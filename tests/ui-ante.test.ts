import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MathConfigSchema } from '../src/config/math';
import { anteFromConfig, anteNextCost, formatFactor } from '../src/ui/ante';

const cfg = MathConfigSchema.parse(JSON.parse(readFileSync('public/game-math-config.json', 'utf8')));

describe('ante panel values', () => {
  it('next spin cost: bet x ante cost when on, bet when off', () => {
    expect(anteNextCost(1_000_000, true, 1.5)).toBe(1_500_000);
    expect(anteNextCost(1_000_000, false, 1.5)).toBe(1_000_000);
    expect(anteNextCost(333_333, true, 1.5)).toBe(500_000);
  });

  it('reads the real factor and cost from the math config', () => {
    const v = anteFromConfig(cfg, 2_000_000, true);
    expect(v).toEqual({ factor: cfg.modes.ANTE?.bonusChanceFactor, cost: cfg.modes.ANTE?.cost, nextCost: Math.round(2_000_000 * (cfg.modes.ANTE?.cost ?? 1)) });
    expect(anteFromConfig(cfg, 2_000_000, false)?.nextCost).toBe(2_000_000);
    const { ANTE: _drop, ...rest } = cfg.modes;
    expect(anteFromConfig({ ...cfg, modes: rest }, 1, true)).toBeNull();
  });

  it('formats the factor for the locale', () => {
    expect(formatFactor(3, 'en-US')).toBe('3');
    expect(formatFactor(2.5, 'fr-FR')).toBe('2,5');
  });
});
