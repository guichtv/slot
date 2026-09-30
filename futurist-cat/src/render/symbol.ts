// One symbol in a cell. Visible pixels sized at ~90 % of the cell (alpha box from the manifest).
// Idle accents every 5-12 s (offset per cell), a win reaction per premium (lows stay sober),
// an upgrade with ONE visible representation (the old symbol is squashed and hidden before the
// new one appears), landing bounce, dimming for losing cells.
import { Container, Sprite, Graphics, type Renderer } from 'pixi.js';
import gsap from 'gsap';
import type { AssetStore } from './assets';
import type { SymbolId } from '../contract/symbols';
import type { Rand } from '../core/rng';

export const SYMBOL_FILL = 0.9;

export class SymbolView {
  readonly root = new Container({ label: 'sym' });
  private readonly body = new Container();
  private readonly glow = new Graphics();
  private readonly base = new Sprite();
  private readonly part = new Sprite();
  private readonly flash = new Graphics();
  id: SymbolId = 'L1';
  private idleIn = 5;
  private idleTl: gsap.core.Timeline | null = null;
  private reactTl: gsap.core.Timeline | null = null;
  dimmed = false;

  constructor(private readonly assets: AssetStore, private readonly renderer: Renderer, readonly cell: number, private readonly rand: Rand) {
    this.base.anchor.set(0.5);
    this.part.anchor.set(0.5);
    this.part.visible = false;
    this.glow.blendMode = 'add';
    this.glow.alpha = 0;
    this.flash.blendMode = 'add';
    this.flash.alpha = 0;
    this.body.addChild(this.glow, this.base, this.part, this.flash);
    this.root.addChild(this.body);
    this.drawGlow();
    this.idleIn = 5 + rand() * 7;
  }

  private drawGlow(): void {
    const r = this.cell * 0.46;
    this.glow.clear();
    for (const [k, a] of [[1, 0.1], [0.75, 0.16], [0.5, 0.22]] as const) this.glow.circle(0, 0, r * k).fill({ color: 0x3feaff, alpha: a });
    this.flash.clear().roundRect(-this.cell / 2, -this.cell / 2, this.cell, this.cell, this.cell * 0.18).fill({ color: 0xbff8ff, alpha: 1 });
  }

  set(id: SymbolId): void {
    this.id = id;
    const key = `sym.${id}`;
    const tex = this.assets.tex(key, this.renderer);
    this.base.texture = tex;
    const vb = this.assets.visibleBox(key);
    const k = (SYMBOL_FILL * this.cell) / (Math.max(tex.width, tex.height) * vb.size || 1);
    this.base.scale.set(k);
    this.base.anchor.set(vb.cx, vb.cy);
    const partId = id === 'H4' ? 'sym.H4.rotor' : id === 'H3' ? 'sym.H3.tail' : id === 'W' ? 'sym.W.ring' : id === 'S' ? 'sym.S.iris' : id === 'H1' ? 'sym.H1.lid' : null;
    if (partId && this.assets.has(partId)) {
      this.part.texture = this.assets.tex(partId);
      this.part.scale.set(k);
      this.part.visible = true;
      if (partId === 'sym.W.ring') this.body.setChildIndex(this.part, 1);
    } else this.part.visible = false;
    const special = id === 'W' || id === 'S';
    this.glow.tint = special ? 0xffffff : 0x3feaff;
    this.glow.alpha = special ? 0.55 : 0;
  }

  /** stretch while spinning (motion) */
  setSpinning(on: boolean): void {
    this.body.scale.set(1, on ? 1.12 : 1);
    this.body.alpha = on ? 0.9 : 1;
    if (on) { this.idleTl?.kill(); this.reactTl?.kill(); this.body.rotation = 0; this.body.position.set(0, 0); }
  }

  land(delay = 0): gsap.core.Timeline {
    const tl = gsap.timeline({ delay });
    tl.fromTo(this.body.scale, { x: 1.04, y: 0.9 }, { x: 1, y: 1, duration: 0.22, ease: 'back.out(3)' });
    if (this.id === 'W' || this.id === 'S') tl.fromTo(this.glow, { alpha: 1 }, { alpha: 0.55, duration: 0.5 }, 0);
    return tl;
  }

  dim(on: boolean, alpha = 0.32): void {
    this.dimmed = on;
    gsap.to(this.root, { alpha: on ? alpha : 1, duration: 0.16, overwrite: 'auto' });
  }

  /** win reaction: each premium its own, lows sober */
  react(): gsap.core.Timeline {
    this.reactTl?.kill();
    const b = this.body, tl = gsap.timeline();
    this.reactTl = tl;
    tl.to(this.glow, { alpha: this.id === 'W' || this.id === 'S' ? 1 : 0.8, duration: 0.12 }, 0);
    switch (this.id) {
      case 'H1': // can: hop, lid pops
        tl.to(b, { y: -this.cell * 0.12, duration: 0.14, ease: 'power2.out' }, 0).to(b, { y: 0, duration: 0.22, ease: 'bounce.out' })
          .fromTo(b.scale, { x: 1.12, y: 0.86 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' }, 0.14);
        if (this.part.visible) tl.to(this.part, { y: -this.cell * 0.2, rotation: 0.5, duration: 0.18, yoyo: true, repeat: 1 }, 0.05);
        break;
      case 'H2': // yarn: rolls and flares
        tl.to(b, { rotation: Math.PI * 0.5, duration: 0.45, ease: 'back.out(1.6)' }, 0).to(b, { rotation: 0, duration: 0.01 })
          .fromTo(this.glow.scale, { x: 1, y: 1 }, { x: 1.35, y: 1.35, duration: 0.3, yoyo: true, repeat: 1 }, 0);
        break;
      case 'H3': // fish: flips in an arc
        tl.to(b, { y: -this.cell * 0.16, duration: 0.18, ease: 'power2.out' }, 0).to(b.scale, { x: -1, duration: 0.18, ease: 'sine.inOut' }, 0)
          .to(b, { y: 0, duration: 0.2, ease: 'power2.in' }, 0.18).to(b.scale, { x: 1, duration: 0.18, ease: 'sine.inOut' }, 0.24);
        break;
      case 'H4': // mouse-drone: lifts off, zips, lands
        tl.to(b, { y: -this.cell * 0.18, duration: 0.18, ease: 'power2.out' }, 0).to(b, { x: this.cell * 0.08, duration: 0.08, yoyo: true, repeat: 3 }, 0.18)
          .to(b, { y: 0, duration: 0.2, ease: 'back.out(2)' }, 0.5);
        if (this.part.visible) tl.to(this.part, { rotation: '+=18', duration: 0.7, ease: 'none' }, 0);
        break;
      case 'W':
        tl.fromTo(b.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(3)' }, 0);
        if (this.part.visible) tl.to(this.part, { rotation: '+=3.14', duration: 0.7, ease: 'power2.out' }, 0);
        break;
      case 'S':
        tl.fromTo(b.scale, { x: 1.18, y: 1.18 }, { x: 1, y: 1, duration: 0.4, ease: 'elastic.out(1, 0.5)' }, 0);
        if (this.part.visible) tl.fromTo(this.part.scale, { x: this.part.scale.x * 1.8 }, { x: this.part.scale.x, duration: 0.4 }, 0);
        break;
      default: // lows: sober pulse
        tl.fromTo(b.scale, { x: 1.1, y: 1.1 }, { x: 1, y: 1, duration: 0.3, ease: 'power2.out' }, 0);
    }
    tl.to(this.glow, { alpha: this.id === 'W' || this.id === 'S' ? 0.55 : 0, duration: 0.3 }, '>-0.05');
    return tl;
  }

  /** overclock: old value -> cause (flash) -> new value. Only one representation visible. */
  upgradeTo(next: SymbolId, dur = 0.3): gsap.core.Timeline {
    const b = this.body, tl = gsap.timeline();
    this.idleTl?.kill();
    const half = dur * 0.45;
    tl.to(this.flash, { alpha: 0.9, duration: half * 0.6 }, 0)
      .to(b.scale, { x: 1.15, y: 0.08, duration: half, ease: 'power2.in' }, 0)
      .call(() => { this.set(next); }, undefined, half)
      .to(b.scale, { x: 1, y: 1, duration: dur - half, ease: 'back.out(2.6)' }, half)
      .to(this.flash, { alpha: 0, duration: dur - half }, half)
      .fromTo(this.glow, { alpha: 1 }, { alpha: this.id === 'W' || this.id === 'S' ? 0.55 : 0, duration: 0.4 }, half);
    return tl;
  }

  /** "maxed" feedback on H4 visited by the dot */
  maxed(): gsap.core.Timeline {
    return gsap.timeline().fromTo(this.flash, { alpha: 0.6 }, { alpha: 0, duration: 0.3 }).fromTo(this.body.scale, { x: 1.08, y: 1.08 }, { x: 1, y: 1, duration: 0.3 }, 0);
  }

  update(dt: number, allowIdle: boolean): void {
    if (!allowIdle || this.dimmed) return;
    this.idleIn -= dt;
    if (this.part.visible && (this.id === 'H4' || this.id === 'W')) this.part.rotation += dt * (this.id === 'H4' ? 14 : 0.6);
    if (this.idleIn > 0) return;
    this.idleIn = 5 + this.rand() * 7;
    if (this.idleTl?.isActive() || this.reactTl?.isActive()) return;
    const b = this.body;
    const tl = gsap.timeline();
    this.idleTl = tl;
    switch (this.id) {
      case 'L1': case 'L2': case 'L3': case 'L4':
        tl.to(b, { alpha: 0.7, duration: 0.05, yoyo: true, repeat: 3 }).to(b, { y: -3, duration: 0.6, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 0);
        break;
      case 'H1': tl.to(b, { rotation: 0.08, duration: 0.18, yoyo: true, repeat: 3, ease: 'sine.inOut' }); break;
      case 'H2': tl.to(this.glow, { alpha: 0.45, duration: 0.4, yoyo: true, repeat: 1 }); break;
      case 'H3': tl.to(b.scale, { x: 0.94, duration: 0.14, yoyo: true, repeat: 3, ease: 'sine.inOut' }); break;
      case 'H4': tl.to(b, { y: -6, duration: 0.5, yoyo: true, repeat: 1, ease: 'sine.inOut' }); break;
      case 'W': tl.to(this.glow, { alpha: 1, duration: 0.3, yoyo: true, repeat: 1 }); break;
      case 'S': tl.to(b.scale, { x: 1.06, y: 1.06, duration: 0.35, yoyo: true, repeat: 1, ease: 'sine.inOut' }); break;
    }
  }

  reset(): void {
    this.idleTl?.kill(); this.reactTl?.kill();
    gsap.killTweensOf([this.body, this.body.scale, this.glow, this.flash, this.root, this.part]);
    this.body.position.set(0, 0); this.body.rotation = 0; this.body.scale.set(1); this.body.alpha = 1;
    this.flash.alpha = 0; this.root.alpha = 1; this.dimmed = false;
    this.glow.scale.set(1);
    this.glow.alpha = this.id === 'W' || this.id === 'S' ? 0.55 : 0;
  }
}
