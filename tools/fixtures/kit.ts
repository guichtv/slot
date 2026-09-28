/**
 * Kit d'auteur de fixtures (books de démonstration, montants illustratifs).
 * - écrit des grilles lisibles (texte 5 lignes × 5 colonnes), génère les événements dans l'ordre légal,
 *   imprime les grilles en ASCII.
 * - n'évalue JAMAIS un gain : l'auteur déclare chaque connexion (symbole, nombre de rouleaux, montant).
 *   Le kit ne fait que de la géométrie (sélection des cases déclarées, gravité des chutes).
 * - le validateur (validate.ts) contrôle la cohérence ; un scénario invalide est signalé, jamais réparé.
 */
import { COLS, ROWS, type SymbolName, type TntKind } from '../../src/contract/schema';

type Sym = SymbolName;
type Pos = [number, number];

const TNT_SIZE: Record<TntKind, number> = { stick: 2, bundle: 3, crate: 4 };

export function grid(text: string): Sym[][] {
  const rows = text
    .trim()
    .split('\n')
    .map((l) => l.trim().split(/\s+/));
  if (rows.length !== ROWS) throw new Error(`grille : ${rows.length} lignes au lieu de ${ROWS}`);
  const board: Sym[][] = Array.from({ length: COLS }, () => []);
  rows.forEach((r, ri) => {
    if (r.length !== COLS) throw new Error(`grille ligne ${ri} : ${r.length} colonnes`);
    r.forEach((s, ci) => ((board[ci] as Sym[])[ri] = s as Sym));
  });
  return board;
}

export function ascii(board: Sym[][], mark: Pos[] = []): string {
  const m = new Set(mark.map(([c, r]) => `${c},${r}`));
  const lines: string[] = [];
  for (let r = 0; r < ROWS; r++) {
    const cells: string[] = [];
    for (let c = 0; c < COLS; c++) {
      const s = (board[c] as Sym[])[r] as string;
      cells.push(m.has(`${c},${r}`) ? `[${s.padEnd(2)}]` : ` ${s.padEnd(2)} `);
    }
    lines.push(cells.join(''));
  }
  return lines.join('\n');
}

export interface WinDecl {
  symbol: Exclude<Sym, 'S' | 'T'>;
  reels: number;
  /** gain final (centièmes de mise) */
  win: number;
  mult?: number;
  baseWin?: number;
}

interface Ev {
  index?: number;
  type: string;
  [k: string]: unknown;
}

export class BookBuilder {
  private events: Ev[] = [];
  private board: Sym[][] = [];
  private tnt = new Map<string, TntKind>();
  private lastWinPositions: Pos[] = [];
  private spinWin = 0;
  private roundWin = 0;
  private bonusWin = 0;
  private fsTotal = 0;
  private fsCurrent = 0;
  private inFs = false;
  private mult = 1;
  printed: string[] = [];

  constructor(
    readonly id: string,
    readonly mode: string,
    readonly meta: { weight?: number; tags?: string[]; note?: string; cost?: number } = {},
  ) {}

  private push(e: Ev): void {
    this.events.push(e);
  }

  private log(title: string, mark: Pos[] = []): void {
    this.printed.push(`-- ${title}\n${ascii(this.board, mark)}`);
  }

  /** Révélation d'une grille. tnt : liste [col,row,kind] pour chaque case T. anticipation par rouleau. */
  reveal(text: string, opts: { tnt?: Array<[number, number, TntKind]>; anticipation?: number[]; freegame?: boolean } = {}): this {
    this.board = grid(text);
    this.tnt.clear();
    for (const [c, r, k] of opts.tnt ?? []) this.tnt.set(`${c},${r}`, k);
    this.spinWin = 0;
    this.lastWinPositions = [];
    this.push({
      type: 'reveal',
      board: this.board.map((col) => col.map((name) => ({ name }))),
      anticipation: opts.anticipation ?? [0, 0, 0, 0, 0],
      gameType: opts.freegame || this.inFs ? 'freegame' : 'basegame',
      tnt: [...this.tnt].map(([k, kind]) => ({ pos: k.split(',').map(Number) as Pos, kind })),
    });
    this.log(`${this.id} reveal`);
    return this;
  }

  /** Explosion d'une charge : la zone (taille fixée par le type) devient un géant. anchor = coin haut-gauche. */
  blast(at: Pos, giant: Exclude<Sym, 'S' | 'T'>, anchor?: Pos): this {
    const kind = this.tnt.get(`${at[0]},${at[1]}`);
    if (!kind) throw new Error(`${this.id}: pas de TNT en ${at}`);
    const n = TNT_SIZE[kind];
    const [ac, ar] = anchor ?? [Math.min(Math.max(0, at[0] - Math.floor((n - 1) / 2)), COLS - n), Math.min(Math.max(0, at[1] - Math.floor((n - 1) / 2)), ROWS - n)];
    const area = { col: ac, row: ar, w: n, h: n };
    for (let c = ac; c < ac + n; c++) for (let r = ar; r < ar + n; r++) {
      (this.board[c] as Sym[])[r] = giant;
      this.tnt.delete(`${c},${r}`);
    }
    this.push({ type: 'blast', tnt: { pos: at, kind }, area, giant });
    this.log(`${this.id} blast ${kind} @${at} -> ${giant} ${n}x${n}`);
    if (this.inFs) {
      this.mult += 1;
      this.push({ type: 'updateGlobalMult', globalMult: this.mult, cause: 'blast' });
    }
    return this;
  }

  /** Déclare les connexions du board courant (positions = cases du symbole ou W sur les rouleaux 0..reels-1). */
  wins(decls: WinDecl[]): this {
    const wins = decls.map((d) => {
      const positions: Pos[] = [];
      const counts: number[] = [];
      for (let c = 0; c < d.reels; c++) {
        let n = 0;
        for (let r = 0; r < ROWS; r++) {
          const s = (this.board[c] as Sym[])[r];
          if (s === d.symbol || s === 'W') {
            positions.push([c, r]);
            n++;
          }
        }
        counts.push(n);
      }
      const ways = counts.reduce((a, b) => a * b, 1);
      return {
        symbol: d.symbol,
        kind: 'ways',
        reels: d.reels,
        ways,
        win: d.win,
        ...(d.mult && d.mult > 1 ? { mult: d.mult, baseWin: d.baseWin ?? Math.round(d.win / d.mult) } : {}),
        positions,
      };
    });
    const total = wins.reduce((s, w) => s + w.win, 0);
    this.push({ type: 'winInfo', totalWin: total, wins });
    const all = new Map<string, Pos>();
    for (const w of wins) for (const p of w.positions) all.set(`${p[0]},${p[1]}`, p);
    this.lastWinPositions = [...all.values()];
    this.spinWin += total;
    this.push({ type: 'updateTumbleWin', amount: this.spinWin });
    this.log(`${this.id} wins ${decls.map((d) => `${d.symbol}x${d.reels}=${d.win}`).join(' ')}`, this.lastWinPositions);
    return this;
  }

  /** Chute : retire les cases gagnantes, fait tomber les survivants, insère les nouveaux (haut -> bas par colonne). */
  tumble(newCols: string[], opts: { tnt?: Array<[number, number, TntKind]> } = {}): this {
    const removed = this.lastWinPositions;
    if (!removed.length) throw new Error(`${this.id}: chute sans gain`);
    const rm = new Set(removed.map(([c, r]) => `${c},${r}`));
    const newSymbols: Sym[][] = newCols.map((s) => (s.trim() ? (s.trim().split(/\s+/) as Sym[]) : []));
    const next: Sym[][] = [];
    const tntNext = new Map<string, TntKind>();
    for (let c = 0; c < COLS; c++) {
      const survivors: Array<{ s: Sym; r: number }> = [];
      for (let r = 0; r < ROWS; r++) if (!rm.has(`${c},${r}`)) survivors.push({ s: (this.board[c] as Sym[])[r] as Sym, r });
      const add = newSymbols[c] ?? [];
      if (add.length + survivors.length !== ROWS) throw new Error(`${this.id}: colonne ${c} : ${add.length} nouveaux pour ${ROWS - survivors.length} cases libres`);
      const col = [...add, ...survivors.map((x) => x.s)];
      next.push(col);
      survivors.forEach((sv, i) => {
        const k = this.tnt.get(`${c},${sv.r}`);
        if (k) tntNext.set(`${c},${add.length + i}`, k);
      });
    }
    for (const [c, r, k] of opts.tnt ?? []) tntNext.set(`${c},${r}`, k);
    this.board = next;
    this.tnt = tntNext;
    this.push({
      type: 'tumbleBoard',
      removed,
      newSymbols,
      board: next.map((col) => col.map((name) => ({ name }))),
      tnt: [...tntNext].map(([k, kind]) => ({ pos: k.split(',').map(Number) as Pos, kind })),
    });
    this.lastWinPositions = [];
    this.log(`${this.id} tumble`);
    return this;
  }

  /** Fin du spin : gain du spin (et total de manche). */
  endSpin(): this {
    this.push({ type: 'setWin', amount: this.spinWin });
    this.roundWin += this.spinWin;
    if (this.inFs) this.bonusWin += this.spinWin;
    this.push({ type: 'setTotalWin', amount: this.inFs ? this.bonusWin : this.roundWin });
    return this;
  }

  fsTrigger(bonus: 'standard' | 'super', totalFs: number): this {
    const positions: Pos[] = [];
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) if ((this.board[c] as Sym[])[r] === 'S') positions.push([c, r]);
    this.push({ type: 'freeSpinTrigger', bonus, totalFs, positions });
    this.inFs = true;
    this.fsTotal = totalFs;
    this.fsCurrent = 0;
    this.mult = 1;
    this.bonusWin = this.roundWin;
    return this;
  }

  /** Démarre le tour de free spin suivant (compteur exact). */
  fsSpin(): this {
    this.fsCurrent += 1;
    this.push({ type: 'updateFreeSpin', amount: this.fsCurrent, total: this.fsTotal });
    return this;
  }

  fsRetrigger(extra: number): this {
    const positions: Pos[] = [];
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) if ((this.board[c] as Sym[])[r] === 'S') positions.push([c, r]);
    this.fsTotal += extra;
    this.push({ type: 'freeSpinRetrigger', extra, totalFs: this.fsTotal, positions });
    return this;
  }

  fsEnd(): this {
    this.push({ type: 'freeSpinEnd', amount: this.bonusWin });
    this.inFs = false;
    this.roundWin = this.bonusWin;
    return this;
  }

  get multiplier(): number {
    return this.mult;
  }

  wincap(amount: number): this {
    this.push({ type: 'wincap', amount });
    this.roundWin = amount;
    this.bonusWin = amount;
    return this;
  }

  build(): { id: string; mode: string; weight: number; tags: string[]; note: string; book: unknown } {
    const events = [...this.events, { type: 'finalWin', amount: this.roundWin }].map((e, i) => ({ index: i, ...e }));
    return {
      id: this.id,
      mode: this.mode,
      weight: this.meta.weight ?? 1,
      tags: this.meta.tags ?? [],
      note: this.meta.note ?? '',
      book: {
        id: this.id,
        mode: this.mode,
        payoutMultiplier: this.roundWin,
        ...(this.meta.cost ? { costMultiplier: this.meta.cost } : {}),
        events,
      },
    };
  }
}
