// Book events -> staging. Logic is already applied by the round player (ctx.state); this file only
// animates, always from ctx.before to ctx.state. A skip jumps each step to its exact end.
import gsap from 'gsap';
import { Container, Sprite } from 'pixi.js';
import type { Presenter, PresentCtx } from '../controller/round-player';
import type { LogicalState } from '../controller/state';
import { spinsLeft } from '../controller/state';
import type { Scene } from './scene';
import type { Celebration } from './celebrate';
import type { CatView } from './cat/cat-view';
import type { UiBridge, IntroKind } from '../ui/bridge';
import type { GameConfig, TierId } from '../config/game-config';
import { tierFor } from '../config/game-config';
import { T, tscale } from '../config/timings';
import { bookToMicros } from '../contract/money';
import { COLS, posKey, type SymbolId } from '../contract/symbols';
import type { Book, EventOf, WinE } from '../contract/events';
import { FixedAmount, numText } from './texts';
import { FX } from './fx';

export interface SoundPort {
  play(id: string, o?: { rate?: number; gainDb?: number; variant?: boolean }): void;
  loop(id: string, o?: { gainDb?: number; fadeIn?: number }): { stop(fade?: number): void } | null;
  duck(on: boolean): void;
  music(id: string | null, fade?: number): void;
  ambienceLayer(id: string | null, fade?: number): void;
}

export interface PresenterDeps {
  scene: Scene;
  celebration: Celebration;
  cat: () => CatView | null;
  ui: UiBridge;
  sound: SoundPort;
  cfg: GameConfig;
  baseBet: () => number; // micros
  format: (micros: number, digits?: number) => string;
  digits: (micros: number) => number;
  t: (k: string, p?: Record<string, string | number>) => string;
  turbo: () => boolean;
  reduced: () => boolean;
  autoplaying: () => boolean;
}

export class GamePresenter implements Presenter {
  private label = new Container({ label: 'win-label' });
  private labelAmount = new FixedAmount(64);
  private labelMult = numText('', 52);
  private labelBase = numText('', 44);
  private fsBanner = new Container({ label: 'fs-banner' });
  private fsBannerSprite = new Sprite();
  private fsBannerText = numText('', 72);
  private spinning = false;
  private anticipationLoop: { stop(f?: number): void } | null = null;
  private reelLoop: { stop(f?: number): void } | null = null;
  private inBonus = false;

  constructor(private readonly d: PresenterDeps) {
    this.label.addChild(this.labelBase, this.labelMult, this.labelAmount.root);
    this.label.visible = false;
    d.scene.grid.fxLayer.addChild(this.label);
    this.fsBannerSprite.anchor.set(0.5);
    this.fsBanner.addChild(this.fsBannerSprite, this.fsBannerText);
    this.fsBanner.visible = false;
    d.scene.bannerLayer.addChild(this.fsBanner);
  }

  private get turbo(): boolean { return this.d.turbo(); }
  private k(): number { return tscale(this.turbo); }
  private money(h: number): number { return bookToMicros(h, this.d.baseBet()); }
  private cat(m: Parameters<CatView['request']>[0]): void { this.d.cat()?.request(m); }

  // ---------------------------------------------------------------- spin start (called by the controller at the click)
  startSpin(): void {
    const sc = this.d.scene;
    if (this.spinning) return;
    this.spinning = true;
    sc.mech.clearTokens();
    sc.grid.dimAllExcept(null);
    sc.grid.startSpin(this.turbo);
    this.label.visible = false;
    this.d.sound.play('spin_start');
    this.reelLoop = this.d.sound.loop('reel_loop', { gainDb: -6, fadeIn: 0.1 });
    // the cat glances at the grid
    this.cat('spinStart');
    sc.lookAt(sc.grid.center);
    this.d.ui.setPhase('spinning');
  }

  begin(_book: Book, _state: LogicalState): void {
    this.d.ui.setWin(0, this.inBonus);
  }

  // ---------------------------------------------------------------- featureStart (SCAN / DOUBLE SCAN)
  featureStart = async (e: EventOf<'featureStart'>, ctx: PresentCtx): Promise<void> => {
    await this.intro(e.feature === 'scan' ? 'scan' : 'doubleScan', 1, ctx);
  };

  private async intro(kind: IntroKind, spins: number, ctx: PresentCtx): Promise<void> {
    const ui = this.d.ui;
    this.d.sound.play('bonus_intro');
    this.d.sound.duck(true);
    const el = ui.showIntro(kind, spins);
    this.d.scene.veilTo(0.3);
    await ctx.waitClick(this.d.autoplaying() ? 6 : undefined);
    // the cat's hook tears the popup (<= 0.3 s after the click), then runs in place while the city slides
    this.cat('bonusEnter');
    this.d.sound.play('punch_tear');
    await ui.tearIntro(el, this.d.reduced());
    const sc = this.d.scene;
    sc.veilTo(0, 0.3);
    this.d.sound.duck(false);
    if (kind === 'nineLives' || kind === 'doubleGaze') {
      this.d.sound.play('run_whoosh');
      if (!this.d.reduced()) gsap.timeline().add(sc.decor.runParallax(T.bonus.transition * 0.8));
      this.d.sound.play('scan_mode_on');
      sc.decor.setScan(kind === 'doubleGaze' ? 2 : 1);
      this.d.sound.music(kind === 'doubleGaze' ? 'music_bonus_double' : 'music_bonus', 1.2);
      this.d.sound.ambienceLayer('amb_scan', 1.2);
      this.d.cat()?.setBackground('idle34');
      this.inBonus = true;
      await ctx.wait(T.bonus.transition * this.k() * 0.6);
    } else {
      await ctx.wait(0.35 * this.k());
    }
  }

  // ---------------------------------------------------------------- reveal
  reveal = async (e: EventOf<'reveal'>, ctx: PresentCtx): Promise<void> => {
    const sc = this.d.scene, grid = sc.grid;
    if (!this.spinning) { this.startSpin(); await ctx.wait(T.spin.minSpin * this.k()); }
    else await ctx.wait(Math.max(0, T.spin.minSpin * this.k() - 0.15));
    const k = this.k();
    const bought = (ctx.book.mode === 'BONUS' || ctx.book.mode === 'SUPER') && e.gameType === 'basegame';
    const antic = e.anticipation ?? [0, 0, 0, 0, 0];
    // bought bonus: scatters fall one by one with anticipation (reels holding a scatter)
    const scatterCols = e.board.map((col, c) => (col.includes('S') ? c : -1)).filter((c) => c >= 0);
    const tense = (c: number) => !ctx.skipped() && ((antic[c] ?? 0) > 0 || (bought && scatterCols.includes(c) && scatterCols.indexOf(c) >= 1));
    let scatters = 0;
    let anticipated = false;
    this.d.ui.setPhase('stopping');
    for (let c = 0; c < COLS; c++) {
      if (tense(c)) {
        anticipated = true;
        if (!this.anticipationLoop) {
          this.anticipationLoop = this.d.sound.loop('anticipation_loop', { fadeIn: 0.2 });
          this.d.sound.play('anticipation_riser');
          this.cat('anticipation');
          if (!this.d.reduced()) sc.zoomTo(grid.center, T.scene.anticipationZoom, 0.5);
        }
        grid.reels[c]!.slow(T.spin.anticipationSpeed);
        grid.anticipate(c, true);
        // the scatters already on the grid react while waiting
        for (let cc = 0; cc < c; cc++) grid.reels[cc]!.cells.forEach((v) => { if (v.id === 'S') v.react(); });
        // the whole slowdown lasts 1.8-2.1 s whatever the number of reels in tension
        const n = antic.filter((a) => a > 0).length;
        const first = !antic.slice(0, c).some((a) => a > 0);
        const next = n === 2 ? 0.8 : 0.5;
        const dur = n <= 1 ? T.spin.anticipationTotal1 : first ? T.spin.anticipationTotal - (n - 1) * next : next;
        await ctx.wait((bought ? T.bonus.scatterDrop : dur) * (this.turbo ? 0.8 : 1));
        grid.anticipate(c, false);
      } else if (c > 0) await ctx.wait(T.spin.reelGap * k);
      const pad = e.padding?.top[c] ?? null;
      const land = ctx.skipped() ? T.spin.quickStopLand : T.spin.land * (this.turbo ? 0.75 : 1);
      await grid.reels[c]!.stop(e.board[c]!, pad && pad !== 'W' ? pad : null, land);
      this.d.sound.play(c === COLS - 1 ? 'reel_stop_last' : 'reel_stop', { variant: true });
      if (e.board[c]!.includes('S')) {
        scatters += e.board[c]!.filter((s) => s === 'S').length;
        this.d.sound.play(`scatter_land_${Math.min(3, scatters)}`);
        grid.reels[c]!.cells.forEach((v) => { if (v.id === 'S') v.react(); });
        const r = e.board[c]!.indexOf('S');
        sc.lookAt(grid.cellCenter(c, r));
        if (anticipated || bought) this.cat('scatterLand');
      }
    }
    this.reelLoop?.stop(0.12); this.reelLoop = null;
    this.spinning = false;
    grid.spinning = false;
    grid.noteLanded();
    grid.reels.forEach((r) => r.maskOn(false));
    if (this.anticipationLoop) {
      this.anticipationLoop.stop(0.3); this.anticipationLoop = null;
      sc.resetZoom(0.4);
      if (scatters < 3 && !this.inBonus) { this.d.sound.play('scatter_fail'); this.cat('nothing'); }
    }
    sc.lookAt(null);
    this.d.ui.setPhase('resolving');
  };

  // ---------------------------------------------------------------- chips / dots
  chipUpgrade = async (e: EventOf<'chipUpgrade'>, ctx: PresentCtx): Promise<void> => {
    await ctx.play(this.d.scene.mech.chipUpgradeTimeline(e, this.turbo));
  };

  overclock = async (e: EventOf<'overclock'>, ctx: PresentCtx): Promise<void> => {
    const tl = gsap.timeline();
    e.chips.forEach((c, i) => tl.add(this.d.scene.mech.chipTimeline(c.pos, c.level), i * 0.12 * this.k()));
    await ctx.play(tl);
  };

  laserDot = async (e: EventOf<'laserDot'>, ctx: PresentCtx): Promise<void> => {
    this.cat('laser');
    await ctx.play(this.d.scene.mech.dotTimeline(e, this.turbo));
  };

  // ---------------------------------------------------------------- wins
  winInfo = async (e: EventOf<'winInfo'>, ctx: PresentCtx): Promise<void> => {
    const sc = this.d.scene, grid = sc.grid;
    const k = this.k();
    const groups = e.wins;
    const per = (groups.length > 3 ? T.win.connectionFast : T.win.connection) * k;
    const all = new Set(groups.flatMap((w) => w.positions.map((p) => posKey(p))));
    const tier = tierFor(e.totalWin, this.d.cfg);
    if (!tier && !this.inBonus) this.cat('smallWin');
    this.d.sound.play('win_connect');
    for (const w of groups) {
      if (ctx.skipped()) break;
      await this.connection(w, per, ctx);
    }
    // all together + spin total (distinct from the connection amounts and from the bonus total)
    grid.dimAllExcept(all);
    if (groups.length > 1 || groups.some((w) => w.meta.mult > 1)) {
      this.showLabel(null, null, this.d.format(this.money(e.totalWin)), grid.center, true);
      if (!ctx.skipped()) { this.d.sound.play('win_small'); await ctx.wait(T.win.spinTotalHold * k); }
    }
    if (ctx.skipped()) this.showLabel(null, null, this.d.format(this.money(e.totalWin)), grid.center, false);
  };

  private async connection(w: WinE, dur: number, ctx: PresentCtx): Promise<void> {
    const grid = this.d.scene.grid;
    const keep = new Set(w.positions.map((p) => posKey(p)));
    grid.dimAllExcept(keep);
    for (const p of w.positions) grid.cellView(p[0], p[1]).react();
    if (w.symbol.startsWith('H') || w.symbol === 'W') this.d.sound.play(`sym_${w.symbol}`);
    // label near the connection: base -> xN -> final
    const cx = w.positions.reduce((a, p) => a + p[0], 0) / w.positions.length;
    const cy = w.positions.reduce((a, p) => a + p[1], 0) / w.positions.length;
    const at = grid.cellCenter(Math.round(cx), Math.min(3, Math.max(0, Math.round(cy))));
    const pos = { x: grid.center.x * 0.4 + at.x * 0.6, y: at.y };
    const baseTxt = this.d.format(this.money(w.meta.baseWin));
    if (w.meta.mult > 1) {
      this.showLabel(baseTxt, null, '', pos, true);
      await ctx.wait(T.win.multSteps * this.k());
      // the multiplier token(s) fly into the label
      const mp = w.meta.multPositions ?? [];
      for (const p of mp) {
        const from = this.d.scene.mech.tokenWorld(p);
        this.d.scene.shapes.beam(from.x, from.y, pos.x, pos.y, 0.3, 0x9af6ff);
      }
      this.showLabel(baseTxt, `×${w.meta.mult}`, '', pos, true);
      this.d.sound.play('mult_stamp', { rate: 1.15 });
      await ctx.wait(T.win.multSteps * this.k());
      this.showLabel(null, null, this.d.format(this.money(w.win)), pos, true);
      this.d.sound.play('win_small', { rate: 1.1 });
      await ctx.wait(Math.max(0.25, dur - 2 * T.win.multSteps * this.k()));
    } else {
      this.showLabel(null, null, this.d.format(this.money(w.win)), pos, true);
      await ctx.wait(dur);
    }
  }

  private showLabel(base: string | null, mult: string | null, final: string, at: { x: number; y: number }, pop: boolean): void {
    const L = this.label;
    L.visible = true;
    L.position.set(at.x, at.y);
    const s = this.d.scene.grid.cell / 170;
    this.labelBase.visible = !!base; this.labelMult.visible = !!mult; this.labelAmount.root.visible = !!final;
    if (base) { this.labelBase.text = mult ? `${base}  →` : base; this.labelBase.scale.set(s); this.labelBase.x = mult ? -70 * s : 0; }
    if (mult) { this.labelMult.text = `${mult}  →`; this.labelMult.scale.set(s); this.labelMult.x = 120 * s; this.labelMult.tint = 0x9af6ff; }
    if (final) { this.labelAmount.set(final); this.labelAmount.root.scale.set(s); }
    if (pop) gsap.fromTo(L.scale, { x: 0.7, y: 0.7 }, { x: 1, y: 1, duration: T.win.amountIn, ease: 'back.out(2.2)' });
  }

  setWin = async (e: EventOf<'setWin'>, ctx: PresentCtx): Promise<void> => {
    const st = ctx.state;
    const capNext = this.capFollows(ctx);
    // HUD: spin win in base game; bonus total during the bonus (three distinct informations)
    if (st.bonus) this.d.ui.setWin(this.money(st.bonus.win), true);
    else this.d.ui.setWin(this.money(e.amount), false);
    if (e.amount > 0) this.d.ui.announce(`${this.d.t('hud.win')} ${this.d.format(this.money(e.amount))}`);
    const tier = capNext ? null : tierFor(e.amount, this.d.cfg);
    if (tier) await this.celebrate(this.money(e.amount), tier, ctx);
    else if (e.amount === 0 && !st.bonus && !st.feature) this.cat('nothing');
    else if (e.amount > 0) this.cat('winEnd');
    this.label.visible = false;
    this.d.scene.grid.dimAllExcept(null);
  };

  private capFollows(ctx: PresentCtx): boolean {
    const i = ctx.book.events.findIndex((x) => x.index === ctx.state.lastIndex);
    for (let j = i + 1; j < ctx.book.events.length; j++) { const x = ctx.book.events[j]!; if (x.type === 'wincap') return true; if (x.type === 'reveal' || x.type === 'updateFreeSpin') return false; }
    return false;
  }

  private async celebrate(micros: number, tier: TierId, ctx: PresentCtx): Promise<void> {
    this.d.ui.setPhase('celebrating');
    this.label.visible = false;
    const c = this.d.celebration;
    const tl = c.build(micros, this.d.baseBet(), tier, this.d.reduced(), this.turbo);
    await ctx.play(tl); // first click: final state
    const hold = (this.turbo ? T.tiers.holdAtEndTurbo : T.tiers.holdAtEnd);
    await ctx.waitClick(this.d.autoplaying() || this.inBonus ? hold : hold * 2.5); // second click: close
    await new Promise<void>((res) => c.close(this.d.reduced()).eventCallback('onComplete', () => res()));
    this.d.ui.setPhase(this.inBonus ? 'bonus' : 'resolving');
  }

  setTotalWin = async (_e: EventOf<'setTotalWin'>, ctx: PresentCtx): Promise<void> => {
    if (ctx.state.bonus) this.d.ui.setWin(this.money(ctx.state.bonus.win), true);
  };

  // ---------------------------------------------------------------- bonus
  freeSpinTrigger = async (e: EventOf<'freeSpinTrigger'>, ctx: PresentCtx): Promise<void> => {
    const sc = this.d.scene, grid = sc.grid;
    const keep = new Set(e.positions.map((p) => posKey(p)));
    grid.dimAllExcept(keep, 0.45);
    this.d.sound.play('bonus_trigger');
    this.cat('trigger');
    for (const p of e.positions) {
      const v = grid.cellView(p[0], p[1]); v.react();
      const c = grid.cellCenter(p[0], p[1]);
      sc.shapes.ring(c.x, c.y, 20, grid.cell * 1.1, 0.7, 0x3feaff, 8);
      if (!ctx.skipped()) sc.particles.burst({ x: c.x, y: c.y, n: 16, frame: FX.glint, speed: [80, 260], life: [0.3, 0.7], size: [20, 40], tint: 0x9af6ff });
    }
    await ctx.wait(T.bonus.triggerScatters * this.k());
    grid.dimAllExcept(null);
    await this.intro(e.bonus, e.totalFs, ctx);
    this.d.ui.setSpinsLeft(e.totalFs);
    this.d.ui.setWin(0, true);
    this.d.ui.setPhase('bonus');
  };

  updateFreeSpin = async (e: EventOf<'updateFreeSpin'>, ctx: PresentCtx): Promise<void> => {
    this.d.ui.setSpinsLeft(spinsLeft(ctx.state.bonus), true);
    await ctx.wait(T.bonus.betweenSpins * this.k());
    void e;
  };

  freeSpinRetrigger = async (e: EventOf<'freeSpinRetrigger'>, ctx: PresentCtx): Promise<void> => {
    const sc = this.d.scene, grid = sc.grid;
    for (const p of e.positions) grid.cellView(p[0], p[1]).react();
    this.d.sound.play('fs_add');
    // "+N FS" in the centre, then it flies to the counter
    const l = sc.layoutNow!;
    const c = sc.worldToScreen(l.design.focus);
    const B = this.fsBanner;
    this.fsBannerSprite.texture = sc.assets.tex('ui.banner.fs', sc.renderer);
    const k = Math.min(1.2, l.scale * 1.4);
    this.fsBannerSprite.scale.set((520 * k) / (this.fsBannerSprite.texture.width || 1));
    this.fsBannerText.text = this.d.t('fs.add', { n: e.added });
    this.fsBannerText.scale.set(k);
    B.visible = true; B.alpha = 1; B.position.set(c.x, c.y);
    const target = this.d.ui.spinsCounterPos() ?? { x: c.x, y: 40 };
    const tl = gsap.timeline();
    tl.fromTo(B.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2.5)' })
      .to(B, { x: target.x, y: target.y, duration: 0.45, ease: 'power2.in' }, `+=${Math.max(0.2, T.bonus.fsBanner * this.k() - 0.6)}`)
      .to(B.scale, { x: 0.25, y: 0.25, duration: 0.45, ease: 'power2.in' }, '<')
      .call(() => { B.visible = false; this.d.ui.setSpinsLeft(spinsLeft(ctx.state.bonus), true); });
    await ctx.play(tl);
    B.visible = false;
    this.d.ui.setSpinsLeft(spinsLeft(ctx.state.bonus), true);
  };

  freeSpinEnd = async (e: EventOf<'freeSpinEnd'>, ctx: PresentCtx): Promise<void> => {
    const sc = this.d.scene;
    await ctx.wait(0.4 * this.k());
    this.d.ui.setSpinsLeft(null);
    this.d.sound.play('bonus_end');
    this.d.sound.duck(true);
    sc.veilTo(0.34);
    const micros = this.money(e.amount);
    const dec = this.d.digits(micros);
    const el = this.d.ui.showBonusEnd(this.d.t('end.total'), this.d.format(0, dec));
    // quick roll-up (decimals fixed on the final value) then exact value
    const st = { v: 0 };
    const roll = gsap.to(st, { v: micros, duration: Math.min(2.2, 0.6 + micros / Math.max(1, this.d.baseBet()) / 60) * this.k(), ease: 'power2.out', onUpdate: () => this.d.ui.updateBonusEnd(el, this.d.format(Math.round(st.v), dec)) });
    await ctx.play(roll);
    this.d.ui.updateBonusEnd(el, this.d.format(micros));
    this.d.ui.setWin(micros, true);
    await ctx.waitClick(this.d.autoplaying() ? 5 : undefined);
    await this.d.ui.closePopup(el);
    this.d.sound.duck(false);
    sc.veilTo(0, 0.3);
    // exit: chips go out one by one, the city leaves scan mode, the cat dives back
    ctx.resetSkip();
    const out = gsap.timeline();
    out.add(sc.mech.chipsOffTimeline(this.turbo), 0);
    out.add(sc.decor.setScan(0), 0.1);
    out.call(() => { sc.mech.clearTokens(); this.d.sound.play('scan_mode_off'); this.d.sound.music('music_base', 1.2); this.d.sound.ambienceLayer(null, 1); this.cat('bonusReturn'); this.d.cat()?.setBackground('idle'); }, undefined, 0);
    await ctx.play(out);
    this.inBonus = false;
    this.d.ui.setPhase('resolving');
  };

  wincap = async (_e: EventOf<'wincap'>, ctx: PresentCtx): Promise<void> => {
    // MAX WIN only on the cap event; the rest of the round stops (the book has no more spins)
    const spin = ctx.state.spinWin;
    await this.celebrate(this.money(spin), 'max', ctx);
  };

  finalWin = async (e: EventOf<'finalWin'>, _ctx: PresentCtx): Promise<void> => {
    this.d.ui.setWin(this.money(e.amount), false);
  };

  end(_state: LogicalState, cancelled: boolean): void {
    const sc = this.d.scene;
    this.reelLoop?.stop(0.1); this.reelLoop = null;
    this.anticipationLoop?.stop(0.1); this.anticipationLoop = null;
    this.label.visible = false;
    this.fsBanner.visible = false;
    if (cancelled) { sc.veilTo(0, 0.2); sc.resetZoom(0.2); this.d.ui.setPhase('idle'); }
    // otherwise the controller switches to idle once the end-round answer is in
  }

  // ---------------------------------------------------------------- resume: visuals = state, no animation
  restore = async (s: LogicalState, _book: Book): Promise<void> => {
    const sc = this.d.scene;
    if (s.board) sc.grid.setBoard(s.board as SymbolId[][]);
    sc.mech.setChips(s.chips);
    sc.mech.setTokens(s.mults);
    if (s.bonus) {
      this.inBonus = true;
      sc.decor.setScan(s.bonus.kind === 'doubleGaze' ? 2 : 1, true);
      this.d.sound.music(s.bonus.kind === 'doubleGaze' ? 'music_bonus_double' : 'music_bonus', 0.5);
      this.d.cat()?.setBackground('idle34');
      this.d.ui.setSpinsLeft(spinsLeft(s.bonus));
      this.d.ui.setWin(this.money(s.bonus.win), true);
      this.d.ui.setPhase('bonus');
    }
  };

  /** refused or failed request: the reels land back on the last board shown, nothing else changes */
  abortSpin(): void {
    const grid = this.d.scene.grid;
    if (!this.spinning) return;
    const board = grid.lastBoard.length ? grid.lastBoard : grid.board();
    grid.reels.forEach((r, c) => { void r.stop(board[c]!, null, 0.2).then(() => r.maskOn(false)); });
    grid.spinning = false;
    this.spinning = false;
    this.reelLoop?.stop(0.1); this.reelLoop = null;
    this.d.scene.lookAt(null);
    this.d.ui.setPhase('idle');
  }

  /** QA / reset between rounds (never during a round) */
  resetVisuals(): void {
    const sc = this.d.scene;
    sc.mech.clearAll();
    sc.decor.setScan(0, true);
    this.inBonus = false;
    this.d.ui.setSpinsLeft(null);
  }
  get bonusActive(): boolean { return this.inBonus; }
}
