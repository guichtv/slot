import { BitmapText, Container, Sprite } from 'pixi.js';
import { gsap } from 'gsap';
import { hasTex, tex } from './assets';
import type { Beat } from '../core/beat';
import type { SceneLayout } from './layout';
import { fxTextures } from './fx/textures';
import { ParticleField } from './fx/particles';
import { clock } from '../core/clock';

/**
 * THE CORNERSTONE : bloc de granit gravé qui porte le multiplicateur du bonus (×1 à ×9 999).
 * Objet de mécanique illustré (ImageGen), valeur lisible dessus. Ancienne valeur → cause (éclats qui arrivent)
 * → nouvelle valeur regravée. Matière par palier (granit, marbre ×25, cuivre ×100, or ×250, or en fusion ×1000).
 */
export class Cornerstone {
  readonly view = new Container();
  private stone: Sprite | null = null;
  private text: BitmapText;
  private chips = new ParticleField(200, 'normal');
  value = 0;
  visibleState = false;
  private size = 160;

  constructor() {
    const key = hasTex('ui.cornerstone') ? 'ui.cornerstone' : hasTex('ui.multiplier') ? 'ui.multiplier' : null;
    if (key) {
      this.stone = new Sprite(tex(key));
      this.stone.anchor.set(0.5, 1);
      this.view.addChild(this.stone);
    }
    this.text = new BitmapText({ text: '', style: { fontFamily: 'WinDigits', fontSize: 64 } });
    this.text.anchor.set(0.5);
    this.view.addChild(this.text, this.chips.view);
    this.view.visible = false;
    clock.onFrame((_t, dt) => this.chips.update(dt));
  }

  layout(l: SceneLayout): void {
    this.size = Math.max(90, Math.min(220, l.cell * 1.25));
    const x = l.mascot.x;
    const y = l.mascot.y + this.size * 0.05;
    this.view.position.set(x, y);
    if (this.stone) {
      const k = this.size / Math.max(this.stone.texture.width, this.stone.texture.height);
      this.stone.scale.set(k);
    }
    this.text.position.set(0, -this.size * 0.42);
    this.text.style.fontSize = Math.round(this.size * 0.3);
  }

  private tint(v: number): number {
    if (v >= 1000) return 0xffd24a;
    if (v >= 250) return 0xffe08a;
    if (v >= 100) return 0xf0b080;
    if (v >= 25) return 0xf2f2f2;
    return 0xffffff;
  }

  /** montre / cache le bloc (bonus uniquement) */
  show(on: boolean): gsap.core.Timeline {
    const tl = gsap.timeline();
    if (on && !this.visibleState) {
      this.view.visible = true;
      tl.fromTo(this.view.scale, { x: 0.6, y: 0.6 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2)' }).fromTo(this.view, { alpha: 0 }, { alpha: 1, duration: 0.2 }, 0);
    } else if (!on && this.visibleState) {
      tl.to(this.view, { alpha: 0, duration: 0.3, onComplete: () => void (this.view.visible = false) });
    }
    this.visibleState = on;
    return tl;
  }

  setValue(v: number): void {
    this.value = v;
    this.text.text = v > 0 ? `×${v}` : '';
    this.text.tint = this.tint(v);
    if (this.stone) {
      // matière : granit, puis bloc veiné d'or (illustration dédiée) à partir de ×250
      const gold = v >= 250 && hasTex('ui.cornerstoneGold');
      const key = gold ? 'ui.cornerstoneGold' : hasTex('ui.cornerstone') ? 'ui.cornerstone' : null;
      if (key && this.stone.texture !== tex(key)) this.stone.texture = tex(key);
      this.stone.tint = gold ? (v >= 1000 ? 0xffe9a8 : 0xffffff) : this.tint(v);
    }
  }

  /** éclats qui volent de la zone sculptée jusqu'au bloc (la valeur change à leur arrivée) */
  async collect(from: { x: number; y: number }, count: number, beat: Beat): Promise<void> {
    const fx = fxTextures();
    // coordonnées du monde (scène) -> locales du bloc
    await new Promise<void>((resolve) => {
      this.chips.emit({
        texture: fx.chunk,
        count: Math.min(24, Math.max(4, count)),
        x: from.x - this.view.x,
        y: from.y - this.view.y,
        spread: 40,
        speed: [0, 0],
        life: [520, 760],
        scale: [0.18, 0.3],
        spin: [-6, 6],
        tint: [0x8a8f9c, 0x6f7f92, 0xc98a45],
        target: { x: 0, y: -this.size * 0.42, arc: 160 },
        delay: [0, 180],
        onArrive: () => resolve(),
      });
      if (beat.fast) {
        this.chips.finish();
        resolve();
      }
    });
  }

  /** regravure : ancienne valeur → nouvelle, coup sec */
  async engrave(v: number, beat: Beat): Promise<void> {
    const tl = gsap.timeline();
    tl.to(this.text.scale, { x: 1.35, y: 1.35, duration: 0.1, ease: 'power2.out' })
      .add(() => this.setValue(v))
      .to(this.text.scale, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' })
      .to(this.view, { y: this.view.y + 4, duration: 0.05, yoyo: true, repeat: 1 }, 0);
    await beat.play(tl);
  }
}
