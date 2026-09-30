// Big wins (>= x10 the base bet on ONE spin, threshold included) and MAX WIN (wincap event only).
// The camera zooms INTO the decor (never replaces it), a light veil keeps the slot visible. One
// new idea per tier: BIG city lights on, SUPER holo-chip rain, MEGA drone swarm drawing the "C",
// EPIC train pass + sky beams, CYBER overload (cyan city + laser grid), MAX eyes fill the sky.
// The counter accelerates before each threshold and converges EXACTLY to the book value.
import { Container, Sprite, Text, Graphics, type Renderer } from 'pixi.js';
import gsap from 'gsap';
import type { Scene } from './scene';
import type { AssetStore } from './assets';
import { FixedAmount } from './texts';
import { FX } from './fx';
import type { TierId } from '../config/game-config';
import { T } from '../config/timings';

export interface CelebrateHooks {
  format(micros: number): string;
  sound(id: string, o?: { rate?: number }): void;
  loop(id: string): { stop(fade?: number): void } | null;
  duck(on: boolean): void;
  cat(m: 'tier1' | 'tierHigh' | 'maxWin' | 'winEnd'): void;
  tierName(id: TierId): string;
}

const ORDER: TierId[] = ['big', 'super', 'mega', 'epic', 'cyber', 'max'];

export class Celebration {
  readonly root = new Container({ label: 'celebration' });
  private plate = new Sprite();
  private titles = new Map<TierId, Text>();
  private amount = new FixedAmount(112);
  private swarm: Sprite[] = [];
  private skyGrid = new Graphics();
  private eyes = new Graphics();
  private rays = new Graphics();
  active = false;

  constructor(private readonly scene: Scene, private readonly assets: AssetStore, private readonly renderer: Renderer, private readonly hooks: CelebrateHooks) {
    this.plate.anchor.set(0.5);
    this.root.addChild(this.rays, this.plate, this.amount.root);
    this.rays.blendMode = 'add';
    this.root.visible = false;
    this.skyGrid.blendMode = 'add';
    this.eyes.blendMode = 'add';
    for (let i = 0; i < 14; i++) { const d = new Sprite(); d.anchor.set(0.5); d.visible = false; this.swarm.push(d); }
  }

  /** pre-create the tier titles for the current language (never at an impact) */
  buildTitles(): void {
    for (const t of this.titles.values()) t.destroy();
    this.titles.clear();
    for (const id of ORDER) {
      const txt = new Text({ text: this.hooks.tierName(id), style: { fontFamily: 'Oxanium, Chakra Petch, Noto Sans JP, Noto Sans KR, Noto Sans SC, Noto Sans Arabic, Noto Sans Devanagari, sans-serif', fontWeight: '800', fontSize: 96, fill: id === 'max' ? 0xfff1c8 : 0xffffff, stroke: { color: id === 'max' ? 0x6a4a10 : 0x0b2a78, width: 12, join: 'round' }, dropShadow: { color: 0x3feaff, blur: 16, distance: 0, alpha: 0.8, angle: 0 }, letterSpacing: 4, align: 'center' } });
      txt.anchor.set(0.5);
      txt.visible = false;
      this.root.addChildAt(txt, 2);
      this.titles.set(id, txt);
    }
  }

  private layoutOverlay(): { cx: number; cy: number; k: number } {
    const l = this.scene.layoutNow!;
    const p = this.scene.worldToScreen(l.design.focus);
    const k = Math.min(l.vw / 1920, (l.vh - l.hud.bottom) / 1000) * (l.cls === 'portrait' ? 1.75 : 1);
    this.root.position.set(p.x, p.y);
    this.plate.texture = this.assets.tex('ui.tier', this.renderer);
    this.plate.scale.set((760 * k) / (this.plate.texture.width || 1));
    this.plate.y = -90 * k;
    for (const t of this.titles.values()) { t.scale.set(k * 0.9); t.y = -96 * k; const maxW = 700 * k; if (t.width > maxW) t.scale.set((k * 0.9 * maxW) / t.width); }
    this.amount.root.scale.set(k);
    this.amount.root.y = 70 * k;
    return { cx: p.x, cy: p.y, k };
  }

  private showTitle(id: TierId): void {
    for (const [k, t] of this.titles) t.visible = k === id;
    const t = this.titles.get(id);
    if (t) gsap.fromTo(t.scale, { x: t.scale.x * 1.6, y: t.scale.y * 1.6 }, { x: t.scale.x, y: t.scale.y, duration: 0.35, ease: 'back.out(2.4)' });
    this.plate.texture = this.assets.tex(id === 'max' ? 'ui.tier.max' : 'ui.tier', this.renderer);
  }

  /** one idea per tier, in the decor/world */
  private tierIdea(id: TierId, tl: gsap.core.Timeline, at: number): void {
    const sc = this.scene, l = sc.layoutNow!, P = sc.particles;
    const focus = l.design.focus;
    const vis = { x: -l.offX / l.scale, y: -l.offY / l.scale, w: l.vw / l.scale, h: l.vh / l.scale };
    switch (id) {
      case 'big':
        tl.add(sc.decor.cityLightsOn(), at);
        tl.call(() => { this.hooks.sound('city_lights_on'); for (let i = 0; i < 4; i++) P.burst({ x: vis.x + vis.w * (0.2 + i * 0.2), y: vis.y + vis.h * 0.2, n: 18, frame: i % 2 ? FX.confettiC : FX.confettiW, speed: [120, 320], life: [1.2, 2], size: [14, 26], gravity: 380, spread: Math.PI, dir: -Math.PI / 2, add: false, shrink: false }); }, undefined, at);
        break;
      case 'super':
        tl.call(() => { this.hooks.sound('coin_rain'); }, undefined, at);
        for (let k = 0; k < 6; k++) tl.call(() => { for (let i = 0; i < 10; i++) P.burst({ x: vis.x + Math.random() * vis.w, y: vis.y - 40, n: 1, frame: i % 3 ? FX.coin : FX.coinEdge, speed: [40, 120], life: [1.6, 2.4], size: [34, 54], gravity: 520, spread: 0.6, dir: Math.PI / 2, add: false, shrink: false, spin: 8 }); }, undefined, at + k * 0.25);
        break;
      case 'mega': {
        tl.call(() => this.hooks.sound('drone_swarm'), undefined, at);
        const tex = this.assets.tex('decor.drone', this.renderer);
        const R = 250;
        this.swarm.forEach((d, i) => {
          const a = 0.75 + (i / (this.swarm.length - 1)) * (Math.PI * 2 - 1.5); // "C" arc
          d.texture = tex; d.scale.set(46 / (tex.height || 1));
          if (!d.parent) sc.world.addChild(d);
          const sx = vis.x + (i % 2 ? vis.w + 100 : -100), sy = vis.y + vis.h * (0.1 + (i / 14) * 0.6);
          tl.set(d, { visible: true, x: sx, y: sy, alpha: 1 }, at);
          tl.to(d, { x: focus.x + Math.cos(a) * R, y: focus.y - 60 + Math.sin(a) * R * 0.8, duration: 1.1, ease: 'power3.out' }, at + i * 0.04);
        });
        tl.to(this.swarm, { alpha: 0, duration: 0.5 }, at + 3.2).set(this.swarm, { visible: false }, at + 3.7);
        break;
      }
      case 'epic':
        tl.call(() => this.hooks.sound('train_pass'), undefined, at);
        tl.add(sc.decor.trainPass(true), at);
        tl.call(() => { const e = sc.eyesWorld(); for (let i = 0; i < 3; i++) sc.shapes.beam(e.x, e.y, vis.x + vis.w * (0.2 + i * 0.25), vis.y, 0.7); }, undefined, at + 0.3);
        break;
      case 'cyber': {
        tl.call(() => { sc.decor.setScan(2); this.hooks.sound('scan_mode_on'); }, undefined, at);
        const g = this.skyGrid;
        if (!g.parent) sc.world.addChildAt(g, sc.world.getChildIndex(sc.grid.root));
        tl.call(() => {
          g.clear();
          const hz = vis.y + vis.h * 0.42;
          for (let i = -12; i <= 12; i++) g.moveTo(focus.x + i * 40, hz).lineTo(focus.x + i * 260, vis.y - 50).stroke({ color: 0x3feaff, width: 2, alpha: 0.5 });
          for (let j = 0; j < 8; j++) { const y = hz - Math.pow(j / 8, 1.8) * (hz - vis.y); g.moveTo(vis.x, y).lineTo(vis.x + vis.w, y).stroke({ color: 0x3feaff, width: 1.5, alpha: 0.4 }); }
        }, undefined, at);
        tl.fromTo(g, { alpha: 0 }, { alpha: 1, duration: 0.4 }, at).to(g, { alpha: 0, duration: 0.6 }, at + 3.4);
        tl.call(() => { for (let i = 0; i < 3; i++) sc.shapes.ring(focus.x, focus.y, 40, 900, 1 + i * 0.2, 0x9af6ff, 10); }, undefined, at);
        break;
      }
      case 'max': {
        const g = this.eyes;
        if (!g.parent) sc.world.addChildAt(g, sc.world.getChildIndex(sc.grid.root));
        tl.call(() => {
          g.clear();
          for (const dx of [-1, 1]) {
            const x = focus.x + dx * vis.w * 0.2, y = vis.y + vis.h * 0.2;
            for (const [rx, ry, a] of [[380, 150, 0.08], [300, 110, 0.14], [220, 80, 0.3]] as const) g.ellipse(x, y, rx, ry).fill({ color: 0x3feaff, alpha: a });
            g.ellipse(x, y, 34, 70).fill({ color: 0xe8fdff, alpha: 0.9 });
          }
          this.hooks.sound('maxwin');
        }, undefined, at);
        tl.fromTo(g, { alpha: 0 }, { alpha: 1, duration: 0.8 }, at);
        break;
      }
    }
  }

  /**
   * Builds the counter timeline. Returns the timeline and a cleanup. The caller plays it with
   * ctx.play() (skip -> exact final state), then waits for the closing click.
   */
  build(winMicros: number, baseBetMicros: number, top: TierId, reduced: boolean, turbo: boolean): gsap.core.Timeline {
    const o = this.layoutOverlay();
    void o;
    this.active = true;
    this.root.visible = true;
    this.root.alpha = 1;
    const tl = gsap.timeline();
    const topIdx = ORDER.indexOf(top);
    const reached = ORDER.slice(0, topIdx + 1);
    const thresholds: Record<TierId, number> = { big: 10, super: 25, mega: 50, epic: 100, cyber: 500, max: winMicros / baseBetMicros };
    const k = turbo ? 0.6 : 1;
    // counter segments: 0 -> each threshold reached -> final value; accelerating into each threshold
    const state = { v: 0 };
    const digits = this.hooks.format(winMicros).length;
    const setText = () => { const s = this.hooks.format(Math.round(state.v)); this.amount.set(s.padStart(digits, ' ')); };
    let t = 0;
    tl.call(() => { this.hooks.duck(true); this.hooks.sound('bigwin_intro'); this.hooks.cat(top === 'big' ? 'tier1' : top === 'max' ? 'maxWin' : 'tierHigh'); }, undefined, 0);
    tl.add(this.scene.veilTo(0.34, 0.3), 0);
    if (!reduced) tl.add(this.scene.zoomTo({ x: this.scene.layoutNow!.design.focus.x, y: this.scene.layoutNow!.design.focus.y }, T.scene.celebrateZoom, T.scene.zoomIn), 0);
    tl.fromTo(this.root.scale, { x: 0.6, y: 0.6 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2)' }, 0);
    let counting: { stop(f?: number): void } | null = null;
    tl.call(() => { counting = this.hooks.loop('win_count_loop'); }, undefined, 0.2);
    reached.forEach((id, i) => {
      const segDur = (T.tiers[id] - (i > 0 ? T.tiers[reached[i - 1]!] : 0)) * k * (id === 'max' ? 0.6 : 1);
      const next = reached[i + 1];
      const target = !next ? winMicros : next === 'max' ? Math.round(winMicros * 0.55) : Math.min(winMicros, baseBetMicros * thresholds[next]);
      tl.call(() => { this.showTitle(id); this.hooks.sound(`tier_${id === 'max' ? 'cyber' : id}`); if (id !== 'big') this.scene.shake(0.12, 8); }, undefined, t);
      this.tierIdea(id, tl, t);
      tl.to(state, { v: target, duration: segDur, ease: 'power2.in', onUpdate: setText }, t);
      t += segDur;
    });
    // exact convergence
    tl.call(() => { state.v = winMicros; setText(); counting?.stop(0.1); this.hooks.sound('win_count_end'); }, undefined, t);
    tl.fromTo(this.amount.root.scale, { x: this.amount.root.scale.x * 1.18, y: this.amount.root.scale.y * 1.18 }, { x: this.amount.root.scale.x, y: this.amount.root.scale.y, duration: 0.3, ease: 'back.out(3)' }, t);
    tl.eventCallback('onInterrupt', () => counting?.stop(0.1));
    return tl;
  }

  /** closing (not skippable, short) */
  close(reduced: boolean): gsap.core.Timeline {
    const tl = gsap.timeline();
    tl.to(this.root, { alpha: 0, duration: 0.25 }, 0);
    tl.add(this.scene.veilTo(0, 0.3), 0);
    if (!reduced) tl.add(this.scene.resetZoom(T.scene.zoomOut), 0);
    tl.call(() => {
      this.root.visible = false; this.active = false;
      for (const t of this.titles.values()) t.visible = false;
      for (const d of this.swarm) d.visible = false;
      this.skyGrid.clear(); this.eyes.clear();
      this.hooks.duck(false);
      this.hooks.cat('winEnd');
    });
    return tl;
  }
}
