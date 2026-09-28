import type { gsap } from 'gsap';
import { clock as defaultClock, type PresentationClock } from './clock';

export class Cancelled extends Error {
  constructor(reason = 'cancelled') {
    super(reason);
    this.name = 'Cancelled';
  }
}

export class CancelToken {
  cancelled = false;
  reason = '';
  private hooks: Array<() => void> = [];
  cancel(reason = 'cancelled'): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.reason = reason;
    const h = this.hooks;
    this.hooks = [];
    for (const fn of h) fn();
  }
  onCancel(fn: () => void): void {
    if (this.cancelled) fn();
    else this.hooks.push(fn);
  }
  throwIfCancelled(): void {
    if (this.cancelled) throw new Cancelled(this.reason);
  }
}

/**
 * Contexte d'exécution d'une séquence de présentation.
 * - wait()/play() suivent l'horloge de présentation et la vitesse (turbo).
 * - skip() amène chaque animation active à sa fin exacte (progress(1)) et résout les attentes :
 *   l'état final visuel est atteint sans rien réappliquer à l'état logique.
 * - Les sous-séquences (child) héritent de l'annulation et du skip parent.
 */
export class Beat {
  skipping = false;
  private active = new Set<gsap.core.Animation>();
  private waits = new Set<() => void>();
  private children = new Set<Beat>();

  constructor(
    readonly token: CancelToken = new CancelToken(),
    public speed = 1,
    readonly clock: PresentationClock = defaultClock,
    private parent: Beat | null = null,
  ) {
    token.onCancel(() => this.flush());
  }

  child(): Beat {
    const c = new Beat(this.token, this.speed, this.clock, this);
    c.skipping = this.skipping;
    this.children.add(c);
    return c;
  }

  dispose(): void {
    this.parent?.children.delete(this);
  }

  get fast(): boolean {
    return this.skipping || this.token.cancelled;
  }

  async wait(ms: number): Promise<void> {
    this.token.throwIfCancelled();
    if (this.fast || ms <= 0) return;
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.waits.delete(finish);
        resolve();
      };
      this.waits.add(finish);
      void this.clock.wait(ms / this.speed).then(finish);
    });
    this.token.throwIfCancelled();
  }

  /** Joue une animation GSAP jusqu'au bout (ou instantanément si skip). */
  async play(anim: gsap.core.Animation): Promise<void> {
    this.token.throwIfCancelled();
    anim.timeScale(anim.timeScale() * this.speed);
    if (this.fast) {
      anim.progress(1);
      return;
    }
    this.active.add(anim);
    await new Promise<void>((resolve) => {
      const prev = anim.eventCallback('onComplete');
      anim.eventCallback('onComplete', (...a: unknown[]) => {
        if (typeof prev === 'function') (prev as (...x: unknown[]) => void)(...a);
        resolve();
      });
      if (anim.progress() >= 1) resolve();
      this.token.onCancel(() => resolve());
    });
    this.active.delete(anim);
    this.token.throwIfCancelled();
  }

  /** Lance sans attendre (effets parallèles) ; le skip l'amène aussi à sa fin. */
  fire(anim: gsap.core.Animation): gsap.core.Animation {
    anim.timeScale(anim.timeScale() * this.speed);
    if (this.fast) {
      anim.progress(1);
      return anim;
    }
    this.active.add(anim);
    anim.eventCallback('onComplete', () => this.active.delete(anim));
    return anim;
  }

  skip(): void {
    this.skipping = true;
    this.flush();
    for (const c of this.children) c.skip();
  }

  private flush(): void {
    for (const a of [...this.active]) a.progress(1);
    this.active.clear();
    for (const w of [...this.waits]) w();
    this.waits.clear();
  }
}
