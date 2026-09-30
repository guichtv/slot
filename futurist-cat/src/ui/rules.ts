// Rules tab (Stake requirement): ways, paytable read from the config (in currency for the current
// bet), Wild, Scatter, laser dot, chips, bonuses, features and their prices, Ante, max win, RTP per
// mode, "Malfunction voids all pays and plays." (translated). Fully visible on mobile.
import { el } from './dom';
import { t } from '../i18n/i18n';
import type { GameConfig } from '../config/game-config';
import { LADDER } from '../contract/symbols';
import { MODES } from '../contract/events';

export function buildRules(cfg: GameConfig, o: { symbolUrl: (id: string) => string | null; money: (units: number) => string; bet: number; version: string; showRtp: boolean; costs: Partial<Record<string, number>> }): HTMLElement {
  const img = (id: string) => { const u = o.symbolUrl(id); return u ? el('img', { src: u, alt: id }) : el('span', { class: 'sym-txt', text: id }); };
  const pays = (['H4', 'H3', 'H2', 'H1', 'W', 'L4', 'L3', 'L2', 'L1'] as const).map((s) => {
    const p = cfg.paytable[s];
    return el('div', { class: 'pay' }, img(`sym.${s}`), el('ul', {}, ...[5, 4, 3].map((k) => el('li', {}, el('span', { text: t('rules.kind', { n: k }) }), el('b', { text: o.money(p[k - 3]! * o.bet) })))));
  });
  const cost = (m: string) => o.costs[m] ?? cfg.modes[m as keyof GameConfig['modes']]?.cost ?? 1;
  const nf = (x: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(x);
  const ladder = el('div', { class: 'ladder' }, ...LADDER.flatMap((s, i) => (i ? [el('span', { text: '→' }), img(`sym.${s}`)] : [img(`sym.${s}`)])));
  const retrig = Object.entries(cfg.bonus.retrigger).map(([s, n]) => el('p', { text: t('rules.retrigger', { s, n }) }));
  const rtp = MODES.filter((m) => cfg.modes[m]).map((m) => el('div', { text: t('rules.rtpMode', { mode: t(`rules.modes.${m}`), rtp: nf(cfg.modes[m]!.rtp) }) }));
  return el('div', { class: 'rules' },
    el('h3', { text: t('rules.title') }), el('p', { text: t('rules.ways') }), el('p', { text: t('rules.controls') }),
    el('h3', { text: t('rules.paytable') }), el('div', { class: 'paytable' }, ...pays),
    el('h3', { text: 'WILD · SCATTER' }), el('div', { class: 'ladder' }, img('sym.W'), img('sym.S')), el('p', { text: t('rules.wild') }), el('p', { text: t('rules.scatter') }),
    el('h3', { text: t('rules.ladder') }), ladder, el('p', { text: t('rules.laser') }), el('p', { text: t('rules.chips') }),
    el('h3', { text: `${t('bonus.nineLives')} · ${t('bonus.doubleGaze')}` }),
    el('p', { text: t('rules.nineLives', { n: cfg.bonus.nineLives.spins }) }), el('p', { text: t('rules.doubleGaze', { n: cfg.bonus.doubleGaze.spins }) }), ...retrig,
    el('h3', { text: t('rules.features') }),
    el('p', { text: t('rules.feature.scan', { x: nf(cost('SCAN')) }) }), el('p', { text: t('rules.feature.doubleScan', { x: nf(cost('DOUBLE_SCAN')) }) }),
    el('p', { text: t('rules.feature.bonus', { x: nf(cost('BONUS')) }) }), el('p', { text: t('rules.feature.super', { x: nf(cost('SUPER')) }) }),
    el('p', { text: t('rules.ante', { x: nf(cost('ANTE')), s: nf(cfg.modes.ANTE?.scatterChanceX ?? 2) }) }),
    el('p', { text: t('rules.maxWin', { x: nf(cfg.maxWinX) }) }), el('p', { text: t('rules.tiers') }),
    ...(o.showRtp ? [el('h3', { text: t('rules.rtp') }), el('div', { class: 'rtp' }, ...rtp)] : []),
    el('h3', { text: '—' }), el('p', { text: t('rules.malfunction') }), el('p', { class: 'muted', text: t('rules.version', { v: o.version }) }));
}
