import { BitmapFont, Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import { clock } from '../core/clock';
import { Camera } from './camera';
import { Decor } from './decor';
import { GridView } from './grid/GridView';
import { BlastFx } from './fx/blast';
import { buildFxTextures } from './fx/textures';
import { computeLayout, type SceneLayout } from './layout';
import { COLS, ROWS } from '../contract/schema';
import type { RenderHost } from './app';

/**
 * Racine de la scène : caméra commune (décor + grille + mascotte), calques, voile, célébrations.
 * Ordre : ciel/lointain/intermédiaire → sol → grille → mascotte → effets d'explosion → premier plan
 *         (hors caméra) voile → bannières / célébration.
 */
export class Scene {
  readonly camera = new Camera();
  readonly decor: Decor;
  readonly grid: GridView;
  readonly blast: BlastFx;
  readonly mascotLayer = new Container();
  readonly overlay = new Container();
  readonly veil = new Graphics();
  readonly banners = new Container();
  layout!: SceneLayout;
  private listeners: Array<(l: SceneLayout) => void> = [];

  constructor(readonly host: RenderHost) {
    const app = host.app;
    buildFxTextures(app.renderer);
    BitmapFont.install({
      name: 'WinDigits',
      style: {
        fontFamily: 'Lilita One, Baloo 2, sans-serif',
        fontSize: 64,
        fill: 0xfff3c4,
        stroke: { color: 0x1b1410, width: 10, join: 'round' },
        dropShadow: { color: 0x1b1410, distance: 4, angle: Math.PI / 2, blur: 0, alpha: 1 },
      },
      chars: [['0', '9'], ' .,×=+-€$%SGCx:'.split('').join('')].flat() as never,
      resolution: Math.min(2, host.dpr),
      padding: 6,
    });
    this.decor = new Decor();
    this.grid = new GridView();
    this.blast = new BlastFx(this.grid, this.camera);
    const w = this.camera.world;
    w.addChild(this.decor.back, this.decor.ground, this.grid.view, this.mascotLayer, this.blast.outer, this.decor.front);
    this.veil.alpha = 0;
    this.overlay.addChild(this.veil, this.banners);
    app.stage.addChild(w, this.overlay);
    clock.onFrame((_t, dt) => this.blast.update(dt));
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  onLayout(fn: (l: SceneLayout) => void): void {
    this.listeners.push(fn);
    if (this.layout) fn(this.layout);
  }

  resize(): void {
    const host = this.host.app.canvas.parentElement as HTMLElement;
    const vw = host.clientWidth || window.innerWidth;
    const vh = host.clientHeight || window.innerHeight;
    const cs = getComputedStyle(document.documentElement);
    const safe = {
      top: parseFloat(cs.getPropertyValue('--sat')) || 0,
      right: parseFloat(cs.getPropertyValue('--sar')) || 0,
      bottom: parseFloat(cs.getPropertyValue('--sab')) || 0,
      left: parseFloat(cs.getPropertyValue('--sal')) || 0,
    };
    this.layout = computeLayout(vw, vh, { cols: COLS, rows: ROWS, frame: 0.36 }, safe);
    this.host.app.renderer.resize(vw, vh);
    this.camera.resize(vw, vh);
    this.decor.layout(this.layout);
    this.grid.layout(this.layout);
    this.veil.clear().rect(0, 0, vw, vh).fill({ color: 0x0d0906 });
    for (const l of this.listeners) l(this.layout);
  }

  /** voile léger derrière les popups : la slot reste visible */
  setVeil(alpha: number, duration = 0.25): gsap.core.Tween {
    return gsap.to(this.veil, { alpha, duration });
  }
}
