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
  /** tours de projecteurs (visibles la nuit) : les faisceaux partent de leurs lampes */
  private towers: Sprite[] = [];
  private birdsLayer = new Container();
  private flock: Array<{ s: Sprite; vx: number; vy: number; phase: number; rate: number }> = [];
  private birdFrames: Texture[] = [];
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
    this.skyDay = sprite('decor.skyRich') ?? sprite('decor.sky');
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
    for (let i = 0; i < 2; i++) {
      const tw = sprite('decor.floodlight');
      if (!tw) break;
      tw.anchor.set(0.5, 1);
      tw.alpha = 0;
      if (i === 1) tw.scale.x = -1;
      this.towers.push(tw);
      land.addChild(tw);
    }
    land.addChild(this.beams);
    if (this.mid) land.addChild(this.mid);
    land.addChild(this.waterfall);
    back.addChild(land);
    for (let i = 0; i < 3; i++) if (hasTex(`decor.birds.${i}`)) this.birdFrames.push(tex(`decor.birds.${i}`));
    back.addChild(this.birdsLayer);
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
      // Mount Buckmore : la sculpture se dresse sur le massif de gauche, visible à côté de la grille
      const leftFree = l.grid.x - l.cell * 0.7;
      for (const m of this.monument) {
        m.anchor.set(0.5, 1);
        const mh = portrait ? Math.min(l.stage.h * 0.16, vw * 0.3) : Math.min(leftFree * 0.62, vh * 0.3);
        m.scale.set(mh / (m.texture.height || 1));
        if (portrait) m.position.set(vw * 0.5, l.grid.y - l.cell * 1.05);
        else m.position.set(leftFree * 0.5, l.grid.y + l.grid.h * 0.62);
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
    // tours de projecteurs sur les côtés, pied au niveau du sol
    const towerH = portrait ? l.stage.h * 0.22 : vh * 0.42;
    this.towers.forEach((tw, i) => {
      const k = towerH / (tw.texture.height || 1);
      tw.scale.set(i === 1 ? -k : k, k);
      tw.position.set(i === 0 ? vw * (portrait ? 0.06 : 0.1) : vw * (portrait ? 0.94 : 0.93), portrait ? l.grid.y + l.grid.h * 0.1 : l.hud.y - vh * 0.02);
    });
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
    for (const tw of this.towers) tl.to(tw, { alpha: night, duration: duration * 0.8, ease: 'sine.inOut' }, 0);
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
    this.updateFlock(dt);
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
    // deux faisceaux par tour, depuis les lampes (haut de l'illustration)
    const len = this.l.vh * 1.1;
    const spread = 0.08;
    this.towers.forEach((tw, i) => {
      const h = tw.texture.height * tw.scale.y;
      const ox = tw.x;
      const oy = tw.y - h * 0.93;
      const base = i === 0 ? -1.2 : -1.94;
      for (let j = 0; j < 2; j++) {
        const a = base + (j - 0.5) * 0.3 + Math.sin(this.t / (2600 + j * 500) + i * 1.7 + j) * 0.28;
        g.moveTo(ox, oy)
          .lineTo(ox + Math.cos(a - spread) * len, oy + Math.sin(a - spread) * len)
          .lineTo(ox + Math.cos(a + spread) * len, oy + Math.sin(a + spread) * len)
          .closePath();
      }
    });
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
    const kind = Math.floor(rand() * 3);
    if (kind === 0 || !this.onRareEvent) this.launchFlock();
    else this.onRareEvent(kind);
  }

  /** vol d'oies en V qui traverse le ciel (3 poses d'ailes ImageGen en boucle) */
  launchFlock(): void {
    const l = this.l;
    if (!l || !this.birdFrames.length || this.flock.length) return;
    const n = 3 + Math.floor(rand() * 3);
    const dir = rand() < 0.5 ? 1 : -1;
    const size = Math.min(l.vw, l.vh) * 0.045;
    const y0 = l.vh * (0.08 + rand() * 0.14);
    for (let i = 0; i < n; i++) {
      const s = new Sprite(this.birdFrames[0]);
      s.anchor.set(0.5);
      const k = (size * (0.85 + rand() * 0.3)) / (s.texture.height || 1);
      s.scale.set(dir * k, k);
      const rank = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
      s.x = dir > 0 ? -size * 2 - Math.abs(rank) * size * 1.4 : l.vw + size * 2 + Math.abs(rank) * size * 1.4;
      s.y = y0 + rank * size * 0.9;
      s.tint = this.night > 0.5 ? 0x5a6a86 : 0xffffff;
      this.birdsLayer.addChild(s);
      this.flock.push({ s, vx: dir * l.vw * (0.07 + rand() * 0.01), vy: -l.vh * 0.004, phase: rand() * 3, rate: 7 + rand() * 2 });
    }
  }

  private updateFlock(dt: number): void {
    if (!this.flock.length || !this.l) return;
    const vw = this.l.vw;
    const keep: typeof this.flock = [];
    for (const b of this.flock) {
      b.s.x += (b.vx * dt) / 1000;
      b.s.y += (b.vy * dt) / 1000;
      b.phase += (b.rate * dt) / 1000;
      const f = Math.floor(b.phase) % 4; // 0 1 2 1
      b.s.texture = this.birdFrames[f === 3 ? 1 : f] ?? b.s.texture;
      const out = b.vx > 0 ? b.s.x > vw + 200 : b.s.x < -200;
      if (out) b.s.destroy();
      else keep.push(b);
    }
    this.flock = keep;
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
