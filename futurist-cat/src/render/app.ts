// Pixi application + the single frame loop. Order in one frame:
//   clock.step(dt) -> gsap.updateRoot(clock.time) -> frame listeners (cat: mixer -> three -> upload) -> Pixi render.
// Hidden tab: the loop stops entirely; on resume dt is clamped (0.05 s), no catch-up.
// QA (?virtual=1): the loop does not advance time; window.__qaStep(ms) does, frame exact.
import { Application } from 'pixi.js';
import gsap from 'gsap';
import type { GameClock } from '../core/clock';

export interface AppOptions { clock: GameClock; resolution: number; antialias: boolean }

export class GameApp {
  readonly app = new Application();
  private raf = 0;
  private last = 0;
  private running = false;
  fps = 60;
  private fpsAcc: number[] = [];
  frameMs = 0;
  onBeforeRender = new Set<(dt: number) => void>();

  constructor(private readonly o: AppOptions) {}

  async init(parent: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: window, antialias: this.o.antialias, backgroundAlpha: 1, background: 0x05080f, preference: 'webgl',
      autoStart: false, resolution: this.o.resolution, autoDensity: true, powerPreference: 'high-performance',
    });
    this.app.ticker.stop();
    this.app.canvas.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.app.canvas);
    gsap.ticker.remove(gsap.updateRoot);
    gsap.ticker.lagSmoothing(0);
    gsap.config({ autoSleep: 0 } as unknown as gsap.GSAPConfig);
    document.addEventListener('visibilitychange', this.onVis);
  }

  private onVis = (): void => {
    const hidden = document.visibilityState === 'hidden';
    this.o.clock.hidden = hidden;
    if (hidden) this.stop(); else this.start();
  };

  /** one frame with a given game dt (seconds) */
  frame(dt: number): void {
    const t0 = performance.now();
    gsap.updateRoot(this.o.clock.time);
    for (const f of this.onBeforeRender) f(dt);
    this.app.renderer.render(this.app.stage);
    this.frameMs = performance.now() - t0;
  }

  start(): void {
    if (this.running || this.o.clock.virtual) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const real = (now - this.last) / 1000;
      this.last = now;
      this.fpsAcc.push(real);
      if (this.fpsAcc.length > 30) this.fpsAcc.shift();
      const avg = this.fpsAcc.reduce((a, b) => a + b, 0) / this.fpsAcc.length;
      this.fps = avg > 0 ? 1 / avg : 60;
      const dt = this.o.clock.step(real);
      this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void { this.running = false; cancelAnimationFrame(this.raf); }

  /** QA: advance game time by ms in fixed 1/60 steps and render each frame */
  step(ms: number, fps = 60): void {
    const n = Math.max(1, Math.round((ms / 1000) * fps));
    for (let i = 0; i < n; i++) { this.o.clock.advance(1 / fps); this.frame(1 / fps); }
  }
}
