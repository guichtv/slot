import { gsap } from 'gsap';
import { intlLocale, t } from '../i18n';
import { anywhereToDismiss, h } from './dom';
import { assetUrl } from './overlays';

/**
 * Écran d'accueil : logo, trois cartes illustrées (mécanique, bonus, super bonus), gain maximal.
 * Aucun bouton « Continuer » : un toucher n'importe où (ou Entrée / Espace) ferme, et ce geste est consommé.
 * Sortie thématique : les cartes sont soufflées vers l'extérieur comme par une explosion au centre.
 * « Ne plus afficher » est une préférence locale du joueur (stockage du navigateur, facultatif).
 */
const SKIP_KEY = 'bt.skipWelcome';

export function welcomeSkipped(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

function setSkipped(on: boolean): void {
  try {
    if (on) localStorage.setItem(SKIP_KEY, '1');
    else localStorage.removeItem(SKIP_KEY);
  } catch {
    /* stockage indisponible : l'accueil s'affichera la prochaine fois */
  }
}

const CARDS = [
  { art: 'id.card.blast', key: 'welcome.blast' },
  { art: 'id.card.bonus', key: 'welcome.bonus' },
  { art: 'id.card.detonator', key: 'welcome.super' },
] as const;

export async function showWelcome(host: HTMLElement, opts: { onDismissStart?: () => void; maxWinX: number }): Promise<void> {
  const cards = CARDS.map((c, i) => {
    const url = assetUrl(c.art);
    const img = url ? h('img', { class: 'wel-art', src: url, alt: '', draggable: 'false' }) : h('div', { class: 'wel-art' });
    return h('article', { class: 'wel-card', 'data-i': i }, img, h('div', { class: 'wel-text' }, h('h2', { class: 'wel-title' }, t(`${c.key}.title`)), h('p', { class: 'wel-body' }, t(`${c.key}.body`))));
  });
  const logoUrl = assetUrl('id.logo');
  const logo = logoUrl ? h('img', { class: 'wel-logo', src: logoUrl, alt: 'BOOMTOOTH' }) : h('div', { class: 'wel-logo' });
  const check = h('input', { type: 'checkbox', class: 'wel-check' }) as HTMLInputElement;
  check.checked = welcomeSkipped();
  check.addEventListener('change', () => setSkipped(check.checked));
  const skip = h('label', { class: 'wel-skip' }, check, h('span', {}, t('welcome.skip')));
  const max = h('div', { class: 'wel-max' }, t('welcome.max', { x: opts.maxWinX.toLocaleString(intlLocale()) }));
  const hint = h('div', { class: 'wel-hint', 'aria-hidden': 'true' }, t('common.tapAnywhere'));
  const root = h(
    'div',
    { class: 'wel', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('welcome.label'), tabindex: '-1' },
    h('div', { class: 'wel-veil' }),
    h('div', { class: 'wel-inner' }, logo, h('div', { class: 'wel-cards' }, ...cards), max, h('div', { class: 'wel-foot' }, hint, skip)),
  );
  host.append(root);
  root.focus({ preventScroll: true });

  const tin = gsap.timeline();
  tin.fromTo(root.querySelector('.wel-veil'), { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0)
    .fromTo(logo, { y: -40, opacity: 0, scale: 0.8 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2)' }, 0.05)
    .fromTo(cards, { y: 60, opacity: 0, rotation: (i: number) => (i - 1) * 6 }, { y: 0, opacity: 1, rotation: 0, duration: 0.5, ease: 'back.out(1.6)', stagger: 0.09 }, 0.15)
    .fromTo([max, hint, skip], { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.05 }, 0.55);

  // animations réduites (réglage du menu ou préférence système) : apparition et sortie sans mouvement
  const reduced = document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) tin.progress(1);
  await new Promise<void>((resolve) => anywhereToDismiss(root, () => resolve(), { armDelayMs: 300, ignore: '.wel-skip' }));
  tin.progress(1);
  opts.onDismissStart?.();

  // sortie : souffle depuis le centre, les cartes partent vers l'extérieur en tournoyant
  const out = gsap.timeline();
  cards.forEach((c, i) => {
    const dir = i - 1;
    out.to(c, { x: dir * window.innerWidth * 0.6, y: -window.innerHeight * (0.35 + Math.abs(dir) * 0.1), rotation: dir * 40 + (dir === 0 ? -18 : 0), opacity: 0, duration: 0.55, ease: 'power2.in' }, 0.02 * i);
  });
  out.to(logo, { y: -120, scale: 1.2, opacity: 0, duration: 0.4, ease: 'power2.in' }, 0)
    .to([max, hint, skip], { opacity: 0, duration: 0.2 }, 0)
    .to(root.querySelector('.wel-veil'), { opacity: 0, duration: 0.45 }, 0.15);
  if (reduced) out.progress(1);
  else await new Promise<void>((resolve) => out.eventCallback('onComplete', () => resolve()));
  root.remove();
}
