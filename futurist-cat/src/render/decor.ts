// Living decor on several depths: sky, far and mid city (maglev track), train, drones, neon
// signs, glass lab + wet floor, rain in two depths, puddle glints. Bonus: the city switches to
// "scan mode" (wireframe layer + colour shift + sweep). Everything is placed in world units and
// covers the visible world rect (with margins for zoom and parallax).
import { Container, Sprite, Graphics, ColorMatrixFilter, type Renderer, Texture } from 'pixi.js';
import gsap from 'gsap';
import type { AssetStore } from './assets';
import type { Layout } from './layout';
import type { Rand } from '../core/rng';
import { T } from '../config/timings';

interface RainDrop { x: number; y: number; v: number; len: number; a: number }

export class Decor {
  readonly root = new Container({ label: 'decor' });
  readonly back = new Container({ label: 'decor-back' }); // behind the grid
  readonly front = new Container({ label: 'decor-front' }); // glass frame, floor (behind the cat, in front of the city)
  readonly fore = new Container({ label: 'decor-fore' }); // front rain (in front of everything, faint)
  private sky = new Sprite();
  private far = new Sprite();
  private mid = new Sprite();
  private scan = new Sprite();
  private near = new Sprite();
  private train = new Sprite();
  private drone = new Sprite();
  private signs: { on: Sprite; off: Sprite | null; glow: Graphics }[] = [];
  private rainBack = new Graphics();
  private rainFront = new Graphics();
  private sweep = new Graphics();
  private drops: RainDrop[] = [];
  private dropsFront: RainDrop[] = [];
  private cityFilter = new ColorMatrixFilter();
  private portrait = false;
  private vis = { x: 0, y: 0, w: 1920, h: 1080 };
  private trackY = 0;
  private nextTrain = 6;
  private nextDrone = 10;
  private t = 0;
  scanLevel = 0; // 0 normal, 1 scan (9 VIES), 2 double
  private reduced = false;
  private lowQuality = false;
  private parallax = { far: 0, mid: 0, near: 0 };
  private busyTrain = false;

  constructor(private readonly assets: AssetStore, private readonly renderer: Renderer, private readonly rand: Rand) {
    this.back.addChild(this.sky, this.far, this.mid, this.scan, this.train, this.drone, this.rainBack, this.sweep);
    this.front.addChild(this.near);
    this.fore.addChild(this.rainFront);
    this.root.addChild(this.back);
    this.scan.alpha = 0;
    this.scan.blendMode = 'add';
    this.sweep.blendMode = 'add';
    this.train.visible = false;
    this.drone.visible = false;
    this.far.filters = [this.cityFilter];
    this.mid.filters = [this.cityFilter];
  }

  setQuality(low: boolean, reduced: boolean): void {
    this.lowQuality = low; this.reduced = reduced;
    this.buildRain();
  }

  /** place every layer for this layout (visible world rect + cat feet anchoring for the floor) */
  layout(l: Layout): void {
    this.portrait = l.cls === 'portrait';
    const s = l.scale;
    const m = 0.14; // margin for zoom 1.12 + parallax
    this.vis = { x: -l.offX / s, y: -l.offY / s, w: l.vw / s, h: l.vh / s };
    const v = { x: this.vis.x - this.vis.w * m, y: this.vis.y - this.vis.h * m, w: this.vis.w * (1 + 2 * m), h: this.vis.h * (1 + 2 * m) };
    const r = this.renderer;
    const cover = (sp: Sprite, id: string, ax = 0.5, ay = 0.5, focus?: { x: number; y: number }) => {
      sp.texture = this.assets.tex(id, r);
      const tw = sp.texture.width || 1, th = sp.texture.height || 1;
      let k = Math.max(v.w / tw, v.h / th);
      if (focus) {
        // the image point (ax, ay) must land on `focus` and the image must still cover v
        k = Math.max(k, (focus.x - v.x) / (ax * tw), (v.x + v.w - focus.x) / ((1 - ax) * tw), (focus.y - v.y) / (ay * th), (v.y + v.h - focus.y) / ((1 - ay) * th));
        sp.scale.set(k);
        sp.position.set(focus.x - ax * tw * k, focus.y - ay * th * k);
      } else {
        sp.scale.set(k);
        sp.position.set(v.x + (v.w - tw * k) * ax, v.y + (v.h - th * k) * ay);
      }
    };
    const feet = { x: l.design.cat.x, y: l.design.cat.y };
    if (this.portrait) {
      cover(this.sky, 'decor.p.bg');
      this.far.visible = false; this.mid.visible = false;
      cover(this.scan, 'decor.scan', 0.5, 0.35);
      cover(this.near, 'decor.p.near', 0.74, 0.83, feet);
      this.trackY = this.sky.y + this.sky.height * 0.3;
    } else {
      cover(this.sky, 'decor.sky');
      this.far.visible = true; this.mid.visible = true;
      cover(this.far, 'decor.far', 0.5, 0.62);
      cover(this.mid, 'decor.mid', 0.5, 0.62);
      cover(this.scan, 'decor.scan', 0.5, 0.62);
      cover(this.near, 'decor.near', 0.8, 0.8, feet);
      this.trackY = this.mid.y + this.mid.height * 0.38;
    }
    this.train.texture = this.assets.tex('decor.train', r);
    this.train.scale.set((this.vis.h * 0.07) / (this.train.texture.height || 1));
    this.train.y = this.trackY - this.train.height * 0.78;
    this.drone.texture = this.assets.tex('decor.drone', r);
    this.drone.scale.set((this.vis.h * 0.06) / (this.drone.texture.height || 1));
    this.placeSigns(l);
    this.buildRain();
    this.sweep.clear();
  }

  private placeSigns(l: Layout): void {
    for (const s of this.signs) { s.on.destroy(); s.off?.destroy(); s.glow.destroy(); }
    this.signs = [];
    const spots = this.portrait
      ? [{ id: 'decor.sign1', x: 0.12, y: 0.12, h: 0.1 }, { id: 'decor.sign2', x: 0.86, y: 0.08, h: 0.06 }]
      : [{ id: 'decor.sign1', x: 0.1, y: 0.42, h: 0.2 }, { id: 'decor.sign2', x: 0.9, y: 0.2, h: 0.1 }];
    for (const sp of spots) {
      const on = new Sprite(this.assets.tex(sp.id, this.renderer));
      const offId = `${sp.id}_off`;
      const off = this.assets.has(offId) || __DEV_TOOLS__ ? new Sprite(this.assets.tex(offId, this.renderer)) : null;
      const k = (this.vis.h * sp.h) / (on.texture.height || 1);
      for (const s of [on, off]) if (s) { s.anchor.set(0.5); s.scale.set(k); s.position.set(this.vis.x + this.vis.w * sp.x, this.vis.y + this.vis.h * sp.y); }
      if (off) off.alpha = 0;
      const glow = new Graphics().circle(0, 0, on.width * 0.55).fill({ color: sp.id === 'decor.sign2' ? 0xffb547 : 0xff3fa4, alpha: 0.12 });
      glow.position.copyFrom(on.position);
      glow.blendMode = 'add';
      this.back.addChildAt(glow, this.back.getChildIndex(this.train));
      this.back.addChildAt(on, this.back.getChildIndex(this.train));
      if (off) this.back.addChildAt(off, this.back.getChildIndex(this.train));
      this.signs.push({ on, off, glow });
    }
    void l;
  }

  private buildRain(): void {
    const n = this.reduced ? 0 : this.lowQuality ? 60 : 150;
    const mk = (k: number): RainDrop[] => Array.from({ length: k }, () => ({ x: this.vis.x + this.rand() * this.vis.w, y: this.vis.y + this.rand() * this.vis.h, v: 900 + this.rand() * 700, len: 18 + this.rand() * 26, a: 0.08 + this.rand() * 0.14 }));
    this.drops = mk(n);
    this.dropsFront = mk(Math.round(n * 0.12));
  }

  /** bonus ambience: 0 base, 1 scan (9 VIES), 2 double (DOUBLE REGARD) */
  setScan(level: 0 | 1 | 2, instant = false): gsap.core.Timeline {
    this.scanLevel = level;
    const tl = gsap.timeline();
    if (level > 0) this.scan.texture = this.assets.tex(level === 2 ? 'decor.scan2' : 'decor.scan', this.renderer);
    const target = level > 0 ? 0.85 : 0;
    const d = instant ? 0 : 0.9;
    tl.to(this.scan, { alpha: target, duration: d, ease: 'sine.inOut' }, 0);
    const cf = this.cityFilter;
    const state = { k: level > 0 ? 0 : 1 };
    tl.to(state, { k: level > 0 ? 1 : 0, duration: d, ease: 'sine.inOut', onUpdate: () => {
      cf.reset();
      cf.saturate(-0.35 * state.k, false);
      cf.tint(level === 2 ? 0x9fe8ff : 0x7fdcff, true);
      cf.alpha = state.k * 0.55;
    } }, 0);
    if (level === 0) tl.call(() => { cf.reset(); cf.alpha = 0; });
    return tl;
  }

  /** transition to the bonus: the city slides in parallax while the cat runs in place */
  runParallax(duration: number): gsap.core.Timeline {
    const tl = gsap.timeline();
    const p = this.parallax;
    tl.to(p, { far: -40, mid: -110, near: -190, duration: duration * 0.55, ease: 'power2.in' })
      .to(p, { far: 0, mid: 0, near: 0, duration: duration * 0.45, ease: 'power2.out' });
    return tl;
  }

  /** big win ideas using the decor */
  cityLightsOn(): gsap.core.Timeline {
    const tl = gsap.timeline();
    for (const s of this.signs) tl.to(s.glow, { alpha: 3, duration: 0.25, yoyo: true, repeat: 3 }, 0);
    tl.fromTo(this.mid, { alpha: 1 }, { alpha: 1, duration: 0.01 }, 0);
    const st = { b: 1 };
    tl.to(st, { b: 1.6, duration: 0.5, yoyo: true, repeat: 1, ease: 'sine.inOut', onUpdate: () => { const f = this.cityFilter; f.reset(); f.brightness(st.b, false); f.alpha = 1; }, onComplete: () => { this.setScan(this.scanLevel as 0 | 1 | 2, true); } }, 0);
    return tl;
  }

  trainPass(fast = false): gsap.core.Timeline {
    const tl = gsap.timeline();
    if (this.busyTrain) return tl;
    this.busyTrain = true;
    const dir = this.rand() < 0.5 ? 1 : -1;
    const w = this.train.width;
    const x0 = dir > 0 ? this.vis.x - w - 50 : this.vis.x + this.vis.w + 50;
    const x1 = dir > 0 ? this.vis.x + this.vis.w + 50 : this.vis.x - w - 50;
    this.train.scale.x = Math.abs(this.train.scale.x) * dir;
    this.train.visible = true;
    this.train.x = dir > 0 ? x0 : x0 + w;
    tl.to(this.train, { x: dir > 0 ? x1 : x1 + w, duration: fast ? 2.2 : 5.5, ease: 'none', onComplete: () => { this.train.visible = false; this.busyTrain = false; } });
    return tl;
  }

  droneFly(): gsap.core.Timeline {
    const tl = gsap.timeline();
    const d = this.drone;
    d.visible = true;
    const y = this.vis.y + this.vis.h * (0.12 + this.rand() * 0.2);
    const left = this.rand() < 0.5;
    d.position.set(left ? this.vis.x - 80 : this.vis.x + this.vis.w + 80, y);
    tl.to(d, { x: left ? this.vis.x + this.vis.w + 80 : this.vis.x - 80, duration: 9 + this.rand() * 5, ease: 'none' })
      .to(d, { y: y + 40, duration: 2.2, ease: 'sine.inOut', yoyo: true, repeat: 3 }, 0)
      .call(() => { d.visible = false; });
    return tl;
  }

  update(dt: number): void {
    this.t += dt;
    // parallax offsets
    this.far.pivot.x = -this.parallax.far; this.mid.pivot.x = -this.parallax.mid; this.near.pivot.x = -this.parallax.near / Math.max(0.001, this.near.scale.x);
    if (this.reduced) return;
    // rain
    const draw = (g: Graphics, drops: RainDrop[], k: number) => {
      g.clear();
      for (const d of drops) {
        d.y += d.v * dt * k; d.x -= d.v * dt * 0.12 * k;
        if (d.y > this.vis.y + this.vis.h) { d.y = this.vis.y - 40; d.x = this.vis.x + this.rand() * this.vis.w * 1.1; }
        g.moveTo(d.x, d.y).lineTo(d.x + d.len * 0.12, d.y - d.len);
      }
      g.stroke({ color: 0xbfe6ff, width: 1.4 * k, alpha: 0.16 * k });
    };
    draw(this.rainBack, this.drops, 1);
    draw(this.rainFront, this.dropsFront, 1.6);
    // sign flicker (rare)
    for (const s of this.signs) {
      if (this.rand() < dt * 0.08 && s.off) {
        gsap.timeline().to(s.off, { alpha: 1, duration: 0.04 }).to(s.off, { alpha: 0, duration: 0.05, delay: 0.06 }).to(s.off, { alpha: 1, duration: 0.03, delay: 0.1 }).to(s.off, { alpha: 0, duration: 0.2 });
      }
      s.glow.alpha = 0.85 + Math.sin(this.t * 2.1 + s.on.x) * 0.15;
    }
    // scan sweep
    if (this.scanLevel > 0) {
      const y = this.vis.y + ((this.t * 0.18) % 1) * this.vis.h;
      this.sweep.clear().rect(this.vis.x, y, this.vis.w, 90).fill({ color: 0x3feaff, alpha: 0.06 }).rect(this.vis.x, y + 40, this.vis.w, 3).fill({ color: 0x9af6ff, alpha: 0.25 });
    } else if (this.sweep.alpha) this.sweep.clear();
    // ambient events
    this.nextTrain -= dt; this.nextDrone -= dt;
    if (this.nextTrain <= 0) { this.nextTrain = T.idle.trainMin + this.rand() * (T.idle.trainMax - T.idle.trainMin); this.trainPass(); }
    if (this.nextDrone <= 0) { this.nextDrone = T.idle.droneMin + this.rand() * (T.idle.droneMax - T.idle.droneMin); if (!this.drone.visible) this.droneFly(); }
  }

  get texEmpty(): Texture { return Texture.EMPTY; }
}
