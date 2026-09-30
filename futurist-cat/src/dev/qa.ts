// DEV / QA BUILD ONLY (imported behind __DEV_TOOLS__, absent from the public build).
// Hooks: __qaPlay('F07'), __qaStep(ms), __qa (state); DEV panel (forced scenario, latency, error,
// refusal, balance, long amounts); TEST ANIM chains the key moments without touching the balance.
import type { GameApp } from '../render/app';
import type { GameClock } from '../core/clock';
import type { GameController } from '../controller/game';
import type { Scene } from '../render/scene';
import type { GamePresenter } from '../render/presenter';
import type { Ui } from '../ui/ui';
import type { Provider } from '../provider/types';
import { LocalProvider } from '../provider/local';
import type { GameConfig } from '../config/game-config';
import type { CatView } from '../render/cat/cat-view';
import type { Celebration } from '../render/celebrate';
import { Book, type ModeId } from '../contract/events';
import { el } from '../ui/dom';

interface QaDeps { app: GameApp; clock: GameClock; game: GameController; scene: Scene; presenter: GamePresenter; ui: Ui; audio: unknown; provider: Provider; cfg: GameConfig; cat: () => CatView | null; celebration: Celebration; relayout: () => void; fmt: (m: number) => string; settings: (s: Record<string, unknown>) => void }

// key moments chained (the full bonuses and the purchase have their own videos)
const TEST_ANIM = ['F07', 'F25', 'F10', 'F13', 'F12', 'F15', 'F17', 'F19'];

export function installQa(d: QaDeps): void {
  const w = window as unknown as Record<string, unknown>;
  const local = d.provider instanceof LocalProvider ? d.provider : null;
  let autoClick = false;
  // auto-advance click-anywhere screens (TEST ANIM, videos)
  // game clock, so virtual-time recordings click after 1.4 s of GAME time
  const armWatch = () => {
    if (autoClick && d.ui.catcher.isArmed) d.clock.after(1.4, () => { if (d.ui.catcher.isArmed && autoClick) d.ui.catcher.poke(); });
  };
  const obs = new MutationObserver(armWatch);
  obs.observe(d.ui.catcher.node, { attributes: true, attributeFilter: ['class'] });

  const modeOf = async (id: string): Promise<ModeId> => {
    if (!local) return 'BASE';
    const f = await local.fixture(id);
    return (f.book as { mode: ModeId }).mode;
  };
  w.__qaPlay = async (id: string, opts: { auto?: boolean } = {}) => {
    if (!local) throw new Error('local provider only');
    autoClick = opts.auto ?? autoClick;
    local.dev.forceNext = id;
    const mode = await modeOf(id);
    if (mode === 'BASE' || mode === 'ANTE') { d.game.ante = mode === 'ANTE'; d.game.refreshHud(); d.game.press(); }
    else d.game.buy(mode);
    return true;
  };
  w.__qaReplay = async (id: string) => {
    if (!local) return false;
    const f = await local.fixture(id);
    autoClick = true;
    await d.game.replay(Book.parse(f.book), d.game.bet);
    return true;
  };
  w.__qaStep = (ms: number, render = true) => d.app.step(ms, 60, render ? 1 : 1000);
  /** background driver for e2e runs on the virtual clock: advances `ms` of game time per tick */
  let driving = false;
  w.__qaDrive = (on: boolean, ms = 100) => {
    if (on === driving) return;
    driving = on;
    // paced by requestAnimationFrame: a setTimeout(0) chain starved the compositor (no rAF, no
    // screenshots, dialogs never received their 'in' class)
    // Pixi renders once every 4 ticks only: e2e reads state and DOM, and software GL is the bottleneck
    let tick = 0;
    const loop = () => { if (!driving) return; d.app.step(ms, 60, 1e9, tick++ % 4 === 0); requestAnimationFrame(loop); };
    if (on) loop();
  };
  w.__qaAuto = (on: boolean) => { autoClick = on; armWatch(); };
  w.__qaLayout = () => d.relayout();
  /** screen rects of the grid frame, the cat zone and the logo/ante (for the HUD overlap test) */
  w.__qaRects = () => {
    const l = d.scene.layoutNow!;
    const g = l.design.grid, c = l.design.cat;
    const r = (x: number, y: number, ww: number, hh: number) => { const p = l.toScreen(x, y); return { x: p.x, y: p.y, w: ww * l.scale, h: hh * l.scale }; };
    return { cls: l.cls, grid: r(g.x, g.y, l.gridW + 2 * g.pad, l.gridH + 2 * g.pad), cat: r(c.x - c.height * 0.3, c.y - c.height, c.height * 0.6, c.height), logo: r(l.design.logo.x, l.design.logo.y, l.design.logo.w, l.design.logo.h), ante: r(l.design.ante.x, l.design.ante.y, l.design.ante.w, l.design.ante.h) };
  };
  w.__qaSetWin = (units: number) => d.ui.setWin(Math.round(units * 1e6), false);
  w.__qa = () => ({
    state: d.game.fsm.state, phase: d.ui.root.dataset.phase, balance: d.game.balance, bet: d.game.bet, auto: d.game.autoLeft,
    fps: Math.round(d.app.fps), frameMs: +d.app.frameMs.toFixed(2), catMode: d.cat()?.mode ?? 'none', catMs: +(d.cat()?.lastCatMs ?? 0).toFixed(2),
    catFail: d.cat()?.failedReason ?? '', lastBook: d.game.lastBook?.id ?? null, history: d.game.history.length, time: +d.clock.time.toFixed(3),
    particles: d.scene.particles.activeCount, catcher: d.ui.catcher.isArmed, dialog: d.ui.dialogOpen,
    plays: local?.plays ?? -1, endRounds: local?.endRounds ?? -1, spinsLeft: document.querySelector('.spins-counter.on')?.textContent ?? null, win: document.querySelector('.field.win .val')?.textContent ?? '',
    popup: document.querySelector('.popup')?.className ?? null, errorDialog: document.querySelector('.dialog.error p')?.textContent ?? null,
  });
  w.__qaTestAnim = () => testAnim();
  w.__qaSetBalance = (units: number) => { local?.setBalance(Math.round(units * 1e6)); d.game.balance = Math.round(units * 1e6); d.game.refreshHud(); };
  w.__qaGame = d.game;
  w.__qaScene = d.scene;
  /** player settings as the Info menu would set them (turbo, reduced, quality...) */
  w.__qaSettings = (s: Record<string, unknown>) => d.settings(s);
  /** 3D context loss, restored after `sec` of GAME time (virtual-clock videos) */
  w.__qaLoseContext = (sec = 2.5) => {
    const ext = d.cat()?.stage?.renderer.getContext().getExtension('WEBGL_lose_context');
    if (!ext) return false;
    ext.loseContext();
    d.clock.after(sec, () => ext.restoreContext());
    return true;
  };

  async function testAnim(): Promise<void> {
    autoClick = true;
    w.__qaTestAnimRunning = true;
    for (const id of TEST_ANIM) {
      if (!local) break;
      const f = await local.fixture(id);
      while (!d.game.idle) await new Promise((r) => setTimeout(r, 50));
      await d.game.replay(Book.parse(f.book), d.game.bet, { bar: false });
      await new Promise((r) => setTimeout(r, 200));
    }
    autoClick = false;
    w.__qaTestAnimRunning = false;
  }

  // ---------------- DEV panel
  const panel = el('div', { class: 'dev-panel', style: 'position:fixed;left:8px;bottom:calc(var(--hud-bottom,110px) + 8px);z-index:20;background:rgba(5,8,20,.92);border:1px solid #3feaff;border-radius:12px;padding:8px 10px;font:12px/1.4 monospace;color:#cfe8ff;pointer-events:auto;display:none;max-width:320px' });
  const toggle = el('button', { type: 'button', style: 'position:fixed;left:8px;top:50%;z-index:20;pointer-events:auto;font:11px monospace;background:#0b1230;color:#3feaff;border:1px solid #3feaff;border-radius:8px;padding:4px 6px;opacity:.7', text: 'DEV' });
  toggle.addEventListener('click', () => { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; });
  const sel = el('select', { style: 'width:100%;margin:4px 0' });
  sel.append(el('option', { value: '', text: '(playlist)' }));
  for (const e of local?.entries ?? []) sel.append(el('option', { value: e.id, text: `${e.id} ${e.title}` }));
  const btn = (label: string, f: () => void) => { const b = el('button', { type: 'button', style: 'margin:2px;font:11px monospace;background:#13205a;color:#fff;border:1px solid #3feaff;border-radius:6px;padding:3px 6px', text: label }); b.addEventListener('click', f); return b; };
  const lat = el('input', { type: 'range', min: '0', max: '6000', value: '0', style: 'width:100%' });
  lat.addEventListener('input', () => { if (local) local.dev.latencyMs = Number(lat.value); });
  const info = el('pre', { style: 'margin:4px 0 0;white-space:pre-wrap' });
  setInterval(() => { if (panel.style.display !== 'none') info.textContent = JSON.stringify((w.__qa as () => unknown)(), null, 0).replace(/,"/g, ', "'); }, 500);
  panel.append(
    el('b', { text: 'DEV (build QA)' }), sel,
    btn('forcer le prochain', () => { if (local && sel.value) local.dev.forceNext = sel.value; }),
    btn('jouer', () => { if (sel.value) void (w.__qaPlay as (id: string) => Promise<boolean>)(sel.value); }),
    btn('rejouer sans debit', () => { if (sel.value) void (w.__qaReplay as (id: string) => Promise<boolean>)(sel.value); }),
    el('div', { text: 'lenteur reseau (ms)' }), lat,
    btn('refus solde (ERR_IPB)', () => { if (local) local.dev.failNext = 'ERR_IPB'; }),
    btn('erreur generale', () => { if (local) local.dev.failNext = 'ERR_GE'; }),
    btn('delai depasse (incertain)', () => { if (local) local.dev.failNext = 'TIMEOUT'; }),
    btn('coupure end-round', () => { if (local) local.dev.failEndRound = true; }),
    btn('solde 10 chiffres', () => (w.__qaSetBalance as (u: number) => void)(1234567890.12)),
    btn('solde 1000', () => (w.__qaSetBalance as (u: number) => void)(1000)),
    btn('TEST ANIM', () => { void testAnim(); }),
    btn('perte de contexte 3D', () => { const st = d.cat()?.stage; const ext = st?.renderer.getContext().getExtension('WEBGL_lose_context'); ext?.loseContext(); setTimeout(() => ext?.restoreContext(), 2500); }),
    btn('reinitialiser session locale', () => { local?.reset(); location.reload(); }),
    info,
  );
  document.body.append(toggle, panel);
  window.addEventListener('keydown', (e) => { if (e.key === '`' || e.key === 'F9') toggle.click(); });
}
