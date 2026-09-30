// 5x4 grid. Each reel is a strip of 9 recycled SymbolViews (never recreated). While spinning the
// strip is masked and shows decorative symbols only (never a Wild, never a Scatter). A stop is
// aligned on the cell pitch: the 4 final symbols are assigned to views that are still above the
// window, so nothing pops; landing = one tween with a small bounce. Quick stop only shortens the
// landing, the result is the book's board.
import { Container, Graphics, NineSliceSprite, Sprite, type Renderer } from 'pixi.js';
import gsap from 'gsap';
import { SymbolView } from './symbol';
import type { AssetStore } from './assets';
import type { Layout } from './layout';
import { COLS, ROWS, type SymbolId } from '../contract/symbols';
import type { Rand } from '../core/rng';
import { T } from '../config/timings';

const N = 9; // views per strip
const DECOR: [SymbolId, number][] = [['L1', 10], ['L2', 10], ['L3', 9], ['L4', 8], ['H1', 5], ['H2', 4], ['H3', 3], ['H4', 2]];

type ReelPhase = 'idle' | 'accel' | 'spin' | 'slow' | 'landing';

export class ReelView {
  readonly root = new Container({ label: 'reel' });
  readonly strip = new Container();
  readonly mask = new Graphics();
  readonly views: SymbolView[] = [];
  offset = 0;
  speed = 0; // pitches / s
  targetSpeed = 0;
  phase: ReelPhase = 'idle';
  private lastMod: number[] = [];
  private landTween: gsap.core.Tween | null = null;
  private nextTop: SymbolId[] = [];
  cells: SymbolView[] = [];
  onLand: (() => void) | null = null;

  constructor(readonly col: number, readonly pitch: number, readonly cell: number, private readonly make: () => SymbolView, private readonly rand: Rand) {
    for (let i = 0; i < N; i++) {
      const v = make();
      this.views.push(v);
      this.strip.addChild(v.root);
      this.lastMod.push(0);
    }
    this.root.addChild(this.strip, this.mask);
    this.mask.rect(-6, -6, cell + 12, pitch * ROWS - (pitch - cell) + 12).fill({ color: 0xffffff });
    this.strip.mask = this.mask;
    this.place();
  }

  private decor(): SymbolId {
    const tot = DECOR.reduce((a, [, w]) => a + w, 0);
    let x = this.rand() * tot;
    for (const [s, w] of DECOR) { x -= w; if (x < 0) return s; }
    return 'L1';
  }

  private modOf(i: number): number { const span = N * this.pitch; return (((i * this.pitch + this.offset) % span) + span) % span; }

  /** y of view i (cell top), in [-5p, 4p) */
  private place(): void {
    for (let i = 0; i < N; i++) {
      const m = this.modOf(i);
      if (this.phase !== 'idle' && m < this.lastMod[i]! - this.pitch) this.wrapped(i);
      this.lastMod[i] = m;
      const v = this.views[i]!;
      v.root.position.set(this.cell / 2, m - 5 * this.pitch + this.cell / 2);
    }
  }

  private wrapped(i: number): void {
    const v = this.views[i]!;
    const s = this.nextTop.shift() ?? this.decor();
    v.set(s);
  }

  /** initial board (no animation) */
  setBoard(col: SymbolId[]): void {
    this.phase = 'idle';
    this.offset = 0;
    this.speed = 0;
    // with offset 0: view i is at slot i-5 -> rows 0..3 are views 5..8
    for (let i = 0; i < N; i++) this.views[i]!.set(i >= 5 ? col[i - 5]! : this.decor());
    this.cells = this.views.slice(5, 9);
    this.place();
    this.maskOn(false);
  }

  maskOn(on: boolean): void {
    this.strip.mask = on ? this.mask : null;
    this.mask.visible = on;
    for (const v of this.views) v.root.visible = on || this.cells.includes(v);
  }

  start(delay = 0): void {
    this.landTween?.kill();
    this.maskOn(true);
    for (const v of this.views) { v.reset(); }
    gsap.delayedCall(delay, () => {
      this.phase = 'accel';
      for (const v of this.views) v.setSpinning(true);
      // anticipation-friendly acceleration: a small lift then full speed
      gsap.fromTo(this, { offset: this.offset }, { offset: this.offset - this.pitch * 0.12, duration: 0.08, ease: 'power1.out', onComplete: () => { this.targetSpeed = T.spin.speed; this.phase = 'spin'; } });
    });
  }

  /** slow down for anticipation (keeps spinning) */
  slow(factor: number): void { if (this.phase === 'spin' || this.phase === 'slow') { this.targetSpeed = T.spin.speed * factor; this.phase = 'slow'; } }

  stop(final: SymbolId[], topPad: SymbolId | null, landDur: number): Promise<void> {
    return new Promise((resolve) => {
      if (this.phase === 'idle' || this.phase === 'landing') { resolve(); return; }
      const p = this.pitch;
      const k = Math.ceil(this.offset / p + 1e-6);
      const target = (k + 4) * p;
      // views that will sit on rows 0..3 at `target`
      const rowView = (r: number) => ((((5 + r - target / p) % N) + N) % N);
      const idx = [0, 1, 2, 3].map(rowView);
      idx.forEach((vi, r) => this.views[vi]!.set(final[r]!));
      this.nextTop = topPad ? [topPad] : [];
      this.phase = 'landing';
      this.speed = 0;
      this.landTween = gsap.to(this, {
        offset: target, duration: landDur, ease: 'back.out(1.05)',
        onUpdate: () => this.place(),
        onComplete: () => {
          this.phase = 'idle';
          this.cells = idx.map((i) => this.views[i]!);
          for (const v of this.views) v.setSpinning(false);
          this.place();
          this.cells.forEach((v, r) => v.land(r * 0.015));
          this.onLand?.();
          resolve();
        },
      });
    });
  }

  update(dt: number): void {
    if (this.phase === 'spin' || this.phase === 'slow' || this.phase === 'accel') {
      this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * 10);
      this.offset += this.speed * this.pitch * dt;
      this.place();
    }
  }
}

export class GridView {
  readonly root = new Container({ label: 'grid' });
  readonly frameLayer = new Container();
  readonly cellBgLayer = new Container();
  readonly reelLayer = new Container();
  readonly overlay = new Container({ label: 'grid-overlay' }); // chips, mult tokens
  readonly fxLayer = new Container({ label: 'grid-fx' });
  reels: ReelView[] = [];
  private frame: NineSliceSprite | null = null;
  private cellBgs: Sprite[] = [];
  cell = 170;
  gap = 8;
  pitch = 178;
  origin = { x: 0, y: 0 };
  private anticipationFx = new Graphics();
  spinning = false;

  constructor(private readonly assets: AssetStore, private readonly renderer: Renderer, private readonly rand: Rand) {
    this.root.addChild(this.frameLayer, this.cellBgLayer, this.reelLayer, this.anticipationFx, this.overlay, this.fxLayer);
    this.anticipationFx.blendMode = 'add';
  }

  layout(l: Layout): void {
    const g = l.design.grid;
    const newCell = g.cell;
    const rebuild = newCell !== this.cell || !this.reels.length;
    this.cell = g.cell; this.gap = g.gap; this.pitch = g.cell + g.gap;
    this.origin = { ...l.cellOrigin };
    // frame (9-slice)
    this.frame?.destroy();
    const ftex = this.assets.tex('grid.frame', this.renderer);
    const s9 = this.assets.slice9('grid.frame') ?? [170, 170, 170, 170];
    const fs = 0.34; // frame art is drawn at ~3x
    this.frame = new NineSliceSprite({ texture: ftex, leftWidth: s9[0], topHeight: s9[1], rightWidth: s9[2], bottomHeight: s9[3] });
    this.frame.scale.set(fs);
    this.frame.width = (l.gridW + 2 * g.pad) / fs; this.frame.height = (l.gridH + 2 * g.pad) / fs;
    this.frame.position.set(g.x, g.y);
    this.frameLayer.addChild(this.frame);
    // cells
    for (const c of this.cellBgs) c.destroy();
    this.cellBgs = [];
    const ctex = this.assets.tex('grid.cell', this.renderer);
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
      const sp = new Sprite(ctex);
      sp.width = this.cell; sp.height = this.cell;
      sp.position.set(this.origin.x + c * this.pitch, this.origin.y + r * this.pitch);
      this.cellBgLayer.addChild(sp);
      this.cellBgs.push(sp);
    }
    if (rebuild) {
      const board = this.reels.length ? this.board() : null;
      for (const r of this.reels) r.root.destroy({ children: true });
      this.reels = [];
      for (let c = 0; c < COLS; c++) {
        const reel = new ReelView(c, this.pitch, this.cell, () => new SymbolView(this.assets, this.renderer, this.cell, this.rand), this.rand);
        this.reels.push(reel);
        this.reelLayer.addChild(reel.root);
      }
      if (board) this.setBoard(board);
    }
    this.reels.forEach((r, c) => r.root.position.set(this.origin.x + c * this.pitch, this.origin.y));
  }

  /** last landed board (the strip views are recycled while spinning, so keep a copy) */
  lastBoard: SymbolId[][] = [];
  setBoard(board: SymbolId[][]): void { this.lastBoard = board.map((c) => [...c]); this.reels.forEach((r, c) => r.setBoard(board[c]!)); }
  noteLanded(): void { this.lastBoard = this.board(); }
  board(): SymbolId[][] { return this.reels.map((r) => r.cells.map((v) => v.id)); }
  cellView(c: number, r: number): SymbolView { return this.reels[c]!.cells[r]!; }
  cellCenter(c: number, r: number): { x: number; y: number } { return { x: this.origin.x + c * this.pitch + this.cell / 2, y: this.origin.y + r * this.pitch + this.cell / 2 }; }
  get center(): { x: number; y: number } { return { x: this.origin.x + (COLS * this.pitch - this.gap) / 2, y: this.origin.y + (ROWS * this.pitch - this.gap) / 2 }; }

  startSpin(turbo: boolean): void {
    this.spinning = true;
    this.reels.forEach((r, c) => r.start(c * (turbo ? 0.02 : 0.045)));
  }

  /** anticipation glow on a reel column (cyan contour x1.5) */
  anticipate(col: number, on: boolean): gsap.core.Tween {
    const g = this.anticipationFx;
    if (on) {
      g.clear();
      const x = this.origin.x + col * this.pitch, y = this.origin.y;
      const h = ROWS * this.pitch - this.gap;
      for (const [w, a] of [[16, 0.12], [8, 0.3], [3, 0.9]] as const) g.roundRect(x - w / 2, y - w / 2, this.cell + w, h + w, 22).stroke({ color: 0x3feaff, width: w, alpha: a });
    }
    return gsap.to(g, { alpha: on ? 1 : 0, duration: 0.2, onComplete: () => { if (!on) g.clear(); } });
  }

  dimAllExcept(keep: Set<string> | null, alpha: number = T.win.dimAlpha): void {
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
      const v = this.cellView(c, r);
      const on = keep !== null && !keep.has(`${c},${r}`);
      if (on !== v.dimmed) v.dim(on, alpha);
    }
  }

  allCells(): SymbolView[] { return this.reels.flatMap((r) => r.cells); }

  update(dt: number, idleAllowed: boolean): void {
    for (const r of this.reels) r.update(dt);
    if (!this.spinning) for (const v of this.allCells()) v.update(dt, idleAllowed);
  }
}
