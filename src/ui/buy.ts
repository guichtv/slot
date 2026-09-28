import './buy.css';
import { gsap } from 'gsap';
import { formatMoney, getMoneyFormat } from '../core/money';
import { math, type MathConfig } from '../config/math';
import { t, onLangChange } from '../i18n';
import { h, pressable } from './dom';
import { entry } from '../render/assets';
import { applyArt, artImg, cfButton, cfClose, fitAll, isTopTrap, placeArea, playArea, reducedMotion, trapDialog, warmArt } from './dialogs';
import type { SceneLayout } from '../render/layout';

/**
 * BUY BONUS : une seule page pour les bonus, les features d'un spin et la règle Ante.
 * Parcours : catalogue -> sélection d'une carte -> confirmation (devis figé) -> acceptation -> l'appelant achète.
 * - Annuler revient au catalogue, carte toujours sélectionnée ; fermer (X, Échap, voile) revient au jeu sans achat.
 * - Double clic bloqué : onConfirm n'est appelé qu'une fois, bouton désactivé tant que la promesse est en cours ;
 *   si elle renvoie false (refus, erreur), retour cohérent au catalogue.
 * - Achat impossible si l'Ante est actif (raison affichée) ou si le solde est inférieur au prix (carte atténuée + raison).
 */

export type BuyMode = 'BONUS' | 'SUPER' | 'BLAST' | 'MEGA';
export const BUY_MODES: readonly BuyMode[] = ['BONUS', 'SUPER', 'BLAST', 'MEGA'];

export interface BuyQuote {
  mode: BuyMode;
  /** mise de base (base 1e6) */
  bet: number;
  /** facteur de coût du mode (config maths) */
  cost: number;
  /** prix total exact (base 1e6) */
  price: number;
  currency: string;
}

export type BuyBlock = 'ante' | 'balance' | null;

/** Prix d'un mode : mise × coût, entier (même arrondi que le contrôleur). */
export function buyPrice(bet: number, cost: number): number {
  return Math.round(bet * cost);
}

/** Modes achetables présents dans la config, dans l'ordre du catalogue. */
export function buyModes(cfg: MathConfig): BuyMode[] {
  return BUY_MODES.filter((m) => cfg.modes[m] !== undefined);
}

export function quoteFor(cfg: MathConfig, mode: BuyMode, bet: number, currency: string): BuyQuote {
  const cost = cfg.modes[mode]?.cost ?? 1;
  return { mode, bet, cost, price: buyPrice(bet, cost), currency };
}

/** Raison qui empêche l'achat (Ante prioritaire sur le solde). */
export function buyBlock(price: number, balance: number, anteOn: boolean): BuyBlock {
  if (anteOn) return 'ante';
  if (price > balance) return 'balance';
  return null;
}

/** Nombre de free spins affiché pour un bonus acheté. */
export function bonusSpins(cfg: MathConfig, mode: BuyMode): number | null {
  const m = cfg.modes[mode];
  if (!m || m.kind !== 'bonus') return null;
  if (m.spins) return m.spins;
  const kind = m.bonus ?? (mode === 'SUPER' ? 'super' : 'standard');
  return cfg.freeSpins[kind]?.spins ?? null;
}

export type BuyStep = 'closed' | 'catalog' | 'confirm' | 'pending';

/** Automate du parcours d'achat, sans DOM (testé seul). */
export class BuyFlow {
  step: BuyStep = 'closed';
  selected: BuyMode | null = null;
  quote: BuyQuote | null = null;
  private calls = 0;

  open(): boolean {
    if (this.step !== 'closed') return false;
    this.step = 'catalog';
    this.selected = null;
    this.quote = null;
    return true;
  }

  select(mode: BuyMode): boolean {
    if (this.step !== 'catalog') return false;
    this.selected = mode;
    return true;
  }

  /** ouvre la confirmation : le devis est figé ici (mode, mise, coût, devise) */
  review(quote: BuyQuote): boolean {
    if (this.step !== 'catalog' || this.selected !== quote.mode) return false;
    this.quote = { ...quote };
    this.step = 'confirm';
    return true;
  }

  /** Annuler : retour au catalogue, carte toujours sélectionnée */
  cancel(): boolean {
    if (this.step !== 'confirm') return false;
    this.step = 'catalog';
    this.quote = null;
    return true;
  }

  /** Fermer : retour au jeu sans achat (impossible pendant l'achat en cours) */
  close(): boolean {
    if (this.step === 'closed' || this.step === 'pending') return false;
    this.step = 'closed';
    this.selected = null;
    this.quote = null;
    return true;
  }

  /** nombre d'appels réels à l'achat (contrôle du double clic) */
  get confirmCalls(): number {
    return this.calls;
  }

  /**
   * Accepter : un seul appel, quelle que soit la cadence des clics.
   * 'done' : achat accepté (menu fermé) · 'refused' : retour au catalogue · 'ignored' : clic en trop.
   */
  async confirm(run: (q: BuyQuote) => Promise<boolean>): Promise<'done' | 'refused' | 'ignored'> {
    if (this.step !== 'confirm' || !this.quote) return 'ignored';
    const q = this.quote;
    this.step = 'pending';
    this.calls++;
    let ok = false;
    try {
      ok = (await run(q)) === true;
    } catch {
      ok = false;
    }
    if (ok) {
      this.step = 'closed';
      this.selected = null;
      this.quote = null;
      return 'done';
    }
    this.step = 'catalog';
    this.quote = null;
    return 'refused';
  }
}

/* ------------------------------------------------------------------ */

export interface BuyMenuOptions {
  getBet(): number;
  getBalance(): number;
  isAnteOn(): boolean;
  /** achat confirmé ; true = accepté par le serveur, false = refus / erreur */
  onConfirm(mode: BuyMode, quote: BuyQuote): Promise<boolean>;
  onOpen?(): void;
  /** 'purchased' : fermé après un achat accepté ; 'cancel' : retour au jeu sans achat */
  onClose?(reason: 'cancel' | 'purchased'): void;
  /** étape affichée (pour la machine à états du jeu) */
  onStep?(step: 'catalog' | 'confirm'): void;
  getConfig?(): MathConfig;
  reducedMotion?(): boolean;
}

const NAME: Record<BuyMode, string> = {
  BONUS: 'bonus.standard.name',
  SUPER: 'bonus.super.name',
  BLAST: 'feature.blast.name',
  MEGA: 'feature.mega.name',
};

const LINE: Record<BuyMode, string | null> = { BONUS: null, SUPER: null, BLAST: 'buy.blast.line', MEGA: 'buy.mega.line' };

export function buyModeName(mode: BuyMode): string {
  return t(NAME[mode]);
}

/** Ligne courte d'une carte : nombre de free spins (bonus) ou effet (feature). */
function cardLine(cfg: MathConfig, mode: BuyMode): string {
  const spins = bonusSpins(cfg, mode);
  if (spins !== null) return t('bonus.spins', { n: spins });
  const key = LINE[mode];
  return key ? t(key) : '';
}

/** Visuel d'une carte, uniquement avec les images réelles des symboles. */
export function buyVisual(mode: BuyMode): HTMLElement {
  const v = h('span', { class: `bm-visual bm-v-${mode.toLowerCase()}`, 'aria-hidden': 'true' });
  const add = (key: string, cls: string) => v.append(artImg(key, `bm-art ${cls}`));
  if (mode === 'BONUS') for (let i = 0; i < 3; i++) add(entry('sym.S.full') ? 'sym.S.full' : 'sym.S.body', `bm-s bm-s${i}`);
  else if (mode === 'SUPER') for (let i = 0; i < 4; i++) add(entry('sym.S.full') ? 'sym.S.full' : 'sym.S.body', `bm-s bm-s${i}`);
  else if (mode === 'BLAST') {
    add('sym.T.bundle', 'bm-bundle');
    add('sym.T.stick', 'bm-stick');
  } else add('sym.T.keg', 'bm-keg');
  return v;
}

export class BuyMenu {
  readonly root: HTMLElement;
  private flow = new BuyFlow();
  private board = h('div', { class: 'cf-panel bm-board', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'bm-title', tabindex: '-1' });
  private veil = h('div', { class: 'cf-veil bm-veil' });
  private area = h('div', { class: 'cf-area bm-area' });
  private cardsBox = h('div', { class: 'bm-cards', role: 'group' });
  private notice = h('p', { class: 'bm-notice', hidden: true });
  private titleEl = h('span', { class: 'bm-sign-text', id: 'bm-title', 'data-fit': '' });
  private closeBtn: HTMLButtonElement;
  private cards = new Map<BuyMode, HTMLButtonElement>();
  private confirmBox: HTMLElement | null = null;
  private untrap: (() => void) | null = null;
  private untrapConfirm: (() => void) | null = null;
  private anim: gsap.core.Timeline | null = null;

  constructor(private opts: BuyMenuOptions) {
    this.closeBtn = cfClose(t('common.close'), () => this.close());
    const sign = h('div', { class: 'bm-sign' }, this.titleEl);
    this.board.append(sign, this.closeBtn, this.notice, this.cardsBox);
    this.area.append(this.board);
    this.root = h('div', { class: 'cf-ui cf-layer bm-root', hidden: true }, this.veil, this.area);
    applyArt(this.root);
    warmArt(['ui.btn.buy', 'ui.btn.plaque', 'ui.btn.round', 'ui.ico.plus', 'sym.S.body', 'sym.T.bundle', 'sym.T.stick', 'sym.T.keg']);
    this.veil.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.veil.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.flow.step !== 'pending') this.close();
    });
    onLangChange(() => {
      this.closeBtn.setAttribute('aria-label', t('common.close'));
      if (this.flow.step === 'catalog') this.renderCatalog();
      else if (this.flow.step === 'confirm') {
        this.renderCatalog();
        this.showConfirm();
      }
    });
  }

  /**
   * Échap : retour au jeu sans achat (écouté sur le document : fonctionne même si le focus est sorti).
   * Sans effet pendant l'achat en cours ; un dialogue ouvert par-dessus le consomme avant.
   */
  private onEscape = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || this.flow.step === 'closed') return;
    const top = this.confirmBox ?? this.board;
    if (!isTopTrap(top)) return;
    e.preventDefault();
    this.close();
  };

  get isOpen(): boolean {
    return this.flow.step !== 'closed';
  }

  /** étape courante du parcours (catalog / confirm / pending / closed) */
  get step(): BuyStep {
    return this.flow.step;
  }

  setLayout(l: SceneLayout): void {
    placeArea(this.root, playArea(l));
    this.root.dataset.layout = l.cls;
    if (this.isOpen) fitAll(this.board, '[data-fit]', 9);
  }

  private cfg(): MathConfig {
    return this.opts.getConfig?.() ?? math();
  }

  private reduced(): boolean {
    return this.opts.reducedMotion?.() ?? reducedMotion();
  }

  open(): void {
    if (!this.flow.open()) return;
    this.anim?.kill();
    this.root.hidden = false;
    this.renderCatalog();
    this.opts.onOpen?.();
    this.opts.onStep?.('catalog');
    this.untrap = trapDialog(this.board);
    document.addEventListener('keydown', this.onEscape);
    // l'enseigne descend du haut et se balance comme un panneau suspendu (~350 ms) ; animations réduites : fondu
    const tl = gsap.timeline();
    gsap.set(this.board, { transformOrigin: '50% 0%' });
    tl.fromTo(this.veil, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0);
    if (this.reduced()) tl.fromTo(this.board, { opacity: 0 }, { opacity: 1, duration: 0.18 }, 0);
    else {
      tl.fromTo(this.board, { yPercent: -115, opacity: 1 }, { yPercent: 0, duration: 0.3, ease: 'power2.out' }, 0);
      tl.fromTo(this.board, { rotation: -7 }, { rotation: 0, duration: 0.35, ease: 'back.out(3.2)' }, 0);
    }
    this.anim = tl;
    queueMicrotask(() => this.focusCard());
  }

  close(): void {
    this.shut('cancel');
  }

  private shut(reason: 'cancel' | 'purchased'): void {
    if (!this.flow.close() && reason === 'cancel') return;
    this.removeConfirm();
    document.removeEventListener('keydown', this.onEscape);
    this.untrap?.();
    this.untrap = null;
    this.anim?.kill();
    const tl = gsap.timeline({
      onComplete: () => {
        this.root.hidden = true;
        gsap.set(this.board, { clearProps: 'transform,opacity' });
      },
    });
    tl.to(this.veil, { opacity: 0, duration: 0.18 }, 0);
    if (this.reduced() || reason === 'purchased') tl.to(this.board, { opacity: 0, duration: 0.16 }, 0);
    else tl.to(this.board, { yPercent: -115, rotation: 4, duration: 0.24, ease: 'power2.in' }, 0);
    this.anim = tl;
    this.opts.onClose?.(reason);
  }

  private focusCard(): void {
    const sel = this.flow.selected ? this.cards.get(this.flow.selected) : undefined;
    (sel ?? this.cardsBox.querySelector<HTMLElement>('.bm-card:not([aria-disabled="true"])') ?? this.closeBtn).focus();
  }

  /** Catalogue : cartes avec visuel réel, nom, ligne courte, prix réel suivant la mise. */
  private renderCatalog(): void {
    const cfg = this.cfg();
    const bet = this.opts.getBet();
    const balance = this.opts.getBalance();
    const ante = this.opts.isAnteOn();
    const currency = getMoneyFormat().currency;
    this.titleEl.textContent = t('hud.buy');
    this.board.setAttribute('aria-label', t('hud.buy'));
    this.notice.hidden = !ante;
    this.notice.textContent = ante ? t('buy.reason.ante') : '';
    this.cardsBox.setAttribute('aria-label', t('hud.buy'));
    this.cardsBox.replaceChildren();
    this.cards.clear();
    for (const mode of buyModes(cfg)) {
      const q = quoteFor(cfg, mode, bet, currency);
      const block = buyBlock(q.price, balance, ante);
      const line = cardLine(cfg, mode);
      const reasonId = `bm-r-${mode}`;
      const card = h(
        'button',
        {
          type: 'button',
          class: 'bm-card',
          'data-mode': mode,
          'aria-pressed': this.flow.selected === mode ? 'true' : 'false',
          'aria-disabled': block ? 'true' : 'false',
          'aria-label': `${buyModeName(mode)}, ${line}, ${formatMoney(q.price)}`,
          ...(block ? { 'aria-describedby': reasonId } : {}),
        },
        buyVisual(mode),
        h('span', { class: 'bm-name' }, buyModeName(mode)),
        h('span', { class: 'bm-line' }, line),
        block === 'balance' ? h('span', { class: 'bm-reason', id: reasonId }, t('buy.reason.balance')) : null,
        block === 'ante' ? h('span', { class: 'visually-hidden', id: reasonId }, t('buy.reason.ante')) : null,
        h('span', { class: 'bm-price' }, h('span', { class: 'bm-price-val', 'data-fit': '' }, formatMoney(q.price))),
      );
      card.classList.toggle('is-blocked', block !== null);
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pick(mode);
      });
      pressable(card);
      this.cards.set(mode, card);
      this.cardsBox.append(card);
    }
    fitAll(this.board, '[data-fit]', 9);
  }

  private pick(mode: BuyMode): void {
    if (this.flow.step !== 'catalog') return;
    const cfg = this.cfg();
    const q = quoteFor(cfg, mode, this.opts.getBet(), getMoneyFormat().currency);
    if (buyBlock(q.price, this.opts.getBalance(), this.opts.isAnteOn())) return;
    this.flow.select(mode);
    for (const [m, c] of this.cards) c.setAttribute('aria-pressed', m === mode ? 'true' : 'false');
    if (this.flow.review(q)) this.showConfirm();
  }

  /** Confirmation : visuel, prix total exact (devis figé), Confirmer / Annuler. */
  private showConfirm(): void {
    const q = this.flow.quote;
    if (!q) return;
    this.removeConfirm();
    const cfg = this.cfg();
    const line = cardLine(cfg, q.mode);
    const price = formatMoney(q.price);
    const ok = cfButton(t('common.confirm'), 'is-primary bm-ok');
    const cancel = cfButton(t('common.cancel'), 'is-secondary bm-cancel');
    const box = h(
      'div',
      { class: 'bm-confirm', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'bm-c-title', 'aria-describedby': 'bm-c-price', tabindex: '-1' },
      buyVisual(q.mode),
      h('h2', { class: 'bm-c-title', id: 'bm-c-title' }, t('buy.confirm.title', { name: buyModeName(q.mode) })),
      h('p', { class: 'bm-c-line' }, line),
      h(
        'p',
        { class: 'bm-c-total', id: 'bm-c-price' },
        h('span', { class: 'bm-c-total-label' }, t('buy.total')),
        h('span', { class: 'bm-c-total-val', 'data-fit': '' }, price),
      ),
      h('div', { class: 'bm-c-actions' }, ok, cancel),
    );
    const shade = h('div', { class: 'bm-shade' });
    shade.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.flow.step === 'confirm') this.backToCatalog();
    });
    ok.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.accept(ok, cancel);
    });
    cancel.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.flow.step === 'confirm') this.backToCatalog();
    });
    this.board.append(shade, box);
    this.board.classList.add('has-confirm');
    this.cardsBox.inert = true;
    this.confirmBox = box;
    fitAll(box);
    this.untrapConfirm = trapDialog(box);
    this.opts.onStep?.('confirm');
  }

  private async accept(ok: HTMLButtonElement, cancel: HTMLButtonElement): Promise<void> {
    if (this.flow.step !== 'confirm') return;
    // verrou immédiat (avant toute attente) : un second clic ne peut rien déclencher
    ok.disabled = true;
    cancel.disabled = true;
    ok.setAttribute('aria-busy', 'true');
    this.closeBtn.disabled = true;
    // le bouton désactivé perd le focus : il reste dans la confirmation (lecteurs d'écran : achat en cours)
    this.confirmBox?.setAttribute('aria-busy', 'true');
    this.confirmBox?.focus();
    const res = await this.flow.confirm((q) => this.opts.onConfirm(q.mode, q));
    this.closeBtn.disabled = false;
    if (res === 'done') {
      this.shut('purchased');
      return;
    }
    if (res === 'refused') {
      this.removeConfirm();
      this.renderCatalog();
      this.opts.onStep?.('catalog');
      this.focusCard();
    }
  }

  private backToCatalog(): void {
    if (!this.flow.cancel()) return;
    this.removeConfirm();
    this.opts.onStep?.('catalog');
    this.focusCard();
  }

  private removeConfirm(): void {
    this.untrapConfirm?.();
    this.untrapConfirm = null;
    this.confirmBox?.remove();
    this.confirmBox = null;
    this.board.querySelector('.bm-shade')?.remove();
    this.board.classList.remove('has-confirm');
    this.cardsBox.inert = false;
  }
}
