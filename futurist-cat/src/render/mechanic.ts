// POINT LASER visuals: laser dot hops, chips (+1..+3: chevrons shape + number, never colour
// alone), circuit traces between chips, multiplier tokens. Every animation is built as ONE GSAP
// timeline (children added at build time) so a skip (progress 1) reaches the exact end state.
import { Container, Sprite, Graphics, type Renderer, type BitmapText } from 'pixi.js';
import gsap from 'gsap';
import type { AssetStore } from './assets';
import type { GridView } from './grid';
import type { Particles, Shapes } from './fx';
import { FX } from './fx';
import { numText } from './texts';
import { posKey, type Pos, type SymbolId } from '../contract/symbols';
import type { LaserDotE, ChipUpgradeE } from '../contract/events';
import { T, tscale } from '../config/timings';

interface ChipView { root: Container; sprite: Sprite; label: BitmapText; level: number; pos: Pos }

export interface MechHooks {
  eyesWorld(): { x: number; y: number };
  lookAt(p: { x: number; y: number } | null): void;
  sound(id: string, o?: { rate?: number; hop?: number; level?: number }): void;
  quiet(): boolean; // skipping: no cosmetic particles
}

export class Mechanic {
  readonly chipsLayer = new Container({ label: 'chips' });
  readonly circuit = new Graphics();
  readonly tokens = new Container({ label: 'mult-tokens' });
  readonly dotLayer = new Container({ label: 'dot' });
  private dot = new Sprite();
  private dotTrail = new Graphics();
  private chips = new Map<string, ChipView>();
  private chipPool: ChipView[] = [];
  private tokenPool: { root: Container; label: BitmapText }[] = [];
  private activeTokens = new Map<string, { root: Container; label: BitmapText }>();
  private circuitPulse = 0;

  constructor(private readonly grid: GridView, private readonly assets: AssetStore, private readonly renderer: Renderer, private readonly particles: Particles, private readonly shapes: Shapes, private readonly hooks: MechHooks) {
    this.dot.anchor.set(0.5); this.dot.visible = false; this.dot.blendMode = 'add';
    this.dotTrail.blendMode = 'add';
    this.circuit.blendMode = 'add';
    this.dotLayer.addChild(this.dotTrail, this.dot);
    for (let i = 0; i < 20; i++) {
      const root = new Container(); root.visible = false;
      const sprite = new Sprite(); sprite.anchor.set(0.5);
      const label = numText('+1', 40); label.position.set(0, 18);
      root.addChild(sprite, label);
      this.chipsLayer.addChild(root);
      this.chipPool.push({ root, sprite, label, level: 0, pos: [0, 0] });
    }
    for (let i = 0; i < 4; i++) {
      const root = new Container(); root.visible = false;
      const sp = new Sprite(); sp.anchor.set(0.5);
      const label = numText('×2', 54);
      root.addChild(sp, label);
      this.tokens.addChild(root);
      this.tokenPool.push({ root, label });
    }
  }

  layout(): void {
    const cell = this.grid.cell;
    this.dot.texture = this.assets.tex('mech.dot', this.renderer);
    this.dot.scale.set((cell * 0.42) / (this.dot.texture.width || 1));
    for (const c of this.chipPool) {
      c.sprite.scale.set((cell * 0.34) / (this.assets.tex('mech.chip1', this.renderer).width || 1));
      c.label.style.fontSize = cell * 0.17;
      c.label.position.set(0, cell * 0.075);
    }
    for (const t of this.tokenPool) {
      const sp = t.root.children[0] as Sprite;
      sp.texture = this.assets.tex('mech.mult', this.renderer);
      sp.scale.set((cell * 0.5) / (sp.texture.width || 1));
      t.label.style.fontSize = cell * 0.2;
    }
    // re-place visible chips/tokens
    for (const c of this.chips.values()) this.placeChip(c);
    for (const [k, t] of this.activeTokens) { const [cc, rr] = k.split(',').map(Number) as [number, number]; this.placeToken(t.root, [cc, rr]); }
    this.drawCircuit();
  }

  private chipAnchor(p: Pos): { x: number; y: number } {
    const c = this.grid.cellCenter(p[0], p[1]);
    const o = this.grid.cell * 0.31;
    return { x: c.x + o, y: c.y + o };
  }
  private placeChip(c: ChipView): void { const a = this.chipAnchor(c.pos); c.root.position.set(a.x, a.y); }
  private placeToken(root: Container, p: Pos): void { const c = this.grid.cellCenter(p[0], p[1]); root.position.set(c.x + this.grid.cell * 0.28, c.y - this.grid.cell * 0.28); }

  private chipTexture(level: number) { return this.assets.tex(`mech.chip${Math.min(3, Math.max(1, level))}`, this.renderer); }

  /** chip appears or levels up (bonus) */
  chipTimeline(p: Pos, level: number): gsap.core.Timeline {
    const tl = gsap.timeline();
    const k = posKey(p);
    let c = this.chips.get(k);
    tl.call(() => {
      if (!c) {
        c = this.chipPool.find((q) => !q.root.visible);
        if (!c) return;
        c.pos = p; c.root.visible = true; this.chips.set(k, c); this.placeChip(c);
      }
      c.level = level;
      c.sprite.texture = this.chipTexture(level);
      c.label.text = `+${level}`;
      this.drawCircuit();
      this.hooks.sound(level > 1 ? 'chip_level' : 'chip_place', { level });
    });
    tl.add(() => {
      const cv = this.chips.get(k); if (!cv) return;
      gsap.fromTo(cv.root.scale, { x: 1.7, y: 1.7 }, { x: 1, y: 1, duration: T.chips.place, ease: 'back.out(3)' });
      if (!this.hooks.quiet()) { const a = this.chipAnchor(p); this.particles.burst({ x: a.x, y: a.y, n: 6 + level * 3, frame: FX.spark, speed: [60, 180], life: [0.2, 0.4], size: [10, 20], tint: 0x9af6ff }); }
    });
    return tl;
  }

  /** instant chips (resume / overclock skip) */
  setChips(chips: Map<string, number>): void {
    for (const c of this.chips.values()) c.root.visible = false;
    this.chips.clear();
    for (const [k, lvl] of chips) {
      const c = this.chipPool.find((q) => !q.root.visible); if (!c) break;
      const [cc, rr] = k.split(',').map(Number) as [number, number];
      c.pos = [cc, rr]; c.level = lvl; c.root.visible = true; c.root.scale.set(1);
      c.sprite.texture = this.chipTexture(lvl); c.label.text = `+${lvl}`;
      this.chips.set(k, c); this.placeChip(c);
    }
    this.drawCircuit();
  }

  /** the grid lights up like a circuit: orthogonal traces between chips of the same row/column */
  private drawCircuit(): void {
    const g = this.circuit; g.clear();
    const list = [...this.chips.values()];
    if (list.length < 2) return;
    const seen = new Set<string>();
    for (const a of list) {
      // connect to the nearest chip (Manhattan)
      let best: ChipView | null = null, bd = 1e9;
      for (const b of list) { if (a === b) continue; const d = Math.abs(a.pos[0] - b.pos[0]) + Math.abs(a.pos[1] - b.pos[1]); if (d < bd) { bd = d; best = b; } }
      if (!best) continue;
      const key = [posKey(a.pos), posKey(best.pos)].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const pa = this.chipAnchor(a.pos), pb = this.chipAnchor(best.pos);
      const lvl = Math.max(a.level, best.level);
      for (const [w, al] of [[9, 0.1], [4, 0.25], [1.6, 0.8]] as const) g.moveTo(pa.x, pa.y).lineTo(pb.x, pa.y).lineTo(pb.x, pb.y).stroke({ color: 0x3feaff, width: w * (0.8 + lvl * 0.2), alpha: al });
    }
  }

  chipUpgradeTimeline(e: ChipUpgradeE, turbo: boolean): gsap.core.Timeline {
    const tl = gsap.timeline();
    const k = tscale(turbo);
    e.upgrades.forEach((u, i) => {
      const at = i * T.chips.upgradeStagger * k;
      const v = this.grid.cellView(u.pos[0], u.pos[1]);
      tl.add(() => { const c = this.chips.get(posKey(u.pos)); if (c) gsap.fromTo(c.root.scale, { x: 1.4, y: 1.4 }, { x: 1, y: 1, duration: 0.25 }); }, at);
      tl.add(v.upgradeTo(u.to as SymbolId, T.laser.upgrade * k), at);
      tl.call(() => this.hooks.sound('upgrade_tick', { rate: 1 + u.level * 0.08 }), undefined, at);
    });
    return tl;
  }

  /** one laser dot: eyes -> beam -> hops (upgrades, chips) -> multiplier stamp */
  dotTimeline(e: LaserDotE, turbo: boolean): gsap.core.Timeline {
    const k = tscale(turbo);
    const tl = gsap.timeline();
    const eyes = this.hooks.eyesWorld();
    const pts = e.path.map((p) => this.grid.cellCenter(p[0], p[1]));
    const first = pts[0]!;
    const dot = this.dot;
    // charge
    tl.call(() => { this.hooks.sound('eyes_charge'); this.hooks.lookAt(first); if (!this.hooks.quiet()) this.particles.burst({ x: eyes.x, y: eyes.y, n: 10, frame: FX.glint, speed: [10, 60], life: [0.2, 0.35], size: [30, 60], tint: 0x9af6ff }); }, undefined, 0);
    tl.add(this.shapes.ring(eyes.x, eyes.y, 4, 60, T.laser.eyeCharge * k, 0x9af6ff, 4), 0);
    const tBeam = T.laser.eyeCharge * k;
    tl.call(() => this.hooks.sound('laser_fire'), undefined, tBeam);
    tl.add(this.shapes.beam(eyes.x, eyes.y, first.x, first.y, T.laser.beam * 2 * k), tBeam);
    const tDot = tBeam + T.laser.beam * k;
    tl.set(dot, { visible: true, x: first.x, y: first.y, alpha: 1 }, tDot);
    tl.fromTo(dot.scale, { x: 0, y: 0 }, { x: dot.scale.x, y: dot.scale.y, duration: 0.12, ease: 'back.out(3)' }, tDot);
    let t = tDot;
    const hop = T.laser.hop * k;
    e.path.forEach((p, i) => {
      const c = pts[i]!;
      if (i > 0) {
        const a = pts[i - 1]!;
        const st = { u: 0 };
        const dist = Math.hypot(c.x - a.x, c.y - a.y);
        const h = Math.min(90, 30 + dist * 0.18);
        tl.to(st, { u: 1, duration: hop, ease: 'sine.inOut', onUpdate: () => {
          const x = a.x + (c.x - a.x) * st.u, y = a.y + (c.y - a.y) * st.u - Math.sin(Math.PI * st.u) * h;
          dot.position.set(x, y);
          this.hooks.lookAt({ x, y });
          this.dotTrail.clear().moveTo(a.x, a.y).lineTo(x, y).stroke({ color: 0x3feaff, width: 3, alpha: 0.35 * (1 - st.u) });
        } }, t);
        tl.call(() => this.hooks.sound('laser_hop', { hop: i }), undefined, t);
        t += hop;
      }
      // landing: ring + upgrade (+ chip)
      tl.add(this.shapes.ring(c.x, c.y, 10, this.grid.cell * 0.55, 0.3, 0x3feaff, 5), t);
      tl.call(() => { this.dotTrail.clear(); if (!this.hooks.quiet()) this.particles.burst({ x: c.x, y: c.y, n: 8, frame: FX.spark, speed: [80, 220], life: [0.15, 0.35], size: [8, 18], tint: 0xbff8ff }); }, undefined, t);
      const u = e.upgrades[i];
      if (u) {
        const v = this.grid.cellView(p[0], p[1]);
        if (u.from === u.to) { tl.add(v.maxed(), t); tl.call(() => this.hooks.sound('upgrade_max'), undefined, t); }
        else { tl.add(v.upgradeTo(u.to as SymbolId, T.laser.upgrade * k), t); tl.call(() => this.hooks.sound('upgrade_tick', { rate: 1 + i * 0.05 }), undefined, t + 0.05); }
      }
      const chip = e.chips?.find((q) => posKey(q.pos) === posKey(p));
      if (chip) tl.add(this.chipTimeline(p, chip.level), t + 0.08);
      t += Math.max(0.06, T.laser.upgrade * k * 0.45);
    });
    // multiplier on the landing cell
    if (e.mult) tl.add(this.multTimeline(e.mult.pos, e.mult.value, turbo), t);
    t += e.mult ? T.laser.multStamp * k : 0;
    tl.to(dot, { alpha: 0, duration: 0.2, onComplete: () => { dot.visible = false; } }, t + T.laser.hold * k);
    tl.call(() => this.hooks.lookAt(null), undefined, t + T.laser.hold * k + 0.2);
    return tl;
  }

  multTimeline(p: Pos, value: number, turbo: boolean): gsap.core.Timeline {
    const tl = gsap.timeline();
    const key = posKey(p);
    let tok = this.activeTokens.get(key);
    tl.call(() => {
      tok = tok ?? this.tokenPool.find((q) => !q.root.visible);
      if (!tok) return;
      this.activeTokens.set(key, tok);
      tok.root.visible = true;
      tok.label.text = `×${value}`;
      this.placeToken(tok.root, p);
      this.hooks.sound('mult_stamp');
    });
    tl.add(() => {
      const tk = this.activeTokens.get(key); if (!tk) return;
      gsap.fromTo(tk.root.scale, { x: 2.2, y: 2.2 }, { x: 1, y: 1, duration: T.laser.multStamp * tscale(turbo), ease: 'back.out(2.2)' });
      gsap.fromTo(tk.root, { alpha: 0 }, { alpha: 1, duration: 0.12 });
      if (!this.hooks.quiet()) { const c = this.grid.cellCenter(p[0], p[1]); this.shapes.ring(c.x + this.grid.cell * 0.28, c.y - this.grid.cell * 0.28, 20, 110, 0.35, 0xffffff, 6); }
    });
    return tl;
  }

  /** instant tokens (resume) */
  setTokens(mults: Map<string, number>): void {
    this.clearTokens();
    for (const [k, v] of mults) {
      const tok = this.tokenPool.find((q) => !q.root.visible); if (!tok) break;
      const [c, r] = k.split(',').map(Number) as [number, number];
      tok.root.visible = true; tok.root.alpha = 1; tok.root.scale.set(1); tok.label.text = `×${v}`;
      this.placeToken(tok.root, [c, r]);
      this.activeTokens.set(k, tok);
    }
  }
  tokenWorld(p: Pos): { x: number; y: number } { const c = this.grid.cellCenter(p[0], p[1]); return { x: c.x + this.grid.cell * 0.28, y: c.y - this.grid.cell * 0.28 }; }

  clearTokens(): void { for (const t of this.tokenPool) { gsap.killTweensOf([t.root, t.root.scale]); t.root.visible = false; } this.activeTokens.clear(); }

  /** end of bonus: chips go out one by one */
  chipsOffTimeline(turbo: boolean): gsap.core.Timeline {
    const tl = gsap.timeline();
    const list = [...this.chips.values()].sort((a, b) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1]);
    list.forEach((c, i) => {
      const at = i * T.bonus.endChipsOff * tscale(turbo);
      tl.to(c.root, { alpha: 0, duration: 0.18 }, at).to(c.root.scale, { x: 0.4, y: 0.4, duration: 0.18 }, at);
      tl.call(() => this.hooks.sound('chip_off'), undefined, at);
    });
    tl.call(() => { for (const c of list) { c.root.visible = false; c.root.alpha = 1; c.root.scale.set(1); } this.chips.clear(); this.drawCircuit(); });
    return tl;
  }

  clearAll(): void { this.clearTokens(); this.setChips(new Map()); this.dot.visible = false; this.dotTrail.clear(); }

  update(dt: number): void {
    if (this.chips.size > 1) { this.circuitPulse += dt; this.circuit.alpha = 0.75 + Math.sin(this.circuitPulse * 3) * 0.25; }
  }
}
