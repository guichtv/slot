import { Container, Sprite } from 'pixi.js';
import { gsap } from 'gsap';
import { hasTex, tex } from './assets';
import type { SceneLayout } from './layout';
import { fxTextures } from './fx/textures';
import { ParticleField } from './fx/particles';
import { clock } from '../core/clock';

/**
 * Logo BOOMTOOTH (ImageGen) posé dans le décor : respiration lente, mèche qui crépite,
 * sursaut sur les gains (thump). Placé dans le rectangle `logo` de la mise en page (contain).
 */
// position de la mèche dans l'image du logo (fraction de la texture)
const FUSE = { x: 0.935, y: 0.14 };

export class Logo {
  readonly view = new Container();
  private art: Sprite | null = null;
  private sparks = new ParticleField(80, 'add');
  private baseScale = 1;
  private sparkAcc = 0;
  reducedMotion = false;

  constructor() {
    this.view.label = 'logo';
    if (hasTex('id.logo')) {
      this.art = new Sprite(tex('id.logo'));
      this.art.anchor.set(0.5);
      this.view.addChild(this.art);
    }
    this.view.addChild(this.sparks.view);
    clock.onFrame((t, dt) => this.tick(t, dt));
  }

  layout(l: SceneLayout): void {
    if (!this.art) return;
    const r = l.logo;
    const k = Math.min(r.w / this.art.texture.width, r.h / this.art.texture.height);
    this.baseScale = k;
    this.art.scale.set(k);
    this.view.position.set(r.x + r.w / 2, r.y + r.h / 2);
  }

  private tick(t: number, dt: number): void {
    const a = this.art;
    if (!a) return;
    if (!this.reducedMotion) {
      const s = this.baseScale * (1 + Math.sin(t / 1400) * 0.012);
      a.scale.set(s);
      a.rotation = Math.sin(t / 2300) * 0.012;
    }
    // la mèche crépite : quelques étincelles par seconde
    this.sparkAcc += dt;
    if (this.sparkAcc > 90) {
      this.sparkAcc = 0;
      const fx = fxTextures();
      const w = a.texture.width * a.scale.x;
      const h = a.texture.height * a.scale.y;
      this.sparks.emit({
        texture: fx.spark,
        count: 2,
        x: (FUSE.x - 0.5) * w,
        y: (FUSE.y - 0.5) * h,
        spread: 3,
        speed: [40, 130],
        angle: -Math.PI / 2,
        cone: Math.PI * 0.7,
        gravity: 260,
        life: [220, 480],
        scale: [0.12, 0.26],
        scaleEnd: 0.3,
        tint: [0xffe08a, 0xffb347, 0xffffff],
      });
    }
    this.sparks.update(dt);
  }

  /** sursaut sur un gain ou un impact */
  thump(strength = 1): gsap.core.Timeline {
    const a = this.art;
    const tl = gsap.timeline();
    if (!a || this.reducedMotion) return tl;
    tl.to(this.view.scale, { x: 1 + 0.08 * strength, y: 1 - 0.05 * strength, duration: 0.08, ease: 'power2.out' })
      .to(this.view.scale, { x: 1, y: 1, duration: 0.5, ease: 'elastic.out(1, 0.4)' });
    return tl;
  }
}
