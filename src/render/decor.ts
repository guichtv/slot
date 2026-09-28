import { ColorMatrixFilter, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { hasTex, tex } from './assets';
import { rand } from './fx/particles';
import { clock } from '../core/clock';
import type { SceneLayout } from './layout';

/**
 * Décor vivant en calques aux rythmes déphasés : ciel, nuages, lointain + sculpture, intermédiaire (barrage, chute),
 * sol, premier plan. Événements rares : vol d'oiseaux, explosion lointaine sur la montagne, étincelles de chantier.
 * Ambiances : base (heure dorée), bonus (nuit, aurore, projecteurs), super (nuit dorée). Retour propre.
 * Intensité réduite pendant la lecture d'un gain.
 */
export type Ambience = 'base' | 'bonus' | 'super';

interface Layer {
  node: Container;
  depth: number;
}

function sprite(key: string): Sprite | null {
  if (!hasTex(key)) return null;
  const s = new Sprite(tex(key));
  s.label = key;
  return s;
}

export class Decor {
  readonly back = new Container();
  readonly ground = new Container();
  readonly front = new Container();
  private skyDay: Sprite | null;
  private skyNight: Sprite | null;
  private clouds: Array<{ s: Sprite; speed: number; y: number }> = [];
  private far: Sprite | null;
  /** second massif, plus lointain, à gauche (même illustration, en miroir et bleutée) */
  private farBack: Sprite | null;
  private monument: Sprite[] = [];
  private mid: Sprite | null;
  private groundS: Sprite | null;
  private fg: Sprite[] = [];
  private waterfall = new Graphics();
  private beams = new Graphics();
  private motes = new Graphics();
  private grade = new ColorMatrixFilter();
  private gradeFront = new ColorMatrixFilter();
  private layers: Layer[] = [];
  private l: SceneLayout | null = null;
  ambience: Ambience = 'base';
  private night = 0; // 0 jour -> 1 nuit
  private gold = 0; // teinte dorée (super)
  private dim = 0; // atténuation pendant un gain
  private t = 0;
  private nextEvent = 9000;
  monumentStage = 0;
  /** bornes relatives de la chute d'eau dans mid.png (réglées sur l'asset réel) */
  waterfallRect = { x: 0.1, y: 0.42, w: 0.12, h: 0.28 };

  constructor() {
    this.skyDay = sprite('decor.sky');
    this.skyNight = sprite('decor.nightSky');
    this.far = sprite('decor.far');
    this.farBack = sprite('decor.far');
    if (this.farBack) this.farBack.tint = 0xb9c6de;
    this.mid = sprite('decor.mid');
    this.groundS = sprite('decor.ground');
    for (let i = 0; i < 4; i++) {
      const m = sprite(`decor.monument.${i}`);
      if (m) this.monument.push(m);
    }
    const back = this.back;
    if (this.skyDay) back.addChild(this.skyDay);
    if (this.skyNight) {
      this.skyNight.alpha = 0;
      back.addChild(this.skyNight);
    }
    for (let i = 0; i < 5; i++) {
      const c = sprite(`decor.clouds.${i}`);
      if (c) {
        c.anchor.set(0.5);
        back.addChild(c);
        this.clouds.push({ s: c, speed: 4 + rand() * 7, y: 0.08 + rand() * 0.26 });
      }
    }
    const land = new Container();
    land.filters = [this.grade];
    if (this.farBack) land.addChild(this.farBack);
    if (this.far) land.addChild(this.far);
    for (const m of this.monument) {
      m.visible = false;
      land.addChild(m);
    }
    land.addChild(this.beams);
    if (this.mid) land.addChild(this.mid);
    land.addChild(this.waterfall);
    back.addChild(land);
    back.addChild(this.motes);
    if (this.groundS) this.ground.addChild(this.groundS);
    this.ground.filters = [this.grade];
    for (let i = 0; i < 3; i++) {
      const f = sprite(`decor.fg.${i}`);
      if (f) {
        this.fg.push(f);
        this.front.addChild(f);
      }
    }
    this.front.filters = [this.gradeFront];
    this.layers = [
      { node: land, depth: 0.35 },
      { node: this.ground, depth: 0.8 },
      { node: this.front, depth: 1.15 },
    ];
    this.setMonument(0, false);
    clock.onFrame((_t, dt) => this.update(dt));
  }

  private cover(s: Sprite, x: number, y: number, w: number, h: number, anchorY = 0): void {
    const tw = s.texture.width || 1;
    const th = s.texture.height || 1;
    const k = Math.max(w / tw, h / th);
    s.scale.set(k);
    s.anchor.set(0.5, anchorY);
    s.position.set(x + w / 2, y + (anchorY === 0 ? 0 : h));
  }

  layout(l: SceneLayout): void {
    this.l = l;
    const { vw, vh } = l;
    if (this.skyDay) this.cover(this.skyDay, 0, 0, vw, vh);
    if (this.skyNight) this.cover(this.skyNight, 0, 0, vw, vh);
    const portrait = l.cls === 'portrait' || l.cls === 'tablet' || l.cls === 'mini';
    // lointain : la face plate de la falaise (≈ 52 % de l'image) doit apparaître hors de la grille
    if (this.far) {
      const tw = this.far.texture.width || 1;
      const th = this.far.texture.height || 1;
      const k = portrait ? (vh * 0.5) / th : Math.max(vw / tw, (vh * 0.9) / th) * 0.98;
      this.far.scale.set(k);
      this.far.anchor.set(0.52, 1);
      const cliffX = portrait ? vw * 0.5 : Math.max(l.grid.x + l.grid.w + (vw - l.grid.x - l.grid.w) * 0.45, vw * 0.78);
      this.far.position.set(cliffX, portrait ? l.grid.y + l.cell * 0.4 : vh * 0.98);
      for (const m of this.monument) {
        m.anchor.set(0.5, 0.5);
        m.scale.set(k);
        // la sculpture se pose sur la face plate de la falaise (réglée sur l'asset réel)
        m.position.set(this.far.x, this.far.y - th * k * 0.62);
      }
      if (this.farBack) {
        const kb = k * (portrait ? 0.8 : 0.72);
        this.farBack.scale.set(-kb, kb);
        this.farBack.anchor.set(0.5, 1);
        this.farBack.position.set(portrait ? vw * 0.1 : vw * 0.14, this.far.y - th * k * 0.08);
      }
    }
    if (this.mid) {
      const tw = this.mid.texture.width || 1;
      const k = portrait ? (vw * 1.9) / tw : (vw * 1.04) / tw;
      this.mid.scale.set(k);
      this.mid.anchor.set(portrait ? 0.3 : 0.5, 1);
      this.mid.position.set(portrait ? vw * 0.35 : vw / 2, portrait ? l.grid.y + l.grid.h * 0.35 : vh * 1.0);
    }
    if (this.groundS) {
      const tw = this.groundS.texture.width || 1;
      const th = this.groundS.texture.height || 1;
      const k = Math.max((vw * 1.04) / tw, (vh * (portrait ? 0.3 : 0.34)) / th);
      this.groundS.scale.set(k);
      this.groundS.anchor.set(0.5, 1);
      this.groundS.position.set(vw / 2, vh + th * k * 0.04);
    }
    const [a, b, c] = this.fg;
    const fgH = Math.min(vh * 0.32, vw * 0.22);
    if (a) {
      a.anchor.set(0.2, 1);
      a.scale.set(fgH / (a.texture.height || 1));
      a.position.set(0, l.hud.y + (portrait ? 0 : l.hud.h * 0.35));
      a.visible = !portrait;
    }
    if (b) {
      b.anchor.set(0.75, 1);
      b.scale.set((fgH * 0.9) / (b.texture.height || 1));
      b.position.set(vw, l.hud.y + (portrait ? 0 : l.hud.h * 0.35));
      b.visible = !portrait;
    }
    if (c) c.visible = false;
    for (const cl of this.clouds) {
      const k = (portrait ? vh : vw) * 0.00032;
      cl.s.scale.set(k * 1.0);
      if (!cl.s.x) cl.s.x = rand() * vw;
      cl.s.y = vh * cl.y * (portrait ? 0.6 : 1);
    }
  }

  setMonument(stage: number, animate = true): gsap.core.Timeline {
    const tl = gsap.timeline();
    this.monumentStage = stage;
    this.monument.forEach((m, i) => {
      if (i === stage) {
        m.visible = true;
        if (animate) tl.fromTo(m, { alpha: 0 }, { alpha: 1, duration: 0.6 }, 0);
        else m.alpha = 1;
      } else if (m.visible) {
        if (animate) tl.to(m, { alpha: 0, duration: 0.6, onComplete: () => void (m.visible = false) }, 0);
        else m.visible = false;
      }
    });
    return tl;
  }

  /** transition d'ambiance (lumière, ciel, projecteurs) */
  setAmbience(a: Ambience, duration = 1.6): gsap.core.Timeline {
    this.ambience = a;
    const tl = gsap.timeline();
    const night = a === 'base' ? 0 : 1;
    const gold = a === 'super' ? 1 : 0;
    tl.to(this, { night, gold, duration, ease: 'sine.inOut', onUpdate: () => this.applyGrade() }, 0);
    if (this.skyNight) tl.to(this.skyNight, { alpha: night, duration, ease: 'sine.inOut' }, 0);
    return tl;
  }

  /** atténuation pendant la lecture d'un gain */
  setDim(v: number, duration = 0.35): gsap.core.Tween {
    return gsap.to(this, { dim: v, duration, onUpdate: () => this.applyGrade() });
  }

  private applyGrade(): void {
    const g = this.grade;
    g.reset();
    const n = this.night;
    const d = this.dim;
    // nuit : baisse de luminosité, teinte bleu-vert ; super : reflets dorés
    g.brightness(1 - n * 0.42 - d * 0.22, false);
    if (n > 0) g.tint(lerpColor(0xffffff, this.gold > 0.5 ? 0xb7a6ff : 0x7fb8d6, n), true);
    if (this.gold > 0) g.saturate(this.gold * 0.18, true);
    const f = this.gradeFront;
    f.reset();
    f.brightness(1 - n * 0.5 - d * 0.1, false);
    if (n > 0) f.tint(lerpColor(0xffffff, 0x6f8fb8, n), true);
  }

  private update(dt: number): void {
    this.t += dt;
    const l = this.l;
    if (!l) return;
    for (const c of this.clouds) {
      c.s.x += (c.speed * dt) / 1000;
      if (c.s.x - c.s.width / 2 > l.vw) c.s.x = -c.s.width / 2;
    }
    this.drawWaterfall();
    this.drawBeams();
    this.drawMotes();
    this.nextEvent -= dt;
    if (this.nextEvent <= 0) {
      this.nextEvent = 14000 + rand() * 16000;
      this.rareEvent();
    }
  }

  /** chute d'eau : traits blancs qui défilent sur la chute illustrée (primitive d'effet) */
  private drawWaterfall(): void {
    const g = this.waterfall;
    g.clear();
    if (!this.mid || !this.mid.visible) return;
    const m = this.mid;
    const w = m.texture.width * m.scale.x;
    const h = m.texture.height * m.scale.y;
    const x0 = m.x - w * m.anchor.x + this.waterfallRect.x * w;
    const y0 = m.y - h + this.waterfallRect.y * h;
    const ww = this.waterfallRect.w * w;
    const hh = this.waterfallRect.h * h;
    const alpha = 0.55 * (1 - this.dim * 0.6);
    for (let i = 0; i < 9; i++) {
      const lx = x0 + (i / 8) * ww;
      const phase = ((this.t * (0.22 + (i % 3) * 0.05)) / 1000 + i * 0.37) % 1;
      const y = y0 + phase * hh;
      g.moveTo(lx, y).lineTo(lx + ww * 0.01, Math.min(y0 + hh, y + hh * 0.16));
    }
    g.stroke({ width: Math.max(1.5, ww * 0.018), color: 0xffffff, alpha, cap: 'round' });
  }

  /** projecteurs de nuit qui balaient la montagne */
  private drawBeams(): void {
    const g = this.beams;
    g.clear();
    if (this.night < 0.05 || !this.l) return;
    const { vw } = this.l;
    const baseY = this.l.stage.y + this.l.stage.h * 0.72;
    const beams = [
      { x: vw * 0.72, a: -1.9 + Math.sin(this.t / 2600) * 0.35 },
      { x: vw * 0.9, a: -1.35 + Math.sin(this.t / 3100 + 1.4) * 0.3 },
      { x: vw * 0.12, a: -1.25 + Math.sin(this.t / 2900 + 2.2) * 0.3 },
    ];
    const len = this.l.vh * 0.9;
    for (const b of beams) {
      const spread = 0.09;
      g.moveTo(b.x, baseY)
        .lineTo(b.x + Math.cos(b.a - spread) * len, baseY + Math.sin(b.a - spread) * len)
        .lineTo(b.x + Math.cos(b.a + spread) * len, baseY + Math.sin(b.a + spread) * len)
        .closePath();
    }
    g.fill({ color: this.gold > 0.5 ? 0xffd27a : 0xffb35c, alpha: 0.13 * this.night });
  }

  /** poussières dorées dans la lumière rasante */
  private drawMotes(): void {
    const g = this.motes;
    g.clear();
    if (!this.l) return;
    const { vw, vh } = this.l;
    const a = 0.35 * (1 - this.night * 0.5) * (1 - this.dim);
    for (let i = 0; i < 26; i++) {
      const px = ((i * 137.5) % 100) / 100;
      const x = (px * vw + Math.sin(this.t / (2400 + i * 40) + i) * 30 + (this.t / 90) * (0.2 + (i % 5) * 0.05)) % vw;
      const y = vh * (0.25 + ((i * 53) % 55) / 100) + Math.cos(this.t / (2000 + i * 70) + i) * 18;
      g.circle(x, y, 1.2 + (i % 3) * 0.8);
    }
    g.fill({ color: this.night > 0.5 ? 0xbfe9ff : 0xffe2a0, alpha: a });
  }

  private rareEvent(): void {
    this.onRareEvent?.(Math.floor(rand() * 3));
  }

  /** branché par la scène (oiseaux, explosion lointaine, étincelles) */
  onRareEvent: ((kind: number) => void) | null = null;

  /** parallaxe légère pendant un zoom de caméra */
  parallax(zoom: number, fx: number, fy: number): void {
    for (const ly of this.layers) {
      const k = (zoom - 1) * (1 - ly.depth);
      ly.node.position.set(-(fx - (this.l?.vw ?? 0) / 2) * k * 0.2, -(fy - (this.l?.vh ?? 0) / 2) * k * 0.2);
    }
  }

  getTexture(key: string): Texture {
    return tex(key);
  }
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
