// Book contract v1 (see CONTRAT-EVENTS.md). The front never computes a result: it only reads these.
// Amounts inside books are integers in hundredths of the BASE bet (100 = x1).
import { z } from 'zod';
import { SYMBOLS, COLS, ROWS } from './symbols';

export const CONTRACT_VERSION = 1;

const sym = z.enum(SYMBOLS);
const pos = z.tuple([z.number().int().min(0).max(COLS - 1), z.number().int().min(0).max(ROWS - 1)]);
const amount = z.number().int().nonnegative();
const base = { index: z.number().int().nonnegative() };

export const RevealEvent = z.object({
  ...base, type: z.literal('reveal'),
  board: z.array(z.array(sym).length(ROWS)).length(COLS),
  gameType: z.enum(['basegame', 'freegame']),
  anticipation: z.array(z.number().int().nonnegative()).length(COLS).optional(),
  padding: z.object({ top: z.array(sym).length(COLS), bottom: z.array(sym).length(COLS) }).optional(),
});
export const FeatureStartEvent = z.object({ ...base, type: z.literal('featureStart'), feature: z.enum(['scan', 'doubleScan']), dots: z.number().int().min(1).max(2) });
const upgrade = z.object({ pos, from: sym, to: sym });
const chip = z.object({ pos, level: z.number().int().min(1).max(3) });
export const LaserDotEvent = z.object({
  ...base, type: z.literal('laserDot'),
  eye: z.enum(['left', 'right']),
  path: z.array(pos).min(3).max(8),
  upgrades: z.array(upgrade),
  mult: z.object({ pos, value: z.number().int().min(2).max(10) }).optional(),
  chips: z.array(chip).optional(),
});
export const OverclockEvent = z.object({ ...base, type: z.literal('overclock'), chips: z.array(chip).min(1) });
export const ChipUpgradeEvent = z.object({ ...base, type: z.literal('chipUpgrade'), upgrades: z.array(upgrade.extend({ level: z.number().int().min(1).max(3) })).min(1) });
export const Win = z.object({
  symbol: sym,
  kind: z.number().int().min(3).max(COLS),
  ways: z.number().int().positive(),
  win: amount,
  positions: z.array(pos).min(3),
  meta: z.object({ baseWin: amount, mult: z.number().int().min(1), multPositions: z.array(pos).optional() }),
});
export const WinInfoEvent = z.object({ ...base, type: z.literal('winInfo'), totalWin: amount, wins: z.array(Win).min(1) });
export const SetWinEvent = z.object({ ...base, type: z.literal('setWin'), amount, winLevel: z.number().int().nonnegative().optional() });
export const SetTotalWinEvent = z.object({ ...base, type: z.literal('setTotalWin'), amount });
export const FreeSpinTriggerEvent = z.object({ ...base, type: z.literal('freeSpinTrigger'), totalFs: z.number().int().positive(), positions: z.array(pos), bonus: z.enum(['nineLives', 'doubleGaze']) });
export const UpdateFreeSpinEvent = z.object({ ...base, type: z.literal('updateFreeSpin'), amount: z.number().int().positive(), total: z.number().int().positive() });
export const FreeSpinRetriggerEvent = z.object({ ...base, type: z.literal('freeSpinRetrigger'), totalFs: z.number().int().positive(), added: z.number().int().positive(), positions: z.array(pos) });
export const FreeSpinEndEvent = z.object({ ...base, type: z.literal('freeSpinEnd'), amount, winLevel: z.number().int().nonnegative().optional() });
export const UpdateGlobalMultEvent = z.object({ ...base, type: z.literal('updateGlobalMult'), globalMult: z.number().int().min(1) });
export const WincapEvent = z.object({ ...base, type: z.literal('wincap'), amount });
export const FinalWinEvent = z.object({ ...base, type: z.literal('finalWin'), amount });

export const BookEvent = z.discriminatedUnion('type', [
  RevealEvent, FeatureStartEvent, LaserDotEvent, OverclockEvent, ChipUpgradeEvent, WinInfoEvent, SetWinEvent, SetTotalWinEvent,
  FreeSpinTriggerEvent, UpdateFreeSpinEvent, FreeSpinRetriggerEvent, FreeSpinEndEvent, UpdateGlobalMultEvent, WincapEvent, FinalWinEvent,
]);
export const MODES = ['BASE', 'ANTE', 'SCAN', 'DOUBLE_SCAN', 'BONUS', 'SUPER'] as const;
export type ModeId = (typeof MODES)[number];
export const Book = z.object({
  id: z.number().int().nonnegative(),
  mode: z.enum(MODES),
  payoutMultiplier: amount,
  costMultiplier: z.number().positive().optional(),
  events: z.array(BookEvent).min(2),
});

export type BookEvent = z.infer<typeof BookEvent>;
export type Book = z.infer<typeof Book>;
export type RevealE = z.infer<typeof RevealEvent>;
export type LaserDotE = z.infer<typeof LaserDotEvent>;
export type WinInfoE = z.infer<typeof WinInfoEvent>;
export type WinE = z.infer<typeof Win>;
export type ChipUpgradeE = z.infer<typeof ChipUpgradeEvent>;
export type OverclockE = z.infer<typeof OverclockEvent>;
export type FreeSpinTriggerE = z.infer<typeof FreeSpinTriggerEvent>;
export type EventOf<T extends BookEvent['type']> = Extract<BookEvent, { type: T }>;
