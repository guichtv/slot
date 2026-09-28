/** Petit constructeur DOM typé (pas de framework). */
type Attrs = Record<string, string | number | boolean | undefined | null | ((e: Event) => void)>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Array<Node | string | null | undefined | false>): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`élément introuvable ${sel}`);
  return el as HTMLElement;
}

/** Retour visuel < 100 ms au pointerdown (avant le click). */
export function pressable(el: HTMLElement): void {
  el.addEventListener('pointerdown', () => {
    el.classList.add('is-pressed');
  });
  const off = () => el.classList.remove('is-pressed');
  el.addEventListener('pointerup', off);
  el.addEventListener('pointerleave', off);
  el.addEventListener('pointercancel', off);
}

/**
 * Écran « clic n'importe où » : un pointerdown/clic ou Entrée/Espace ferme l'écran.
 * Le geste est consommé (stopPropagation + preventDefault) : il ne déclenche ni spin, ni achat, ni l'écran suivant.
 */
export function anywhereToDismiss(target: HTMLElement, onDismiss: () => void, opts: { armDelayMs?: number } = {}): () => void {
  let armed = false;
  let done = false;
  const armTimer = window.setTimeout(() => (armed = true), opts.armDelayMs ?? 250);
  const finish = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (!armed || done) return;
    done = true;
    cleanup();
    // le click qui suit le pointerup est lui aussi absorbé
    const swallow = (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 400);
    onDismiss();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') finish(e);
  };
  const block = (e: Event) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
  };
  target.addEventListener('pointerdown', finish, { capture: true });
  target.addEventListener('click', block, { capture: true });
  window.addEventListener('keydown', onKey, { capture: true });
  const cleanup = () => {
    window.clearTimeout(armTimer);
    target.removeEventListener('pointerdown', finish, { capture: true });
    target.removeEventListener('click', block, { capture: true });
    window.removeEventListener('keydown', onKey, { capture: true });
  };
  return cleanup;
}

/** Piège de focus pour les dialogues (Tab/Shift+Tab restent dans le dialogue). */
export function trapFocus(root: HTMLElement): () => void {
  const prev = document.activeElement as HTMLElement | null;
  const focusables = () => [...root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select, [tabindex]:not([tabindex="-1"])')];
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (!f.length) return;
    const first = f[0] as HTMLElement;
    const last = f[f.length - 1] as HTMLElement;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  root.addEventListener('keydown', onKey);
  queueMicrotask(() => (focusables()[0] ?? root).focus());
  return () => {
    root.removeEventListener('keydown', onKey);
    prev?.focus?.();
  };
}
