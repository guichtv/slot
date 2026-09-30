// HTML UI: HUD (one layout per width class), logo + Ante, spins counter, click-anywhere popups,
// shop + frozen quote, autoplay popup, Info menu (rules / settings / history), loading, welcome,
// errors. Accessible: keyboard everywhere, focus kept in dialogs, >= 44 px targets on touch.
import { el, trapFocus, ClickCatcher, isTouch } from './dom';
import type { UiBridge, IntroKind, SpinPhase } from './bridge';
import type { Layout } from '../render/layout';
import type { Jurisdiction } from '../provider/types';
import { t, i18n } from '../i18n/i18n';

export interface UiHandlers {
  spin(): void;
  betStep(dir: 1 | -1): void;
  openShop(): void;
  buy(mode: string): void;
  autoStart(n: number): void;
  autoStop(): void;
  ante(on: boolean): void;
  turbo(on: boolean): void;
  sound(on: boolean): void;
  settings(s: Partial<Settings>): void;
  replayRound(id: number): void;
  fullscreen(): void;
}
export interface Settings { master: number; music: number; sfx: number; turbo: boolean; reduced: boolean; quality: 'high' | 'low' }
export interface ShopOffer { mode: string; name: string; spinsText: string; priceText: string; enabled: boolean; art: string | null; reason?: string }
export interface HistoryRow { id: number; mode: string; bet: string; win: string }

const AUTO_STEPS = [10, 25, 50, 100, 250, 500, 1000];

const overflows = (e: HTMLElement) => e.clientWidth > 0 && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1);
/** shrink `node`'s font until it and the given parts fit their boxes (long translations, small screens) */
function fitFont(node: HTMLElement, basePx: number, minPx: number, parts: HTMLElement[] = []): void {
  let px = basePx;
  node.style.fontSize = `${px}px`;
  while (px > minPx && (overflows(node) || parts.some(overflows))) { px = Math.max(minPx, px - 0.5); node.style.fontSize = `${px}px`; }
}
/** a HUD amount never gets cut: its font shrinks to fit (10-digit amounts), re-measured only when needed */
function fitVal(v: HTMLElement, cls: string): void {
  const key = `${v.textContent?.length ?? 0}/${cls}`;
  if (v.dataset.fit === key) return;
  v.dataset.fit = key;
  v.style.fontSize = '';
  if (!overflows(v)) return;
  const base = parseFloat(getComputedStyle(v).fontSize);
  v.style.fontSize = `${Math.max(base * 0.55, Math.floor(((base * (v.clientWidth - 2)) / v.scrollWidth) * 10) / 10)}px`;
}

export class Ui implements UiBridge {
  readonly root: HTMLDivElement;
  readonly catcher: ClickCatcher;
  private top: HTMLDivElement;
  private logo: HTMLImageElement;
  private anteBtn: HTMLButtonElement;
  private counter: HTMLDivElement;
  private hud: HTMLDivElement;
  private spinBtn: HTMLButtonElement;
  private spinLabel: HTMLSpanElement;
  private buyBtn: HTMLButtonElement;
  private betVal: HTMLSpanElement;
  private betUp: HTMLButtonElement;
  private betDown: HTMLButtonElement;
  private winLbl: HTMLSpanElement;
  private winVal: HTMLSpanElement;
  private balVal: HTMLSpanElement;
  private turboBtn: HTMLButtonElement;
  private autoBtn: HTMLButtonElement;
  private autoCount: HTMLSpanElement;
  private menuBtn: HTMLButtonElement;
  private soundBtn: HTMLButtonElement;
  private fsBtn: HTMLButtonElement;
  private popups: HTMLDivElement;
  private live: HTMLDivElement;
  private phase: SpinPhase = 'locked';
  private autoLeft: number | null = null;
  private turboOn = false;
  private soundOn = true;
  private anteOn = false;
  private jur: Jurisdiction | null = null;
  private openDialog: { node: HTMLElement; release: () => void; onClose?: () => void } | null = null;
  private layoutNow: Layout | null = null;
  private images: Record<string, string> = {};
  settings: Settings = { master: 0.8, music: 0.6, sfx: 0.9, turbo: false, reduced: false, quality: 'high' };
  private historyRows: HistoryRow[] = [];
  private sessionInfo: HTMLDivElement;
  private replayBar: HTMLDivElement | null = null;

  constructor(parent: HTMLElement, private readonly h: UiHandlers) {
    this.root = el('div', { id: 'ui', class: 'ui' });
    parent.appendChild(this.root);
    // top-left: logo + Ante; spins counter
    this.logo = el('img', { class: 'logo', alt: t('game.name'), draggable: 'false' });
    this.anteBtn = el('button', { class: 'ante', type: 'button', 'aria-pressed': 'false' });
    this.counter = el('div', { class: 'spins-counter', role: 'status', 'aria-live': 'polite' });
    this.sessionInfo = el('div', { class: 'session-info', 'aria-live': 'off' });
    this.top = el('div', { class: 'top' }, this.logo, this.anteBtn, this.counter, this.sessionInfo);
    // HUD
    this.buyBtn = el('button', { class: 'btn buy', type: 'button' }, el('span', { class: 'buy-label' }));
    this.betDown = el('button', { class: 'btn round minus', type: 'button' });
    this.betUp = el('button', { class: 'btn round plus', type: 'button' });
    this.betVal = el('span', { class: 'val' });
    const bet = el('div', { class: 'field bet' }, el('span', { class: 'lbl bet-lbl' }), this.betVal);
    this.winLbl = el('span', { class: 'lbl' });
    this.winVal = el('span', { class: 'val' });
    const win = el('div', { class: 'field win', 'aria-live': 'off' }, this.winLbl, this.winVal);
    this.balVal = el('span', { class: 'val' });
    const bal = el('div', { class: 'field balance' }, el('span', { class: 'lbl bal-lbl' }), this.balVal);
    this.spinLabel = el('span', { class: 'spin-label' });
    this.spinBtn = el('button', { class: 'btn spin', type: 'button' }, this.spinLabel);
    this.turboBtn = el('button', { class: 'btn round turbo', type: 'button', 'aria-pressed': 'false' });
    this.autoCount = el('span', { class: 'auto-count' });
    this.autoBtn = el('button', { class: 'btn round auto', type: 'button', 'aria-haspopup': 'dialog' }, this.autoCount);
    this.menuBtn = el('button', { class: 'btn round menu', type: 'button', 'aria-haspopup': 'dialog' });
    this.soundBtn = el('button', { class: 'btn round sound', type: 'button', 'aria-pressed': 'true' });
    this.fsBtn = el('button', { class: 'btn round fullscreen', type: 'button' });
    this.hud = el('div', { class: 'hud', role: 'toolbar' },
      el('div', { class: 'hud-panel' }),
      el('div', { class: 'grp grp-buy' }, this.buyBtn),
      el('div', { class: 'grp grp-bet' }, this.betDown, bet, this.betUp),
      el('div', { class: 'grp grp-fields' }, win, bal),
      el('div', { class: 'grp grp-spin' }, this.turboBtn, this.spinBtn, this.autoBtn),
      el('div', { class: 'grp grp-sys' }, this.menuBtn, this.soundBtn, this.fsBtn),
    );
    this.popups = el('div', { class: 'popups' });
    this.live = el('div', { class: 'sr-only', 'aria-live': 'polite' });
    this.root.append(this.top, this.hud);
    this.catcher = new ClickCatcher(this.root);
    this.root.append(this.popups, this.live);
    this.bind();
    this.texts();
    i18n.onChange(() => this.texts());
    this.setPhase('locked');
  }

  private bind(): void {
    const press = (b: HTMLButtonElement, f: () => void) => {
      b.addEventListener('click', (e) => { e.preventDefault(); if (b.disabled) return; f(); });
    };
    press(this.spinBtn, () => this.h.spin());
    press(this.betUp, () => this.h.betStep(1));
    press(this.betDown, () => this.h.betStep(-1));
    press(this.buyBtn, () => this.h.openShop());
    press(this.turboBtn, () => { this.turboOn = !this.turboOn; this.renderToggles(); this.h.turbo(this.turboOn); });
    press(this.soundBtn, () => { this.soundOn = !this.soundOn; this.renderToggles(); this.h.sound(this.soundOn); });
    press(this.menuBtn, () => this.openMenu('rules'));
    press(this.fsBtn, () => this.h.fullscreen());
    press(this.autoBtn, () => { if (this.autoLeft !== null) this.h.autoStop(); else this.openAuto(); });
    press(this.anteBtn, () => { this.h.ante(!this.anteOn); });
  }

  texts(): void {
    this.logo.alt = t('game.name');
    this.spinLabel.textContent = t('spin');
    (this.buyBtn.querySelector('.buy-label') as HTMLElement).textContent = t('hud.buy');
    this.buyBtn.setAttribute('aria-label', t('hud.buy.aria'));
    (this.hud.querySelector('.bet-lbl') as HTMLElement).textContent = t('hud.bet');
    (this.hud.querySelector('.bal-lbl') as HTMLElement).textContent = t('hud.balance');
    this.betUp.setAttribute('aria-label', t('hud.betUp'));
    this.betDown.setAttribute('aria-label', t('hud.betDown'));
    this.turboBtn.setAttribute('aria-label', t('hud.turbo'));
    this.menuBtn.setAttribute('aria-label', t('hud.menu'));
    this.soundBtn.setAttribute('aria-label', t('hud.sound'));
    this.fsBtn.setAttribute('aria-label', t('hud.fullscreen'));
    this.renderToggles();
    this.renderSpin();
  }

  /** images from the manifest (or dev stand-ins) as CSS variables */
  setImages(urls: Record<string, string | null>): void {
    for (const [k, v] of Object.entries(urls)) if (v) this.images[k] = v;
    const s = this.root.style;
    const map: Record<string, string> = { 'ui.spin': '--img-spin', 'ui.spin_stop': '--img-spin-stop', 'ui.buy': '--img-buy', 'ui.round': '--img-round', 'ui.panel': '--img-panel', 'ui.popup': '--img-popup', 'ui.icons': '--img-icons', 'ui.intro.ninelives': '--img-intro-ninelives', 'ui.intro.doublegaze': '--img-intro-doublegaze', 'ui.intro.scan': '--img-intro-scan', 'ui.intro.doublescan': '--img-intro-doublescan', 'ui.total': '--img-total' };
    for (const [id, v] of Object.entries(map)) if (this.images[id]) s.setProperty(v, `url("${this.images[id]}")`);
    this.root.classList.toggle('has-art', !!this.images['ui.spin']);
    if (this.images['logo']) this.logo.src = this.images['logo'];
  }

  setJurisdiction(j: Jurisdiction): void {
    this.jur = j;
    this.turboBtn.hidden = j.disabledTurbo;
    this.autoBtn.hidden = j.disabledAutoplay;
    this.buyBtn.hidden = j.disabledBuyFeature;
    this.fsBtn.hidden = j.disabledFullscreen || !document.fullscreenEnabled;
    this.sessionInfo.hidden = !(j.displayNetPosition || j.displaySessionTimer);
  }

  /** jurisdiction: net position and/or session timer */
  setSessionInfo(net: string | null, timer: string | null): void {
    const parts: string[] = [];
    if (net !== null) parts.push(`${t('hud.net')} ${net}`);
    if (timer !== null) parts.push(`${t('hud.session')} ${timer}`);
    this.sessionInfo.textContent = parts.join('   ');
  }

  /** replay: badge, bet, win, pause / stop / watch again (no wallet call, no bet) */
  showReplayBar(o: { bet: string; onStop: () => void; onAgain: () => void; onPause: (paused: boolean) => void }): void {
    this.hideReplayBar();
    let paused = false;
    const pause = el('button', { class: 'btn small', type: 'button', text: t('replay.pause') });
    pause.addEventListener('click', () => { paused = !paused; pause.textContent = paused ? t('replay.play') : t('replay.pause'); o.onPause(paused); });
    const stop = el('button', { class: 'btn small', type: 'button', text: t('replay.stop') });
    stop.addEventListener('click', () => o.onStop());
    const again = el('button', { class: 'btn small', type: 'button', text: t('replay.again') });
    again.addEventListener('click', () => o.onAgain());
    this.replayBar = el('div', { class: 'replay-bar', role: 'toolbar', 'aria-label': t('replay.title') }, el('b', { text: t('replay.title') }), el('span', { class: 'rb-bet', text: t('replay.bet', { v: o.bet }) }), el('span', { class: 'rb-win' }), pause, stop, again);
    this.root.append(this.replayBar);
  }
  setReplayWin(text: string): void { const w = this.replayBar?.querySelector('.rb-win'); if (w) w.textContent = t('replay.win', { v: text }); }
  hideReplayBar(): void { this.replayBar?.remove(); this.replayBar = null; }

  /** entrance: the logo flies from the welcome screen to its place */
  flyLogoFrom(r: DOMRect | null): void {
    if (!r || !this.logo.src) return;
    const to = this.logo.getBoundingClientRect();
    if (!to.width) return;
    const sx = r.width / to.width, sy = r.height / to.height, k = Math.min(sx, sy);
    const dx = r.left + r.width / 2 - (to.left + to.width / 2), dy = r.top + r.height / 2 - (to.top + to.height / 2);
    this.logo.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${k})` }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.3,.1,.2,1)' });
  }

  layout(l: Layout): void {
    this.layoutNow = l;
    this.root.dataset.cls = l.cls;
    const d = l.design;
    const place = (node: HTMLElement, r: { x: number; y: number; w: number; h: number }) => {
      const p = l.toScreen(r.x, r.y);
      Object.assign(node.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${r.w * l.scale}px`, height: `${r.h * l.scale}px` });
    };
    place(this.logo, d.logo);
    place(this.anteBtn, d.ante);
    this.anteFont = Math.max(10, 17 * l.scale);
    this.fitAnte();
    const c = l.toScreen(d.counter.x, d.counter.y);
    Object.assign(this.counter.style, { left: `${c.x}px`, top: `${c.y}px`, fontSize: `${Math.max(12, 30 * l.scale)}px` });
    this.root.style.setProperty('--hud-bottom', `${l.hud.bottom}px`);
    this.root.style.setProperty('--hud-right', `${l.hud.right}px`);
    for (const v of [this.betVal, this.winVal, this.balVal]) fitVal(v, l.cls);
  }
  private anteFont = 12;
  private fitAnte(): void {
    fitFont(this.anteBtn, this.anteFont, 7, [...this.anteBtn.querySelectorAll<HTMLElement>('.ante-desc, .ante-cost')].filter((e) => getComputedStyle(e).display !== 'none'));
  }

  // ------------------------------------------------------------------ HUD state
  setBet(text: string, canDown: boolean, canUp: boolean): void { this.betVal.textContent = text; fitVal(this.betVal, this.root.dataset.cls ?? ''); this.betDown.disabled = !canDown || this.phase !== 'idle'; this.betUp.disabled = !canUp || this.phase !== 'idle'; this.betDown.dataset.can = String(canDown); this.betUp.dataset.can = String(canUp); }
  setBalanceText(text: string): void { this.balVal.textContent = text; fitVal(this.balVal, this.root.dataset.cls ?? ''); }
  setWinText(text: string, total: boolean): void { this.winLbl.textContent = total ? t('hud.totalWin') : t('hud.win'); this.winVal.textContent = text; fitVal(this.winVal, this.root.dataset.cls ?? ''); }
  private fmtMoney: (m: number) => string = (m) => String(m);
  setFormatter(f: (m: number) => string): void { this.fmtMoney = f; }
  setWin(micros: number, total = false): void { this.setWinText(micros > 0 || total ? this.fmtMoney(micros) : '', total); }
  setBalance(micros: number): void { this.setBalanceText(this.fmtMoney(micros)); }

  setAnte(on: boolean, factorText: string, scatterText: string, nextCostText: string): void {
    this.anteOn = on;
    this.anteBtn.setAttribute('aria-pressed', String(on));
    this.anteBtn.classList.toggle('on', on);
    this.anteBtn.replaceChildren(
      el('span', { class: 'ante-title', text: t('ante.title') }),
      el('span', { class: 'ante-state', text: on ? t('ante.on') : t('ante.off') }),
      el('span', { class: 'ante-desc', text: `${scatterText} · ${factorText}` }),
      el('span', { class: 'ante-cost', text: t('ante.cost', { cost: nextCostText }) }),
    );
    this.anteBtn.setAttribute('aria-label', t('ante.aria', { x: factorText.replace('×', '') }));
    this.fitAnte();
  }

  setAuto(left: number | null): void { this.autoLeft = left; this.autoCount.textContent = left === null ? '' : String(left); this.autoBtn.classList.toggle('running', left !== null); this.autoBtn.setAttribute('aria-label', left === null ? t('hud.auto') : t('hud.autoStop')); this.renderSpin(); }
  private renderToggles(): void {
    this.turboBtn.setAttribute('aria-pressed', String(this.turboOn)); this.turboBtn.classList.toggle('on', this.turboOn);
    this.soundBtn.setAttribute('aria-pressed', String(this.soundOn)); this.soundBtn.classList.toggle('muted', !this.soundOn);
  }
  setTurbo(on: boolean): void { this.turboOn = on; this.renderToggles(); }
  setSound(on: boolean): void { this.soundOn = on; this.renderToggles(); }

  setPhase(p: SpinPhase): void {
    this.phase = p;
    this.root.dataset.phase = p;
    const idle = p === 'idle';
    this.buyBtn.disabled = !idle || !!this.jur?.disabledBuyFeature;
    this.anteBtn.disabled = !idle;
    this.menuBtn.disabled = !idle && p !== 'bonus';
    this.betDown.disabled = !idle || this.betDown.dataset.can === 'false';
    this.betUp.disabled = !idle || this.betUp.dataset.can === 'false';
    this.renderSpin();
  }
  private renderSpin(): void {
    const p = this.phase;
    const stop = p === 'spinning' || p === 'stopping';
    this.spinBtn.classList.toggle('stop', stop && !this.jur?.disabledSlamstop);
    this.spinBtn.classList.toggle('busy', p !== 'idle' && !stop);
    this.spinBtn.disabled = p === 'locked';
    this.spinBtn.setAttribute('aria-label', stop ? t('spin.stop.aria') : t('spin.aria'));
    this.spinLabel.textContent = this.autoLeft !== null ? String(this.autoLeft) : stop ? '' : t('spin');
  }

  setSpinsLeft(n: number | null, pulse = false): void {
    if (n === null) { this.counter.classList.remove('on'); return; }
    this.counter.textContent = t('fs.left', { n });
    this.counter.classList.add('on');
    if (pulse) { this.counter.classList.remove('pulse'); void this.counter.offsetWidth; this.counter.classList.add('pulse'); }
  }
  spinsCounterPos(): { x: number; y: number } | null {
    if (!this.counter.classList.contains('on')) return null;
    const r = this.counter.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  announce(text: string): void { this.live.textContent = text; }

  // ------------------------------------------------------------------ click-anywhere popups
  private popup(cls: string, children: Node[], labelId?: string): HTMLDivElement {
    const node = el('div', { class: `popup ${cls}`, role: 'dialog', 'aria-modal': 'true', tabindex: '-1', ...(labelId ? { 'aria-labelledby': labelId } : { 'aria-label': t('a11y.dialog') }) });
    node.append(...children);
    this.popups.append(node);
    requestAnimationFrame(() => node.classList.add('in'));
    return node;
  }

  showIntro(kind: IntroKind, spins: number): HTMLElement {
    const name = kind === 'nineLives' ? t('bonus.nineLives') : kind === 'doubleGaze' ? t('bonus.doubleGaze') : kind === 'scan' ? t('feature.scan') : t('feature.doubleScan');
    const count = kind === 'scan' || kind === 'doubleScan' ? t('intro.oneSpin') : t('intro.spins', { n: spins });
    const node = this.popup(`intro intro-${kind.toLowerCase()}`, [
      el('div', { class: 'intro-art' }),
      el('h2', { class: 'intro-name', id: 'intro-name', text: name }),
      el('div', { class: 'intro-count', text: count }),
      el('p', { class: 'intro-rule', text: t(`intro.rule.${kind}`) }),
      el('div', { class: 'tap', text: isTouch() ? t('intro.tap.touch') : t('intro.tap') }),
    ], 'intro-name');
    this.catcher.arm(true);
    return node;
  }

  async tearIntro(node: HTMLElement, reduced: boolean): Promise<void> {
    this.catcher.arm(false);
    if (reduced) { await this.closePopup(node); return; }
    // the punch tears the popup in two jagged halves that fly apart (<= 0.3 s after the click)
    const r = node.getBoundingClientRect();
    const mk = (side: 'l' | 'r') => {
      const c = node.cloneNode(true) as HTMLElement;
      c.classList.add('torn', `torn-${side}`);
      c.removeAttribute('role'); c.setAttribute('aria-hidden', 'true');
      Object.assign(c.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      document.body.appendChild(c);
      return c;
    };
    const L = mk('l'), R = mk('r');
    node.remove();
    await new Promise((res) => setTimeout(res, 20));
    L.classList.add('go'); R.classList.add('go');
    await new Promise((res) => setTimeout(res, 420));
    L.remove(); R.remove();
  }

  showBonusEnd(title: string, amountText: string): HTMLElement {
    const node = this.popup('total', [
      el('h2', { class: 'total-title', id: 'total-title', text: title }),
      el('div', { class: 'total-amount', text: amountText }),
      el('div', { class: 'tap', text: isTouch() ? t('end.tap.touch') : t('end.tap') }),
    ], 'total-title');
    this.catcher.arm(true);
    return node;
  }
  updateBonusEnd(node: HTMLElement, amountText: string): void { const a = node.querySelector('.total-amount'); if (a) a.textContent = amountText; }

  async closePopup(node: HTMLElement): Promise<void> {
    this.catcher.arm(false);
    node.classList.remove('in');
    node.classList.add('out');
    await new Promise((res) => setTimeout(res, 200));
    node.remove();
  }

  // ------------------------------------------------------------------ dialogs (shop, confirm, menu, autoplay, errors)
  private dialog(node: HTMLElement, onClose?: () => void): void {
    this.closeDialog();
    const scrim = el('div', { class: 'scrim' });
    scrim.addEventListener('pointerdown', (e) => { e.preventDefault(); this.closeDialog(); });
    this.popups.append(scrim, node);
    requestAnimationFrame(() => { node.classList.add('in'); scrim.classList.add('in'); });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); this.closeDialog(); } };
    node.addEventListener('keydown', esc);
    const release = trapFocus(node);
    this.openDialog = { node, release: () => { release(); scrim.remove(); }, ...(onClose ? { onClose } : {}) };
  }
  closeDialog(): void {
    const d = this.openDialog; if (!d) return;
    this.openDialog = null;
    d.release();
    d.node.remove();
    d.onClose?.();
  }
  get dialogOpen(): boolean { return !!this.openDialog; }

  openShop(offers: ShopOffer[], bet: string): void {
    const cards = offers.map((o) => {
      const b = el('button', { class: `card card-${o.mode.toLowerCase()}`, type: 'button', ...(o.enabled ? {} : { disabled: true, 'aria-disabled': 'true' }) },
        el('span', { class: 'card-art', style: o.art ? `background-image:url("${o.art}")` : '' }),
        el('span', { class: 'card-name', text: o.name }),
        el('span', { class: 'card-spins', text: o.spinsText }),
        el('span', { class: 'card-price', text: o.priceText }),
        o.enabled ? null : el('span', { class: 'card-reason', text: o.reason ?? t('buy.unavailable') }));
      b.addEventListener('click', (e) => { e.preventDefault(); if (!o.enabled) return; this.confirm(o, bet); });
      return b;
    });
    const close = el('button', { class: 'btn close', type: 'button', 'aria-label': t('buy.close'), text: '×' });
    close.addEventListener('click', () => this.closeDialog());
    const node = el('div', { class: 'dialog shop', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'shop-title', tabindex: '-1' },
      el('h2', { id: 'shop-title', text: t('buy.title') }), close, el('div', { class: 'cards' }, ...cards));
    this.dialog(node);
  }

  private confirm(o: ShopOffer, bet: string): void {
    // frozen quote: mode, bet, cost, currency - computed once when the card is chosen
    const ok = el('button', { class: 'btn primary', type: 'button', text: t('buy.confirm.ok') });
    const cancel = el('button', { class: 'btn secondary', type: 'button', text: t('buy.confirm.cancel') });
    const node = el('div', { class: 'dialog confirm', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'confirm-title', tabindex: '-1' },
      el('h2', { id: 'confirm-title', text: t('buy.confirm.title') }),
      el('dl', {},
        el('dt', { text: t('buy.confirm.mode') }), el('dd', { text: `${o.name} · ${o.spinsText}` }),
        el('dt', { text: t('buy.confirm.bet') }), el('dd', { text: bet }),
        el('dt', { text: t('buy.confirm.cost') }), el('dd', { class: 'cost', text: o.priceText })),
      el('div', { class: 'actions' }, cancel, ok));
    let sent = false;
    ok.addEventListener('click', (e) => {
      e.preventDefault();
      if (sent) return; // double click blocked: one request only
      sent = true; ok.disabled = true; cancel.disabled = true;
      this.closeDialog();
      this.h.buy(o.mode);
    });
    cancel.addEventListener('click', (e) => { e.preventDefault(); this.closeDialog(); });
    this.dialog(node);
  }

  private openAuto(): void {
    const btns = AUTO_STEPS.map((n) => { const b = el('button', { class: 'btn chip-n', type: 'button', text: String(n) }); b.addEventListener('click', () => { this.closeDialog(); this.h.autoStart(n); }); return b; });
    const node = el('div', { class: 'dialog auto', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('auto.aria'), tabindex: '-1' }, el('div', { class: 'auto-title', text: t('auto.title') }), el('div', { class: 'auto-grid' }, ...btns));
    // small popup ABOVE its button
    const r = this.autoBtn.getBoundingClientRect();
    node.style.setProperty('--ax', `${r.left + r.width / 2}px`);
    node.style.setProperty('--ay', `${r.top}px`);
    this.dialog(node);
  }

  // ------------------------------------------------------------------ menu
  private rulesBuilder: (() => HTMLElement) | null = null;
  setRulesBuilder(f: () => HTMLElement): void { this.rulesBuilder = f; }
  addHistory(row: HistoryRow): void { this.historyRows.unshift(row); if (this.historyRows.length > 50) this.historyRows.pop(); }

  openMenu(tab: 'rules' | 'settings' | 'history'): void {
    const tabs: ['rules' | 'settings' | 'history', string][] = [['rules', t('menu.rules')], ['settings', t('menu.settings')], ['history', t('menu.history')]];
    const panel = el('div', { class: 'tab-panel', role: 'tabpanel', tabindex: '0' });
    const bar = el('div', { class: 'tabs', role: 'tablist' });
    const show = (id: 'rules' | 'settings' | 'history') => {
      for (const b of bar.querySelectorAll('button')) { const on = b.dataset.tab === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
      panel.replaceChildren(id === 'rules' ? (this.rulesBuilder?.() ?? el('div')) : id === 'settings' ? this.settingsPanel() : this.historyPanel());
      panel.scrollTop = 0;
    };
    for (const [id, label] of tabs) {
      const b = el('button', { class: 'tab', type: 'button', role: 'tab', 'data-tab': id, text: label });
      b.addEventListener('click', () => show(id));
      bar.append(b);
    }
    const close = el('button', { class: 'btn close', type: 'button', 'aria-label': t('menu.close'), text: '×' });
    close.addEventListener('click', () => this.closeDialog());
    const node = el('div', { class: 'dialog menu', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('hud.menu'), tabindex: '-1' }, bar, close, panel);
    this.dialog(node);
    show(tab);
  }

  private settingsPanel(): HTMLElement {
    const s = this.settings;
    const slider = (key: 'master' | 'music' | 'sfx', label: string) => {
      const id = `set-${key}`;
      const input = el('input', { id, type: 'range', min: '0', max: '100', value: String(Math.round(s[key] * 100)) });
      input.addEventListener('input', () => { s[key] = Number(input.value) / 100; this.h.settings({ [key]: s[key] }); });
      return el('div', { class: 'set-row' }, el('label', { for: id, text: label }), input);
    };
    const toggle = (key: 'turbo' | 'reduced', label: string, hidden = false) => {
      const b = el('button', { class: 'btn toggle', type: 'button', role: 'switch', 'aria-checked': String(s[key]), text: s[key] ? t('set.on') : t('set.off') });
      b.addEventListener('click', () => { s[key] = !s[key]; b.setAttribute('aria-checked', String(s[key])); b.textContent = s[key] ? t('set.on') : t('set.off'); this.h.settings({ [key]: s[key] }); });
      const row = el('div', { class: 'set-row' }, el('span', { text: label }), b);
      row.hidden = hidden;
      return row;
    };
    const q = el('button', { class: 'btn toggle', type: 'button', text: s.quality === 'high' ? t('set.quality.high') : t('set.quality.low') });
    q.addEventListener('click', () => { s.quality = s.quality === 'high' ? 'low' : 'high'; q.textContent = s.quality === 'high' ? t('set.quality.high') : t('set.quality.low'); this.h.settings({ quality: s.quality }); });
    return el('div', { class: 'settings' }, slider('master', t('set.volume')), slider('music', t('set.music')), slider('sfx', t('set.sfx')),
      toggle('turbo', t('set.turbo'), !!this.jur?.disabledTurbo), toggle('reduced', t('set.reduced')), el('div', { class: 'set-row' }, el('span', { text: t('set.quality') }), q));
  }

  private historyPanel(): HTMLElement {
    if (!this.historyRows.length) return el('p', { class: 'muted', text: t('hist.empty') });
    const rows = this.historyRows.map((r) => {
      const b = el('button', { class: 'btn small', type: 'button', text: t('hist.replay') });
      b.addEventListener('click', () => { this.closeDialog(); this.h.replayRound(r.id); });
      return el('tr', {}, el('td', { text: `#${r.id}` }), el('td', { text: r.mode }), el('td', { text: r.bet }), el('td', { text: r.win }), el('td', {}, b));
    });
    return el('table', { class: 'history' }, el('thead', {}, el('tr', {}, el('th', { text: t('hist.round') }), el('th', { text: t('hist.mode') }), el('th', { text: t('hist.bet') }), el('th', { text: t('hist.win') }), el('th', {}))), el('tbody', {}, ...rows));
  }

  // ------------------------------------------------------------------ errors
  error(message: string, actions: { label: string; run: () => void; primary?: boolean }[]): void {
    const btns = actions.map((a) => { const b = el('button', { class: `btn ${a.primary ? 'primary' : 'secondary'}`, type: 'button', text: a.label }); b.addEventListener('click', () => { this.closeDialog(); a.run(); }); return b; });
    const node = el('div', { class: 'dialog error', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'err-title', 'aria-describedby': 'err-msg', tabindex: '-1' },
      el('h2', { id: 'err-title', text: t('err.title') }), el('p', { id: 'err-msg', text: message }), el('div', { class: 'actions' }, ...btns));
    this.dialog(node);
  }

  hide(on: boolean): void { this.root.classList.toggle('hidden', on); }
}
