// game-math-config.json: paytable, mode prices, Ante factor, thresholds, RTP per mode (for the
// rules page and prices). Read-only for the front: it never computes a result from it.
import { z } from 'zod';
import { MODES } from '../contract/events';

const pays = z.tuple([z.number().nonnegative(), z.number().nonnegative(), z.number().nonnegative()]);
export const GameConfig = z.object({
  provisional: z.boolean(),
  contractVersion: z.literal(1),
  gameId: z.string(),
  ways: z.number().int().positive(),
  maxWinX: z.number().positive(),
  wildReels: z.array(z.number().int().min(0).max(4)),
  paytable: z.object({ L1: pays, L2: pays, L3: pays, L4: pays, H1: pays, H2: pays, H3: pays, H4: pays, W: pays }),
  modes: z.record(z.enum(MODES), z.object({
    cost: z.number().positive(),
    rtp: z.number().min(0).max(100),
    feature: z.boolean(),
    dots: z.number().int().optional(),
    spins: z.number().int().optional(),
    bonus: z.enum(['nineLives', 'doubleGaze']).optional(),
    scatterChanceX: z.number().optional(),
  })),
  bonus: z.object({
    nineLives: z.object({ spins: z.number().int().positive(), scatters: z.number().int().positive(), dotsPerSpin: z.number().int().positive() }),
    doubleGaze: z.object({ spins: z.number().int().positive(), scatters: z.number().int().positive(), dotsPerSpin: z.number().int().positive(), startChipsMin: z.number().int(), startChipsMax: z.number().int() }),
    retrigger: z.record(z.string(), z.number().int().positive()),
  }),
  laser: z.object({ pathMin: z.number().int(), pathMax: z.number().int(), multMin: z.number().int(), multMax: z.number().int(), chipMax: z.number().int(), multCombine: z.enum(['multiply', 'add']) }),
  winTiers: z.array(z.object({ id: z.enum(['big', 'super', 'mega', 'epic', 'cyber']), x: z.number().positive() })).min(1),
  localBetLadder: z.array(z.number().positive()).min(2),
  defaultBet: z.number().positive(),
});
export type GameConfig = z.infer<typeof GameConfig>;
export type TierId = GameConfig['winTiers'][number]['id'] | 'max';

export async function loadGameConfig(url = './game-math-config.json'): Promise<GameConfig> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`config ${res.status}`);
  return GameConfig.parse(await res.json());
}

/** tier from the SPIN win and the BASE bet (never the bonus total, never the buy price). Threshold included. */
export function tierFor(spinWinHundredths: number, cfg: GameConfig): GameConfig['winTiers'][number]['id'] | null {
  const x = spinWinHundredths / 100;
  let t: GameConfig['winTiers'][number]['id'] | null = null;
  for (const tier of [...cfg.winTiers].sort((a, b) => a.x - b.x)) if (x >= tier.x) t = tier.id;
  return t;
}
