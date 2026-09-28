import type { Area, Book, EventOf, GameEvent, SymbolName, TntKind } from '../contract/schema';
import { COLS, ROWS } from '../contract/schema';

/**
 * État logique d'une manche : appliqué une seule fois par événement (index croissant),
 * séparé de l'interpolation visuelle. Aucune déduction de gain : on recopie les valeurs du book.
 */
export interface Giant {
  area: Area;
  symbol: SymbolName;
  /** index de l'événement blast qui l'a créé */
  from: number;
}

export interface FsState {
  active: boolean;
  bonus: 'standard' | 'super' | null;
  /** tour en cours (1-based), 0 avant le premier tour */
  current: number;
  total: number;
}

export class RoundModel {
  board: SymbolName[][] = emptyBoard();
  tnt = new Map<string, TntKind>();
  giants: Giant[] = [];
  /** gain du spin en cours (centièmes de mise) */
  spinWin = 0;
  /** gain cumulé de la manche */
  roundWin = 0;
  /** total du bonus (free spins) */
  bonusWin = 0;
  globalMult = 1;
  fs: FsState = { active: false, bonus: null, current: 0, total: 0 };
  capped = false;
  finished = false;
  lastIndex = -1;
  /** dernier winInfo (pour les réactions) */
  lastWins: EventOf<'winInfo'> | null = null;

  constructor(readonly book: Book) {}

  static key(c: number, r: number): string {
    return `${c},${r}`;
  }

  clone(): RoundModel {
    const m = new RoundModel(this.book);
    m.board = this.board.map((c) => [...c]);
    m.tnt = new Map(this.tnt);
    m.giants = this.giants.map((g) => ({ ...g, area: { ...g.area } }));
    m.spinWin = this.spinWin;
    m.roundWin = this.roundWin;
    m.bonusWin = this.bonusWin;
    m.globalMult = this.globalMult;
    m.fs = { ...this.fs };
    m.capped = this.capped;
    m.finished = this.finished;
    m.lastIndex = this.lastIndex;
    m.lastWins = this.lastWins;
    return m;
  }

  /** Applique un événement exactement une fois. Renvoie false si déjà appliqué. */
  apply(e: GameEvent): boolean {
    if (e.index <= this.lastIndex) return false;
    this.lastIndex = e.index;
    switch (e.type) {
      case 'reveal':
        this.board = e.board.map((col) => col.map((s) => s.name));
        this.setTnt(e.tnt);
        this.giants = [];
        this.spinWin = 0;
        this.lastWins = null;
        break;
      case 'blast': {
        const { col, row, w, h } = e.area;
        for (let c = col; c < col + w; c++) for (let r = row; r < row + h; r++) {
          (this.board[c] as SymbolName[])[r] = e.giant;
          this.tnt.delete(RoundModel.key(c, r));
        }
        this.giants.push({ area: { ...e.area }, symbol: e.giant, from: e.index });
        break;
      }
      case 'winInfo':
        this.lastWins = e;
        break;
      case 'updateTumbleWin':
        this.spinWin = e.amount;
        break;
      case 'tumbleBoard':
        this.board = e.board.map((col) => col.map((s) => s.name));
        this.setTnt(e.tnt);
        // après une chute, les géants restants sont redevenus des symboles simples
        this.giants = [];
        this.lastWins = null;
        break;
      case 'updateGlobalMult':
        this.globalMult = e.globalMult;
        break;
      case 'setWin':
        this.spinWin = e.amount;
        break;
      case 'setTotalWin':
        this.roundWin = e.amount;
        if (this.fs.active) this.bonusWin = e.amount;
        break;
      case 'freeSpinTrigger':
        this.fs = { active: true, bonus: e.bonus, current: 0, total: e.totalFs };
        this.globalMult = 1;
        break;
      case 'freeSpinRetrigger':
        this.fs.total = e.totalFs;
        break;
      case 'updateFreeSpin':
        this.fs.current = e.amount;
        this.fs.total = e.total;
        break;
      case 'freeSpinEnd':
        this.bonusWin = e.amount;
        this.fs = { ...this.fs, active: false };
        break;
      case 'wincap':
        this.capped = true;
        this.roundWin = e.amount;
        break;
      case 'finalWin':
        this.roundWin = e.amount;
        this.finished = true;
        break;
    }
    return true;
  }

  private setTnt(list: Array<{ pos: [number, number]; kind: TntKind }>): void {
    this.tnt.clear();
    for (const t of list) this.tnt.set(RoundModel.key(t.pos[0], t.pos[1]), t.kind);
  }

  /** Positions actuelles d'un symbole (lecture de la grille, pour la mise en scène). */
  positionsOf(sym: SymbolName): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) if (this.board[c]?.[r] === sym) out.push([c, r]);
    return out;
  }

  /** Nombre de Scatters visibles (pour l'anticipation et le comptage lisible). */
  scatterCount(): number {
    return this.positionsOf('S').length;
  }
}

export function emptyBoard(): SymbolName[][] {
  return Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => 'L1' as SymbolName));
}
