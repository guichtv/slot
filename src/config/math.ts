import { z } from 'zod';

/**
 * Valeurs de règles fournies par les maths (public/game-math-config.json).
 * Tant que provisional=true : jamais présentées comme validées, et le build Stake est bloqué (tools/check-release.mjs).
 */
const Mode = z.object({
  cost: z.number().positive(),
  rtp: z.number().min(0).max(1),
  kind: z.enum(['base', 'ante', 'bonus', 'feature']),
  bonusChanceFactor: z.number().positive().optional(),
  bonus: z.enum(['standard', 'super']).optional(),
  spins: z.number().int().positive().optional(),
  feature: z.string().optional(),
});

export const MathConfigSchema = z.object({
  provisional: z.boolean(),
  contractVersion: z.string(),
  game: z.string(),
  maxWinX: z.number().positive(),
  celebrationTiersX: z.array(z.number().positive()).min(1),
  modes: z.record(Mode),
  freeSpins: z.object({
    standard: z.object({ scatters: z.number().int(), spins: z.number().int(), retrigger: z.object({ scatters: z.number().int(), spins: z.number().int() }) }),
    super: z.object({ scatters: z.number().int(), spins: z.number().int(), retrigger: z.object({ scatters: z.number().int(), spins: z.number().int() }) }),
  }),
  paytable: z.record(z.union([z.string(), z.record(z.number())])),
  tnt: z.record(z.object({ w: z.number().int(), h: z.number().int() })),
});
export type MathConfig = z.infer<typeof MathConfigSchema>;
export type ModeId = string;

let cfg: MathConfig | null = null;

export async function loadMathConfig(): Promise<MathConfig> {
  const res = await fetch('game-math-config.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`game-math-config ${res.status}`);
  cfg = MathConfigSchema.parse(await res.json());
  return cfg;
}

export function setMathConfig(c: MathConfig): void {
  cfg = c;
}

export function math(): MathConfig {
  if (!cfg) throw new Error('game-math-config non chargé');
  return cfg;
}

export function modeCost(mode: string): number {
  return math().modes[mode]?.cost ?? 1;
}

export function payFor(symbol: string, reels: number): number | null {
  const row = math().paytable[symbol];
  if (!row || typeof row === 'string') return null;
  return row[String(reels)] ?? null;
}
