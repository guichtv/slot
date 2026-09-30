export const SYMBOLS = ['L1', 'L2', 'L3', 'L4', 'H1', 'H2', 'H3', 'H4', 'W', 'S'] as const;
export type SymbolId = (typeof SYMBOLS)[number];
export const LOWS: readonly SymbolId[] = ['L1', 'L2', 'L3', 'L4'];
export const PREMIUMS: readonly SymbolId[] = ['H1', 'H2', 'H3', 'H4'];
/** overclock ladder: each laser visit moves one step up; H4 stays */
export const LADDER: readonly SymbolId[] = ['L1', 'L2', 'L3', 'L4', 'H1', 'H2', 'H3', 'H4'];
export const COLS = 5;
export const ROWS = 4;

export const isSpecial = (s: SymbolId): boolean => s === 'W' || s === 'S';
export const isPremium = (s: SymbolId): boolean => PREMIUMS.includes(s);
export function stepUp(s: SymbolId, steps = 1): SymbolId {
  const i = LADDER.indexOf(s);
  if (i < 0) return s;
  return LADDER[Math.min(LADDER.length - 1, i + steps)]!;
}
export type Pos = readonly [number, number];
export const posKey = (p: Pos): string => `${p[0]},${p[1]}`;
