import { Container } from 'pixi.js';
import { gsap } from 'gsap';

/**
 * Caméra de scène commune (décor + grille + mascotte) : zooms d'anticipation, transitions, secousses.
 * Le HUD (HTML) et les popups gardent leur taille. Amplitude réduite sur mobile et en mouvements réduits.
 */
export class Camera {
  readonly world = new Container();
  zoom = 1;
  private shakeX = 0;
  private shakeY = 0;
  focusX = 0;
  focusY = 0;
  private vw = 1;
  private vh = 1;
  amplitude = 1;
  reducedMotion = false;

  constructor() {
    this.world.label = 'world';
  }

  resize(vw: number, vh: number): void {
    this.vw = vw;
    this.vh = vh;
    if (!this.focusX && !this.focusY) {
      this.focusX = vw / 2;
      this.focusY = vh / 2;
    }
    this.apply();
  }

  apply(): void {
    const z = this.zoom;
    // zoom autour du point focal : le point focal reste à sa place à l'écran
    this.world.scale.set(z);
    this.world.position.set(this.focusX - this.focusX * z + this.shakeX, this.focusY - this.focusY * z + this.shakeY);
  }

  /** zoom doux vers un facteur autour d'un point (coordonnées écran) */
  zoomTo(factor: number, fx: number, fy: number, duration = 1.2, ease = 'sine.inOut'): gsap.core.Timeline {
    const f = this.reducedMotion ? 1 : 1 + (factor - 1) * this.amplitude;
    const tl = gsap.timeline({ onUpdate: () => this.apply() });
    tl.to(this, { zoom: f, focusX: fx, focusY: fy, duration, ease }, 0);
    return tl;
  }

  reset(duration = 0.6): gsap.core.Timeline {
    return this.zoomTo(1, this.vw / 2, this.vh / 2, duration, 'power2.out');
  }

  /** secousse amortie (impact) */
  shake(strength = 10, duration = 0.45): gsap.core.Timeline {
    const tl = gsap.timeline({ onUpdate: () => this.apply(), onComplete: () => { this.shakeX = 0; this.shakeY = 0; this.apply(); } });
    if (this.reducedMotion) return tl;
    const s = strength * this.amplitude;
    const steps = 9;
    for (let i = 0; i < steps; i++) {
      const k = 1 - i / steps;
      tl.to(this, { shakeX: (i % 2 ? -1 : 1) * s * k * (0.6 + 0.4 * ((i * 7) % 3) / 2), shakeY: ((i * 5) % 3 - 1) * s * 0.6 * k, duration: duration / steps, ease: 'none' });
    }
    tl.to(this, { shakeX: 0, shakeY: 0, duration: 0.05 });
    return tl;
  }

  snapReset(): void {
    gsap.killTweensOf(this);
    this.zoom = 1;
    this.shakeX = 0;
    this.shakeY = 0;
    this.focusX = this.vw / 2;
    this.focusY = this.vh / 2;
    this.apply();
  }
}
