import { Container, Sprite, Texture } from 'pixi.js';
import { gsap } from 'gsap';
import type { SymbolName, TntKind } from '../../contract/schema';
import { entry, hasTex, tex } from '../assets';
import { rand } from '../fx/particles';
import { SYMBOL_DEFS, TNT_DEFS } from './symbolConfig';
import LAYOUT from './partsLayout.json';

let NEXT_ID = 1;

interface LayoutPart {
  key: string;
  attach: [number, number];
  pivot: [number, number];
  z: number;
  rest: number;
  react: number;
}
interface SymLayout {
  body: string;
  parts?: LayoutPart[];
  props?: LayoutPart[];
}
const PARTS = LAYOUT as unknown as Record<string, SymLayout>;

interface LivePart {
  def: LayoutPart;
  sprite: Sprite;
  prop: boolean;
}

/**
 * Une instance de symbole (identifiant stable, conservé pendant les chutes).
 * Le dessin est assemblé en « coordonnées de planche » (pièces posées sur le corps au pixel près,
 * d'après src/render/grid/partsLayout.json), puis ajusté à 85-95 % de la case sur les pixels visibles.
 * - repos : boucle propre au dessin (5 à 12 s, déphasée), suspendue pendant le défilement ;
 * - atterrissage : écrasement / étirement ;
 * - connexion : réveil + réaction propre à chaque premium (pièce ou accessoire), lows sobres ;
 * - effondrement : tassement puis disparition (les débris sont émis par la grille).
 */
export class SymbolView extends Container {
  readonly iid = NEXT_ID++;
  sym: SymbolName = 'L1';
  tnt: TntKind | null = null;
  /** dessin assemblé (coordonnées de planche centrées), porte l'échelle d'ajustement */
  readonly art = new Container();
  readonly body = new Sprite(Texture.EMPTY);
  private parts: LivePart[] = [];
  private idleTl: gsap.core.Timeline | null = null;
  private reactTl: gsap.core.Timeline | null = null;
  private cell = 100;
  private fit = 1;
  col = 0;
  row = 0;
  idleEnabled = true;

  constructor() {
    super();
    this.addChild(this.art);
    this.art.addChild(this.body);
  }

  setCell(cell: number): void {
    this.cell = cell;
    this.applyFit();
  }

  get fitScale(): number {
    return this.fit;
  }

  setSymbol(sym: SymbolName, tnt: TntKind | null = null): void {
    this.stopReaction();
    this.sym = sym;
    this.tnt = sym === 'T' ? (tnt ?? 'stick') : null;
    for (const p of this.parts) p.sprite.destroy();
    this.parts = [];
    const bodyKey = sym === 'T' ? TNT_DEFS[this.tnt as TntKind].body : SYMBOL_DEFS[sym].body;
    this.body.texture = tex(bodyKey);
    const e = entry(bodyKey);
    const es = e ? ((e as unknown as { scale?: number }).scale ?? 1) : 1;
    const bf = e ? (e as unknown as { frame: { x: number; y: number; w: number; h: number } }).frame : { x: 0, y: 0, w: this.body.texture.width, h: this.body.texture.height };
    // union des dessins au repos (corps + pièces), en coordonnées de planche
    let minX = bf.x, minY = bf.y, maxX = bf.x + bf.w, maxY = bf.y + bf.h;
    const L = sym === 'T' ? undefined : PARTS[sym];
    const defs: Array<{ d: LayoutPart; prop: boolean }> = [
      ...(L?.parts ?? []).map((d) => ({ d, prop: false })),
      ...(L?.props ?? []).map((d) => ({ d, prop: true })),
    ];
    for (const { d, prop } of defs) {
      const pe = entry(d.key) as unknown as { frame: { x: number; y: number; w: number; h: number }; scale?: number } | undefined;
      if (!pe || !hasTex(d.key)) continue;
      const s = new Sprite(tex(d.key));
      const pf = pe.frame;
      s.anchor.set((d.pivot[0] - pf.x) / pf.w, (d.pivot[1] - pf.y) / pf.h);
      s.scale.set(1 / (pe.scale ?? 1));
      this.parts.push({ def: d, sprite: s, prop });
      if (!prop) {
        const x0 = d.attach[0] - (d.pivot[0] - pf.x);
        const y0 = d.attach[1] - (d.pivot[1] - pf.y);
        minX = Math.min(minX, x0);
        minY = Math.min(minY, y0);
        maxX = Math.max(maxX, x0 + pf.w);
        maxY = Math.max(maxY, y0 + pf.h);
      }
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.union = { w: maxX - minX, h: maxY - minY };
    this.body.anchor.set(0);
    this.body.scale.set(1 / es);
    this.body.position.set(bf.x - cx, bf.y - cy);
    this.art.removeChildren();
    for (const p of this.parts.filter((pp) => pp.def.z < 0)) this.art.addChild(p.sprite);
    this.art.addChild(this.body);
    for (const p of this.parts.filter((pp) => pp.def.z >= 0)) this.art.addChild(p.sprite);
    for (const p of this.parts) {
      p.sprite.position.set(p.def.attach[0] - cx, p.def.attach[1] - cy);
      p.sprite.angle = p.def.rest;
      p.sprite.visible = !p.prop;
    }
    this.applyFit();
    this.restartIdle();
  }

  private union = { w: 1, h: 1 };

  private fillRatio(): number {
    return this.sym === 'T' ? TNT_DEFS[this.tnt as TntKind].fill : SYMBOL_DEFS[this.sym].fill;
  }

  private applyFit(): void {
    this.fit = (this.cell * this.fillRatio()) / Math.max(this.union.w, this.union.h);
    this.art.scale.set(this.fit);
    this.art.position.set(0, 0);
    this.art.angle = 0;
  }

  get isPremium(): boolean {
    return this.sym === 'H1' || this.sym === 'H2' || this.sym === 'H3' || this.sym === 'H4';
  }

  private part(i = 0): LivePart | undefined {
    return this.parts.filter((p) => !p.prop)[i];
  }

  private prop(): LivePart | undefined {
    return this.parts.find((p) => p.prop);
  }

  /** boucle de repos propre au dessin, période 5-12 s, phase aléatoire (cosmétique) */
  restartIdle(): void {
    this.idleTl?.kill();
    this.idleTl = null;
    if (!this.idleEnabled) return;
    const period = 5 + rand() * 7;
    const tl = gsap.timeline({ repeat: -1, delay: rand() * period });
    const a = this.art;
    const f = this.fit;
    const p0 = this.part(0);
    const p1 = this.part(1);
    switch (this.sym) {
      case 'H1': // le raton plisse les yeux : hochement malin
        tl.to(a, { angle: -4, duration: 0.35, ease: 'sine.inOut' }).to(a, { angle: 2, duration: 0.3, ease: 'sine.inOut' }).to(a, { angle: 0, duration: 0.3 }).to({}, { duration: period - 0.95 });
        break;
      case 'H2': // l'élan souffle, ses bois oscillent en décalé
        tl.to(a.scale, { x: f * 1.03, y: f * 0.98, duration: 0.5, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 0);
        if (p0) tl.to(p0.sprite, { angle: p0.def.rest - 5, duration: 0.3, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 0.1);
        if (p1) tl.to(p1.sprite, { angle: p1.def.rest + 5, duration: 0.3, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 0.22);
        tl.to({}, { duration: period - 1.4 });
        break;
      case 'H3': // la loutre penche la tête
        tl.to(a, { angle: 5, duration: 0.5, ease: 'sine.inOut' }).to(a, { angle: 0, duration: 0.6, ease: 'sine.inOut' }).to({}, { duration: period - 1.1 });
        break;
      case 'H4': // le pic-vert tapote deux coups, huppe qui frémit
        tl.to(a, { x: -this.cell * 0.025, duration: 0.06, yoyo: true, repeat: 3 }, 0);
        if (p0) tl.to(p0.sprite, { angle: p0.def.rest - 10, duration: 0.08, yoyo: true, repeat: 3 }, 0);
        tl.to({}, { duration: period - 0.5 });
        break;
      case 'W': // le couvercle se soulève et retombe
        if (p0) tl.to(p0.sprite, { angle: p0.def.rest - 10, duration: 0.16, yoyo: true, repeat: 1, ease: 'power2.out' });
        tl.to({}, { duration: period * 0.7 });
        break;
      case 'S': // la poignée tressaille, le détonateur respire
        if (p0) tl.to(p0.sprite, { y: p0.sprite.y - 50, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.out' }, 0);
        tl.to(a.scale, { x: f * 1.04, y: f * 1.04, duration: 0.25, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 0);
        tl.to({}, { duration: period * 0.6 });
        break;
      case 'T': // la charge tremble (les étincelles sont émises par la grille)
        tl.to(a, { angle: 3, duration: 0.07, yoyo: true, repeat: 5 }).to({}, { duration: 2.4 });
        break;
      default: // lows sobres : léger souffle
        tl.to(a.scale, { x: f * 1.025, y: f * 1.025, duration: 0.9, ease: 'sine.inOut', yoyo: true, repeat: 1 }).to({}, { duration: period });
    }
    this.idleTl = tl;
  }

  pauseIdle(p: boolean): void {
    if (!this.idleTl) return;
    if (p) {
      this.idleTl.pause();
      this.resetPose();
    } else this.idleTl.resume();
  }

  private resetPose(): void {
    this.art.scale.set(this.fit);
    this.art.angle = 0;
    this.art.position.set(0, 0);
    for (const p of this.parts) {
      p.sprite.angle = p.def.rest;
      p.sprite.visible = !p.prop;
      p.sprite.alpha = 1;
    }
  }

  /** atterrissage : écrasement / étirement + petit rebond */
  land(strength = 1): gsap.core.Timeline {
    const f = this.fit;
    const tl = gsap.timeline();
    tl.fromTo(this.art.scale, { x: f * (1 + 0.1 * strength), y: f * (1 - 0.12 * strength) }, { x: f, y: f, duration: 0.24, ease: 'back.out(3)' });
    return tl;
  }

  private stopReaction(): void {
    this.reactTl?.progress(1).kill();
    this.reactTl = null;
  }

  /**
   * Réaction de connexion (A18 / A18.P1…P4) : réveil, réaction propre, libération d'énergie.
   * ~0,6 s pour un premium, ~0,35 s pour un low.
   */
  react(): gsap.core.Timeline {
    this.idleTl?.pause();
    this.resetPose();
    const a = this.art;
    const f = this.fit;
    const c = this.cell;
    const tl = gsap.timeline({ onComplete: () => this.resetPose() });
    tl.to(a.scale, { x: f * 1.14, y: f * 1.14, duration: 0.12, ease: 'power2.out' }, 0);
    const p0 = this.part(0);
    const p1 = this.part(1);
    const pr = this.prop();
    switch (this.sym) {
      case 'H1': // brandit la dynamite allumée à côté de sa joue et ricane
        if (pr) {
          const s = pr.sprite;
          const y0 = s.y;
          s.visible = true;
          tl.fromTo(s, { y: y0 + 260, angle: -35, alpha: 0 }, { y: y0, angle: pr.def.rest, alpha: 1, duration: 0.2, ease: 'back.out(2.4)' }, 0.05);
          tl.to(s, { angle: pr.def.rest - 12, duration: 0.08, yoyo: true, repeat: 3 }, 0.25);
          tl.to(s, { alpha: 0, y: y0 + 160, duration: 0.14 }, 0.62);
        }
        tl.to(a, { angle: -6, duration: 0.1, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 0.12);
        break;
      case 'H2': // l'élan secoue la tête, les bois battent
        tl.to(a, { angle: -8, duration: 0.1, ease: 'power2.in' }, 0.1).to(a, { angle: 6, duration: 0.12, ease: 'power2.out' }).to(a, { angle: 0, duration: 0.16, ease: 'back.out(2)' });
        if (p0) tl.to(p0.sprite, { angle: p0.def.rest + p0.def.react, duration: 0.09, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 0.12);
        if (p1) tl.to(p1.sprite, { angle: p1.def.rest + p1.def.react, duration: 0.09, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 0.16);
        break;
      case 'H3': // la loutre déroule son plan devant elle
        if (pr) {
          const s = pr.sprite;
          const sc = s.scale.x;
          s.visible = true;
          tl.fromTo(s.scale, { x: sc * 0.05, y: sc * 0.9 }, { x: sc * 0.8, y: sc * 0.8, duration: 0.24, ease: 'back.out(1.8)' }, 0.06);
          tl.fromTo(s, { alpha: 0 }, { alpha: 1, duration: 0.08 }, 0.06);
          tl.to(s, { alpha: 0, duration: 0.14 }, 0.62);
          tl.set(s.scale, { x: sc, y: sc }, 0.8);
        }
        tl.to(a, { y: -c * 0.05, duration: 0.14, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 0.1);
        break;
      case 'H4': // le pic-vert fore : rafale de coups de bec, huppe dressée
        tl.to(a, { x: -c * 0.05, duration: 0.045, yoyo: true, repeat: 9, ease: 'none' }, 0.1);
        if (p0) tl.to(p0.sprite, { angle: p0.def.rest + p0.def.react, duration: 0.12, ease: 'back.out(3)' }, 0.1).to(p0.sprite, { angle: p0.def.rest, duration: 0.2 }, 0.52);
        break;
      case 'W': // le couvercle saute, la dynamite apparaît
        if (p0) tl.to(p0.sprite, { angle: p0.def.rest + p0.def.react, duration: 0.18, ease: 'power2.out' }, 0.05).to(p0.sprite, { angle: p0.def.rest, duration: 0.3, ease: 'bounce.out' }, 0.3);
        tl.to(a, { angle: 4, duration: 0.06, yoyo: true, repeat: 5 }, 0.08);
        break;
      case 'S': // la poignée s'enfonce
        if (p0) {
          const s = p0.sprite;
          const y0 = s.y;
          // la poignée est arrachée vers le haut puis claquée dans le détonateur
          tl.to(s, { y: y0 - 320, duration: 0.16, ease: 'power2.out' }, 0.02).to(s, { y: y0 + 30, duration: 0.07, ease: 'power3.in' }).to(s, { y: y0, duration: 0.3, ease: 'elastic.out(1, 0.5)' });
        }
        break;
      default: // lows : pulsation sobre
        tl.to(a, { angle: 4, duration: 0.08, yoyo: true, repeat: 1 }, 0.1);
    }
    tl.to(a.scale, { x: f * 1.06, y: f * 1.06, duration: 0.2, ease: 'sine.inOut' }, 0.35);
    this.reactTl = tl;
    return tl;
  }

  /** effondrement (retrait d'un gagnant) : tassement puis disparition */
  crumble(): gsap.core.Timeline {
    this.idleTl?.pause();
    const f = this.fit;
    const tl = gsap.timeline();
    tl.to(this.art.scale, { x: f * 1.08, y: f * 0.9, duration: 0.07 })
      .to(this.art.scale, { x: f * 0.6, y: f * 0.5, duration: 0.2, ease: 'power2.in' })
      .to(this, { alpha: 0, duration: 0.16, ease: 'power1.in' }, '<0.04');
    return tl;
  }

  dim(on: boolean, amount = 0.5): gsap.core.Tween {
    return gsap.to(this.art, { alpha: on ? 1 - amount : 1, duration: 0.18 });
  }

  resetVisual(): void {
    this.stopReaction();
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.art);
    this.alpha = 1;
    this.art.alpha = 1;
    this.visible = true;
    this.resetPose();
  }

  /** dessin de ce symbole à une taille donnée (géants) : copie indépendante */
  static makeArt(sym: SymbolName, size: number): SymbolView {
    const v = new SymbolView();
    v.idleEnabled = false;
    v.setCell(size);
    v.setSymbol(sym);
    return v;
  }
}
