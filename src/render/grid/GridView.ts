import { BitmapText, Container, Graphics, NineSliceSprite, Sprite } from 'pixi.js';
import { gsap } from 'gsap';
import { COLS, ROWS, type Area, type SymbolName, type TntKind, type WinLine } from '../../contract/schema';
import { hasTex, tex } from '../assets';
import { ParticleField, rand } from '../fx/particles';
import { fxTextures } from '../fx/textures';
import { clock } from '../../core/clock';
import type { Beat } from '../../core/beat';
import type { SceneLayout } from '../layout';
import { ReelColumn } from './ReelColumn';
import { SymbolView } from './SymbolView';
import { FILLER, SYMBOL_DEFS, TNT_DEFS } from './symbolConfig';
import { T } from '../../config/timings';

/**
 * Grille 5 × 5 : cadre 9-slice, cases, rouleaux masqués, géants, effets internes, montants de connexion.
 * La grille ne recrée jamais ses symboles : elle déplace les survivants et recycle les vues retirées.
 */
export interface GiantView {
  area: Area;
  symbol: SymbolName;
  /** dessin complet du symbole (pièces comprises) à l'échelle de la zone */
  sprite: SymbolView;
}

export class GridView {
  readonly view = new Container();
  readonly behind = new Container();
  private frame: NineSliceSprite | null = null;
  private cellBgs: Sprite[] = [];
  private bgFallback = new Graphics();
  readonly reels = new Container();
  readonly giantsLayer = new Container();
  readonly fxIn = new Container();
  private mask = new Graphics();
  readonly columns: ReelColumn[] = [];
  giants: GiantView[] = [];
  readonly sparks = new ParticleField(260, 'add');
  readonly debris = new ParticleField(500, 'normal');
  readonly dust = new ParticleField(260, 'normal');
  private halos = new Graphics();
  private labelPool: BitmapText[] = [];
  cell = 100;
  x = 0;
  y = 0;
  private fuses: Array<{ col: number; row: number }> = [];
  /** appelé à l'arrêt de chaque colonne (sons, Scatters, anticipation) */
  onColumnStop: ((col: number) => void) | null = null;

  constructor() {
    this.view.label = 'grid';
    this.view.addChild(this.behind);
    this.behind.addChild(this.bgFallback);
    if (hasTex('ui.cell')) {
      for (let i = 0; i < COLS * ROWS; i++) {
        const s = new Sprite(tex('ui.cell'));
        s.anchor.set(0.5);
        this.cellBgs.push(s);
        this.behind.addChild(s);
      }
    }
    this.view.addChild(this.halos);
    for (let c = 0; c < COLS; c++) {
      const col = new ReelColumn(c, ROWS);
      this.columns.push(col);
      this.reels.addChild(col.view);
    }
    this.view.addChild(this.reels, this.giantsLayer, this.fxIn);
    this.fxIn.addChild(this.dust.view, this.debris.view, this.sparks.view);
    this.view.addChild(this.mask);
    this.reels.mask = this.mask;
    this.giantsLayer.mask = this.mask;
    if (hasTex('ui.frame')) {
      this.frame = new NineSliceSprite({ texture: tex('ui.frame'), leftWidth: 150, rightWidth: 150, topHeight: 150, bottomHeight: 150 });
      this.view.addChild(this.frame);
    }
    for (let i = 0; i < 8; i++) {
      const t = new BitmapText({ text: '', style: { fontFamily: 'WinDigits', fontSize: 48 } });
      t.anchor.set(0.5);
      t.visible = false;
      this.labelPool.push(t);
      this.view.addChild(t);
    }
    clock.onFrame((_t, dt) => this.tick(dt));
  }

  layout(l: SceneLayout): void {
    this.cell = l.cell;
    this.x = l.grid.x;
    this.y = l.grid.y;
    this.view.position.set(l.grid.x, l.grid.y);
    const w = l.cell * COLS;
    const h = l.cell * ROWS;
    this.mask.clear().rect(0, 0, w, h).fill({ color: 0xffffff });
    this.bgFallback.clear().roundRect(-4, -4, w + 8, h + 8, 12).fill({ color: 0x1c1a1f });
    for (let c = 0; c < COLS; c++) {
      const col = this.columns[c] as ReelColumn;
      col.view.position.set(c * l.cell, 0);
      col.setCell(l.cell);
    }
    this.cellBgs.forEach((s, i) => {
      const c = i % COLS;
      const r = Math.floor(i / COLS);
      s.position.set((c + 0.5) * l.cell, (r + 0.5) * l.cell);
      const k = (l.cell * 0.97) / (s.texture.width || 1);
      s.scale.set(k);
    });
    if (this.frame) {
      // l'ouverture du cadre (texture 1024) correspond à la grille ; épaisseur relative à la case
      const pad = l.cell * 0.36;
      const tw = this.frame.texture.width || 1024;
      const scale = (w + pad * 2) / tw;
      this.frame.scale.set(scale);
      this.frame.width = (w + pad * 2) / scale;
      this.frame.height = (h + pad * 2) / scale;
      this.frame.position.set(-pad, -pad);
    }
    for (const g of this.giants) this.placeGiant(g);
    for (const t of this.labelPool) t.style.fontSize = Math.round(l.cell * 0.36);
  }

  cellCenter(c: number, r: number): { x: number; y: number } {
    return { x: this.x + (c + 0.5) * this.cell, y: this.y + (r + 0.5) * this.cell };
  }

  localCenter(c: number, r: number): { x: number; y: number } {
    return { x: (c + 0.5) * this.cell, y: (r + 0.5) * this.cell };
  }

  viewAt(c: number, r: number): SymbolView {
    return (this.columns[c] as ReelColumn).cells[r] as SymbolView;
  }

  setBoard(board: SymbolName[][], tnt: Map<string, TntKind>): void {
    this.clearGiants();
    for (let c = 0; c < COLS; c++) {
      const col = board[c] as SymbolName[];
      const kinds = col.map((_, r) => tnt.get(`${c},${r}`) ?? null);
      (this.columns[c] as ReelColumn).setStatic(col, kinds);
    }
    this.refreshFuses();
  }

  /** départ du spin : colonnes décalées, recul tactile, accélération */
  spin(speedCells: number, stagger: number): gsap.core.Timeline {
    this.crackAll(true);
    const tl = gsap.timeline();
    this.fuses = [];
    this.columns.forEach((c, i) => tl.add(c.start(i * stagger, speedCells), 0));
    return tl;
  }

  /**
   * Arrêt sur la grille du book. anticipation[c] > 0 : colonne ralentie longuement avant l'arrêt.
   * quick() : arrêt rapide des colonnes restantes, sans changer le résultat.
   */
  async land(board: SymbolName[][], tnt: Map<string, TntKind>, anticipation: number[], beat: Beat, opts: { gap: number; antiMs: number; onAnticipate?: (col: number) => void; quick?: () => boolean }): Promise<void> {
    for (let c = 0; c < COLS; c++) {
      const col = this.columns[c] as ReelColumn;
      const quick = opts.quick?.() ?? beat.fast;
      if ((anticipation[c] ?? 0) > 0 && !quick) {
        opts.onAnticipate?.(c);
        beat.fire(col.slowTo(7, 0.6));
        await beat.wait(opts.antiMs);
      } else if (c > 0 && !quick) await beat.wait(opts.gap);
      const symbols = board[c] as SymbolName[];
      const kinds = symbols.map((_, r) => tnt.get(`${c},${r}`) ?? null);
      const pad = FILLER[(rand() * FILLER.length) | 0] as SymbolName;
      const tl = col.stop(symbols, kinds, quick ? 0.16 : 0, pad);
      tl.add(() => {
        for (const v of col.cells) {
          v.land(v.sym === 'S' || v.sym === 'W' || v.sym === 'T' ? 1.4 : 1);
          v.pauseIdle(false);
        }
        this.onColumnStop?.(c);
      });
      if (c === COLS - 1) await beat.play(tl);
      else beat.fire(tl);
    }
    await beat.wait(60);
    this.refreshFuses();
  }

  /** arrêt immédiat de toutes les colonnes encore en mouvement (skip global) */
  get anySpinning(): boolean {
    return this.columns.some((c) => c.spinning);
  }

  private tick(dt: number): void {
    for (const c of this.columns) c.tick(dt);
    this.sparks.update(dt);
    this.debris.update(dt);
    this.dust.update(dt);
    // étincelles de mèche sur les TNT posées
    if (this.fuses.length && !this.anySpinning) {
      for (const f of this.fuses) {
        const v = this.viewAt(f.col, f.row);
        if (!v || v.sym !== 'T' || !v.tnt) continue;
        if (rand() < dt / 90) {
          const d = TNT_DEFS[v.tnt];
          const bw = v.body.texture.width * v.body.scale.x;
          const bh = v.body.texture.height * v.body.scale.y;
          const p = this.localCenter(f.col, f.row);
          const x = p.x + (d.fuse[0] - 0.5) * bw;
          const y = p.y + (d.fuse[1] - 0.5) * bh;
          const fx = fxTextures();
          this.sparks.emit({ texture: fx.spark, count: 2, x, y, speed: [60, 160], angle: -Math.PI / 2, cone: 1.2, gravity: 260, life: [220, 420], scale: [0.12, 0.2], scaleEnd: 0.3, tint: [0xffd54a, 0xff9a3c, 0xffffff] });
        }
      }
    }
  }

  refreshFuses(): void {
    this.fuses = [];
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
      const v = this.viewAt(c, r);
      if (v && v.sym === 'T') this.fuses.push({ col: c, row: r });
    }
  }

  // ---------------------------------------------------------------- connexions

  /** montant de connexion près du groupe gagnant (BitmapText préchargé) */
  showAmount(text: string, x: number, y: number, beat: Beat, holdMs: number): gsap.core.Timeline {
    const t = this.labelPool.find((l) => !l.visible) ?? (this.labelPool[0] as BitmapText);
    t.text = text;
    t.visible = true;
    t.position.set(x, y);
    t.alpha = 0;
    t.scale.set(0.6);
    const tl = gsap.timeline({ onComplete: () => void (t.visible = false) });
    tl.to(t, { alpha: 1, duration: 0.1 }, 0).to(t.scale, { x: 1, y: 1, duration: 0.24, ease: 'back.out(3)' }, 0);
    tl.to(t, { y: y - this.cell * 0.18, duration: holdMs / 1000, ease: 'sine.out' }, 0.1);
    tl.to(t, { alpha: 0, duration: 0.14 }, `>-0.05`);
    beat.fire(tl);
    return tl;
  }

  /** halos de connexion derrière les gagnants (primitive d'effet, masquée dans la grille) */
  drawHalos(positions: Array<[number, number]>, color: number, alpha: number): void {
    const g = this.halos;
    g.clear();
    for (const [c, r] of positions) {
      const p = this.localCenter(c, r);
      for (let i = 0; i < 4; i++) g.roundRect(p.x - this.cell * (0.48 - i * 0.05), p.y - this.cell * (0.48 - i * 0.05), this.cell * (0.96 - i * 0.1), this.cell * (0.96 - i * 0.1), this.cell * 0.14).fill({ color, alpha: alpha * (0.18 + i * 0.12) });
    }
  }

  clearHalos(): void {
    this.halos.clear();
  }

  /** présentation d'une connexion ways : réveil des vraies cases, atténuation des autres, montant exact */
  async presentWin(w: WinLine, amountText: string, beat: Beat): Promise<void> {
    const set = new Set(w.positions.map(([c, r]) => `${c},${r}`));
    const giantCells = new Set<string>();
    for (const g of this.giants) for (let c = g.area.col; c < g.area.col + g.area.w; c++) for (let r = g.area.row; r < g.area.row + g.area.h; r++) giantCells.add(`${c},${r}`);
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
      const v = this.viewAt(c, r);
      if (v) beat.fire(v.dim(!set.has(`${c},${r}`), 0.55));
    }
    for (const g of this.giants) g.sprite.alpha = [...set].some((k) => this.inArea(g.area, k)) ? 1 : 0.45;
    const color = SYMBOL_DEFS[w.symbol === 'W' ? 'W' : w.symbol].glow;
    this.drawHalos(w.positions, color, 1);
    // réactions : chaque case réelle réagit (les géants réagissent une fois)
    const reacted = new Set<GiantView>();
    for (const [c, r] of w.positions) {
      const g = this.giants.find((gg) => this.inArea(gg.area, `${c},${r}`));
      if (g) {
        if (!reacted.has(g)) {
          reacted.add(g);
          beat.fire(this.giantReact(g));
        }
        continue;
      }
      const v = this.viewAt(c, r);
      if (v) beat.fire(v.react());
    }
    // énergie libérée : étincelles depuis chaque case gagnante
    const fx = fxTextures();
    for (const [c, r] of w.positions) {
      const p = this.localCenter(c, r);
      this.sparks.emit({ texture: fx.dot, count: 5, x: p.x, y: p.y, spread: this.cell * 0.3, speed: [40, 120], cone: Math.PI, life: [300, 520], scale: [0.06, 0.12], scaleEnd: 0.2, tint: [color, 0xffffff] });
    }
    // montant au barycentre des cases gagnantes
    const cx = w.positions.reduce((s, [c]) => s + c, 0) / w.positions.length;
    const cy = w.positions.reduce((s, [, r]) => s + r, 0) / w.positions.length;
    this.showAmount(amountText, (cx + 0.5) * this.cell, (cy + 0.5) * this.cell, beat, T.win.amountHold);
    await beat.wait(T.win.present);
  }

  endWinPresentation(beat: Beat): void {
    this.clearHalos();
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
      const v = this.viewAt(c, r);
      if (v) beat.fire(v.dim(false));
    }
    for (const g of this.giants) g.sprite.alpha = 1;
  }

  private inArea(a: Area, key: string): boolean {
    const [c, r] = key.split(',').map(Number) as [number, number];
    return c >= a.col && c < a.col + a.w && r >= a.row && r < a.row + a.h;
  }

  // ---------------------------------------------------------------- chutes

  /**
   * Retrait des gagnants puis chute : survivants déplacés (identité conservée), nouveaux symboles au-dessus
   * de leur colonne. La chute démarre dès que les cases sont libres ; aucun ancien symbole ne réapparaît.
   */
  async tumble(removed: Array<[number, number]>, newSymbols: SymbolName[][], board: SymbolName[][], tnt: Map<string, TntKind>, beat: Beat): Promise<void> {
    const rm = new Set(removed.map(([c, r]) => `${c},${r}`));
    // les géants se fissurent en symboles simples ou s'effondrent entièrement
    for (const g of [...this.giants]) {
      const cells: string[] = [];
      for (let c = g.area.col; c < g.area.col + g.area.w; c++) for (let r = g.area.row; r < g.area.row + g.area.h; r++) cells.push(`${c},${r}`);
      const all = cells.every((k) => rm.has(k));
      if (all) beat.fire(this.crumbleGiant(g));
      else this.crackGiant(g, beat);
    }
    const fx = fxTextures();
    const crumbleTl = gsap.timeline();
    for (const [c, r] of removed) {
      const v = this.viewAt(c, r);
      if (!v || !v.visible) continue;
      crumbleTl.add(v.crumble(), 0);
      const p = this.localCenter(c, r);
      this.debris.emit({ texture: fx.chunk, count: 7, x: p.x, y: p.y, spread: this.cell * 0.2, speed: [120, 320], angle: -Math.PI / 2, cone: 1.4, gravity: 1400, life: [420, 700], scale: [this.cell / 520, this.cell / 300], spin: [-8, 8], tint: [0x8a8f9c, 0x6f7f92, 0xc98a45] });
      this.dust.emit({ texture: fx.soft, count: 3, x: p.x, y: p.y + this.cell * 0.2, spread: this.cell * 0.25, speed: [10, 40], angle: -Math.PI / 2, cone: 1, life: [500, 800], scale: [this.cell / 110, this.cell / 80], scaleEnd: 1.6, tint: 0xd9b27a, alphaOut: 0.7 });
    }
    beat.fire(crumbleTl);
    await beat.wait(T.tumble.crumbleBeforeFall);
    const fall = gsap.timeline();
    for (let c = 0; c < COLS; c++) {
      const col = this.columns[c] as ReelColumn;
      const removedHere: SymbolView[] = [];
      const survivors: SymbolView[] = [];
      for (let r = 0; r < ROWS; r++) {
        const v = col.cells[r] as SymbolView;
        if (rm.has(`${c},${r}`)) removedHere.push(v);
        else survivors.push(v);
      }
      if (!removedHere.length) continue;
      const add = newSymbols[c] ?? [];
      const hidden = col.ring[0] as SymbolView;
      // recyclage : les vues retirées deviennent les nouveaux symboles, placées au-dessus de la colonne
      const incoming = removedHere;
      const nextCells: SymbolView[] = [];
      add.forEach((sym, i) => {
        const v = incoming[i] as SymbolView;
        gsap.killTweensOf(v);
        v.resetVisual();
        v.setSymbol(sym, tnt.get(`${c},${i}`) ?? null);
        v.pauseIdle(true);
        v.y = (i - add.length + 0.5) * this.cell - this.cell * 0.15;
        nextCells.push(v);
      });
      nextCells.push(...survivors);
      nextCells.forEach((v, r) => {
        v.row = r;
        const ty = (r + 0.5) * this.cell;
        if (Math.abs(v.y - ty) < 0.5) return;
        const dist = (ty - v.y) / this.cell;
        const d = Math.min(0.55, 0.22 + dist * 0.06);
        fall.to(v, { y: ty, duration: d, ease: 'power2.in' }, c * 0.03 + (r < add.length ? 0.04 : 0));
        fall.add(() => {
          beat.fire(v.land(0.7));
          v.pauseIdle(false);
        }, `>`);
      });
      // l'anneau adopte le nouvel ordre sans replacer les vues (la chute les anime depuis leur position)
      col.adoptCells(nextCells, hidden, false);
      nextCells.forEach((v) => (v.visible = true));
    }
    // vérification de cohérence visuelle : la grille affichée doit égaler la grille déclarée
    await beat.play(fall);
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
      const v = this.viewAt(c, r);
      const want = board[c]?.[r];
      if (v && want && v.sym !== want) {
        if (__DEV_TOOLS__) console.error(`grille visuelle ≠ book en ${c},${r} : ${v.sym} vs ${want}`);
        v.setSymbol(want, tnt.get(`${c},${r}`) ?? null);
      }
      if (v) v.y = (r + 0.5) * this.cell;
    }
    this.refreshFuses();
  }

  // ---------------------------------------------------------------- géants

  private placeGiant(g: GiantView): void {
    const { col, row, w, h } = g.area;
    g.sprite.setCell(Math.min(w, h) * this.cell);
    g.sprite.position.set((col + w / 2) * this.cell, (row + h / 2) * this.cell);
  }

  addGiant(area: Area, symbol: SymbolName): GiantView {
    const s = SymbolView.makeArt(symbol, Math.min(area.w, area.h) * this.cell);
    const g: GiantView = { area, symbol, sprite: s };
    this.giants.push(g);
    this.giantsLayer.addChild(s);
    this.placeGiant(g);
    for (let c = area.col; c < area.col + area.w; c++) for (let r = area.row; r < area.row + area.h; r++) {
      const v = this.viewAt(c, r);
      if (v) {
        v.setSymbol(symbol);
        v.visible = false;
      }
    }
    return g;
  }

  giantReact(g: GiantView): gsap.core.Timeline {
    return g.sprite.react();
  }

  /** le géant qui ne paie pas se fissure en symboles simples identiques (même valeur de grille) */
  crackGiant(g: GiantView, beat: Beat | null): void {
    const tl = gsap.timeline({
      onComplete: () => {
        g.sprite.destroy();
      },
    });
    tl.to(g.sprite, { alpha: 0, duration: 0.14 });
    for (let c = g.area.col; c < g.area.col + g.area.w; c++) for (let r = g.area.row; r < g.area.row + g.area.h; r++) {
      const v = this.viewAt(c, r);
      if (!v) continue;
      v.visible = true;
      v.alpha = 0;
      tl.to(v, { alpha: 1, duration: 0.14 }, 0.04);
      tl.add(v.land(0.6), 0.06);
    }
    this.giants = this.giants.filter((x) => x !== g);
    if (beat) beat.fire(tl);
    else tl.progress(1);
  }

  crumbleGiant(g: GiantView): gsap.core.Timeline {
    const s = g.sprite;
    const tl = s.crumble();
    tl.eventCallback('onComplete', () => s.destroy());
    const fx = fxTextures();
    const cx = (g.area.col + g.area.w / 2) * this.cell;
    const cy = (g.area.row + g.area.h / 2) * this.cell;
    this.debris.emit({ texture: fx.chunk, count: 14 * g.area.w, x: cx, y: cy, spread: this.cell * g.area.w * 0.35, speed: [140, 380], angle: -Math.PI / 2, cone: 1.5, gravity: 1400, life: [480, 780], scale: [this.cell / 420, this.cell / 240], spin: [-8, 8], tint: [0x8a8f9c, 0x6f7f92, 0xc98a45] });
    this.giants = this.giants.filter((x) => x !== g);
    return tl;
  }

  crackAll(instant = false): void {
    for (const g of [...this.giants]) this.crackGiant(g, null);
    if (instant) for (const c of this.columns) for (const v of c.cells) if (v) v.visible = true;
  }

  clearGiants(): void {
    for (const g of this.giants) g.sprite.destroy();
    this.giants = [];
    this.giantsLayer.removeChildren();
  }
}
