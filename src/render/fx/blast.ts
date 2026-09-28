import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import type { Area, SymbolName } from '../../contract/schema';
import type { Beat } from '../../core/beat';
import type { GridView } from '../grid/GridView';
import type { Camera } from '../camera';
import { fxTextures } from './textures';
import { ParticleField } from './particles';
import { T } from '../../config/timings';

/**
 * Mécanique signature « BLAST & CARVE » en phrases visuelles :
 * 1. piquets + cordeau du géomètre autour de la zone (lecture de la zone avant l'explosion) ;
 * 2. mèche qui crépite (préparation) ;
 * 3. explosion : flash en étoile, onde de choc, éclats de granit qui peuvent sortir du cadre, poussière ocre ;
 * 4. chaîne : l'étincelle file jusqu'à la charge suivante, qui crépite 0,4 s puis saute ;
 * 5. sculpture : la poussière se dissipe, le géant émerge du rectangle englobant, trois coups de ciseau.
 * Symboles et halos restent masqués dans la grille ; seuls les éclats et la poussière sortent du cadre.
 */
export class BlastFx {
  readonly outer = new Container();
  private flash = new Graphics();
  private ring = new Graphics();
  private stakesG = new Graphics();
  private wire = new Graphics();
  readonly debris = new ParticleField(700, 'normal');
  readonly sparks = new ParticleField(400, 'add');
  readonly smoke = new ParticleField(260, 'normal');

  constructor(
    private grid: GridView,
    private camera: Camera,
  ) {
    this.outer.addChild(this.stakesG, this.wire, this.smoke.view, this.debris.view, this.ring, this.flash, this.sparks.view);
  }

  update(dt: number): void {
    this.debris.update(dt);
    this.sparks.update(dt);
    this.smoke.update(dt);
  }

  rect(a: Area): { x: number; y: number; w: number; h: number; cx: number; cy: number } {
    const c = this.grid.cell;
    const x = this.grid.x + a.col * c;
    const y = this.grid.y + a.row * c;
    return { x, y, w: a.w * c, h: a.h * c, cx: x + (a.w * c) / 2, cy: y + (a.h * c) / 2 };
  }

  /** piquets et cordeau autour de la zone : le joueur voit ce qui va sauter */
  stakes(a: Area, beat: Beat): gsap.core.Timeline {
    const r = this.rect(a);
    const g = this.stakesG;
    const inset = this.grid.cell * 0.06;
    const pts: Array<[number, number]> = [
      [r.x + inset, r.y + inset],
      [r.x + r.w - inset, r.y + inset],
      [r.x + r.w - inset, r.y + r.h - inset],
      [r.x + inset, r.y + r.h - inset],
    ];
    const prog = { k: 0 };
    const draw = () => {
      g.clear();
      const k = prog.k;
      // cordeau qui se tend d'un piquet à l'autre
      const total = 4 * k;
      g.moveTo(pts[0]![0], pts[0]![1]);
      for (let i = 1; i <= 4; i++) {
        const seg = Math.min(1, Math.max(0, total - (i - 1)));
        if (seg <= 0) break;
        const a0 = pts[i - 1]!;
        const a1 = pts[i % 4]!;
        g.lineTo(a0[0] + (a1[0] - a0[0]) * seg, a0[1] + (a1[1] - a0[1]) * seg);
      }
      g.stroke({ width: Math.max(2, this.grid.cell * 0.025), color: 0xf4e6c8, alpha: 0.95 });
      // piquets : bois clair, tête rouge, contour encre
      const s = this.grid.cell * 0.09;
      for (const [x, y] of pts) {
        g.roundRect(x - s * 0.25, y - s, s * 0.5, s * 1.4, s * 0.15).fill({ color: 0xc98a45 }).stroke({ color: 0x1b1410, width: Math.max(1.5, s * 0.12) });
        g.circle(x, y - s, s * 0.3).fill({ color: 0xd7332b }).stroke({ color: 0x1b1410, width: Math.max(1.5, s * 0.1) });
      }
      g.alpha = 1;
    };
    const tl = gsap.timeline({ onUpdate: draw });
    tl.fromTo(prog, { k: 0 }, { k: 1, duration: 0.32, ease: 'power1.inOut' });
    beat.fire(tl);
    return tl;
  }

  clearStakes(): void {
    this.stakesG.clear();
  }

  /** fil de mise à feu reliant toutes les charges (super bonus) */
  showWire(points: Array<{ x: number; y: number }>, beat: Beat): gsap.core.Timeline {
    const g = this.wire;
    const prog = { k: 0 };
    const draw = () => {
      g.clear();
      if (points.length < 2) return;
      g.moveTo(points[0]!.x, points[0]!.y);
      const n = points.length - 1;
      const reach = prog.k * n;
      for (let i = 1; i <= n; i++) {
        const seg = Math.min(1, Math.max(0, reach - (i - 1)));
        if (seg <= 0) break;
        const p0 = points[i - 1]!;
        const p1 = points[i]!;
        // léger affaissement du fil
        const mx = (p0.x + p1.x) / 2;
        const my = (p0.y + p1.y) / 2 + this.grid.cell * 0.25;
        g.quadraticCurveTo(mx, my, p0.x + (p1.x - p0.x) * seg, p0.y + (p1.y - p0.y) * seg);
      }
      g.stroke({ width: Math.max(3, this.grid.cell * 0.035), color: 0xd7332b }).stroke({ width: Math.max(1, this.grid.cell * 0.012), color: 0x1b1410 });
    };
    const tl = gsap.timeline({ onUpdate: draw });
    tl.fromTo(prog, { k: 0 }, { k: 1, duration: 0.45, ease: 'power1.inOut' });
    beat.fire(tl);
    return tl;
  }

  clearWire(): void {
    this.wire.clear();
  }

  /** étincelle qui file d'un point à un autre (lien de chaîne, fil, allumette) */
  async spark(from: { x: number; y: number }, to: { x: number; y: number }, beat: Beat, ms = 320, arc = 0): Promise<void> {
    const fx = fxTextures();
    const n = Math.max(4, Math.round(ms / 30));
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const x = from.x + (to.x - from.x) * k;
      const y = from.y + (to.y - from.y) * k - Math.sin(Math.PI * k) * arc;
      this.sparks.emit({ texture: fx.spark, count: 3, x, y, speed: [40, 140], cone: Math.PI, gravity: 240, life: [180, 320], scale: [0.14, 0.24], scaleEnd: 0.3, tint: [0xffd54a, 0xff9a3c, 0xffffff], delay: [k * ms, k * ms + 10] });
    }
    await beat.wait(ms);
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

  /** explosion d'une zone : les cases deviennent des gravats (les autres charges prises restent visibles) */
  async explode(area: Area, pos: [number, number], beat: Beat, opts: { reduced?: boolean; strength?: number; keepSymbols?: boolean } = {}): Promise<void> {
    const r = this.rect(area);
    const fx = fxTextures();
    const size = Math.max(r.w, r.h);
    this.clearStakes();
    // keepSymbols : souffle seul (Scatters au déclenchement du bonus : jamais détruits)
    if (!opts.keepSymbols) for (let c = area.col; c < area.col + area.w; c++) for (let rr = area.row; rr < area.row + area.h; rr++) {
      const v = this.grid.viewAt(c, rr);
      const isOtherCharge = v && v.sym === 'T' && (c !== pos[0] || rr !== pos[1]);
      if (v && !isOtherCharge) beat.fire(gsap.to(v, { alpha: 0, duration: 0.08 }));
    }
    const flash = this.flash;
    flash.clear();
    const pts: number[] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const rad = (i % 2 ? 0.28 : 0.62) * size;
      pts.push(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    flash.poly(pts).fill({ color: 0xfff3c4 }).stroke({ color: 0x1b1410, width: Math.max(3, size * 0.012) });
    const p = this.grid.cellCenter(pos[0], pos[1]);
    flash.position.set((p.x + r.cx) / 2, (p.y + r.cy) / 2);
    flash.alpha = 1;
    flash.scale.set(0.2);
    flash.angle = 0;
    const ring = this.ring;
    ring.clear().circle(0, 0, size * 0.5).stroke({ color: 0xfff3c4, width: size * 0.05 });
    ring.position.copyFrom(flash.position);
    ring.scale.set(0.3);
    ring.alpha = 0.9;
    const tl = gsap.timeline();
    tl.to(flash.scale, { x: 1.15, y: 1.15, duration: T.blast.flash / 1000, ease: 'power3.out' }, 0)
      .to(flash, { alpha: 0, duration: 0.16 }, T.blast.flash / 1000)
      .to(flash, { angle: 12, duration: 0.25 }, 0)
      .to(ring.scale, { x: 1.6, y: 1.6, duration: 0.42, ease: 'power2.out' }, 0.02)
      .to(ring, { alpha: 0, duration: 0.42, ease: 'power1.in' }, 0.02);
    beat.fire(tl);
    if (!opts.reduced) beat.fire(this.camera.shake(T.blast.shake * Math.min(2, area.w / 2) * (opts.strength ?? 1), 0.5));
    const k = area.w;
    this.debris.emit({ texture: fx.chunk, count: 18 * k, x: r.cx, y: r.cy, spread: size * 0.3, speed: [300, 900], cone: Math.PI, gravity: 1600, life: [700, 1100], scale: [size / 900, size / 420], spin: [-10, 10], tint: [0x8a8f9c, 0x6f7f92, 0xc98a45, 0x6b4526] });
    this.sparks.emit({ texture: fx.spark, count: 24 * k, x: r.cx, y: r.cy, spread: size * 0.15, speed: [400, 1100], cone: Math.PI, gravity: 500, drag: 1.4, life: [260, 520], scale: [0.2, 0.36], scaleEnd: 0.2, tint: [0xffd54a, 0xffffff, 0xff9a3c] });
    this.smoke.emit({ texture: fx.soft, count: 5 * k, x: r.cx, y: r.cy, spread: size * 0.38, speed: [20, 90], cone: Math.PI, drag: 1.2, life: [1000, 1500], scale: [size / 150, size / 100], scaleEnd: 1.9, tint: [0xd9b27a, 0xc9a06a, 0xe8cfa0], alphaIn: 0.05, alphaOut: 0.55 });
    await beat.wait(T.blast.flash + 140);
  }

  /** sculpture : le géant émerge de la poussière sur le rectangle englobant, trois coups de ciseau */
  async carve(area: Area, giant: SymbolName, beat: Beat): Promise<void> {
    const r = this.rect(area);
    const fx = fxTextures();
    const size = Math.max(r.w, r.h);
    // cases du rectangle englobant qui n'étaient dans aucune zone : elles s'effritent dans le géant
    for (let c = area.col; c < area.col + area.w; c++) for (let rr = area.row; rr < area.row + area.h; rr++) {
      const v = this.grid.viewAt(c, rr);
      if (v && v.alpha > 0.05) beat.fire(gsap.to(v, { alpha: 0, duration: 0.14 }));
    }
    const g = this.grid.addGiant(area, giant);
    const s = g.sprite;
    s.alpha = 0;
    s.scale.set(0.82);
    const carve = gsap.timeline();
    carve.to(s, { alpha: 1, duration: 0.2 }, 0).to(s.scale, { x: 1.08, y: 1.08, duration: 0.28, ease: 'back.out(2)' }, 0).to(s.scale, { x: 1, y: 1, duration: 0.22, ease: 'sine.inOut' });
    const chips = [
      [-0.38, -0.3],
      [0.36, -0.12],
      [-0.1, 0.36],
    ];
    chips.forEach(([dx, dy], i) => {
      carve.add(() => {
        const px = r.cx + (dx as number) * r.w;
        const py = r.cy + (dy as number) * r.h;
        this.sparks.emit({ texture: fx.star, count: 1, x: px, y: py, speed: [0, 0], life: [140, 180], scale: [size / 260, size / 220], scaleEnd: 1.4, tint: 0xffffff, alphaIn: 0.01, alphaOut: 0.8 });
        this.debris.emit({ texture: fx.chunk, count: 6, x: px, y: py, speed: [120, 260], angle: Math.PI / 2, cone: 1.2, gravity: 1400, life: [400, 600], scale: [size / 1100, size / 700], spin: [-8, 8], tint: [0x8a8f9c, 0x6f7f92] });
      }, 0.16 + i * 0.1);
    });
    await beat.play(carve);
  }

  finish(): void {
    this.debris.finish();
    this.sparks.finish();
    this.smoke.finish();
    this.flash.alpha = 0;
    this.ring.alpha = 0;
    this.clearStakes();
    this.clearWire();
  }
}
