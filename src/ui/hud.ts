import { h, pressable } from './dom';
import { t, onLangChange } from '../i18n';
import { formatMoney } from '../core/money';
import type { SceneLayout } from '../render/layout';

/**
 * HUD compact : BUY BONUS illustré à gauche, mise − / +, gain, solde, gros SPIN rond à droite,
 * petits boutons (menu, son, turbo éclair, autoplay, infos). Ante sous le logo.
 * Une disposition par classe d'écran (data-layout), testée sans chevauchement sur ~25 tailles.
 */
export type SpinPhase = 'idle' | 'spinning' | 'stopping' | 'locked' | 'autoplay' | 'bonus';
export type TurboLevel = 0 | 1 | 2;

export interface HudCallbacks {
  spin(): void;
  quickStop(): void;
  betDelta(dir: -1 | 1): void;
  buy(): void;
  menu(tab?: 'rules' | 'settings' | 'history'): void;
  sound(): void;
  turbo(): void;
  autoplay(count: number | null): void;
  ante(on: boolean): void;
}

export const AUTOPLAY_STEPS = [10, 25, 50, 100, 250, 500, 1000];

export class Hud {
  readonly root: HTMLElement;
  private els: Record<string, HTMLElement> = {};
  private phase: SpinPhase = 'idle';
  private autoOpen = false;
  private flags = { turbo: true, autoplay: true, buy: true, ante: true };

  constructor(private cb: HudCallbacks) {
    const e = this.els;
    const btn = (key: string, cls: string, label: string, onClick: () => void, content?: Node | string) => {
      const b = h('button', { class: `hud-btn ${cls}`, type: 'button', 'aria-label': label, 'data-key': key }, content ?? '');
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onClick();
      });
      pressable(b);
      e[key] = b;
      return b;
    };
    const val = (key: string, cls: string) => {
      const lab = h('span', { class: 'hud-label' });
      const v = h('span', { class: 'hud-value', 'aria-live': key === 'win' ? 'polite' : 'off' });
      const box = h('div', { class: `hud-val ${cls}` }, lab, v);
      e[`${key}Label`] = lab;
      e[key] = v;
      e[`${key}Box`] = box;
      return box;
    };

    const autoMenu = h('div', { class: 'hud-auto-pop', role: 'menu', hidden: true });
    for (const n of AUTOPLAY_STEPS) {
      const b = h('button', { class: 'hud-auto-item', type: 'button', role: 'menuitem', 'data-n': n }, String(n));
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.closeAuto();
        cb.autoplay(n);
      });
      pressable(b);
      autoMenu.append(b);
    }
    e.autoPop = autoMenu;

    const spinCount = h('span', { class: 'hud-spin-count', 'aria-hidden': 'true' });
    e.spinCount = spinCount;
    const spin = btn('spin', 'hud-spin', t('hud.spin'), () => this.onSpin(), h('span', { class: 'hud-spin-face' }, spinCount));
    spin.setAttribute('data-phase', 'idle');

    this.root = h(
      'div',
      { class: 'hud', id: 'hud', 'data-layout': 'desktop' },
      h('div', { class: 'hud-bar' }),
      btn('buy', 'hud-buy', t('hud.buy'), () => cb.buy(), h('span', { class: 'hud-buy-text' })),
      h(
        'div',
        { class: 'hud-small' },
        btn('menu', 'hud-ico ico-menu', t('hud.menu'), () => cb.menu()),
        btn('sound', 'hud-ico ico-sound', t('hud.sound'), () => cb.sound()),
        btn('info', 'hud-ico ico-info', t('hud.info'), () => cb.menu('rules')),
      ),
      val('balance', 'hud-balance'),
      val('win', 'hud-win'),
      h(
        'div',
        { class: 'hud-bet' },
        btn('betDown', 'hud-step hud-minus', t('hud.betDown'), () => cb.betDelta(-1), h('span', { class: 'glyph' })),
        val('bet', 'hud-bet-val'),
        btn('betUp', 'hud-step hud-plus', t('hud.betUp'), () => cb.betDelta(1), h('span', { class: 'glyph' })),
      ),
      h(
        'div',
        { class: 'hud-spin-group' },
        btn('turbo', 'hud-ico ico-turbo', t('hud.turbo'), () => cb.turbo()),
        spin,
        h('div', { class: 'hud-auto-wrap' }, btn('auto', 'hud-ico ico-auto', t('hud.autoplay'), () => this.toggleAuto()), autoMenu),
      ),
    );
    this.refreshTexts();
    onLangChange(() => this.refreshTexts());
    document.addEventListener('pointerdown', (ev) => {
      if (this.autoOpen && !(ev.target as HTMLElement).closest('.hud-auto-wrap')) this.closeAuto();
    });
  }

  private refreshTexts(): void {
    const e = this.els;
    (e.balanceLabel as HTMLElement).textContent = t('hud.balance');
    (e.winLabel as HTMLElement).textContent = t('hud.win');
    (e.betLabel as HTMLElement).textContent = t('hud.bet');
    const buyText = this.root.querySelector('.hud-buy-text');
    if (buyText) buyText.textContent = t('hud.buy');
    for (const [k, key] of [['spin', 'hud.spin'], ['buy', 'hud.buy'], ['menu', 'hud.menu'], ['sound', 'hud.sound'], ['info', 'hud.info'], ['betDown', 'hud.betDown'], ['betUp', 'hud.betUp'], ['turbo', 'hud.turbo'], ['auto', 'hud.autoplay']] as const) {
      e[k]?.setAttribute('aria-label', t(key));
    }
  }

  private onSpin(): void {
    if (this.phase === 'spinning') this.cb.quickStop();
    else if (this.phase === 'autoplay') this.cb.autoplay(null);
    else if (this.phase === 'idle') this.cb.spin();
  }

  private toggleAuto(): void {
    if (this.phase === 'autoplay') {
      this.cb.autoplay(null);
      return;
    }
    if (this.phase !== 'idle') return;
    this.autoOpen ? this.closeAuto() : this.openAuto();
  }

  private openAuto(): void {
    this.autoOpen = true;
    (this.els.autoPop as HTMLElement).hidden = false;
    this.els.auto?.setAttribute('aria-expanded', 'true');
    (this.els.autoPop?.querySelector('button') as HTMLElement | null)?.focus();
  }

  closeAuto(): void {
    this.autoOpen = false;
    (this.els.autoPop as HTMLElement).hidden = true;
    this.els.auto?.setAttribute('aria-expanded', 'false');
  }

  setJurisdiction(f: Partial<{ turbo: boolean; autoplay: boolean; buy: boolean; ante: boolean }>): void {
    this.flags = { ...this.flags, ...f };
    (this.els.turbo as HTMLElement).hidden = !this.flags.turbo;
    (this.els.auto as HTMLElement).hidden = !this.flags.autoplay;
    (this.els.buy as HTMLElement).hidden = !this.flags.buy;
  }

  setBalance(amount: number): void {
    (this.els.balance as HTMLElement).textContent = formatMoney(amount);
  }

  setWin(amount: number | null, label?: string): void {
    const box = this.els.winBox as HTMLElement;
    (this.els.winLabel as HTMLElement).textContent = label ?? t('hud.win');
    (this.els.win as HTMLElement).textContent = amount === null ? '' : formatMoney(amount);
    box.classList.toggle('is-empty', amount === null || amount === 0);
  }

  pulseWin(): void {
    const box = this.els.winBox as HTMLElement;
    box.classList.remove('pulse');
    void box.offsetWidth;
    box.classList.add('pulse');
  }

  setBet(amount: number, canDown: boolean, canUp: boolean): void {
    (this.els.bet as HTMLElement).textContent = formatMoney(amount);
    this.betBounds = { canDown, canUp };
    this.applyLocks();
  }

  private betBounds = { canDown: true, canUp: true };

  /** phase réelle du jeu : le SPIN la reflète, les commandes se verrouillent */
  setPhase(p: SpinPhase, autoLeft?: number): void {
    this.phase = p;
    const spin = this.els.spin as HTMLElement;
    spin.setAttribute('data-phase', p);
    (this.els.spinCount as HTMLElement).textContent = p === 'autoplay' && autoLeft !== undefined ? String(autoLeft) : '';
    spin.setAttribute('aria-label', p === 'spinning' ? t('hud.stop') : p === 'autoplay' ? t('hud.stopAuto') : t('hud.spin'));
    if (p !== 'idle') this.closeAuto();
    this.applyLocks();
  }

  private applyLocks(): void {
    const idle = this.phase === 'idle';
    const set = (k: string, dis: boolean) => {
      const el = this.els[k] as HTMLButtonElement | undefined;
      if (el) el.disabled = dis;
    };
    set('betDown', !idle || !this.betBounds.canDown);
    set('betUp', !idle || !this.betBounds.canUp);
    set('buy', !idle);
    set('auto', !(idle || this.phase === 'autoplay'));
    set('spin', this.phase === 'locked' || this.phase === 'bonus' || this.phase === 'stopping');
    this.root.classList.toggle('in-round', !idle);
  }

  setTurbo(level: TurboLevel): void {
    const b = this.els.turbo as HTMLElement;
    b.setAttribute('data-level', String(level));
    b.setAttribute('aria-pressed', level > 0 ? 'true' : 'false');
  }

  setSound(on: boolean): void {
    const b = this.els.sound as HTMLElement;
    b.setAttribute('data-on', on ? '1' : '0');
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  /** place le HUD selon la mise en page commune */
  layout(l: SceneLayout): void {
    this.root.setAttribute('data-layout', l.cls);
    const s = this.root.style;
    s.left = `${l.hud.x}px`;
    s.top = `${l.hud.y}px`;
    s.width = `${l.hud.w}px`;
    s.height = `${l.hud.h}px`;
  }

  element(key: string): HTMLElement | undefined {
    return this.els[key];
  }
}
