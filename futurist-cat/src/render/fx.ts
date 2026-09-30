// Effect primitives (allowed in code: halos, lines, particles). Pooled sprites, nothing created at
// an impact. Textures come from the FX sheet (ImageGen) when present.
import { Container, Sprite, Graphics, type Renderer, type Texture } from 'pixi.js';
import gsap from 'gsap';
import type { AssetStore } from './assets';
import type { Rand } from '../core/rng';

export const FX = { spark: 0, glow: 1, ring: 2, streak: 3, coin: 4, coinEdge: 5, rain: 6, bokeh: 7, arc: 8, pixel: 9, glint: 10, dust: 11, node: 12, laser: 13, confettiC: 14, confettiW: 15 } as const;

interface P { s: Sprite; vx: number; vy: number; g: number; life: number; age: number; spin: number; fade: number; scale0: number; scale1: number; active: boolean }

export class Particles {
  readonly root = new Container({ label: 'particles' });
  private pool: P[] = [];
  private frames: Texture[] = [];
  lowQuality = false;
  reduced = false;
  /** e.g. while a skip jumps a timeline: no burst */
  suppress: (() => boolean) | null = null;

  constructor(private readonly assets: AssetStore, private readonly renderer: Renderer, private readonly rand: Rand, size = 420) {
    this.frames = assets.sheet('fx.sheet', renderer);
    for (let i = 0; i < size; i++) {
      const s = new Sprite(this.frames[0]);
      s.anchor.set(0.5); s.visible = false; s.blendMode = 'add';
      this.root.addChild(s);
      this.pool.push({ s, vx: 0, vy: 0, g: 0, life: 1, age: 0, spin: 0, fade: 1, scale0: 1, scale1: 1, active: false });
    }
  }

  burst(o: { x: number; y: number; n: number; frame: number; speed: [number, number]; life: [number, number]; size: [number, number]; gravity?: number; tint?: number; spread?: number; dir?: number; add?: boolean; spin?: number; shrink?: boolean }): void {
    if (this.reduced || this.suppress?.()) return;
    const n = this.lowQuality ? Math.ceil(o.n / 2) : o.n;
    let made = 0;
    for (const p of this.pool) {
      if (p.active) continue;
      if (made++ >= n) break;
      const a = (o.dir ?? -Math.PI / 2) + (this.rand() - 0.5) * (o.spread ?? Math.PI * 2);
      const v = o.speed[0] + this.rand() * (o.speed[1] - o.speed[0]);
      p.s.texture = this.frames[o.frame] ?? this.frames[0]!;
      p.s.position.set(o.x, o.y);
      p.s.tint = o.tint ?? 0xffffff;
      p.s.blendMode = o.add === false ? 'normal' : 'add';
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.g = o.gravity ?? 0;
      p.life = o.life[0] + this.rand() * (o.life[1] - o.life[0]); p.age = 0;
      const sz = (o.size[0] + this.rand() * (o.size[1] - o.size[0])) / (p.s.texture.width || 1);
      p.scale0 = sz; p.scale1 = o.shrink === false ? sz : sz * 0.2;
      p.s.scale.set(sz); p.s.rotation = this.rand() * Math.PI * 2; p.spin = (this.rand() - 0.5) * (o.spin ?? 4);
      p.s.alpha = 1; p.s.visible = true; p.active = true;
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) { p.active = false; p.s.visible = false; continue; }
      p.vy += p.g * dt;
      p.s.x += p.vx * dt; p.s.y += p.vy * dt;
      p.s.rotation += p.spin * dt;
      p.s.scale.set(p.scale0 + (p.scale1 - p.scale0) * k);
      p.s.alpha = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2;
    }
  }

  clear(): void { for (const p of this.pool) { p.active = false; p.s.visible = false; } }
  get activeCount(): number { return this.pool.filter((p) => p.active).length; }
}

/** reusable one-shot shapes: shockwave ring, flash, beam */
export class Shapes {
  readonly root = new Container({ label: 'shapes' });
  private rings: Graphics[] = [];
  private beams: Graphics[] = [];
  constructor() {
    for (let i = 0; i < 8; i++) { const g = new Graphics(); g.visible = false; g.blendMode = 'add'; this.rings.push(g); this.root.addChild(g); }
    for (let i = 0; i < 4; i++) { const g = new Graphics(); g.visible = false; g.blendMode = 'add'; this.beams.push(g); this.root.addChild(g); }
  }
  ring(x: number, y: number, r0: number, r1: number, dur: number, color = 0x3feaff, width = 6): gsap.core.Timeline {
    const g = this.rings.find((q) => !q.visible) ?? this.rings[0]!;
    const st = { r: r0, a: 1 };
    g.visible = true;
    const draw = () => { g.clear().circle(x, y, st.r).stroke({ color, width: width * (0.4 + st.a * 0.6), alpha: st.a }); };
    return gsap.timeline().to(st, { r: r1, a: 0, duration: dur, ease: 'power2.out', onUpdate: draw, onComplete: () => { g.visible = false; g.clear(); } });
  }
  beam(x0: number, y0: number, x1: number, y1: number, dur: number, color = 0x3feaff): gsap.core.Timeline {
    const g = this.beams.find((q) => !q.visible) ?? this.beams[0]!;
    const st = { k: 0, a: 1 };
    g.visible = true;
    const draw = () => {
      const x = x0 + (x1 - x0) * st.k, y = y0 + (y1 - y0) * st.k;
      g.clear();
      for (const [w, a] of [[14, 0.12], [7, 0.3], [2.5, 1]] as const) g.moveTo(x0, y0).lineTo(x, y).stroke({ color: w < 3 ? 0xe8fdff : color, width: w, alpha: a * st.a, cap: 'round' });
    };
    return gsap.timeline().to(st, { k: 1, duration: dur * 0.5, ease: 'power3.out', onUpdate: draw }).to(st, { a: 0, duration: dur * 0.5, onUpdate: draw, onComplete: () => { g.visible = false; g.clear(); } });
  }
}
