import './ante.css';
import { formatMoney } from '../core/money';
import type { MathConfig } from '../config/math';
import { intlLocale, onLangChange, t } from '../i18n';
import { h, pressable } from './dom';
import { applyArt, fitAll } from './dialogs';
import type { Rect } from '../render/layout';

/**
 * ANTE BET (DOUBLE FUSE) sous le logo, à gauche : libellé, grand interrupteur ON/OFF bois / acier,
 * facteur réel de la config (« 3× BONUS CHANCE ») et coût du prochain spin (mise × coût Ante si actif, sinon mise).
 * Basculer n'est pas un achat : aucune animation de débit.
 */
export interface AnteState {
  on: boolean;
  /** coût du prochain spin (base 1e6) */
  nextCost: number;
  /** facteur de chance de bonus (modes.ANTE.bonusChanceFactor) */
  factor: number;
  disabled: boolean;
}

/** Coût du prochain spin : mise × coût Ante si actif, sinon la mise (même arrondi que le contrôleur). */
export function anteNextCost(bet: number, on: boolean, anteCost: number): number {
  return Math.round(bet * (on ? anteCost : 1));
}

/** Valeurs réelles lues dans la config maths (null si le mode ANTE n'existe pas). */
export function anteFromConfig(cfg: MathConfig, bet: number, on: boolean): { factor: number; cost: number; nextCost: number } | null {
  const m = cfg.modes.ANTE;
  if (!m) return null;
  return { factor: m.bonusChanceFactor ?? 1, cost: m.cost, nextCost: anteNextCost(bet, on, m.cost) };
}

export function formatFactor(x: number, locale = 'en-US'): string {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(x);
  } catch {
    return String(x);
  }
}

export class AntePanel {
  readonly root: HTMLElement;
  private btn: HTMLButtonElement;
  private label = h('span', { class: 'ante-label', 'data-fit': '' });
  private factor = h('span', { class: 'ante-factor', 'data-fit': '' });
  private costLabel = h('span', { class: 'ante-cost-label' });
  private costVal = h('span', { class: 'ante-cost-val', 'data-fit': '' });
  private swState = h('span', { class: 'ante-sw-state' });
  private state: AnteState = { on: false, nextCost: 0, factor: 1, disabled: false };
  /** textes affichés au dernier rendu (l'ajustement des tailles ne se refait que s'ils changent) */
  private shown = '';

  constructor(private cb: { onToggle(on: boolean): void }) {
    const info = h('span', { class: 'ante-info', id: 'ante-info' }, this.label, this.factor, h('span', { class: 'ante-cost' }, this.costLabel, this.costVal));
    this.btn = h(
      'button',
      { type: 'button', class: 'ante-btn', role: 'switch', 'aria-checked': 'false', 'aria-describedby': 'ante-info' },
      h('span', { class: 'ante-sw', 'aria-hidden': 'true' }, this.swState, h('span', { class: 'ante-sw-knob' })),
      info,
    );
    this.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.state.disabled) return;
      // retour immédiat ; l'appelant confirme par setState (ou rétablit l'état)
      const on = !this.state.on;
      this.setState({ on });
      this.cb.onToggle(on);
    });
    pressable(this.btn);
    this.root = h('div', { class: 'cf-ui ante', 'data-on': 'false' }, this.btn);
    applyArt(this.root);
    this.render();
    onLangChange(() => {
      this.shown = '';
      this.render();
    });
  }

  get isOn(): boolean {
    return this.state.on;
  }

  /** appelé à chaque changement d'état du jeu : sans modification, aucun accès au DOM */
  setState(s: Partial<AnteState>): void {
    const next = { ...this.state, ...s };
    const cur = this.state;
    if (next.on === cur.on && next.nextCost === cur.nextCost && next.factor === cur.factor && next.disabled === cur.disabled) return;
    this.state = next;
    this.render();
  }

  /** place l'encart dans le rectangle commun (sous le logo, à gauche) */
  layout(rect: Rect): void {
    const st = this.root.style;
    st.left = `${Math.round(rect.x)}px`;
    st.top = `${Math.round(rect.y)}px`;
    st.width = `${Math.round(rect.w)}px`;
    st.height = `${Math.round(rect.h)}px`;
    fitAll(this.root, '[data-fit]', 9);
  }

  setHidden(hidden: boolean): void {
    this.root.hidden = hidden;
  }

  private render(): void {
    const s = this.state;
    const name = t('ante.label');
    const factor = t('ante.factor', { x: formatFactor(s.factor, intlLocale()) });
    const next = t('ante.next');
    const cost = formatMoney(s.nextCost);
    const sw = s.on ? t('common.on') : t('common.off');
    this.btn.disabled = s.disabled;
    this.btn.setAttribute('aria-checked', s.on ? 'true' : 'false');
    this.root.dataset.on = s.on ? 'true' : 'false';
    const key = `${name}|${factor}|${next}|${cost}|${sw}`;
    if (key === this.shown) return;
    this.shown = key;
    this.label.textContent = name;
    this.factor.textContent = factor;
    this.costLabel.textContent = next;
    this.costVal.textContent = cost;
    this.swState.textContent = sw;
    this.btn.setAttribute('aria-label', name);
    fitAll(this.root, '[data-fit]', 9);
  }
}
