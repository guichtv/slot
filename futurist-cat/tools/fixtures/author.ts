// AUTHORING helper for local fixtures (tools only, never imported by src/). It writes books that
// follow the provisional config so the front can be played end to end before the maths team
// delivers real books. Every book is then checked by tools/fixtures/check.ts (validateBook).
import type { Book, BookEvent } from '../../src/contract/events';
import { COLS, ROWS, stepUp, posKey, isSpecial, type SymbolId, type Pos } from '../../src/contract/symbols';
import type { GameConfig } from '../../src/config/game-config';

type Draft = Omit<BookEvent, 'index'> & { index?: number };
export type Board = SymbolId[][]; // [col][row]

/** rows written top to bottom, 5 symbols each: ['L1 L2 H1 S L4', ...] -> board[col][row] */
export function grid(rows: string[]): Board {
  if (rows.length !== ROWS) throw new Error(`${rows.length} lignes`);
  const cells = rows.map((r) => r.trim().split(/\s+/) as SymbolId[]);
  for (const r of cells) if (r.length !== COLS) throw new Error(`ligne ${r.join(' ')}`);
  return Array.from({ length: COLS }, (_, c) => Array.from({ length: ROWS }, (_, r) => cells[r]![c]!));
}
const clone = (b: Board): Board => b.map((c) => [...c]);

export interface DotSpec { eye?: 'left' | 'right'; path: Pos[]; mult?: number }

/** ways evaluation, grouped by (symbol, combined multiplier) */
export function evaluate(board: Board, cfg: GameConfig, mults: Map<string, number>) {
  const wins: Extract<BookEvent, { type: 'winInfo' }>['wins'] = [];
  const firstCol = new Set(board[0]!.filter((s) => s !== 'S'));
  for (const s of firstCol) {
    const cols: Pos[][] = [];
    for (let c = 0; c < COLS; c++) {
      const cells = board[c]!.map((x, r) => [x, r] as const).filter(([x]) => x === s || (x === 'W' && s !== 'W')).map(([, r]) => [c, r] as Pos);
      if (!cells.length) break;
      cols.push(cells);
    }
    const kind = cols.length;
    if (kind < 3) continue;
    const pay = Math.round((cfg.paytable[s as keyof GameConfig['paytable']]?.[kind - 3] ?? 0) * 100);
    if (!pay) continue;
    const groups = new Map<number, { ways: number; cells: Map<string, Pos>; multCells: Map<string, Pos> }>();
    const walk = (c: number, acc: Pos[]) => {
      if (c === kind) {
        let m = 1; const mc: Pos[] = [];
        for (const p of acc) { const v = mults.get(posKey(p)); if (v) { m = cfg.laser.multCombine === 'add' ? (m === 1 ? v : m + v) : m * v; mc.push(p); } }
        const g = groups.get(m) ?? { ways: 0, cells: new Map(), multCells: new Map() };
        g.ways++; for (const p of acc) g.cells.set(posKey(p), p); for (const p of mc) g.multCells.set(posKey(p), p);
        groups.set(m, g);
        return;
      }
      for (const p of cols[c]!) walk(c + 1, [...acc, p]);
    };
    walk(0, []);
    for (const [m, g] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
      const baseWin = g.ways * pay;
      wins.push({ symbol: s, kind, ways: g.ways, win: baseWin * m, positions: [...g.cells.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]) as [number, number][],
        meta: { baseWin, mult: m, ...(g.multCells.size ? { multPositions: [...g.multCells.values()] as [number, number][] } : {}) } });
    }
  }
  return wins;
}

export class BookBuilder {
  private events: Draft[] = [];
  private board: Board | null = null;
  private chips = new Map<string, number>();
  private mults = new Map<string, number>();
  private total = 0;
  private bonusTotal = 0;
  private inBonus = false;
  private fsTotal = 0;
  private fsPlayed = 0;
  private capped = false;
  constructor(readonly id: number, readonly mode: Book['mode'], readonly cfg: GameConfig) {}

  private push(e: Draft): void { this.events.push(e); }
  featureStart(feature: 'scan' | 'doubleScan'): this { this.push({ type: 'featureStart', feature, dots: feature === 'scan' ? 1 : 2 } as Draft); return this; }

  /** one spin: reveal, chip upgrades (bonus), laser dots, win, setWin (+setTotalWin in bonus) */
  spin(o: { board: Board; anticipation?: number[]; dots?: DotSpec[]; padding?: { top: SymbolId[]; bottom: SymbolId[] } }): { win: number; board: Board } {
    if (this.inBonus) { this.fsPlayed++; this.push({ type: 'updateFreeSpin', amount: this.fsPlayed, total: this.fsTotal } as Draft); }
    this.board = clone(o.board);
    this.mults.clear();
    this.push({ type: 'reveal', board: clone(o.board), gameType: this.inBonus ? 'freegame' : 'basegame', ...(o.anticipation ? { anticipation: o.anticipation } : {}), ...(o.padding ? { padding: o.padding } : {}) } as Draft);
    if (this.inBonus && this.chips.size) {
      const ups: { pos: [number, number]; from: SymbolId; to: SymbolId; level: number }[] = [];
      for (const [k, level] of this.chips) {
        const [c, r] = k.split(',').map(Number) as [number, number];
        const from = this.board[c]![r]!;
        if (isSpecial(from) || from === 'H4') continue;
        const to = stepUp(from, level);
        ups.push({ pos: [c, r], from, to, level });
        this.board[c]![r] = to;
      }
      if (ups.length) this.push({ type: 'chipUpgrade', upgrades: ups } as Draft);
    }
    (o.dots ?? []).forEach((d, i) => {
      const upgrades = d.path.map((p) => {
        const from = this.board![p[0]]![p[1]]!;
        if (isSpecial(from)) throw new Error(`fixture ${this.id}: le point touche ${from} en ${posKey(p)}`);
        const to = stepUp(from);
        this.board![p[0]]![p[1]] = to;
        return { pos: [p[0], p[1]] as [number, number], from, to };
      });
      const last = d.path[d.path.length - 1]!;
      if (d.mult) this.mults.set(posKey(last), (this.mults.get(posKey(last)) ?? 1) * d.mult);
      let chips: { pos: [number, number]; level: number }[] | undefined;
      if (this.inBonus) {
        chips = d.path.map((p) => { const lvl = Math.min(3, (this.chips.get(posKey(p)) ?? 0) + 1); this.chips.set(posKey(p), lvl); return { pos: [p[0], p[1]] as [number, number], level: lvl }; });
      }
      this.push({ type: 'laserDot', eye: d.eye ?? (i === 0 ? 'left' : 'right'), path: d.path.map((p) => [p[0], p[1]]), upgrades,
        ...(d.mult ? { mult: { pos: [last[0], last[1]], value: d.mult } } : {}), ...(chips ? { chips } : {}) } as Draft);
    });
    const wins = evaluate(this.board, this.cfg, this.mults);
    let win = wins.reduce((a, w) => a + w.win, 0);
    if (win > 0) this.push({ type: 'winInfo', totalWin: win, wins } as Draft);
    const cap = this.cfg.maxWinX * 100;
    if (this.total + win >= cap) { win = cap - this.total; this.capped = true; }
    this.push({ type: 'setWin', amount: win } as Draft);
    this.total += win;
    if (this.inBonus) { this.bonusTotal += win; this.push({ type: 'setTotalWin', amount: this.total } as Draft); }
    if (this.capped) this.push({ type: 'wincap', amount: cap } as Draft);
    return { win, board: this.board };
  }

  trigger(bonus: 'nineLives' | 'doubleGaze', positions: Pos[]): this {
    this.fsTotal = bonus === 'nineLives' ? this.cfg.bonus.nineLives.spins : this.cfg.bonus.doubleGaze.spins;
    this.push({ type: 'freeSpinTrigger', totalFs: this.fsTotal, positions: positions.map((p) => [p[0], p[1]]), bonus } as Draft);
    this.inBonus = true; this.fsPlayed = 0; this.bonusTotal = 0; this.chips.clear();
    if (this.board) for (const p of positions) if (this.board[p[0]]![p[1]] !== 'S') throw new Error(`fixture ${this.id}: pas de Scatter en ${posKey(p)}`);
    return this;
  }
  overclock(chips: { pos: Pos; level: number }[]): this {
    for (const c of chips) this.chips.set(posKey(c.pos), c.level);
    this.push({ type: 'overclock', chips: chips.map((c) => ({ pos: [c.pos[0], c.pos[1]], level: c.level })) } as Draft);
    return this;
  }
  retrigger(added: number, positions: Pos[]): this {
    this.fsTotal += added;
    this.push({ type: 'freeSpinRetrigger', totalFs: this.fsTotal, added, positions: positions.map((p) => [p[0], p[1]]) } as Draft);
    return this;
  }
  get remaining(): number { return this.fsTotal - this.fsPlayed; }
  get isCapped(): boolean { return this.capped; }
  get chipMap(): Map<string, number> { return this.chips; }
  endBonus(): this {
    this.push({ type: 'freeSpinEnd', amount: this.bonusTotal } as Draft);
    this.inBonus = false; this.chips.clear();
    return this;
  }
  build(): Book {
    this.push({ type: 'finalWin', amount: this.total } as Draft);
    return { id: this.id, mode: this.mode, payoutMultiplier: this.total, costMultiplier: this.cfg.modes[this.mode]!.cost,
      events: this.events.map((e, i) => ({ ...e, index: i })) as BookEvent[] };
  }
}

/** win of a spin without writing it (chips then dots applied on a copy) */
export function preview(board: Board, chips: Map<string, number>, dots: DotSpec[], cfg: GameConfig): number {
  const b = clone(board);
  for (const [k, level] of chips) {
    const [c, r] = k.split(',').map(Number) as [number, number];
    if (!isSpecial(b[c]![r]!)) b[c]![r] = stepUp(b[c]![r]!, level);
  }
  const mults = new Map<string, number>();
  for (const d of dots) {
    for (const p of d.path) { if (isSpecial(b[p[0]]![p[1]]!)) return -1; b[p[0]]![p[1]] = stepUp(b[p[0]]![p[1]]!); }
    const last = d.path[d.path.length - 1]!;
    if (d.mult) mults.set(posKey(last), (mults.get(posKey(last)) ?? 1) * d.mult);
  }
  return evaluate(b, cfg, mults).reduce((a, w) => a + w.win, 0);
}

/** seeded PRNG for filler boards */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
