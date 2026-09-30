// Loading (Crownforge only, real progress, Retry on error) and welcome (logo + 3 cards, click
// anywhere; the click is consumed and never starts a spin).
import { el, isTouch } from './dom';
import { t } from '../i18n/i18n';

export class LoadingScreen {
  readonly node: HTMLDivElement;
  private bar: HTMLElement;
  private logo: HTMLImageElement;
  private errBox: HTMLDivElement;
  private weights = new Map<string, { w: number; p: number }>();

  constructor(parent: HTMLElement) {
    this.logo = el('img', { class: 'cf-logo', alt: 'Crownforge' });
    this.bar = el('i');
    this.errBox = el('div', { class: 'err', role: 'alert' });
    this.node = el('div', { class: 'screen loading', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-label': 'Crownforge' },
      this.logo, el('div', { class: 'bar' }, this.bar), this.errBox);
    parent.appendChild(this.node);
  }

  setLogo(url: string | null): void { if (url) this.logo.src = url; else this.node.insertBefore(el('div', { class: 'cf-name', text: 'CROWNFORGE' }), this.node.children[1] ?? null); }

  /** declare the real tasks (images decoded, fonts, critical audio, session) with a weight */
  task(id: string, weight: number): (p: number) => void {
    this.weights.set(id, { w: weight, p: 0 });
    return (p: number) => { const x = this.weights.get(id); if (x) { x.p = Math.max(x.p, Math.min(1, p)); this.render(); } };
  }
  private render(): void {
    let tot = 0, done = 0;
    for (const { w, p } of this.weights.values()) { tot += w; done += w * p; }
    const pct = tot ? Math.floor((done / tot) * 100) : 0;
    this.bar.style.width = `${pct}%`;
    this.node.setAttribute('aria-valuenow', String(pct));
  }

  error(message: string, retry: () => void): void {
    const b = el('button', { class: 'btn primary', type: 'button', text: t('loading.retry') });
    b.addEventListener('click', () => retry());
    this.errBox.replaceChildren(el('p', { text: message }), b);
    b.style.pointerEvents = 'auto';
    b.focus();
  }

  hide(): Promise<void> { this.node.classList.add('gone'); return new Promise((r) => setTimeout(() => { this.node.remove(); r(); }, 460)); }
}

export class WelcomeScreen {
  readonly node: HTMLDivElement;
  constructor(parent: HTMLElement, logoUrl: string | null, cards: [string | null, string][]) {
    const logo = el('img', { class: 'w-logo', alt: t('game.name') });
    if (logoUrl) logo.src = logoUrl;
    this.node = el('div', { class: 'screen welcome', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('game.name'), tabindex: '-1' },
      logo,
      el('div', { class: 'w-cards' }, ...cards.map(([img, txt]) => el('div', { class: 'w-card' }, el('i', { style: img ? `background-image:url("${img}")` : '' }), el('p', { text: txt })))),
      el('div', { class: 'tap', text: isTouch() ? t('welcome.tap.touch') : t('welcome.tap') }));
    parent.appendChild(this.node);
    this.node.focus({ preventScroll: true });
  }
  /** resolves on the consumed click / Enter / Space */
  wait(): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const go = (e: Event) => {
        if (done) return;
        if (e instanceof KeyboardEvent && !(e.key === 'Enter' || e.key === ' ')) return;
        e.preventDefault(); e.stopPropagation();
        done = true;
        this.node.removeEventListener('pointerdown', go);
        window.removeEventListener('keydown', go, true);
        // swallow the click that follows this pointerdown
        const swallow = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
        window.addEventListener('click', swallow, true);
        setTimeout(() => window.removeEventListener('click', swallow, true), 350);
        resolve();
      };
      this.node.addEventListener('pointerdown', go);
      window.addEventListener('keydown', go, true);
    });
  }
  hide(): Promise<void> { this.node.classList.add('gone'); return new Promise((r) => setTimeout(() => { this.node.remove(); r(); }, 460)); }
}
