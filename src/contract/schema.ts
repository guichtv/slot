import { z } from 'zod';

/**
 * Contrat de données = book Stake (voir docs/CONTRAT-EVENTS.md).
 * - Coordonnées [colonne, ligne], origine en haut à gauche, index 0. board[colonne][ligne].
 * - Montants : entiers, centièmes de la mise de base (100 = ×1).
 * - Le front ne déduit, ne recalcule et ne corrige jamais un gain : il valide la forme et la cohérence déclarée.
 */
export const CONTRACT_VERSION = '1.0.0';
export const COLS = 5;
export const ROWS = 5;

export const SYMBOLS = ['L1', 'L2', 'L3', 'L4', 'H1', 'H2', 'H3', 'H4', 'W', 'S', 'T'] as const;
export type SymbolName = (typeof SYMBOLS)[number];
export const PAYING: SymbolName[] = ['L1', 'L2', 'L3', 'L4', 'H1', 'H2', 'H3', 'H4', 'W'];

const Sym = z.object({ name: z.enum(SYMBOLS) });
const Amount = z.number().int().nonnegative();
const Pos = z.tuple([z.number().int().min(0).max(COLS - 1), z.number().int().min(0).max(ROWS - 1)]);
export type Pos = z.infer<typeof Pos>;

const Board = z
  .array(z.array(Sym).length(ROWS))
  .length(COLS);
export type Board = z.infer<typeof Board>;

const Area = z.object({
  col: z.number().int().min(0),
  row: z.number().int().min(0),
  w: z.number().int().min(2).max(COLS),
  h: z.number().int().min(2).max(ROWS),
});
export type Area = z.infer<typeof Area>;

export const TntKind = z.enum(['stick', 'bundle', 'crate']);
export type TntKind = z.infer<typeof TntKind>;

const base = { index: z.number().int().nonnegative() };

export const RevealEv = z.object({
  ...base,
  type: z.literal('reveal'),
  board: Board,
  /** symboles décoratifs juste au-dessus/au-dessous de la fenêtre, par colonne (facultatif) */
  padding: z.object({ top: z.array(z.enum(SYMBOLS)).length(COLS), bottom: z.array(z.enum(SYMBOLS)).length(COLS) }).optional(),
  paddingPositions: z.array(z.number().int()).optional(),
  /** anticipation par rouleau : 0 = arrêt normal, n > 0 = n-ième rouleau ralenti */
  anticipation: z.array(z.number().int().nonnegative()).length(COLS),
  gameType: z.enum(['basegame', 'freegame']),
  /** type de TNT pour chaque case T du board, dans l'ordre de lecture (colonne puis ligne) */
  tnt: z.array(z.object({ pos: Pos, kind: TntKind })).default([]),
});

/** Une charge explose : la zone est dégagée puis sculptée en UN symbole géant qui la remplit. */
export const BlastEv = z.object({
  ...base,
  type: z.literal('blast'),
  tnt: z.object({ pos: Pos, kind: TntKind }),
  area: Area,
  giant: z.enum(['L1', 'L2', 'L3', 'L4', 'H1', 'H2', 'H3', 'H4', 'W']),
});

export const WinLine = z.object({
  symbol: z.enum(['L1', 'L2', 'L3', 'L4', 'H1', 'H2', 'H3', 'H4', 'W']),
  kind: z.literal('ways'),
  /** nombre de rouleaux consécutifs depuis la gauche */
  reels: z.number().int().min(3).max(COLS),
  ways: z.number().int().positive(),
  /** gain final de la connexion (multiplicateur compris) */
  win: Amount,
  /** gain avant multiplicateur (si mult > 1) */
  baseWin: Amount.optional(),
  mult: z.number().int().positive().optional(),
  positions: z.array(Pos).min(3),
});
export type WinLine = z.infer<typeof WinLine>;

export const WinInfoEv = z.object({
  ...base,
  type: z.literal('winInfo'),
  totalWin: Amount,
  wins: z.array(WinLine).min(1),
});

export const TumbleEv = z.object({
  ...base,
  type: z.literal('tumbleBoard'),
  /** cases retirées (gagnantes) */
  removed: z.array(Pos).min(1),
  /** nouveaux symboles par colonne, du haut vers le bas, entrant au-dessus de la colonne */
  newSymbols: z.array(z.array(z.enum(SYMBOLS))).length(COLS),
  /** grille résultante complète (contrôle de cohérence) */
  board: Board,
  tnt: z.array(z.object({ pos: Pos, kind: TntKind })).default([]),
});

export const TumbleWinEv = z.object({ ...base, type: z.literal('updateTumbleWin'), amount: Amount });
export const GlobalMultEv = z.object({ ...base, type: z.literal('updateGlobalMult'), globalMult: z.number().int().min(1), cause: z.enum(['blast', 'start']).default('blast') });
export const SetWinEv = z.object({ ...base, type: z.literal('setWin'), amount: Amount });
export const SetTotalWinEv = z.object({ ...base, type: z.literal('setTotalWin'), amount: Amount });
export const FsTriggerEv = z.object({
  ...base,
  type: z.literal('freeSpinTrigger'),
  bonus: z.enum(['standard', 'super']),
  totalFs: z.number().int().positive(),
  positions: z.array(Pos).min(3),
});
export const FsRetriggerEv = z.object({
  ...base,
  type: z.literal('freeSpinRetrigger'),
  extra: z.number().int().positive(),
  totalFs: z.number().int().positive(),
  positions: z.array(Pos).min(3),
});
export const FsUpdateEv = z.object({ ...base, type: z.literal('updateFreeSpin'), amount: z.number().int().positive(), total: z.number().int().positive() });
export const FsEndEv = z.object({ ...base, type: z.literal('freeSpinEnd'), amount: Amount });
export const WincapEv = z.object({ ...base, type: z.literal('wincap'), amount: Amount });
export const FinalWinEv = z.object({ ...base, type: z.literal('finalWin'), amount: Amount });

export const GameEvent = z.discriminatedUnion('type', [
  RevealEv,
  BlastEv,
  WinInfoEv,
  TumbleEv,
  TumbleWinEv,
  GlobalMultEv,
  SetWinEv,
  SetTotalWinEv,
  FsTriggerEv,
  FsRetriggerEv,
  FsUpdateEv,
  FsEndEv,
  WincapEv,
  FinalWinEv,
]);
export type GameEvent = z.infer<typeof GameEvent>;
export type EventOf<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>;

export const BookSchema = z.object({
  id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  mode: z.string(),
  payoutMultiplier: Amount,
  costMultiplier: z.number().positive().optional(),
  events: z.array(GameEvent).min(1),
});
export type Book = z.infer<typeof BookSchema>;

export class ContractError extends Error {
  constructor(message: string, readonly issues: string[] = []) {
    super(message);
    this.name = 'ContractError';
  }
}

/** Validation de forme + cohérence déclarée (jamais une correction). */
export function parseBook(raw: unknown): Book {
  const r = BookSchema.safeParse(raw);
  if (!r.success) {
    throw new ContractError('book invalide', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const issues = checkBook(r.data);
  if (issues.length) throw new ContractError('book incohérent', issues);
  return r.data;
}

/** Contrôles de cohérence des totaux déclarés et de l'ordre (aucun calcul de gain). */
export function checkBook(b: Book): string[] {
  const issues: string[] = [];
  let last = -1;
  let fsTotal = 0;
  let inFs = false;
  let lastFs = 0;
  for (const e of b.events) {
    if (e.index <= last) issues.push(`index non croissant ${e.index}`);
    last = e.index;
    if (e.type === 'winInfo') {
      const sum = e.wins.reduce((s, w) => s + w.win, 0);
      if (sum !== e.totalWin) issues.push(`winInfo#${e.index}: totalWin ${e.totalWin} ≠ somme ${sum}`);
      for (const w of e.wins) {
        if (w.mult !== undefined && w.mult > 1 && w.baseWin === undefined) issues.push(`winInfo#${e.index}: baseWin manquant pour mult ${w.mult}`);
      }
    }
    if (e.type === 'blast') {
      const a = e.area;
      if (a.col + a.w > COLS || a.row + a.h > ROWS) issues.push(`blast#${e.index}: zone hors grille`);
      const [tc, tr] = e.tnt.pos;
      if (tc < a.col || tc >= a.col + a.w || tr < a.row || tr >= a.row + a.h) issues.push(`blast#${e.index}: la TNT n'est pas dans sa zone`);
    }
    if (e.type === 'freeSpinTrigger') {
      inFs = true;
      fsTotal = e.totalFs;
      lastFs = 0;
    }
    if (e.type === 'freeSpinRetrigger') {
      if (!inFs) issues.push(`retrigger#${e.index} hors bonus`);
      if (e.totalFs !== fsTotal + e.extra) issues.push(`retrigger#${e.index}: total ${e.totalFs} ≠ ${fsTotal}+${e.extra}`);
      fsTotal = e.totalFs;
    }
    if (e.type === 'updateFreeSpin') {
      if (!inFs) issues.push(`updateFreeSpin#${e.index} hors bonus`);
      if (e.amount !== lastFs + 1) issues.push(`updateFreeSpin#${e.index}: tour ${e.amount} après ${lastFs}`);
      if (e.total !== fsTotal) issues.push(`updateFreeSpin#${e.index}: total ${e.total} ≠ ${fsTotal}`);
      lastFs = e.amount;
    }
    if (e.type === 'freeSpinEnd') {
      if (lastFs !== fsTotal) issues.push(`freeSpinEnd: ${lastFs}/${fsTotal} tours joués`);
      inFs = false;
    }
  }
  const fin = b.events.filter((e) => e.type === 'finalWin');
  if (fin.length !== 1 || b.events[b.events.length - 1]?.type !== 'finalWin') issues.push('finalWin doit être unique et en dernier');
  else if ((fin[0] as EventOf<'finalWin'>).amount !== b.payoutMultiplier) issues.push(`finalWin ${(fin[0] as EventOf<'finalWin'>).amount} ≠ payoutMultiplier ${b.payoutMultiplier}`);
  if (b.events[0]?.type !== 'reveal') issues.push('le premier événement doit être reveal');
  return issues;
}
