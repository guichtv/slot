import { gsap } from 'gsap';

/**
 * Horloge de présentation partagée (temps écoulé, en ms).
 * - Pilote GSAP (updateRoot), le ticker Pixi et les attentes du séquenceur.
 * - Onglet masqué : l'horloge se fige, puis reprend sans rafale (delta plafonné).
 * - En QA, l'horloge virtuelle remplace requestAnimationFrame : on avance image par image.
 */
export type FrameListener = (timeMs: number, deltaMs: number) => void;

interface Timer {
  at: number;
  resolve: () => void;
}

const MAX_DELTA = 50; // ms : jamais de saut > 3 images après un gel

export class PresentationClock {
  time = 0;
  private listeners: FrameListener[] = [];
  private timers: Timer[] = [];
  private raf = 0;
  private lastReal = 0;
  private paused = false;
  private virtual = false;
  /** facteur de vitesse global (ralenti de revue : 0.25) */
  rate = 1;
  /** origine GSAP (secondes) : le temps racine reste monotone */
  private readonly gsapBase: number;

  constructor() {
    this.gsapBase = gsap.globalTimeline.time();
    gsap.ticker.remove(gsap.updateRoot);
    gsap.ticker.lagSmoothing(0);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => this.setPaused(document.hidden));
    }
  }

  onFrame(fn: FrameListener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  start(): void {
    if (this.virtual || this.raf) return;
    this.lastReal = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const real = Math.min(MAX_DELTA, Math.max(0, now - this.lastReal));
      this.lastReal = now;
      if (!this.paused) this.advance(real * this.rate);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.lastReal = performance.now();
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Mode QA : plus de rAF, l'horloge n'avance que par step(). */
  useVirtual(): void {
    this.stop();
    this.virtual = true;
  }

  get isVirtual(): boolean {
    return this.virtual;
  }

  step(ms: number, frame = 1000 / 60): void {
    let left = ms;
    while (left > 0) {
      const d = Math.min(frame, left);
      this.advance(d);
      left -= d;
    }
  }

  private advance(delta: number): void {
    this.time += delta;
    gsap.updateRoot(this.gsapBase + this.time / 1000);
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > this.time);
        for (const t of due) t.resolve();
      }
    }
    for (const l of this.listeners) l(this.time, delta);
  }

  /** Attente sur l'horloge de présentation (jamais setTimeout pour une animation). */
  wait(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => this.timers.push({ at: this.time + ms, resolve }));
  }

  /** Résout immédiatement toutes les attentes en cours (skip global). */
  flushTimers(): void {
    const all = this.timers;
    this.timers = [];
    for (const t of all) t.resolve();
  }
}

export const clock = new PresentationClock();
