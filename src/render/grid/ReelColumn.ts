import { BlurFilter, Container } from 'pixi.js';
import { gsap } from 'gsap';
import type { SymbolName, TntKind } from '../../contract/schema';
import { SymbolView } from './SymbolView';
import { FILLER } from './symbolConfig';
import { rand } from '../fx/particles';

/**
 * Une colonne de rouleau en anneau (rows + 1 vues).
 * - Défilement : pos (en cases) croît ; une vue qui sort en bas repasse en haut (case -1) avec un symbole décoratif.
 * - Arrêt : les symboles du book sont affectés aux vues qui repassent en haut, dans l'ordre (bas d'abord),
 *   puis pos décélère jusqu'à l'alignement exact, avec un petit rebond d'arrivée. Aucun recul artificiel.
 * - Hors défilement : mode statique, cells[row] = vue (chutes, géants, réactions).
 */
export class ReelColumn {
  readonly view = new Container();
  readonly ring: SymbolView[] = [];
  /** vues visibles par ligne en mode statique */
  cells: SymbolView[] = [];
  pos = 0;
  speed = 0; // cases / s
  spinning = false;
  private lastInt = 0;
  private landing: Array<{ sym: SymbolName; tnt: TntKind | null }> = [];
  private landedViews: SymbolView[] = [];
  private blur = new BlurFilter({ strength: 0, quality: 2 });
  private stopTween: gsap.core.Tween | null = null;
  cell = 100;

  constructor(
    readonly index: number,
    readonly rows: number,
  ) {
    for (let k = 0; k <= rows; k++) {
      const v = new SymbolView();
      v.col = index;
      this.ring.push(v);
      this.view.addChild(v);
    }
    this.blur.strengthX = 0;
    this.view.filters = [];
  }

  setCell(cell: number): void {
    this.cell = cell;
    for (const v of this.ring) v.setCell(cell);
    this.layoutRing();
  }

  /** place les symboles immédiatement (mode statique) */
  setStatic(symbols: SymbolName[], tnt: Array<TntKind | null> = [], top?: SymbolName): void {
    this.spinning = false;
    this.pos = 0;
    this.lastInt = 0;
    // vue 0 : case cachée au-dessus ; vues 1..rows : lignes 0..rows-1
    const pad = this.ring[0] as SymbolView;
    pad.setSymbol(top ?? FILLER[(rand() * FILLER.length) | 0] as SymbolName);
    this.cells = [];
    for (let r = 0; r < this.rows; r++) {
      const v = this.ring[r + 1] as SymbolView;
      v.resetVisual();
      v.setSymbol(symbols[r] as SymbolName, tnt[r] ?? null);
      v.row = r;
      this.cells.push(v);
    }
    this.layoutRing();
  }

  /** remet l'anneau dans l'ordre des lignes après des chutes (les vues gardent leur identité) */
  adoptCells(cells: SymbolView[], hidden: SymbolView, layout = true): void {
    this.cells = cells;
    this.ring.length = 0;
    this.ring.push(hidden, ...cells);
    this.pos = 0;
    this.lastInt = 0;
    if (layout) this.layoutRing();
    else hidden.position.set(this.cell / 2, -0.5 * this.cell);
  }

  private rowOf(k: number): number {
    const n = this.rows + 1;
    return ((((k + this.pos) % n) + n) % n) - 1;
  }

  layoutRing(): void {
    for (let k = 0; k < this.ring.length; k++) {
      const v = this.ring[k] as SymbolView;
      const r = this.rowOf(k);
      v.position.set(this.cell / 2, (r + 0.5) * this.cell);
      v.row = Math.round(r);
    }
  }

  /** départ : léger recul tactile puis accélération */
  start(delay: number, maxSpeed: number): gsap.core.Timeline {
    this.stopTween?.kill();
    this.landing = [];
    this.landedViews = [];
    for (const v of this.ring) {
      v.resetVisual();
      v.pauseIdle(true);
    }
    const tl = gsap.timeline({ delay });
    const startPos = this.pos;
    tl.to(this, { pos: startPos - 0.12, duration: 0.09, ease: 'power2.out', onUpdate: () => this.layoutRing() });
    tl.add(() => {
      this.spinning = true;
      this.lastInt = Math.floor(this.pos);
      this.view.filters = [this.blur];
    });
    tl.to(this, { speed: maxSpeed, duration: 0.22, ease: 'power2.in' });
    return tl;
  }

  /** avance le défilement (appelé par la grille à chaque image) */
  tick(dtMs: number): void {
    if (!this.spinning || this.stopTween) return;
    this.advanceTo(this.pos + (this.speed * dtMs) / 1000);
    this.blur.strengthY = Math.min(10, this.speed * 0.35) * (this.cell / 120);
  }

  private advanceTo(p: number): void {
    const n = this.rows + 1;
    const target = Math.floor(p);
    while (this.lastInt < target) {
      this.lastInt += 1;
      // la vue qui passe en case -1 à l'entier lastInt : k ≡ -lastInt (mod n)
      const k = ((-this.lastInt % n) + n) % n;
      const v = this.ring[k] as SymbolView;
      const next = this.landing.shift();
      if (next) {
        v.setSymbol(next.sym, next.tnt);
        this.landedViews.push(v);
      } else v.setSymbol(FILLER[(rand() * FILLER.length) | 0] as SymbolName);
      v.pauseIdle(true);
    }
    this.pos = p;
    this.layoutRing();
  }

  /**
   * Arrêt sur les symboles du book (haut -> bas). duration : temps de décélération.
   * Renvoie la timeline d'arrêt (fin = colonne posée, rebond compris).
   */
  stop(symbols: SymbolName[], tnt: Array<TntKind | null>, duration: number, padTop: SymbolName): gsap.core.Timeline {
    const n0 = Math.floor(this.pos) + 1;
    // ordre d'affectation : bas d'abord, puis le symbole décoratif du dessus
    this.landing = [];
    for (let r = this.rows - 1; r >= 0; r--) this.landing.push({ sym: symbols[r] as SymbolName, tnt: tnt[r] ?? null });
    this.landing.push({ sym: padTop, tnt: null });
    const end = n0 + this.rows;
    const tl = gsap.timeline();
    const proxy = { p: this.pos };
    const overshoot = 0.14;
    // durée 0 : décélération continue depuis la vitesse de défilement (pas de cassure de vitesse)
    const dist = end + overshoot - this.pos;
    const dur = duration > 0 ? duration : Math.min(0.9, Math.max(0.18, (2 * dist) / Math.max(1, this.speed)));
    this.stopTween = gsap.to(proxy, {
      p: end + overshoot,
      duration: dur,
      ease: 'power2.out',
      onUpdate: () => {
        this.advanceTo(proxy.p);
        this.blur.strengthY = Math.max(0, this.blur.strengthY * 0.8);
      },
    });
    tl.add(this.stopTween);
    tl.add(() => {
      this.view.filters = [];
      this.spinning = false;
    });
    tl.to(proxy, { p: end, duration: 0.16, ease: 'back.out(2.5)', onUpdate: () => { this.pos = proxy.p; this.layoutRing(); } });
    tl.add(() => {
      this.stopTween = null;
      this.speed = 0;
      this.finishLanding();
    });
    return tl;
  }

  private finishLanding(): void {
    // cells[row] = vues posées, de haut en bas
    const byRow: SymbolView[] = [];
    let hidden: SymbolView | null = null;
    for (let k = 0; k < this.ring.length; k++) {
      const v = this.ring[k] as SymbolView;
      const r = Math.round(this.rowOf(k));
      if (r < 0) hidden = v;
      else byRow[r] = v;
    }
    this.cells = byRow;
    this.adoptCells(byRow, hidden as SymbolView);
  }

  get isStopping(): boolean {
    return this.stopTween !== null;
  }

  /** vitesse du défilement pendant l'anticipation */
  slowTo(speed: number, duration: number): gsap.core.Tween {
    return gsap.to(this, { speed, duration, ease: 'sine.out' });
  }
}
