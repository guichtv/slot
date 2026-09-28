import './menu.css';
import { bookToMoney, formatMoney } from '../core/money';
import { math, type MathConfig } from '../config/math';
import { intlLocale, onLangChange, t } from '../i18n';
import { entry } from '../render/assets';
import type { SceneLayout } from '../render/layout';
import type { TurboLevel } from './hud';
import { h, pressable, trapFocus } from './dom';
import { applyArt, artImg, cfButton, cfClose, cfSwitch, fitAll, fitText, placeArea, playArea } from './dialogs';
import { buyModeName, buyModes, buyPrice, buyVisual, type BuyMode } from './buy';

/**
 * Menu du jeu à onglets arrondis : RÈGLES, RÉGLAGES, HISTORIQUE.
 * - La slot reste visible derrière (voile léger) ; Échap, le voile ou le bouton X (icône seule) ferment.
 * - Règles : tout vient de game-math-config (gains par way en monnaie pour la mise courante, coûts, Ante, RTP, gain max).
 *   Le statut « provisoire » de la config n'est jamais affiché.
 * - Réglages persistés (localStorage, try/catch) ; Historique : manches récentes avec « Revoir ».
 */

export type MenuTab = 'rules' | 'settings' | 'history';
export const MENU_TABS: readonly MenuTab[] = ['rules', 'settings', 'history'];
export type Quality = 'high' | 'low';
export type VolumeChannel = 'master' | 'music' | 'effects';

export interface MenuSettings {
  master: number;
  music: number;
  effects: number;
  turbo: TurboLevel;
  reducedMotion: boolean;
  quality: Quality;
}

export interface HistoryItem {
  id: string;
  mode: string;
  /** mise de base (base 1e6) */
  bet: number;
  /** gain en unités de book (×100 de la mise de base) */
  payout: number;
  /** horodatage (ms epoch, ISO ou Date) */
  time: number | string | Date;
}

export interface GameMenuOptions {
  /** mise de base courante (base 1e6) */
  getBet(): number;
  getHistory(): HistoryItem[];
  onReplay(id: string): void;
  /** volumes 0..1 */
  onVolume(channel: VolumeChannel, value: number): void;
  onTurbo(level: TurboLevel): void;
  onReducedMotion(on: boolean): void;
  onQuality(q: Quality): void;
  getConfig?(): MathConfig;
  onOpen?(): void;
  onClose?(): void;
  /** stockage des réglages (défaut : localStorage, protégé par try/catch) */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

/* ------------------------------------------------------------------ */
/* Fonctions pures (testées)                                           */
/* ------------------------------------------------------------------ */

export const SETTINGS_KEY = 'bt.settings';
export const QUALITY_KEY = 'bt.quality';

export function defaultSettings(prefersReduced: boolean): MenuSettings {
  return { master: 0.8, music: 0.7, effects: 0.9, turbo: 0, reducedMotion: prefersReduced, quality: 'high' };
}

const unit = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

/** Réglages lus (JSON quelconque) -> réglages valides, bornés, complétés par défaut. */
export function sanitizeSettings(raw: unknown, prefersReduced: boolean): MenuSettings {
  const d = defaultSettings(prefersReduced);
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const turbo = r.turbo === 1 || r.turbo === 2 ? r.turbo : 0;
  return {
    master: unit(r.master, d.master),
    music: unit(r.music, d.music),
    effects: unit(r.effects, d.effects),
    turbo,
    reducedMotion: typeof r.reducedMotion === 'boolean' ? r.reducedMotion : d.reducedMotion,
    quality: r.quality === 'low' ? 'low' : r.quality === 'high' ? 'high' : d.quality,
  };
}

export function loadSettings(storage: Pick<Storage, 'getItem'> | null | undefined, prefersReduced: boolean): MenuSettings {
  let raw: unknown = null;
  let quality: string | null = null;
  try {
    const s = storage?.getItem(SETTINGS_KEY);
    raw = s ? JSON.parse(s) : null;
    quality = storage?.getItem(QUALITY_KEY) ?? null;
  } catch {
    raw = null;
  }
  const out = sanitizeSettings(raw, prefersReduced);
  // la qualité est aussi lue au démarrage (bt.quality) : même source de vérité
  if (quality === 'low' || quality === 'high') out.quality = quality;
  return out;
}

export function saveSettings(storage: Pick<Storage, 'setItem'> | null | undefined, s: MenuSettings): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(s));
    storage.setItem(QUALITY_KEY, s.quality);
    return true;
  } catch {
    return false;
  }
}

/** Ordre de la table : WILD, premiums, lows, puis tout autre symbole payant de la config. */
export const PAY_ORDER = ['W', 'H1', 'H2', 'H3', 'H4', 'L1', 'L2', 'L3', 'L4'];

export interface PayRow {
  id: string;
  /** du plus long au plus court : [{ n: 5, value }, { n: 4, … }, { n: 3, … }] ; value en ×100 de la mise par way */
  pays: Array<{ n: number; value: number }>;
}

export function paytableRows(cfg: MathConfig): PayRow[] {
  const ids = Object.keys(cfg.paytable).filter((k) => !k.startsWith('_') && typeof cfg.paytable[k] === 'object');
  ids.sort((a, b) => {
    const ia = PAY_ORDER.indexOf(a);
    const ib = PAY_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  return ids.map((id) => {
    const row = cfg.paytable[id] as Record<string, number>;
    const pays = Object.entries(row)
      .map(([n, value]) => ({ n: Number(n), value }))
      .filter((p) => Number.isInteger(p.n) && p.n > 0 && Number.isFinite(p.value))
      .sort((a, b) => b.n - a.n);
    return { id, pays };
  });
}

/** Gain par way en monnaie pour la mise courante : mise × valeur / 100 (entier, arrondi exact). */
export function payAmount(bet: number, value: number): number {
  return bookToMoney(value, bet);
}

/** Nombre de ways : lignes ^ colonnes (5×5 = 3 125). */
export function waysCount(cols = 5, rows = 5): number {
  return rows ** cols;
}

/**
 * Relances par nombre de Scatters (concept : 2 -> +2, 3 -> +5, 4+ -> +8 en super).
 * La config actuelle n'en porte qu'une (retrigger) : elle prime ; une table complète future (retriggers) aussi.
 * Le dernier palier vaut « N ou plus ».
 */
const RETRIGGER_DEFAULTS: Record<'standard' | 'super', Record<number, number>> = {
  standard: { 2: 2, 3: 5 },
  super: { 2: 2, 3: 5, 4: 8 },
};

export function retriggerTable(cfg: MathConfig, kind: 'standard' | 'super'): Array<{ scatters: number; label: string; spins: number }> {
  const table: Record<number, number> = { ...RETRIGGER_DEFAULTS[kind] };
  const fs = cfg.freeSpins[kind] as MathConfig['freeSpins']['standard'] & { retriggers?: Record<string, number> };
  if (fs?.retriggers) for (const [k, v] of Object.entries(fs.retriggers)) if (Number(k) > 0 && v > 0) table[Number(k)] = v;
  if (fs?.retrigger && fs.retrigger.scatters > 0 && fs.retrigger.spins > 0) table[fs.retrigger.scatters] = fs.retrigger.spins;
  const keys = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b);
  return keys.map((k, i) => ({ scatters: k, label: i === keys.length - 1 ? `${k}+` : String(k), spins: table[k] as number }));
}

const MODE_ORDER = ['BASE', 'ANTE', 'BONUS', 'SUPER', 'BLAST', 'MEGA'];

export function modeRtps(cfg: MathConfig): Array<{ mode: string; rtp: number }> {
  return Object.entries(cfg.modes)
    .map(([mode, m]) => ({ mode, rtp: m.rtp }))
    .sort((a, b) => {
      const ia = MODE_ORDER.indexOf(a.mode);
      const ib = MODE_ORDER.indexOf(b.mode);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.mode.localeCompare(b.mode);
    });
}

export function formatPercent(rtp: number, locale = 'en-US'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rtp);
  } catch {
    return `${(rtp * 100).toFixed(2)}%`;
  }
}

export function formatNumber(x: number, locale = 'en-US'): string {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(x);
  } catch {
    return String(x);
  }
}

/** Gain d'une manche de l'historique en monnaie (payout en ×100 de la mise de base). */
export function historyWin(item: Pick<HistoryItem, 'bet' | 'payout'>): number {
  return bookToMoney(item.payout, item.bet);
}

/** Montant débité pour une manche : mise × coût du mode. */
export function historyCost(item: Pick<HistoryItem, 'bet' | 'mode'>, cfg: MathConfig): number {
  return buyPrice(item.bet, cfg.modes[item.mode]?.cost ?? 1);
}

/** Heure (même jour) ou date + heure. */
export function formatTime(time: number | string | Date, locale = 'en-US', now: Date = new Date()): string {
  const d = time instanceof Date ? time : new Date(time);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  try {
    const f = new Intl.DateTimeFormat(locale, sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return f.format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

/** clé d'art d'un symbole (corps illustré si le symbole est en pièces) */
export function symbolArtKey(id: string): string {
  return entry(`sym.${id}.body`) ? `sym.${id}.body` : `sym.${id}`;
}

const MODE_NAME: Record<string, string> = {
  BASE: 'mode.BASE',
  ANTE: 'ante.label',
  BONUS: 'bonus.standard.name',
  SUPER: 'bonus.super.name',
  BLAST: 'feature.blast.name',
  MEGA: 'feature.mega.name',
};

export function modeName(mode: string): string {
  const k = MODE_NAME[mode];
  return k ? t(k) : mode;
}

/* ------------------------------------------------------------------ */
/* Composant                                                           */
/* ------------------------------------------------------------------ */

function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function prefersReduced(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

let uid = 0;

export class GameMenu {
  readonly root: HTMLElement;
  private veil = h('div', { class: 'cf-veil gm-veil' });
  private panel = h('div', { class: 'cf-panel gm-panel', role: 'dialog', 'aria-modal': 'true', tabindex: '-1' });
  private tablist = h('div', { class: 'gm-tabs', role: 'tablist' });
  private body = h('div', { class: 'gm-body', role: 'tabpanel', tabindex: '0' });
  private tabs = new Map<MenuTab, HTMLButtonElement>();
  private closeBtn: HTMLButtonElement;
  private current: MenuTab = 'rules';
  private open_ = false;
  private untrap: (() => void) | null = null;
  private storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  private s: MenuSettings;
  private turboAllowed = { turbo: true, ultra: true };
  private id = `gm${++uid}`;

  constructor(private opts: GameMenuOptions) {
    this.storage = opts.storage === undefined ? safeStorage() : opts.storage;
    this.s = loadSettings(this.storage, prefersReduced());
    this.applyMotion();
    for (const tab of MENU_TABS) {
      const b = h('button', { type: 'button', class: 'gm-tab', role: 'tab', id: `${this.id}-tab-${tab}`, 'aria-controls': `${this.id}-panel`, 'aria-selected': 'false', tabindex: '-1', 'data-tab': tab });
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select(tab);
      });
      pressable(b);
      this.tabs.set(tab, b);
      this.tablist.append(b);
    }
    this.tablist.addEventListener('keydown', (e) => this.onTabKey(e));
    this.body.id = `${this.id}-panel`;
    this.closeBtn = cfClose(t('common.close'), () => this.close());
    this.panel.append(h('div', { class: 'gm-head' }, this.tablist), this.body, this.closeBtn);
    const area = h('div', { class: 'cf-area gm-area' }, this.panel);
    this.root = h('div', { class: 'cf-ui cf-layer gm-root', hidden: true }, this.veil, area);
    applyArt(this.root);
    this.veil.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.veil.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.open_) return;
      e.preventDefault();
      e.stopPropagation();
      this.close();
    });
    this.refreshTexts();
    onLangChange(() => {
      this.refreshTexts();
      if (this.open_) this.renderBody();
    });
  }

  get isOpen(): boolean {
    return this.open_;
  }

  get tab(): MenuTab {
    return this.current;
  }

  /** réglages courants (à appliquer au démarrage via applyAll) */
  get settings(): Readonly<MenuSettings> {
    return this.s;
  }

  /** applique tous les réglages mémorisés via les callbacks (à appeler une fois au démarrage) */
  applyAll(): void {
    this.opts.onVolume('master', this.s.master);
    this.opts.onVolume('music', this.s.music);
    this.opts.onVolume('effects', this.s.effects);
    this.opts.onTurbo(this.clampTurbo(this.s.turbo));
    this.opts.onReducedMotion(this.s.reducedMotion);
    this.opts.onQuality(this.s.quality);
  }

  setLayout(l: SceneLayout): void {
    placeArea(this.root, playArea(l));
    this.root.dataset.layout = l.cls;
    if (this.open_) {
      fitAll(this.body);
      this.fitTabs();
    }
  }

  /** synchronise le niveau turbo changé ailleurs (bouton du HUD) */
  setTurbo(level: TurboLevel): void {
    if (this.s.turbo === level) return;
    this.s = { ...this.s, turbo: level };
    this.persist();
    if (this.open_ && this.current === 'settings') this.renderBody();
  }

  /** juridiction : turbo et/ou super turbo interdits */
  setTurboAllowed(allowed: { turbo: boolean; ultra: boolean }): void {
    this.turboAllowed = { ...allowed };
    if (this.open_ && this.current === 'settings') this.renderBody();
  }

  open(tab?: MenuTab): void {
    if (tab) this.current = tab;
    if (this.open_) {
      this.select(this.current);
      return;
    }
    this.open_ = true;
    this.root.hidden = false;
    this.refreshTexts();
    this.renderBody();
    this.fitTabs();
    this.untrap = trapFocus(this.panel);
    queueMicrotask(() => this.tabs.get(this.current)?.focus());
    this.opts.onOpen?.();
  }

  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.root.hidden = true;
    this.body.replaceChildren();
    this.untrap?.();
    this.untrap = null;
    this.opts.onClose?.();
  }

  select(tab: MenuTab): void {
    this.current = tab;
    this.refreshTabs();
    if (this.open_) {
      this.renderBody();
      this.fitTabs();
    }
  }

  private onTabKey(e: KeyboardEvent): void {
    const i = MENU_TABS.indexOf(this.current);
    let next: MenuTab | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = MENU_TABS[(i + 1) % MENU_TABS.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = MENU_TABS[(i + MENU_TABS.length - 1) % MENU_TABS.length];
    else if (e.key === 'Home') next = MENU_TABS[0];
    else if (e.key === 'End') next = MENU_TABS[MENU_TABS.length - 1];
    if (!next) return;
    e.preventDefault();
    this.select(next);
    this.tabs.get(next)?.focus();
  }

  private refreshTexts(): void {
    for (const [tab, b] of this.tabs) b.replaceChildren(h('span', { class: 'gm-tab-text', 'data-fit': '' }, t(`menu.tab.${tab}`)));
    if (this.open_) this.fitTabs();
    this.panel.setAttribute('aria-label', t('hud.menu'));
    this.closeBtn.setAttribute('aria-label', t('common.close'));
    this.refreshTabs();
  }

  /** libellés d'onglets : ajustés à la largeur, puis tous à la même taille (la plus petite) */
  private fitTabs(): void {
    const run = () => {
      const texts = [...this.tablist.querySelectorAll<HTMLElement>('.gm-tab-text')];
      texts.forEach((el) => fitText(el, 11));
      const sizes = texts.map((el) => parseFloat(getComputedStyle(el).fontSize)).filter((v) => v > 0);
      if (!sizes.length) return;
      const min = Math.min(...sizes);
      texts.forEach((el) => (el.style.fontSize = `${min}px`));
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else run();
  }

  private refreshTabs(): void {
    for (const [tab, b] of this.tabs) {
      const sel = tab === this.current;
      b.setAttribute('aria-selected', sel ? 'true' : 'false');
      b.tabIndex = sel ? 0 : -1;
    }
    this.body.setAttribute('aria-labelledby', `${this.id}-tab-${this.current}`);
    this.root.dataset.tab = this.current;
  }

  private cfg(): MathConfig {
    return this.opts.getConfig?.() ?? math();
  }

  private renderBody(): void {
    const content = this.current === 'rules' ? this.renderRules() : this.current === 'settings' ? this.renderSettings() : this.renderHistory();
    this.body.replaceChildren(content);
    this.body.scrollTop = 0;
    fitAll(this.body);
  }

  /* ---------------------------- RÈGLES ---------------------------- */

  private renderRules(): HTMLElement {
    const cfg = this.cfg();
    const bet = this.opts.getBet();
    const loc = intlLocale();
    const num = (x: number) => formatNumber(x, loc);
    const p = (key: string, params?: Record<string, string | number>, cls = 'gm-p') => h('p', { class: cls }, t(key, params));
    const sec = (key: string, ...kids: Array<Node | null>) => h('section', { class: 'gm-sec' }, h('h3', { class: 'gm-h' }, t(key)), ...kids);
    const wrap = h('div', { class: 'gm-rules' });

    // façons de gagner
    wrap.append(sec('rules.ways.title', p('rules.ways.text', { ways: num(waysCount(5, 5)) }), p('rules.ways.calc', undefined, 'gm-p gm-strong')));

    // table des gains : cartes symbole (2 colonnes sur mobile)
    const grid = h('div', { class: 'gm-pays' });
    for (const row of paytableRows(cfg)) {
      const name = t(`sym.${row.id}`);
      const dl = h('dl', { class: 'gm-pay-rows' });
      for (const pay of row.pays) {
        dl.append(
          h(
            'div',
            { class: 'gm-pay-row' },
            h('dt', { class: 'gm-chip' }, h('span', { 'aria-hidden': 'true' }, String(pay.n)), h('span', { class: 'visually-hidden' }, t('rules.reels', { n: pay.n }))),
            h('dd', { class: 'gm-pay-amt', 'data-fit': '' }, formatMoney(payAmount(bet, pay.value))),
          ),
        );
      }
      grid.append(h('div', { class: `gm-pay${row.id === 'W' ? ' is-wild' : ''}`, role: 'group', 'aria-label': name }, h('div', { class: 'gm-pay-art' }, artImg(symbolArtKey(row.id), '', name)), dl));
    }
    wrap.append(sec('rules.pays.title', p('rules.pays.note'), grid));

    // WILD et SCATTER
    const feat = (art: string, title: string, textKey: string) =>
      h('div', { class: 'gm-feat' }, h('div', { class: 'gm-feat-art' }, artImg(art, '', title)), h('div', { class: 'gm-feat-txt' }, h('h4', { class: 'gm-h4' }, title), p(textKey)));
    wrap.append(sec('rules.special.title', feat(symbolArtKey('W'), t('sym.W'), 'rules.wild.text'), feat(symbolArtKey('S'), t('sym.S'), 'rules.scatter.text')));

    // BLAST & CARVE
    const tnt = cfg.tnt as Record<string, { w: number; h: number }>;
    const charges = h('div', { class: 'gm-charges' });
    for (const [kind, art] of [['stick', 'sym.T.stick'], ['bundle', 'sym.T.bundle'], ['keg', 'sym.T.keg']] as const) {
      const z = tnt[kind] ?? (kind === 'keg' ? tnt.crate : undefined) ?? { w: kind === 'stick' ? 2 : kind === 'bundle' ? 3 : 4, h: kind === 'stick' ? 2 : kind === 'bundle' ? 3 : 4 };
      charges.append(h('figure', { class: 'gm-charge' }, h('div', { class: 'gm-charge-art' }, artImg(art, '', t(`sym.T.${kind}`))), h('figcaption', { class: 'gm-charge-size' }, `${z.w}×${z.h}`)));
    }
    wrap.append(sec('rules.blast.title', p('rules.blast.text1'), charges, p('rules.blast.text2'), p('rules.blast.text3')));

    // bonus : SUNDOWN SHIFT, FLOODLIGHT SHIFT, relances, CORNERSTONE
    const bonus = (kind: 'standard' | 'super', mode: BuyMode) => {
      const fs = cfg.freeSpins[kind];
      const trig = kind === 'super' ? `${fs.scatters}+` : String(fs.scatters);
      const retr = h('ul', { class: 'gm-retrig', 'aria-label': t('rules.retrigger') });
      for (const r of retriggerTable(cfg, kind)) {
        retr.append(
          h(
            'li',
            { class: 'gm-retrig-item' },
            h('span', { class: 'gm-chip', 'aria-hidden': 'true' }, r.label),
            artImg('sym.S.body', 'gm-retrig-art'),
            h('span', { class: 'gm-retrig-val', 'aria-hidden': 'true' }, t('fs.plus', { n: r.spins })),
            h('span', { class: 'visually-hidden' }, t('rules.retriggerRow', { n: r.label, spins: r.spins })),
          ),
        );
      }
      return h(
        'div',
        { class: `gm-bonus gm-bonus-${kind}` },
        h(
          'div',
          { class: 'gm-bonus-head' },
          buyVisual(mode),
          h(
            'div',
            { class: 'gm-bonus-id' },
            h('h4', { class: 'gm-h4' }, t(`bonus.${kind}.name`)),
            h('span', { class: 'gm-bonus-trig' }, t('rules.trigger', { n: trig })),
            h('span', { class: 'gm-bonus-spins' }, t('bonus.spins', { n: fs.spins })),
          ),
        ),
        p(`bonus.${kind}.rule`),
        h('div', { class: 'gm-retrig-box' }, h('span', { class: 'gm-retrig-label' }, t('rules.retrigger')), retr),
      );
    };
    wrap.append(
      sec(
        'rules.bonus.title',
        bonus('standard', 'BONUS'),
        bonus('super', 'SUPER'),
        h('div', { class: 'gm-corner' }, h('h4', { class: 'gm-h4' }, t('rules.corner.title')), p('rules.corner.text')),
      ),
    );

    // features d'un spin
    const featureBlock = (mode: 'BLAST' | 'MEGA', ruleKey: string) =>
      h('div', { class: 'gm-bonus' }, h('div', { class: 'gm-bonus-head' }, buyVisual(mode), h('div', { class: 'gm-bonus-id' }, h('h4', { class: 'gm-h4' }, buyModeName(mode)), p(ruleKey))));
    const hasFeat = cfg.modes.BLAST || cfg.modes.MEGA;
    if (hasFeat) {
      wrap.append(
        sec(
          'rules.features.title',
          cfg.modes.BLAST ? featureBlock('BLAST', 'feature.blast.rule') : null,
          cfg.modes.MEGA ? featureBlock('MEGA', 'feature.mega.rule') : null,
        ),
      );
    }

    // prix des modes (coût × mise)
    const prices = h('div', { class: 'gm-table', role: 'table', 'aria-label': t('rules.modes.title') });
    for (const mode of buyModes(cfg)) {
      const cost = cfg.modes[mode]?.cost ?? 1;
      prices.append(
        h(
          'div',
          { class: 'gm-tr', role: 'row' },
          h('span', { class: 'gm-td gm-td-name', role: 'cell' }, buyModeName(mode)),
          h('span', { class: 'gm-td gm-td-x', role: 'cell' }, t('rules.xBet', { x: num(cost) })),
          h('span', { class: 'gm-td gm-td-amt', role: 'cell', 'data-fit': '' }, formatMoney(buyPrice(bet, cost))),
        ),
      );
    }
    wrap.append(sec('rules.modes.title', prices));

    // ANTE
    const ante = cfg.modes.ANTE;
    if (ante) {
      wrap.append(
        sec(
          'ante.label',
          p('rules.ante.text', { cost: num(ante.cost), factor: num(ante.bonusChanceFactor ?? 1), amount: formatMoney(buyPrice(bet, ante.cost)) }),
          p('rules.modes.note'),
        ),
      );
    }

    // gain max
    wrap.append(sec('rules.maxwin.title', p('rules.maxwin.text', { x: num(cfg.maxWinX), amount: formatMoney(buyPrice(bet, cfg.maxWinX)) })));

    // RTP par mode
    const rtp = h('div', { class: 'gm-table', role: 'table', 'aria-label': t('rules.rtp.title') });
    for (const r of modeRtps(cfg)) {
      rtp.append(
        h(
          'div',
          { class: 'gm-tr', role: 'row' },
          h('span', { class: 'gm-td gm-td-name', role: 'cell' }, modeName(r.mode)),
          h('span', { class: 'gm-td gm-td-amt', role: 'cell' }, formatPercent(r.rtp, loc)),
        ),
      );
    }
    wrap.append(sec('rules.rtp.title', p('rules.rtp.text'), rtp));

    wrap.append(p('rules.malfunction', undefined, 'gm-p gm-fine'));
    return wrap;
  }

  /* --------------------------- RÉGLAGES --------------------------- */

  private renderSettings(): HTMLElement {
    const wrap = h('div', { class: 'gm-settings' });
    const s = this.s;
    const row = (labelEl: HTMLElement, control: HTMLElement, cls = '') => h('div', { class: `gm-set ${cls}`.trim() }, labelEl, control);

    const slider = (ch: VolumeChannel, key: string, withIcon: boolean) => {
      const id = `${this.id}-vol-${ch}`;
      const input = h('input', { type: 'range', class: 'gm-range', id, min: '0', max: '100', step: '1' });
      const ico = withIcon ? h('span', { class: 'gm-set-ico', 'aria-hidden': 'true' }) : null;
      const paint = () => {
        const v = Number(input.value);
        input.style.setProperty('--pct', `${v}%`);
        input.setAttribute('aria-valuetext', `${v}%`);
        ico?.classList.toggle('is-off', v === 0);
      };
      input.value = String(Math.round(s[ch] * 100));
      paint();
      input.addEventListener('input', () => {
        paint();
        const v = Number(input.value) / 100;
        this.s = { ...this.s, [ch]: v };
        this.opts.onVolume(ch, v);
      });
      input.addEventListener('change', () => this.persist());
      return row(h('label', { class: 'gm-set-label', for: id }, ico, t(key)), input, 'is-slider');
    };
    wrap.append(slider('master', 'settings.volume', true), slider('music', 'settings.music', false), slider('effects', 'settings.effects', false));

    // turbo : off / turbo / ultra (icônes éclair réelles)
    const turboLabelId = `${this.id}-turbo`;
    const seg = h('div', { class: 'cf-seg gm-turbo', role: 'group', 'aria-labelledby': turboLabelId });
    const levels: TurboLevel[] = [0, 1, 2];
    for (const lv of levels) {
      const allowed = lv === 0 || (lv === 1 ? this.turboAllowed.turbo : this.turboAllowed.ultra && this.turboAllowed.turbo);
      const content: Array<Node | string> = lv === 0 ? [t('common.off')] : Array.from({ length: lv }, () => artImg('ui.ico.turbo', 'gm-bolt'));
      const b = h('button', { type: 'button', class: 'cf-seg-btn', 'aria-pressed': s.turbo === lv ? 'true' : 'false', 'aria-label': t(`settings.turbo.${lv}`), disabled: !allowed }, ...content);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.s = { ...this.s, turbo: lv };
        seg.querySelectorAll('button').forEach((x, i) => x.setAttribute('aria-pressed', i === lv ? 'true' : 'false'));
        this.persist();
        this.opts.onTurbo(lv);
      });
      pressable(b);
      seg.append(b);
    }
    wrap.append(row(h('span', { class: 'gm-set-label', id: turboLabelId }, t('settings.turbo')), seg));

    // animations réduites
    const sw = cfSwitch(t('settings.motion'), (on) => {
      this.s = { ...this.s, reducedMotion: on };
      this.applyMotion();
      this.persist();
      this.opts.onReducedMotion(on);
    });
    sw.set(s.reducedMotion);
    const motionLabelId = `${this.id}-motion`;
    sw.el.setAttribute('aria-labelledby', motionLabelId);
    sw.el.removeAttribute('aria-label');
    wrap.append(row(h('span', { class: 'gm-set-label', id: motionLabelId }, t('settings.motion')), sw.el));

    // qualité graphique
    const qLabelId = `${this.id}-quality`;
    const qseg = h('div', { class: 'cf-seg', role: 'group', 'aria-labelledby': qLabelId });
    for (const q of ['high', 'low'] as const) {
      const b = h('button', { type: 'button', class: 'cf-seg-btn', 'aria-pressed': s.quality === q ? 'true' : 'false' }, t(`settings.quality.${q}`));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.s = { ...this.s, quality: q };
        qseg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
        this.persist();
        this.opts.onQuality(q);
      });
      pressable(b);
      qseg.append(b);
    }
    wrap.append(row(h('span', { class: 'gm-set-label', id: qLabelId }, t('settings.quality')), qseg));
    return wrap;
  }

  /* -------------------------- HISTORIQUE -------------------------- */

  private renderHistory(): HTMLElement {
    const items = this.opts.getHistory();
    if (!items.length) {
      return h('div', { class: 'gm-empty' }, artImg('buck.heads.grin', 'gm-empty-art'), h('p', { class: 'gm-p' }, t('history.empty')));
    }
    const cfg = this.cfg();
    const loc = intlLocale();
    const now = new Date();
    const list = h('ol', { class: 'gm-hist' });
    for (const it of items) {
      const win = historyWin(it);
      const replay = cfButton(t('history.replay'), 'gm-replay', () => this.opts.onReplay(it.id));
      replay.setAttribute('aria-label', t('history.replayRound', { id: it.id }));
      list.append(
        h(
          'li',
          { class: 'gm-hrow' },
          h('div', { class: 'gm-hcell gm-hwhen' }, h('span', { class: 'gm-hmode' }, modeName(it.mode)), h('span', { class: 'gm-htime' }, formatTime(it.time, loc, now))),
          h('div', { class: 'gm-hcell gm-hbet' }, h('span', { class: 'gm-hlab' }, t('hud.bet')), h('span', { class: 'gm-hval', 'data-fit': '' }, formatMoney(historyCost(it, cfg)))),
          h('div', { class: 'gm-hcell gm-hwin' }, h('span', { class: 'gm-hlab' }, t('hud.win')), h('span', { class: `gm-hval${win > 0 ? ' is-win' : ''}`, 'data-fit': '' }, formatMoney(win))),
          replay,
        ),
      );
    }
    return list;
  }

  /* ------------------------------------------------------------------ */

  private clampTurbo(l: TurboLevel): TurboLevel {
    if (l === 2 && !(this.turboAllowed.ultra && this.turboAllowed.turbo)) return this.turboAllowed.turbo ? 1 : 0;
    if (l === 1 && !this.turboAllowed.turbo) return 0;
    return l;
  }

  private applyMotion(): void {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.motion = this.s.reducedMotion ? 'reduced' : 'full';
  }

  private persist(): void {
    saveSettings(this.storage, this.s);
  }
}
