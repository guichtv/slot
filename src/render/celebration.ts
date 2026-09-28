import { Container, Graphics, type Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { hasTex, tex } from './assets';
import { fxTextures } from './fx/textures';
import { ParticleField, rand } from './fx/particles';
import { clock } from '../core/clock';
import type { Beat } from '../core/beat';
import type { Scene } from './scene';
import type { Buck } from './mascot/Buck';
import type { CelebrationHooks } from '../ui/overlays';

/**
 * Célébration des gros gains, côté scène (piste retenue « Le filon crève ») :
 * le décor s'assombrit, la grille et Buck restent éclairés ; deux geysers de pépites d'or jaillissent
 * des coins bas de la grille, et chaque nouveau palier est une nouvelle détonation
 * (éclair, poussière, éclats de roche, secousse, logo qui sursaute, Buck qui monte d'un cran).
 * Les illustrations (pépites, roches, poussière) sont des sprites ImageGen ; seuls l'éclair et les étincelles sont des primitives.
 */
export class CelebrationFx implements CelebrationHooks {
  readonly view = new Container();
  /** calque derrière la grille (dans le monde) : champignon de poussière, éboulement, sommet qui saute */
  readonly back = new Container();
  private backDust = new ParticleField(90, 'normal');
  private backRocks = new ParticleField(260, 'normal');
  private logs = new ParticleField(40, 'normal');
  private glow = new Graphics();
  /** MAX WIN attendu et palier final (fixés par l'appelant avant la célébration) */
  max = false;
  top = 0;
  /** étape du monument avant la célébration (rétablie après un palier ×1000 ou un MAX WIN) */
  private monumentBefore = 0;
  private gold = new ParticleField(520, 'normal');
  private rocks = new ParticleField(220, 'normal');
  private puffs = new ParticleField(70, 'normal');
  private sparks = new ParticleField(260, 'add');
  private flash = new Graphics();
  private intensity = 0;
  private acc = 0;
  private active = false;
  reducedMotion = false;

  constructor(
    private scene: Scene,
    private buck: Buck,
  ) {
    this.view.label = 'celebration';
    this.flash.alpha = 0;
    this.view.addChild(this.puffs.view, this.rocks.view, this.logs.view, this.gold.view, this.sparks.view, this.flash);
    this.glow.blendMode = 'add';
    this.glow.alpha = 0;
    this.back.addChild(this.backDust.view, this.backRocks.view, this.glow);
    clock.onFrame((_t, dt) => this.tick(dt));
  }

  private list(prefix: string, n: number, fallback: Texture[]): Texture[] {
    const out: Texture[] = [];
    for (let i = 0; i < n; i++) if (hasTex(`${prefix}${i}`)) out.push(tex(`${prefix}${i}`));
    return out.length ? out : fallback;
  }

  private get nuggets(): Texture[] {
    return this.list('fx.debris.n', 3, fxTextures().chunk);
  }

  private get stones(): Texture[] {
    return this.list('fx.debris.g', 6, fxTextures().chunk);
  }

  private get dust(): Texture[] {
    return this.list('fx.dust.', 4, [fxTextures().soft]);
  }

  private get wood(): Texture[] {
    return this.list('fx.debris.w', 3, fxTextures().chunk);
  }

  onStart(maxWin: boolean): void {
    this.max = maxWin;
    this.monumentBefore = this.scene.decor.monumentStage;
    this.active = true;
    this.intensity = 1;
    this.scene.decor.setDim(1.8);
    this.buck.celebrate(0);
    this.detonate(0);
  }

  onTier(tier: number, _beat: Beat): void {
    if (!this.active) return;
    if (tier > 0) this.detonate(tier);
    // une scène propre à chaque palier (CONCEPT § 8), le MAX WIN seulement sur le palier final d'un wincap
    if (this.max && tier === this.top) this.sceneMax();
    else this.sceneTier(tier);
    this.scene.logo.thump(1 + tier * 0.25);
  }

  private sceneTier(tier: number): void {
    const l = this.scene.layout;
    const cell = l.cell;
    const fx = fxTextures();
    switch (tier) {
      case 0: {
        // FIRE IN THE HOLE! : l'allumette de Buck s'embrase
        const p = this.buck.matchPoint();
        this.sparks.emit({ texture: fx.spark, count: 40, x: p.x, y: p.y, spread: 4, speed: [cell * 1.5, cell * 4.5], cone: Math.PI, gravity: cell * 5, drag: 1.5, life: [300, 700], scale: [0.2, 0.45], scaleEnd: 0.2, tint: [0xffe08a, 0xffb347, 0xff7a2a] });
        this.sparks.emit({ texture: fx.star, count: 1, x: p.x, y: p.y, speed: [0, 0], life: [260, 320], scale: [cell / 90, cell / 80], scaleEnd: 1.6, tint: 0xfff3c4, alphaIn: 0.01, alphaOut: 0.8 });
        break;
      }
      case 1: {
        // KA-BOOM! : champignon de poussière derrière la grille, les oies s'envolent
        const cx = l.grid.x + l.grid.w / 2;
        const top = l.grid.y;
        for (let i = 0; i < 3; i++) {
          this.backDust.emit({ texture: this.dust, count: 6, x: cx, y: top + cell * (0.4 - i * 0.9), spread: cell * (0.8 + i * 0.3), speed: [cell * 0.4, cell * 1.4], angle: -Math.PI / 2, cone: 0.9, drag: 0.9, life: [1600, 2400], scale: [(cell * 1.4) / 460, (cell * 2.2) / 460], scaleEnd: 1.8, delay: [i * 120, i * 120 + 80], alphaIn: 0.06, alphaOut: 0.5 });
        }
        this.scene.decor.launchFlock();
        break;
      }
      case 2: {
        // DAM GOOD! : les vannes cèdent, la chute double, des rondins dévalent au premier plan
        this.scene.decor.floodFall();
        const y = l.hud.y - cell * 0.35;
        this.logs.emit({ texture: this.wood, count: 7, x: -cell, y, spread: cell * 0.3, speed: [cell * 4, cell * 6.5], angle: 0, cone: 0.12, gravity: 0, life: [2200, 3000], scale: [(cell * 0.5) / 240, (cell * 0.8) / 240], spin: [4, 8], delay: [0, 900], alphaIn: 0.02, alphaOut: 0.1 });
        break;
      }
      case 3: {
        // ROCKSLIDE! : des rochers dévalent derrière le cadre ; Buck se couvre puis prend la pose
        // sur toute la largeur : visibles de part et d'autre du cadre, derrière la grille au centre
        this.backRocks.emit({ texture: this.stones, count: 80, x: l.vw / 2, y: -cell, spread: l.vw * 0.5, speed: [cell * 1, cell * 3], angle: Math.PI / 2, cone: 0.5, gravity: cell * 14, life: [1400, 2200], scale: [(cell * 0.45) / 230, (cell * 0.95) / 230], spin: [-6, 6], delay: [0, 1400], alphaOut: 0.1 });
        if (!this.reducedMotion) this.scene.camera.shake(10, 1.6);
        this.buck.react('duck');
        gsap.delayedCall(0.8, () => this.buck.celebrate(3));
        return;
      }
      case 4: {
        // MOUNT BUCKMORE! : la dent en or du monument flashe, Buck salue sa propre effigie
        this.scene.decor.setMonument(3, true);
        gsap.delayedCall(0.5, () => this.flashMonument(1));
        break;
      }
    }
    if (tier > 0) this.buck.celebrate(tier);
  }

  /** halo additif sur la sculpture (primitive d'effet) + étoile au coin de la dent */
  private flashMonument(strength: number): void {
    const m = this.scene.decor.monumentPoint();
    if (!m) return;
    const g = this.glow;
    g.clear().circle(m.x, m.y, m.h * 0.55).fill({ color: 0xffd46a, alpha: 0.55 }).circle(m.x, m.y, m.h * 0.3).fill({ color: 0xfff3c4, alpha: 0.6 });
    gsap.fromTo(g, { alpha: 0 }, { alpha: strength, duration: 0.18, yoyo: true, repeat: 3, ease: 'sine.inOut', onComplete: () => void (g.alpha = 0) });
    const fx = fxTextures();
    this.sparks.emit({ texture: fx.star, count: 1, x: m.x + m.h * 0.08, y: m.y + m.h * 0.12, speed: [0, 0], life: [420, 520], scale: [m.h / 260, m.h / 220], scaleEnd: 1.5, tint: 0xffffff, alphaIn: 0.01, alphaOut: 0.7 });
  }

  /** BLOWN SKY-HIGH! : le sommet explose en feu d'artifice de granit et révèle un visage doré qui cligne de l'œil */
  private sceneMax(): void {
    const l = this.scene.layout;
    const cell = l.cell;
    const fx = fxTextures();
    const s = this.scene.decor.summitPoint() ?? { x: l.vw * 0.8, y: l.vh * 0.1 };
    this.flash.clear().rect(0, 0, l.vw, l.vh).fill({ color: 0xfff1c9 });
    gsap.fromTo(this.flash, { alpha: this.reducedMotion ? 0.2 : 0.85 }, { alpha: 0, duration: 0.8, ease: 'power2.out' });
    if (!this.reducedMotion) this.scene.camera.shake(22, 1.2);
    this.backRocks.emit({ texture: this.stones, count: 90, x: s.x, y: s.y, spread: cell * 0.6, speed: [cell * 5, cell * 12], angle: -Math.PI / 2, cone: Math.PI * 0.8, gravity: cell * 9, drag: 0.3, life: [1600, 2600], scale: [(cell * 0.25) / 230, (cell * 0.6) / 230], spin: [-9, 9], alphaOut: 0.15 });
    this.sparks.emit({ texture: fx.spark, count: 120, x: s.x, y: s.y, spread: cell * 0.5, speed: [cell * 6, cell * 14], cone: Math.PI, gravity: cell * 5, drag: 1, life: [500, 1100], scale: [0.3, 0.7], scaleEnd: 0.2, tint: [0xffe08a, 0xffb347, 0xffffff] });
    this.backDust.emit({ texture: this.dust, count: 14, x: s.x, y: s.y, spread: cell * 1.2, speed: [cell * 0.5, cell * 1.8], cone: Math.PI, drag: 0.8, life: [2000, 3000], scale: [(cell * 1.6) / 460, (cell * 2.6) / 460], scaleEnd: 1.7, alphaIn: 0.05, alphaOut: 0.5 });
    // la sculpture apparaît dorée dans la poussière, puis cligne de l'œil
    gsap.delayedCall(0.6, () => {
      this.scene.decor.setMonumentGold(true);
      this.flashMonument(1);
    });
    gsap.delayedCall(1.6, () => {
      const m = this.scene.decor.monumentPoint();
      if (m) this.sparks.emit({ texture: fx.star, count: 1, x: m.x + m.h * 0.12, y: m.y - m.h * 0.08, speed: [0, 0], life: [300, 360], scale: [m.h / 200, m.h / 170], scaleEnd: 0.2, tint: 0xffffff, alphaIn: 0.01, alphaOut: 0.9 });
    });
    this.buck.celebrate(5);
  }

  coins(intensity: number): void {
    this.intensity = intensity;
  }

  onEnd(): void {
    this.active = false;
    this.intensity = 0;
    this.scene.decor.setDim(0);
    // le visage doré du MAX WIN reste le temps de la célébration, puis la sculpture revient au granit
    const before = this.monumentBefore;
    if (this.max || this.scene.decor.monumentStage !== before) {
      gsap.delayedCall(1.2, () => {
        this.scene.decor.setMonumentGold(false);
        this.scene.decor.setMonument(before);
      });
    }
  }

  /** détonation de palier au cœur de la grille */
  private detonate(tier: number): void {
    const l = this.scene.layout;
    const cx = l.grid.x + l.grid.w / 2;
    const cy = l.grid.y + l.grid.h / 2;
    const cell = l.cell;
    const k = 1 + tier * 0.35;
    const fx = fxTextures();
    this.flash.clear().rect(0, 0, l.vw, l.vh).fill({ color: 0xfff1c9 });
    gsap.fromTo(this.flash, { alpha: this.reducedMotion ? 0.15 : 0.55 }, { alpha: 0, duration: 0.45, ease: 'power2.out' });
    if (!this.reducedMotion) this.scene.camera.shake(6 + tier * 4, 0.35 + tier * 0.06);
    this.puffs.emit({
      texture: this.dust,
      count: Math.round(8 * k),
      x: cx,
      y: cy,
      spread: cell * 0.6,
      speed: [cell * 1.2, cell * 3.2],
      cone: Math.PI,
      drag: 1.6,
      life: [900, 1500],
      scale: [(cell * 0.9) / 460, (cell * 1.5) / 460],
      scaleEnd: 1.7,
      spin: [-0.6, 0.6],
      alphaIn: 0.05,
      alphaOut: 0.6,
    });
    this.rocks.emit({
      texture: this.stones,
      count: Math.round(18 * k),
      x: cx,
      y: cy,
      spread: cell * 0.5,
      speed: [cell * 4, cell * 8],
      cone: Math.PI,
      gravity: cell * 12,
      drag: 0.4,
      life: [900, 1500],
      scale: [(cell * 0.18) / 230, (cell * 0.42) / 230],
      spin: [-9, 9],
      alphaOut: 0.2,
    });
    this.sparks.emit({
      texture: fx.spark,
      count: Math.round(50 * k),
      x: cx,
      y: cy,
      spread: cell * 0.3,
      speed: [cell * 5, cell * 11],
      cone: Math.PI,
      gravity: cell * 6,
      drag: 1.2,
      life: [300, 700],
      scale: [0.25, 0.6],
      scaleEnd: 0.2,
      tint: [0xffe08a, 0xffb347, 0xffffff],
    });
    this.gold.emit({
      texture: this.nuggets,
      count: Math.round(26 * k),
      x: cx,
      y: cy,
      spread: cell * 0.4,
      speed: [cell * 5, cell * 9],
      angle: -Math.PI / 2,
      cone: Math.PI * 0.55,
      gravity: cell * 14,
      life: [1300, 1900],
      scale: [(cell * 0.2) / 200, (cell * 0.36) / 200],
      spin: [-7, 7],
      alphaOut: 0.15,
    });
  }

  private tick(dt: number): void {
    this.backDust.update(dt);
    this.backRocks.update(dt);
    this.logs.update(dt);
    this.gold.update(dt);
    this.rocks.update(dt);
    this.puffs.update(dt);
    this.sparks.update(dt);
    if (!this.active) return;
    // geysers continus depuis les deux coins bas de la grille, débit selon l'intensité (palier)
    const perSec = this.reducedMotion ? 8 : 16 + this.intensity * 14;
    this.acc += (perSec * dt) / 1000;
    const l = this.scene.layout;
    const cell = l.cell;
    while (this.acc >= 1) {
      this.acc -= 1;
      const left = rand() < 0.5;
      const x = left ? l.grid.x + cell * 0.2 : l.grid.x + l.grid.w - cell * 0.2;
      const y = l.grid.y + l.grid.h + cell * 0.1;
      this.gold.emit({
        texture: this.nuggets,
        count: 1,
        x,
        y,
        spread: cell * 0.15,
        speed: [cell * 7, cell * 11.5],
        angle: left ? -Math.PI / 2 + 0.28 : -Math.PI / 2 - 0.28,
        cone: 0.22,
        gravity: cell * 13,
        life: [1500, 2100],
        scale: [(cell * 0.2) / 200, (cell * 0.34) / 200],
        spin: [-8, 8],
        alphaIn: 0.02,
        alphaOut: 0.12,
      });
      // pluie d'or par le haut aux paliers élevés
      if (this.intensity >= 3 && rand() < 0.5) {
        this.gold.emit({
          texture: this.nuggets,
          count: 1,
          x: rand() * l.vw,
          y: -cell * 0.3,
          speed: [cell * 1, cell * 3],
          angle: Math.PI / 2,
          cone: 0.3,
          gravity: cell * 9,
          life: [1400, 2000],
          scale: [(cell * 0.16) / 200, (cell * 0.3) / 200],
          spin: [-6, 6],
          alphaOut: 0.1,
        });
      }
    }
  }
}
