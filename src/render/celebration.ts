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
    this.view.addChild(this.puffs.view, this.rocks.view, this.gold.view, this.sparks.view, this.flash);
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

  onStart(_maxWin: boolean): void {
    this.active = true;
    this.intensity = 1;
    this.scene.decor.setDim(1.8);
    this.buck.celebrate(0);
    this.detonate(0);
  }

  onTier(tier: number, _beat: Beat): void {
    if (!this.active) return;
    if (tier > 0) {
      this.detonate(tier);
      this.buck.celebrate(tier);
    }
    this.scene.logo.thump(1 + tier * 0.25);
  }

  coins(intensity: number): void {
    this.intensity = intensity;
  }

  onEnd(): void {
    this.active = false;
    this.intensity = 0;
    this.scene.decor.setDim(0);
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
