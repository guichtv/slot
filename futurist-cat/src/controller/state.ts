// Logical state of a round, applied ONCE per event and kept apart from any interpolation.
// A skip or a replay rebuilds it from the book without touching the session.
import type { BookEvent, ModeId } from '../contract/events';
import { posKey, type SymbolId } from '../contract/symbols';

export interface BonusState { kind: 'nineLives' | 'doubleGaze'; total: number; played: number; win: number }
export interface LogicalState {
  mode: ModeId;
  board: SymbolId[][] | null;
  mults: Map<string, number>;
  chips: Map<string, number>;
  spinWin: number; // hundredths of the base bet (current spin)
  roundWin: number; // hundredths, whole round
  bonus: BonusState | null;
  bonusEnded: { kind: BonusState['kind']; win: number } | null;
  feature: 'scan' | 'doubleScan' | null;
  capped: boolean;
  finished: boolean;
  lastIndex: number;
}

export function initialState(mode: ModeId): LogicalState {
  return { mode, board: null, mults: new Map(), chips: new Map(), spinWin: 0, roundWin: 0, bonus: null, bonusEnded: null, feature: null, capped: false, finished: false, lastIndex: -1 };
}

export function snapshot(s: LogicalState): LogicalState {
  return { ...s, board: s.board ? s.board.map((c) => [...c]) : null, mults: new Map(s.mults), chips: new Map(s.chips), bonus: s.bonus ? { ...s.bonus } : null, bonusEnded: s.bonusEnded ? { ...s.bonusEnded } : null };
}

export class DuplicateEvent extends Error {}

export function applyEvent(s: LogicalState, e: BookEvent): void {
  if (e.index <= s.lastIndex) throw new DuplicateEvent(`event ${e.index} already applied (last ${s.lastIndex})`);
  s.lastIndex = e.index;
  switch (e.type) {
    case 'featureStart': s.feature = e.feature; break;
    case 'reveal': s.board = e.board.map((c) => [...c]); s.mults.clear(); s.spinWin = 0; break;
    case 'chipUpgrade': for (const u of e.upgrades) s.board![u.pos[0]]![u.pos[1]] = u.to; break;
    case 'laserDot':
      for (const u of e.upgrades) s.board![u.pos[0]]![u.pos[1]] = u.to;
      if (e.mult) s.mults.set(posKey(e.mult.pos), e.mult.value);
      for (const c of e.chips ?? []) s.chips.set(posKey(c.pos), c.level);
      break;
    case 'overclock': for (const c of e.chips) s.chips.set(posKey(c.pos), c.level); break;
    case 'winInfo': break; // the amounts are applied by setWin (one source of truth)
    case 'setWin':
      s.spinWin = e.amount; s.roundWin += e.amount;
      if (s.bonus) s.bonus.win += e.amount;
      break;
    case 'setTotalWin': break; // informative; roundWin already follows setWin
    case 'freeSpinTrigger': s.bonus = { kind: e.bonus, total: e.totalFs, played: 0, win: 0 }; s.chips.clear(); s.bonusEnded = null; break;
    case 'updateFreeSpin': if (s.bonus) { s.bonus.played = e.amount; s.bonus.total = e.total; } break;
    case 'freeSpinRetrigger': if (s.bonus) s.bonus.total = e.totalFs; break;
    case 'freeSpinEnd': s.bonusEnded = { kind: s.bonus?.kind ?? 'nineLives', win: e.amount }; s.bonus = null; s.chips.clear(); break;
    case 'updateGlobalMult': break;
    case 'wincap': s.capped = true; break;
    case 'finalWin': s.finished = true; s.roundWin = e.amount; break;
  }
}

/** "Spins restants : N" = total - played (9 spins: 8 during the first, 0 during the last) */
export const spinsLeft = (b: BonusState | null): number => (b ? Math.max(0, b.total - b.played) : 0);
