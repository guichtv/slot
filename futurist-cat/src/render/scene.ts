// Scene graph. `cam` is the scene camera: every zoom (anticipation, celebrations, transitions)
// scales decor + grid + cat TOGETHER, so the cat never zooms twice and its feet stay on its
// shadow. The HUD is HTML and stays fixed. Screen-space layers (veil, celebration) sit above.
import { Container, Graphics, Point, RenderLayer, type Renderer } from 'pixi.js';
import gsap from 'gsap';
import { Decor } from './decor';
import { GridView } from './grid';
import { Mechanic, type MechHooks } from './mechanic';
import { Particles, Shapes } from './fx';
import type { AssetStore } from './assets';
import type { Layout } from './layout';
import type { Rand } from '../core/rng';
import type { CatView } from './cat/cat-view';

export class Scene {
  readonly cam = new Container({ label: 'camera' });
  readonly world = new Container({ label: 'world' });
  readonly screen = new Container({ label: 'screen' });
  readonly veil = new Graphics();
  /** the cat is drawn here (above the veil, below the plates) while it is the star: celebrations, intros */
  readonly catLayer = new RenderLayer();
  readonly celebrationLayer = new Container({ label: 'celebration' });
  readonly bannerLayer = new Container({ label: 'banners' });
  readonly decor: Decor;
  readonly grid: GridView;
  readonly particles: Particles;
  readonly shapes = new Shapes();
  readonly mech: Mechanic;
  readonly catSlot = new Container({ label: 'cat-slot' });
  cat: CatView | null = null;
  layoutNow: Layout | null = null;
  private zoomTl: gsap.core.Timeline | null = null;
  private shakeT = 0;
  private shakeAmp = 0;
  reduced = false;

  constructor(readonly assets: AssetStore, readonly renderer: Renderer, private readonly rand: Rand, hooks: Omit<MechHooks, 'eyesWorld' | 'lookAt'>) {
    this.decor = new Decor(assets, renderer, rand);
    this.grid = new GridView(assets, renderer, rand);
    this.particles = new Particles(assets, renderer, rand);
    this.mech = new Mechanic(this.grid, assets, renderer, this.particles, this.shapes, {
      ...hooks,
      eyesWorld: () => this.eyesWorld(),
      lookAt: (p) => this.lookAt(p),
    });
    this.grid.overlay.addChild(this.mech.circuit, this.mech.chipsLayer, this.mech.tokens);
    this.world.addChild(this.decor.back, this.decor.front, this.grid.root, this.catSlot, this.mech.dotLayer, this.shapes.root, this.particles.root, this.decor.fore);
    this.cam.addChild(this.world);
    this.screen.addChild(this.veil, this.catLayer, this.celebrationLayer, this.bannerLayer);
    this.veil.alpha = 0;
  }

  attachCat(cat: CatView): void {
    this.cat = cat;
    this.catSlot.addChild(cat.root);
    if (this.layoutNow) this.placeCat(this.layoutNow);
  }

  private placeCat(l: Layout): void {
    if (!this.cat) return;
    this.cat.root.position.set(l.design.cat.x, l.design.cat.y);
  }

  layout(l: Layout): void {
    this.layoutNow = l;
    this.world.scale.set(l.scale);
    this.world.position.set(l.offX, l.offY);
    this.cam.pivot.set(0, 0); this.cam.position.set(0, 0); this.cam.scale.set(1);
    this.decor.layout(l);
    this.grid.layout(l);
    this.mech.layout();
    this.placeCat(l);
    this.veil.clear().rect(0, 0, l.vw, l.vh).fill({ color: 0x02040c });
  }

  eyesWorld(): { x: number; y: number } {
    if (!this.cat) { const l = this.layoutNow!; return { x: l.design.cat.x, y: l.design.cat.y - l.design.cat.height * 0.85 }; }
    const g = this.cat.eyesGlobal(new Point());
    return this.world.toLocal(g);
  }
  lookAt(p: { x: number; y: number } | null): void {
    if (!this.cat) return;
    if (!p) { this.cat.lookAtGlobal(null); return; }
    this.cat.lookAtGlobal(this.world.toGlobal(new Point(p.x, p.y)));
  }
  worldToScreen(p: { x: number; y: number }): { x: number; y: number } { const g = this.world.toGlobal(new Point(p.x, p.y)); return { x: g.x, y: g.y }; }

  /** zoom the whole scene toward a world point (the HUD stays fixed) */
  zoomTo(focus: { x: number; y: number }, zoom: number, dur: number): gsap.core.Timeline {
    this.zoomTl?.kill();
    const tl = gsap.timeline();
    this.zoomTl = tl;
    if (this.reduced) return tl;
    const s = this.worldToScreenNoCam(focus);
    tl.to(this.cam.pivot, { x: s.x, y: s.y, duration: dur, ease: 'power2.inOut' }, 0)
      .to(this.cam.position, { x: s.x, y: s.y, duration: dur, ease: 'power2.inOut' }, 0)
      .to(this.cam.scale, { x: zoom, y: zoom, duration: dur, ease: 'power2.inOut' }, 0);
    return tl;
  }
  resetZoom(dur: number): gsap.core.Timeline {
    this.zoomTl?.kill();
    const tl = gsap.timeline();
    this.zoomTl = tl;
    tl.to(this.cam.scale, { x: 1, y: 1, duration: dur, ease: 'power2.inOut' }, 0);
    return tl;
  }
  private worldToScreenNoCam(p: { x: number; y: number }): { x: number; y: number } {
    const l = this.layoutNow!;
    return { x: l.offX + p.x * l.scale, y: l.offY + p.y * l.scale };
  }

  shake(dur = 0.08, amp = 6): void { if (this.reduced) return; this.shakeT = dur; this.shakeAmp = amp; }

  /** cat above the veil (keeps its world transform: zoom, camera) or back in the world order */
  catFront(on: boolean): void {
    if (on && this.catSlot.parentRenderLayer !== this.catLayer) this.catLayer.attach(this.catSlot);
    else if (!on && this.catSlot.parentRenderLayer === this.catLayer) this.catLayer.detach(this.catSlot);
  }
  veilTo(alpha: number, dur = 0.25): gsap.core.Tween { return gsap.to(this.veil, { alpha, duration: dur }); }

  update(dt: number, idleAllowed: boolean): void {
    this.decor.update(dt);
    this.grid.update(dt, idleAllowed);
    this.mech.update(dt);
    this.particles.update(dt);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeT > 0 ? this.shakeAmp : 0;
      this.world.pivot.set((this.rand() - 0.5) * a / this.world.scale.x, (this.rand() - 0.5) * a / this.world.scale.y);
    } else if (this.world.pivot.x || this.world.pivot.y) this.world.pivot.set(0, 0);
  }
}
