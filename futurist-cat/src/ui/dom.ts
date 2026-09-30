// Small DOM helpers + focus trap + the "click anywhere" catcher (click consumed: it never starts a
// spin, a purchase or the next screen; keyboard Enter/Space do the same).
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | number> = {}, ...children: (Node | string | null)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false) continue;
    if (k === 'class') e.className = String(v);
    else if (k === 'text') e.textContent = String(v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null) e.append(c);
  return e;
}

export const isTouch = (): boolean => matchMedia('(pointer: coarse)').matches;

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
export function trapFocus(root: HTMLElement): () => void {
  const prev = document.activeElement as HTMLElement | null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
    if (!items.length) { e.preventDefault(); root.focus(); return; }
    const first = items[0]!, last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  root.addEventListener('keydown', onKey);
  const first = root.querySelector<HTMLElement>(FOCUSABLE);
  (first ?? root).focus({ preventScroll: true });
  return () => { root.removeEventListener('keydown', onKey); prev?.focus?.({ preventScroll: true }); };
}

/**
 * Full-screen catcher. While armed, the next pointer click (pointerdown + click) or Enter/Space
 * resolves the waiters and is swallowed. A short guard prevents the same gesture from reaching
 * whatever appears next.
 */
export class ClickCatcher {
  readonly node: HTMLDivElement;
  private waiters: (() => void)[] = [];
  private armed = false;
  private guardUntil = 0;
  onAny: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.node = el('div', { class: 'catcher', 'aria-hidden': 'true' });
    parent.appendChild(this.node);
    const fire = (ev: Event) => {
      if (!this.armed) return;
      ev.preventDefault(); ev.stopPropagation();
      if (performance.now() < this.guardUntil) return;
      this.guardUntil = performance.now() + 280;
      this.release();
    };
    this.node.addEventListener('pointerdown', fire);
    this.node.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    window.addEventListener('keydown', (e) => {
      if (!this.armed) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { if (e.repeat) { e.preventDefault(); return; } fire(e); }
    }, true);
  }

  private release(): void {
    const w = this.waiters; this.waiters = [];
    this.onAny?.();
    for (const f of w) f();
  }

  /** the catcher layer is on (blocks the HUD underneath) */
  arm(on: boolean): void { this.armed = on; this.node.classList.toggle('on', on); if (on) this.guardUntil = Math.max(this.guardUntil, performance.now() + 180); }
  get isArmed(): boolean { return this.armed; }
  next(): Promise<void> { return new Promise((res) => this.waiters.push(res)); }
  /** external consumed click (e.g. SPIN pressed during a presentation) */
  poke(): void { if (performance.now() < this.guardUntil) return; this.guardUntil = performance.now() + 280; this.release(); }
}
