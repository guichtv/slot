import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import type { Area, SymbolName } from '../../contract/schema';
import type { Beat } from '../../core/beat';
import type { GridView } from '../grid/GridView';
import type { Camera } from '../camera';
import { fxTextures } from './textures';
import { ParticleField } from './particles';
import { hasTex, tex } from '../assets';
import { T } from '../../config/timings';

/**
 * Mécanique signature « BLAST & CARVE » : une charge explose, sa zone est dégagée,
 * puis les gravats se reforment en UN symbole géant qui remplit la zone.
 * Phrase visuelle : préparation (mèche) → action (flash + onde) → impact (éclats, poussière, secousse)
 *                   → révélation (le géant se sculpte dans la poussière) → maintien → retour.
 * Les éclats peuvent sortir de la grille (effet d'explosion) ; symboles et halos restent masqués.
 */
export class BlastFx {
  readonly outer = new Container();
  private flash = new Graphics();
  private ring = new Graphics();
  readonly debris = new ParticleField(600, 'normal');
  readonly sparks = new ParticleField(300, 'add');
  readonly smoke = new ParticleField(200, 'normal');

  constructor(
    private grid: GridView,
    private camera: Camera,
  ) {
    this.outer.addChild(this.smoke.view, this.debris.view, this.ring, this.flash, this.sparks.view);
  }

  update(dt: number): void {
    this.debris.update(dt);
    this.sparks.update(dt);
    this.smoke.update(dt);
  }

  /** centre écran d'une zone */
  areaCenter(a: Area): { x: number; y: number; w: number; h: number } {
    const c = this.grid.cell;
    return { x: this.grid.x + (a.col + a.w / 2) * c, y: this.grid.y + (a.row + a.h / 2) * c, w: a.w * c, h: a.h * c };
  }

  /** mèche qui crépite sur la charge (préparation) */
  async fuse(pos: [number, number], beat: Beat, ms = T.blast.fuse): Promise<void> {
    const v = this.grid.viewAt(pos[0], pos[1]);
    const p = this.grid.cellCenter(pos[0], pos[1]);
    const fx = fxTextures();
    const shake = gsap.timeline({ repeat: Math.max(1, Math.round(ms / 70)) });
    if (v) shake.to(v, { angle: 6, duration: 0.035, yoyo: true, repeat: 1 });
    beat.fire(shake);
    const n = Math.max(1, Math.round(ms / 60));
    for (let i = 0; i < n; i++) {
      this.sparks.emit({ texture: fx.spark, count: 4, x: p.x, y: p.y - this.grid.cell * 0.35, speed: [80, 220], angle: -Math.PI / 2, cone: 1.3, gravity: 300, life: [200, 380], scale: [0.14, 0.24], scaleEnd: 0.3, tint: [0xffd54a, 0xff9a3c, 0xffffff], delay: [i * 60, i * 60 + 20] });
    }
    await beat.wait(ms);
    shake.kill();
    if (v) v.angle = 0;
  }

  /** explosion + sculpture du géant */
  async explode(area: Area, giant: SymbolName, beat: Beat, opts: { reduced?: boolean } = {}): Promise<void> {
    const { x, y, w, h } = this.areaCenter(area);
    const fx = fxTextures();
    const size = Math.max(w, h);
    // les cases de la zone disparaissent dans le flash
    for (let c = area.col; c < area.col + area.w; c++) for (let r = area.row; r < area.row + area.h; r++) {
      const v = this.grid.viewAt(c, r);
      if (v) beat.fire(gsap.to(v, { alpha: 0, duration: 0.08 }));
    }
    // flash (étoile d'impact) + onde de choc en anneau
    const flash = this.flash;
    flash.clear();
    const pts: number[] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const r = (i % 2 ? 0.28 : 0.62) * size;
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    flash.poly(pts).fill({ color: 0xfff3c4 }).stroke({ color: 0x1b1410, width: Math.max(3, size * 0.012) });
    flash.position.set(x, y);
    flash.alpha = 1;
    flash.scale.set(0.2);
    const ring = this.ring;
    ring.clear().circle(0, 0, size * 0.5).stroke({ color: 0xfff3c4, width: size * 0.05 });
    ring.position.set(x, y);
    ring.scale.set(0.3);
    ring.alpha = 0.9;
    const tl = gsap.timeline();
    tl.to(flash.scale, { x: 1.15, y: 1.15, duration: T.blast.flash / 1000, ease: 'power3.out' }, 0)
      .to(flash, { alpha: 0, duration: 0.16 }, T.blast.flash / 1000)
      .to(flash, { angle: 12, duration: 0.25 }, 0)
      .to(ring.scale, { x: 1.6, y: 1.6, duration: 0.42, ease: 'power2.out' }, 0.02)
      .to(ring, { alpha: 0, duration: 0.42, ease: 'power1.in' }, 0.02);
    beat.fire(tl);
    if (!opts.reduced) beat.fire(this.camera.shake(T.blast.shake * Math.min(2, area.w / 2), 0.5));
    // éclats de granit et de bois qui sortent de la grille, poussière ocre qui remplit la zone
    this.debris.emit({ texture: fx.chunk, count: 20 * area.w, x, y, spread: size * 0.3, speed: [300, 900], cone: Math.PI, gravity: 1600, life: [700, 1100], scale: [size / 900, size / 420], spin: [-10, 10], tint: [0x8a8f9c, 0x6f7f92, 0xc98a45, 0x6b4526] });
    this.sparks.emit({ texture: fx.spark, count: 26 * area.w, x, y, spread: size * 0.15, speed: [400, 1100], cone: Math.PI, gravity: 500, drag: 1.4, life: [260, 520], scale: [0.2, 0.36], scaleEnd: 0.2, tint: [0xffd54a, 0xffffff, 0xff9a3c] });
    this.smoke.emit({ texture: fx.soft, count: 10 * area.w, x, y, spread: size * 0.42, speed: [20, 90], cone: Math.PI, drag: 1.2, life: [900, 1400], scale: [size / 90, size / 60], scaleEnd: 1.5, tint: [0xd9b27a, 0xc9a06a, 0xe8cfa0], alphaIn: 0.05, alphaOut: 0.55 });
    await beat.wait(T.blast.flash + 120);
    // le géant se sculpte : il émerge de la poussière, trois coups de ciseau font tomber les gravats
    const g = this.grid.addGiant(area, giant);
    const s = g.sprite;
    s.alpha = 0;
    s.scale.set(0.82);
    const carve = gsap.timeline();
    carve.to(s, { alpha: 1, duration: 0.18 }, 0).to(s.scale, { x: 1.08, y: 1.08, duration: 0.26, ease: 'back.out(2)' }, 0).to(s.scale, { x: 1, y: 1, duration: 0.22, ease: 'sine.inOut' });
    const chips = [
      [-0.38, -0.3],
      [0.36, -0.12],
      [-0.1, 0.36],
    ];
    chips.forEach(([dx, dy], i) => {
      carve.add(() => {
        const px = x + (dx as number) * w;
        const py = y + (dy as number) * h;
        this.sparks.emit({ texture: fx.star, count: 1, x: px, y: py, speed: [0, 0], life: [140, 180], scale: [size / 260, size / 220], scaleEnd: 1.4, tint: 0xffffff, alphaIn: 0.01, alphaOut: 0.8 });
        this.debris.emit({ texture: fx.chunk, count: 6, x: px, y: py, speed: [120, 260], angle: Math.PI / 2, cone: 1.2, gravity: 1400, life: [400, 600], scale: [size / 1100, size / 700], spin: [-8, 8], tint: [0x8a8f9c, 0x6f7f92] });
      }, 0.16 + i * 0.1);
    });
    await beat.play(carve);
    if (hasTex('fx.carve')) void tex('fx.carve');
  }

  finish(): void {
    this.debris.finish();
    this.sparks.finish();
    this.smoke.finish();
    this.flash.alpha = 0;
    this.ring.alpha = 0;
  }
}
