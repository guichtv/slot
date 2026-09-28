import { gsap } from 'gsap';
import type { Beat } from '../core/beat';
import { formatMoney } from '../core/money';
import { t } from '../i18n';
import { anywhereToDismiss, h, trapFocus } from './dom';
import type { SceneLayout } from '../render/layout';
import { entry } from '../render/assets';
import { math } from '../config/math';

/**
 * Surcouches HTML au-dessus de la scène (texte traduit, polices locales) :
 * compteur « Spins restants », bannière « +N FS », introductions et fin de bonus, célébrations.
 * - Voile léger : la slot reste visible derrière, jamais de panneau opaque plein écran.
 * - Aucun bouton « Continuer » : un clic / toucher n'importe où, Entrée ou Espace ferme ; le geste est consommé.
 */
export interface CelebrationHooks {
  onTier(tier: number, beat: Beat): void;
  onStart(maxWin: boolean): void;
  onEnd(): void;
  coins(intensity: number): void;
}

export function assetUrl(key: string): string | null {
  const e = entry(key);
  return e ? e.url : null;
}

export class Overlays {
  readonly root = h('div', { class: 'ovl' });
  private fsBox = h('div', { class: 'ovl-fs', hidden: true, 'aria-live': 'polite' });
  private fsLabel = h('span', { class: 'ovl-fs-label' });
  private fsValue = h('span', { class: 'ovl-fs-value' });
  private plus = h('div', { class: 'ovl-plus', hidden: true, 'aria-live': 'assertive' });
  private layer = h('div', { class: 'ovl-layer' });
  private live = h('div', { class: 'visually-hidden', 'aria-live': 'polite' });
  private layout: SceneLayout | null = null;
  celebration: CelebrationHooks | null = null;

  constructor() {
    this.fsBox.append(this.fsLabel, this.fsValue);
    const plank = assetUrl('ui.topbar');
    if (plank) this.fsBox.style.backgroundImage = `url(${plank})`;
    this.root.append(this.fsBox, this.plus, this.layer, this.live);
  }

  setLayout(l: SceneLayout): void {
    this.layout = l;
    const b = this.fsBox.style;
    const w = Math.min(l.grid.w * 0.9, 460);
    b.left = `${l.grid.x + (l.grid.w - w) / 2}px`;
    b.top = `${l.topBar.y}px`;
    b.width = `${w}px`;
    b.height = `${l.topBar.h}px`;
    this.root.style.setProperty('--gx', `${l.grid.x + l.grid.w / 2}px`);
    this.root.style.setProperty('--gy', `${l.grid.y + l.grid.h / 2}px`);
    this.root.style.setProperty('--gw', `${l.grid.w}px`);
    this.root.style.setProperty('--hud-top', `${l.hud.y}px`);
    this.root.style.setProperty('--stage-cx', `${l.stage.x + l.stage.w / 2}px`);
    this.root.style.setProperty('--stage-cy', `${l.stage.y + l.stage.h / 2}px`);
  }

  announce(text: string): void {
    this.live.textContent = text;
  }

  /** « Spins restants : N » (sur 6 tours : 5 pendant le premier, 0 pendant le dernier) */
  setFs(remaining: number | null): void {
    if (remaining === null) {
      this.fsBox.hidden = true;
      return;
    }
    this.fsBox.hidden = false;
    this.fsLabel.textContent = t('fs.left');
    this.fsValue.textContent = String(remaining);
  }

  /** « +N FS » en grand au centre, puis il rejoint le compteur */
  async plusFs(n: number, beat: Beat): Promise<void> {
    const p = this.plus;
    p.textContent = t('fs.plus', { n });
    p.hidden = false;
    const target = this.fsBox.getBoundingClientRect();
    const r = p.getBoundingClientRect();
    const dx = target.left + target.width / 2 - (r.left + r.width / 2);
    const dy = target.top + target.height / 2 - (r.top + r.height / 2);
    const tl = gsap.timeline({ onComplete: () => void (p.hidden = true) });
    tl.fromTo(p, { scale: 0.3, opacity: 0, x: 0, y: 0 }, { scale: 1.12, opacity: 1, duration: 0.28, ease: 'back.out(2.2)' })
      .to(p, { scale: 1, duration: 0.14 })
      .to(p, { x: dx, y: dy, scale: 0.35, duration: 0.45, ease: 'power2.in' }, '+=0.45')
      .to(p, { opacity: 0, duration: 0.1 });
    tl.add(() => {
      this.fsBox.classList.remove('bump');
      void this.fsBox.offsetWidth;
      this.fsBox.classList.add('bump');
    }, '-=0.1');
    await beat.play(tl);
  }

  /** dialogue centré dans la zone de jeu, au-dessus des commandes ; fermé par un clic n'importe où */
  async dialog(kind: 'intro' | 'outro', opts: { title: string; big?: string; rule?: string; spins?: string; art?: string | null; artKey?: string; variant?: string }, beat: Beat, onClose?: (el: HTMLElement) => gsap.core.Timeline | void): Promise<void> {
    const panel = h('div', { class: `ovl-dialog ovl-${kind} ${opts.variant ?? ''}${opts.art ? ' has-art' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title, tabindex: '-1' });
    if (opts.art) {
      panel.style.backgroundImage = `url(${opts.art})`;
      const e = opts.artKey ? entry(opts.artKey) : undefined;
      if (e) panel.style.aspectRatio = `${e.w} / ${e.h}`;
    }
    panel.append(h('div', { class: 'ovl-title' }, opts.title));
    if (opts.spins) panel.append(h('div', { class: 'ovl-spins' }, opts.spins));
    if (opts.big) panel.append(h('div', { class: 'ovl-big' }, opts.big));
    if (opts.rule) panel.append(h('div', { class: 'ovl-rule' }, opts.rule));
    panel.append(h('div', { class: 'ovl-hint', 'aria-hidden': 'true' }, t('common.tapAnywhere')));
    const veil = h('div', { class: 'ovl-veil' });
    this.layer.append(veil, panel);
    const untrap = trapFocus(panel);
    const tl = gsap.timeline();
    tl.fromTo(veil, { opacity: 0 }, { opacity: 1, duration: 0.25 }, 0).fromTo(panel, { scale: 0.6, opacity: 0, rotation: -3 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.42, ease: 'back.out(1.8)' }, 0.05);
    await beat.play(tl);
    if (!beat.fast || kind === 'intro' || kind === 'outro') {
      await new Promise<void>((resolve) => {
        anywhereToDismiss(document.body, () => resolve(), { armDelayMs: 350 });
      });
    }
    const exit = onClose?.(panel) ?? gsap.timeline().to(panel, { scale: 0.85, opacity: 0, duration: 0.22, ease: 'power2.in' });
    exit.to(veil, { opacity: 0, duration: 0.22 }, 0);
    await new Promise<void>((resolve) => exit.eventCallback('onComplete', () => resolve()));
    untrap();
    panel.remove();
    veil.remove();
  }

  /**
   * Célébration (≥ ×10 la mise de base) : le compteur démarre lentement et accélère avant chaque palier,
   * passable à tout moment : un clic atteint l'état final exact, un second ferme. Aucune célébration ne crédite.
   */
  async celebrate(amount: number, bet: number, beat: Beat, maxWin: boolean): Promise<void> {
    const tiers = math().celebrationTiersX;
    const names = ['tier.fire', 'tier.kaboom', 'tier.dam', 'tier.rockslide', 'tier.mountain'];
    const x = amount / bet;
    let reached = 0;
    for (let i = 0; i < tiers.length; i++) if (x >= (tiers[i] as number)) reached = i;
    const box = h('div', { class: `ovl-celebrate${maxWin ? ' is-max' : ''}`, role: 'status' });
    const title = h('div', { class: 'ovl-cel-title' });
    const banner = h('div', { class: 'ovl-cel-banner' }, title);
    const bannerUrl = assetUrl('scr.banner');
    if (bannerUrl) banner.style.backgroundImage = `url(${bannerUrl})`;
    const value = h('div', { class: 'ovl-cel-value' });
    box.append(banner, value);
    // la scène gère l'assombrissement (décor seul) quand elle est branchée ; sinon voile HTML léger
    const veil = h('div', { class: `ovl-veil soft${this.celebration ? ' none' : ''}` });
    this.layer.append(veil, box);
    this.celebration?.onStart(maxWin);
    const state = { shown: 0, tier: -1 };
    const setTier = (i: number) => {
      if (i === state.tier) return;
      state.tier = i;
      title.textContent = maxWin && i === reached ? t('tier.max') : t(names[i] ?? 'tier.fire');
      box.dataset.tier = String(i);
      title.classList.remove('pop');
      void title.offsetWidth;
      title.classList.add('pop');
      this.celebration?.onTier(i, beat);
      this.celebration?.coins(i + 1);
    };
    const render = () => {
      value.textContent = formatMoney(Math.round(state.shown));
      let ti = 0;
      for (let i = 0; i <= reached; i++) if (state.shown >= bet * (tiers[i] as number)) ti = i;
      setTier(maxWin && state.shown >= amount ? reached : ti);
    };
    setTier(0);
    // comptage par segments : lent au départ, accélère avant chaque palier
    const tl = gsap.timeline({ onUpdate: render });
    let from = 0;
    const stops = tiers.slice(1, reached + 1).map((m) => bet * m).concat([amount]);
    stops.forEach((to, i) => {
      const dur = (i === 0 ? 2.2 : 1.5) + (maxWin && i === stops.length - 1 ? 2.5 : 0);
      tl.fromTo(state, { shown: from }, { shown: to, duration: dur, ease: 'power2.in' });
      if (i < stops.length - 1) tl.to({}, { duration: 0.25 });
      from = to;
    });
    tl.fromTo(box, { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2)' }, 0);
    tl.fromTo(veil, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0);
    // premier clic : état final exact ; second clic : fermeture
    let skipped = false;
    const finished = new Promise<void>((resolve) => {
      tl.eventCallback('onComplete', () => resolve());
    });
    const firstClick = new Promise<void>((resolve) => anywhereToDismiss(document.body, () => resolve(), { armDelayMs: 120 }));
    const auto = beat.fast ? Promise.resolve() : finished;
    await Promise.race([auto, firstClick.then(() => (skipped = true))]);
    tl.progress(1);
    state.shown = amount;
    render();
    value.classList.add('final');
    this.announce(`${title.textContent} ${value.textContent}`);
    if (skipped) {
      await new Promise<void>((resolve) => anywhereToDismiss(document.body, () => resolve(), { armDelayMs: 200 }));
    } else {
      // maintien utile, puis fermeture automatique ou au clic
      await Promise.race([beat.wait(maxWin ? 3200 : 1600), new Promise<void>((resolve) => anywhereToDismiss(document.body, () => resolve(), { armDelayMs: 200 }))]);
    }
    const out = gsap.timeline();
    out.to(box, { scale: 0.9, opacity: 0, duration: 0.25, ease: 'power2.in' }).to(veil, { opacity: 0, duration: 0.25 }, 0);
    await new Promise<void>((resolve) => out.eventCallback('onComplete', () => resolve()));
    box.remove();
    veil.remove();
    this.celebration?.onEnd();
  }
}
