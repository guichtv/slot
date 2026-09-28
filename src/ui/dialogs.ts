import './dialogs.css';
import { entry } from '../render/assets';
import { t } from '../i18n';
import { h, pressable, trapFocus } from './dom';
import type { Rect, SceneLayout } from '../render/layout';

/**
 * États techniques sobres (jamais cinématiques) + briques partagées des menus Crownforge.
 * A29.1 attente (commandes verrouillées) · A29.2 solde insuffisant (solde mis en évidence)
 * A29.3 erreur avec « Réessayer » · A29.4 connexion / reconnexion · A29.5 reprise d'une manche
 * interrompue (sans nouveau débit) · session expirée.
 * Chaque dialogue renvoie Promise<'retry' | 'dismiss' | 'reload'> ; l'appelant agit (relance, recharge).
 */

/* ------------------------------------------------------------------ */
/* Briques partagées (menu, achat, ante, dialogues)                    */
/* ------------------------------------------------------------------ */

/** URL absolue d'un asset du manifeste (absolue : une url() dans une variable CSS reste juste en build). */
export function artUrl(key: string): string | null {
  const e = entry(key);
  if (!e) return null;
  try {
    return new URL(e.url, document.baseURI).href;
  } catch {
    return e.url;
  }
}

/** Image réelle du manifeste ; masquée (jamais de substitut dessiné) si la clé manque. */
export function artImg(key: string, cls = '', alt = ''): HTMLImageElement {
  const img = h('img', { class: `cf-img ${cls}`.trim(), alt, draggable: 'false', decoding: 'async' });
  const u = artUrl(key);
  if (u) img.src = u;
  else img.hidden = true;
  return img;
}

const ART_VARS: ReadonlyArray<readonly [string, string]> = [
  ['--cf-plaque', 'ui.btn.plaque'],
  ['--cf-card', 'scr.card'],
  ['--cf-bg-bonus', 'decor.skyRich'],
  ['--cf-bg-super', 'decor.nightSky'],
  ['--cf-bg-blast', 'decor.far'],
  ['--cf-bg-mega', 'decor.mid'],
  ['--cf-bar', 'ui.btn.bar'],
  ['--cf-round', 'ui.btn.round'],
  ['--cf-step', 'ui.btn.step'],
  ['--cf-sign', 'ui.btn.buy'],
  ['--cf-ico-plus', 'ui.ico.plus'],
  ['--cf-ico-minus', 'ui.ico.minus'],
  ['--cf-ico-turbo', 'ui.ico.turbo'],
  ['--cf-ico-spin', 'ui.ico.spin'],
  ['--cf-ico-auto', 'ui.ico.auto'],
  ['--cf-ico-info', 'ui.ico.info'],
  ['--cf-ico-menu', 'ui.ico.menu'],
  ['--cf-ico-sound-on', 'ui.ico.soundOn'],
  ['--cf-ico-sound-off', 'ui.ico.soundOff'],
];

/** Expose les images d'interface en variables CSS sur un élément racine. */
export function applyArt(el: HTMLElement): void {
  for (const [v, key] of ART_VARS) {
    const u = artUrl(key);
    if (u) el.style.setProperty(v, `url("${u}")`);
  }
}

/** Précharge et décode des images du manifeste (première ouverture sans cartes vides). */
export function warmArt(keys: string[]): void {
  if (typeof Image === 'undefined') return;
  for (const k of keys) {
    const u = artUrl(k);
    if (!u) continue;
    const img = new Image();
    img.src = u;
    img.decode?.().catch(() => undefined);
  }
}

/** Zone de jeu (au-dessus des commandes) où se centrent menus et dialogues. */
export function playArea(l: SceneLayout): Rect {
  return l.stage;
}

export function placeArea(el: HTMLElement, r: Rect): void {
  el.style.setProperty('--pa-x', `${Math.round(r.x)}px`);
  el.style.setProperty('--pa-y', `${Math.round(r.y)}px`);
  el.style.setProperty('--pa-w', `${Math.round(r.w)}px`);
  el.style.setProperty('--pa-h', `${Math.round(r.h)}px`);
}

/** Réglage « animations réduites » : choix du joueur (html[data-motion]) sinon préférence système. */
export function reducedMotion(): boolean {
  const m = typeof document !== 'undefined' ? document.documentElement.dataset.motion : undefined;
  if (m === 'reduced') return true;
  if (m === 'full') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Montants longs (9-10 chiffres) : réduit la police jusqu'à ce que le texte tienne dans sa boîte.
 * Les éléments doivent être visibles, sur une ligne (white-space: nowrap) et bornés (max-width / min-width: 0).
 * Lectures et écritures groupées (au plus 4 mises en page pour tout le lot, jamais une par pixel de police).
 */
export function fitBatch(els: readonly HTMLElement[], minPx = 10): void {
  for (const el of els) el.style.fontSize = '';
  const todo: Array<{ el: HTMLElement; size: number }> = [];
  for (const el of els) {
    if (!el.isConnected || el.clientWidth === 0) continue;
    todo.push({ el, size: parseFloat(getComputedStyle(el).fontSize) || 16 });
  }
  let pending = todo;
  for (let round = 0; round < 3 && pending.length; round++) {
    // lecture de tout le lot, puis écriture de tout le lot
    const over = pending.map((p) => ({ p, sw: p.el.scrollWidth, cw: p.el.clientWidth })).filter((m) => m.sw - m.cw > 0.5 && m.p.size > minPx);
    for (const { p, sw, cw } of over) {
      const next = Math.max(minPx, Math.floor(p.size * (cw / sw) * 4) / 4 - (round ? 0.5 : 0));
      p.size = next < p.size ? next : Math.max(minPx, p.size - 1);
      p.el.style.fontSize = `${p.size}px`;
    }
    pending = over.map((m) => m.p);
  }
}

export function fitText(el: HTMLElement, minPx = 10): void {
  fitBatch([el], minPx);
}

/** Ajuste tous les montants d'un conteneur à la prochaine image (après mise en page). */
export function fitAll(root: ParentNode, selector = '[data-fit]', minPx = 10): void {
  const run = () => fitBatch([...root.querySelectorAll<HTMLElement>(selector)], minPx);
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else run();
}

/* ------------------------------------------------------------------ */
/* Piège de focus empilable                                            */
/* ------------------------------------------------------------------ */

const TABBABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]';
const traps: HTMLElement[] = [];

/** éléments réellement atteignables au clavier (tabindex >= 0, visibles, hors inert) */
export function tabbables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => el.tabIndex >= 0 && !el.closest('[hidden], [inert]') && el.getClientRects().length > 0);
}

/** le piège le plus récent (seul lui reçoit Tab et Échap) */
export function isTopTrap(root: HTMLElement): boolean {
  return traps[traps.length - 1] === root;
}

/**
 * trapFocus (focus initial + retour au déclencheur) complété : Tab / Maj+Tab suivent les éléments
 * réellement atteignables (onglets en tabindex itinérant, éléments inertes ou désactivés exclus),
 * et ramènent le focus dans le dialogue s'il en était sorti (bouton désactivé pendant une attente).
 * Les pièges s'empilent : seul le dernier ouvert agit.
 */
export function trapDialog(root: HTMLElement): () => void {
  const untrap = trapFocus(root);
  traps.push(root);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !isTopTrap(root)) return;
    e.preventDefault();
    e.stopPropagation();
    const f = tabbables(root);
    if (!f.length) {
      root.focus();
      return;
    }
    const i = f.indexOf(document.activeElement as HTMLElement);
    const next = i < 0 ? (e.shiftKey ? f.length - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + f.length) % f.length;
    f[next]?.focus();
  };
  document.addEventListener('keydown', onKey, true);
  return () => {
    document.removeEventListener('keydown', onKey, true);
    const i = traps.lastIndexOf(root);
    if (i >= 0) traps.splice(i, 1);
    untrap();
  };
}

/** Bouton plaque bois cerclée d'acier (art réel en 9-slice). */
export function cfButton(label: string, cls = '', onClick?: () => void): HTMLButtonElement {
  const b = h('button', { type: 'button', class: `cf-btn ${cls}`.trim() }, h('span', { class: 'cf-btn-text', 'data-fit': '' }, label));
  if (onClick)
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
  pressable(b);
  return b;
}

/** Bouton de fermeture icône seule (disque bois/acier + croix). */
export function cfClose(label: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'cf-close', 'aria-label': label }, h('span', { class: 'cf-close-x', 'aria-hidden': 'true' }));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  pressable(b);
  return b;
}

/** Interrupteur ON/OFF (role="switch"), bouton de pas réel comme curseur. */
export function cfSwitch(label: string, onChange: (on: boolean) => void): { el: HTMLButtonElement; set(on: boolean): void; refresh(label: string): void } {
  const state = h('span', { class: 'cf-switch-state', 'aria-hidden': 'true' });
  const el = h(
    'button',
    { type: 'button', class: 'cf-switch', role: 'switch', 'aria-checked': 'false', 'aria-label': label },
    h('span', { class: 'cf-switch-track', 'aria-hidden': 'true' }, state, h('span', { class: 'cf-switch-knob' })),
  );
  let on = false;
  const paint = () => {
    el.setAttribute('aria-checked', on ? 'true' : 'false');
    state.textContent = on ? t('common.on') : t('common.off');
  };
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    on = !on;
    paint();
    onChange(on);
  });
  pressable(el);
  paint();
  return {
    el,
    set(v: boolean) {
      on = v;
      paint();
    },
    refresh(l: string) {
      el.setAttribute('aria-label', l);
      paint();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Codes d'erreur RGS -> message traduit + comportement                */
/* ------------------------------------------------------------------ */

export type DialogAction = 'retry' | 'dismiss' | 'reload';
export type DialogKind = 'insufficient' | 'error' | 'connection' | 'session' | 'maintenance';

export interface ErrorSpec {
  code: string;
  kind: DialogKind;
  titleKey: string;
  messageKey: string;
  /** action principale proposée */
  action: DialogAction;
  /** une fermeture simple existe (bouton secondaire, Échap) */
  dismissible: boolean;
  /** met le solde en évidence (A29.2) */
  highlightBalance: boolean;
  /** issue du pari inconnue : la dernière manche sera vérifiée (réconciliation) */
  uncertain: boolean;
}

type Rule = Pick<ErrorSpec, 'kind' | 'action' | 'dismissible'> & { message?: string };

const RULES: Record<string, Rule> = {
  ERR_IS: { kind: 'session', action: 'reload', dismissible: false },
  ERR_ATE: { kind: 'session', action: 'reload', dismissible: false },
  ERR_IB: { kind: 'insufficient', action: 'dismiss', dismissible: true, message: 'err.ERR_IPB' },
  ERR_IPB: { kind: 'insufficient', action: 'dismiss', dismissible: true },
  ERR_BR: { kind: 'error', action: 'dismiss', dismissible: true },
  ERR_OR: { kind: 'error', action: 'dismiss', dismissible: true },
  ERR_NR: { kind: 'error', action: 'dismiss', dismissible: true },
  ERR_TF: { kind: 'error', action: 'retry', dismissible: true },
  ERR_VAL: { kind: 'error', action: 'dismiss', dismissible: true },
  ERR_GLE: { kind: 'error', action: 'dismiss', dismissible: true },
  ERR_LOC: { kind: 'error', action: 'reload', dismissible: false },
  ERR_GEN: { kind: 'error', action: 'retry', dismissible: true },
  ERR_MAINTENANCE: { kind: 'maintenance', action: 'reload', dismissible: false },
  TIMEOUT: { kind: 'connection', action: 'retry', dismissible: true },
  NETWORK: { kind: 'connection', action: 'retry', dismissible: true },
  BAD_RESPONSE: { kind: 'error', action: 'retry', dismissible: true },
};

export const KNOWN_ERROR_CODES = Object.keys(RULES);

/** Code d'une erreur quelconque (RgsError, objet { code }, échec réseau de fetch). */
export function errorCode(e: unknown): string {
  if (e && typeof e === 'object') {
    const c = (e as { code?: unknown }).code;
    if (typeof c === 'string' && c) return c;
    const name = (e as { name?: unknown }).name;
    if (name === 'AbortError' || name === 'TimeoutError') return 'TIMEOUT';
    if (name === 'TypeError' && /fetch|network|load failed/i.test(String((e as { message?: unknown }).message ?? ''))) return 'NETWORK';
  }
  return 'ERR_GEN';
}

export function mapRgsError(e: unknown): ErrorSpec {
  const raw = errorCode(e);
  const code = raw in RULES ? raw : 'ERR_GEN';
  const r = RULES[code] as Rule;
  const uncertain = Boolean(e && typeof e === 'object' && (e as { uncertain?: unknown }).uncertain === true);
  return {
    code,
    kind: r.kind,
    titleKey: `dlg.${r.kind}.title`,
    messageKey: r.message ?? `err.${code}`,
    action: r.action,
    dismissible: r.dismissible,
    highlightBalance: r.kind === 'insufficient',
    uncertain,
  };
}

/**
 * Boutons proposés pour une erreur (ordre d'affichage : principal d'abord).
 * Issue incertaine : le contrôleur ne rejoue jamais le pari, il vérifie la manche ; « Réessayer » serait
 * trompeur, seul OK est proposé (sauf perte de connexion, où Réessayer relance la vérification au retour du réseau).
 */
export function errorActions(spec: ErrorSpec): DialogAction[] {
  if (spec.action === 'dismiss') return ['dismiss'];
  if (spec.uncertain && spec.action === 'retry' && spec.kind !== 'connection') return ['dismiss'];
  return spec.dismissible ? [spec.action, 'dismiss'] : [spec.action];
}

/* ------------------------------------------------------------------ */
/* Dialogues                                                           */
/* ------------------------------------------------------------------ */

export interface DialogsOptions {
  /** verrouille / déverrouille les commandes du jeu (A29.1) */
  onLock?(locked: boolean): void;
  /** élément du solde à mettre en évidence (A29.2) */
  balanceEl?(): HTMLElement | null | undefined;
}

interface ShowSpec {
  kind: DialogKind | 'resume';
  icon: 'info' | 'spin' | 'auto';
  title: string;
  message: string;
  extra?: string;
  actions: Array<{ id: DialogAction; label: string; primary: boolean }>;
  /** action d'Échap ; absente = Échap sans effet */
  escape?: DialogAction;
  mount?(panel: HTMLElement, resolve: (a: DialogAction) => void, status: HTMLElement): () => void;
}

const LABEL: Record<DialogAction, string> = { retry: 'dlg.retry', dismiss: 'dlg.ok', reload: 'dlg.reload' };

export class Dialogs {
  readonly root: HTMLElement;
  private block = h('div', { class: 'dlg-block', hidden: true });
  private waitArea = h('div', { class: 'cf-area dlg-wait-area' });
  private waitBox = h('div', { class: 'dlg-wait', role: 'status', 'aria-live': 'polite', hidden: true });
  private waitText = h('span', { class: 'dlg-wait-text' });
  private waitTimer = 0;
  private waitingOn = false;
  private chain: Promise<unknown> = Promise.resolve();
  private openCount = 0;

  constructor(private opts: DialogsOptions = {}) {
    this.waitBox.append(h('span', { class: 'dlg-wait-ico', 'aria-hidden': 'true' }), this.waitText);
    this.waitArea.append(this.waitBox);
    this.root = h('div', { class: 'cf-ui cf-layer dlg-root', hidden: true }, this.block, this.waitArea);
    applyArt(this.root);
  }

  private sync(): void {
    this.root.hidden = !(this.waitingOn || this.openCount > 0);
  }

  setLayout(l: SceneLayout): void {
    placeArea(this.root, playArea(l));
  }

  /** un dialogue ou l'attente bloquante est affiché (le raccourci Espace doit l'ignorer) */
  get blocking(): boolean {
    return !this.block.hidden || this.openCount > 0;
  }

  /**
   * A29.1 : indicateur d'attente. Par défaut, commandes verrouillées aussitôt (voile transparent) et
   * indicateur visible après 250 ms. { block: false } : indicateur seul (requête lente pendant que les
   * rouleaux tournent, l'arrêt rapide reste possible) ; { delayMs } : délai avant l'indicateur.
   */
  waiting(on: boolean, opts: { delayMs?: number; block?: boolean } = {}): void {
    const block = on && opts.block !== false;
    if (on === this.waitingOn && block === !this.block.hidden) return;
    const wasLocked = !this.block.hidden;
    this.waitingOn = on;
    window.clearTimeout(this.waitTimer);
    this.block.hidden = !block;
    this.sync();
    if (block !== wasLocked) this.opts.onLock?.(block);
    if (on) {
      this.waitText.textContent = t('dlg.waiting');
      this.waitTimer = window.setTimeout(() => (this.waitBox.hidden = false), Math.max(0, opts.delayMs ?? 250));
    } else {
      this.waitBox.hidden = true;
    }
  }

  /** A29.2 : solde insuffisant, solde mis en évidence tant que le message est ouvert. */
  insufficient(): Promise<DialogAction> {
    const spec = mapRgsError({ code: 'ERR_IPB' });
    return this.showError(spec);
  }

  /** A29.3 / A29.4 / session : erreur quelconque traduite selon son code RGS. */
  error(e: unknown): Promise<DialogAction> {
    return this.showError(mapRgsError(e));
  }

  /** A29.4 : connexion perdue ; reconnexion automatique au retour du réseau. */
  connection(): Promise<DialogAction> {
    return this.showError(mapRgsError({ code: 'NETWORK' }));
  }

  /** A29.5 : reprise d'une manche interrompue, sans nouveau débit. 'dismiss' = continuer la manche. */
  resume(): Promise<DialogAction> {
    return this.show({
      kind: 'resume',
      icon: 'auto',
      title: t('dlg.resume.title'),
      message: t('dlg.resume.text'),
      actions: [{ id: 'dismiss', label: t('dlg.resume.go'), primary: true }],
    });
  }

  /** Session expirée : seul le rechargement est proposé. */
  sessionExpired(): Promise<DialogAction> {
    return this.showError(mapRgsError({ code: 'ERR_IS' }));
  }

  private showError(spec: ErrorSpec): Promise<DialogAction> {
    const ids = errorActions(spec);
    // « Fermer » seulement à côté d'une action principale ; seul, le bouton dit OK
    const actions = ids.map((id, i) => ({
      id,
      label: t(id === 'dismiss' && ids.length > 1 ? 'common.close' : LABEL[id]),
      primary: i === 0,
    }));
    const connection = spec.kind === 'connection';
    return this.show({
      kind: spec.kind,
      icon: connection ? 'spin' : 'info',
      title: t(spec.titleKey),
      message: t(spec.messageKey),
      ...(spec.uncertain ? { extra: t('err.uncertain') } : {}),
      actions,
      ...(spec.dismissible ? { escape: 'dismiss' as const } : {}),
      mount: (panel, resolve, status) => {
        const undo: Array<() => void> = [];
        if (spec.highlightBalance) {
          const el = this.opts.balanceEl?.();
          if (el) {
            el.classList.add('cf-balance-alert');
            undo.push(() => el.classList.remove('cf-balance-alert'));
          }
        }
        if (connection) {
          // hors ligne : attente du réseau ; au retour, reconnexion automatique
          const paint = () => {
            const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
            panel.classList.toggle('is-offline', offline);
            status.textContent = offline ? t('dlg.connection.offline') : '';
          };
          let timer = 0;
          const online = () => {
            status.textContent = t('dlg.connection.reconnecting');
            panel.classList.remove('is-offline');
            panel.classList.add('is-reconnecting');
            window.clearTimeout(timer);
            timer = window.setTimeout(() => resolve('retry'), 400);
          };
          paint();
          window.addEventListener('online', online);
          window.addEventListener('offline', paint);
          undo.push(() => {
            window.clearTimeout(timer);
            window.removeEventListener('online', online);
            window.removeEventListener('offline', paint);
          });
        }
        return () => undo.forEach((f) => f());
      },
    });
  }

  /** file d'attente : un seul dialogue à la fois */
  private show(spec: ShowSpec): Promise<DialogAction> {
    const run = () => this.render(spec);
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }

  private render(spec: ShowSpec): Promise<DialogAction> {
    return new Promise<DialogAction>((resolve) => {
      this.openCount++;
      this.sync();
      const id = `dlg-${Math.random().toString(36).slice(2, 8)}`;
      const status = h('p', { class: 'dlg-status', 'aria-live': 'polite' });
      const panel = h(
        'div',
        { class: `dlg-panel dlg-${spec.kind}`, role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-t`, 'aria-describedby': `${id}-m`, tabindex: '-1' },
        h('span', { class: `dlg-icon dlg-icon-${spec.icon}`, 'aria-hidden': 'true' }),
        h('h2', { class: 'dlg-title', id: `${id}-t` }, spec.title),
        h('p', { class: 'dlg-msg', id: `${id}-m` }, spec.message),
        spec.extra ? h('p', { class: 'dlg-extra' }, spec.extra) : null,
        status,
      );
      const row = h('div', { class: 'dlg-actions' });
      let done = false;
      let cleanup: () => void = () => undefined;
      const finish = (a: DialogAction) => {
        if (done) return;
        done = true;
        cleanup();
        untrap();
        document.removeEventListener('keydown', onKey, true);
        veil.remove();
        area.remove();
        this.openCount--;
        this.sync();
        resolve(a);
      };
      for (const a of spec.actions) {
        row.append(cfButton(a.label, a.primary ? 'is-primary' : 'is-secondary', () => finish(a.id)));
      }
      panel.append(row);
      // Échap au niveau du document (même si le focus est sorti) ; consommé : les menus dessous ne se ferment pas
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== 'Escape' || !isTopTrap(panel)) return;
        e.preventDefault();
        e.stopPropagation();
        if (spec.escape) finish(spec.escape);
      };
      document.addEventListener('keydown', onKey, true);
      const veil = h('div', { class: 'dlg-veil' });
      const area = h('div', { class: 'cf-area dlg-area' }, panel);
      // les gestes sur le voile sont consommés (aucun spin / achat derrière) et le focus reste dans le dialogue
      for (const ev of ['pointerdown', 'mousedown', 'click'] as const)
        veil.addEventListener(ev, (e) => {
          e.stopPropagation();
          e.preventDefault();
        });
      this.root.append(veil, area);
      fitAll(panel, '[data-fit]', 12);
      const untrap = trapDialog(panel);
      cleanup = spec.mount?.(panel, finish, status) ?? cleanup;
    });
  }
}
