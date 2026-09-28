import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MathConfigSchema } from '../src/config/math';
import {
  formatPercent,
  formatTime,
  historyCost,
  historyWin,
  loadSettings,
  modeRtps,
  payAmount,
  paytableRows,
  retriggerTable,
  sanitizeSettings,
  saveSettings,
  SETTINGS_KEY,
  QUALITY_KEY,
  waysCount,
} from '../src/ui/menu';

const cfg = MathConfigSchema.parse(JSON.parse(readFileSync('public/game-math-config.json', 'utf8')));

describe('rules: pay table', () => {
  it('lists paying symbols from the config (WILD, highs, lows) without meta keys', () => {
    const rows = paytableRows(cfg);
    expect(rows.map((r) => r.id)).toEqual(['W', 'H1', 'H2', 'H3', 'H4', 'L1', 'L2', 'L3', 'L4']);
    const h1 = rows.find((r) => r.id === 'H1');
    expect(h1?.pays).toEqual([
      { n: 5, value: 500 },
      { n: 4, value: 150 },
      { n: 3, value: 50 },
    ]);
  });

  it('shows pays as money for the current bet: bet x value / 100', () => {
    expect(payAmount(1_000_000, 50)).toBe(500_000);
    expect(payAmount(1_000_000, 500)).toBe(5_000_000);
    expect(payAmount(100_000, 5)).toBe(5_000);
    expect(payAmount(1_000_000_000, 500)).toBe(5_000_000_000);
  });

  it('counts 3125 ways on 5x5', () => {
    expect(waysCount(5, 5)).toBe(3125);
  });

  it('builds retrigger tables from the math config only (last row is "or more")', () => {
    // table complète de la config livrée (2 → +2, 3 → +5 ; super : 4+ → +8)
    expect(retriggerTable(cfg, 'standard').map((x) => `${x.label}:${x.spins}`)).toEqual(['2:2', '3+:5']);
    expect(retriggerTable(cfg, 'super').map((x) => `${x.label}:${x.spins}`)).toEqual(['2:2', '3:5', '4+:8']);
    // une seule entrée `retrigger` : une seule ligne « N ou plus »
    const single = (k: 'standard' | 'super') => ({ ...cfg.freeSpins[k], retriggers: undefined });
    const cfg1 = { ...cfg, freeSpins: { standard: single('standard'), super: single('super') } };
    const r = cfg.freeSpins.standard.retrigger;
    expect(retriggerTable(cfg1, 'standard')).toEqual([{ scatters: r.scatters, label: `${r.scatters}+`, spins: r.spins }]);
    const tweaked = { ...cfg1, freeSpins: { ...cfg1.freeSpins, standard: { ...cfg1.freeSpins.standard, retrigger: { scatters: 3, spins: 6 } } } };
    expect(retriggerTable(tweaked, 'standard')).toEqual([{ scatters: 3, label: '3+', spins: 6 }]);
    // a full table, when the math config carries one, is shown row by row
    const full = { ...cfg, freeSpins: { ...cfg.freeSpins, super: { ...cfg.freeSpins.super, retriggers: { '2': 2, '3': 5, '4': 8 } } } };
    expect(retriggerTable(full, 'super').map((x) => `${x.label}:${x.spins}`)).toEqual(['2:2', '3:5', '4+:8']);
    // nothing configured: no row (never a value invented by the front-end)
    const none = { ...cfg1, freeSpins: { ...cfg1.freeSpins, standard: { ...cfg1.freeSpins.standard, retrigger: { scatters: 0, spins: 0 } } } };
    expect(retriggerTable(none, 'standard')).toEqual([]);
  });

  it('lists RTP per mode in a stable order and formats percentages', () => {
    expect(modeRtps(cfg).map((r) => r.mode)).toEqual(['BASE', 'ANTE', 'BONUS', 'SUPER', 'BLAST', 'MEGA']);
    expect(formatPercent(0.965, 'en-US')).toBe('96.50%');
    expect(formatPercent(0.9655, 'en-US')).toBe('96.55%');
  });
});

describe('history', () => {
  it('converts book payout (x100) to money and computes the debited amount', () => {
    expect(historyWin({ bet: 1_000_000, payout: 2550 })).toBe(25_500_000);
    expect(historyWin({ bet: 200_000, payout: 0 })).toBe(0);
    expect(historyCost({ bet: 1_000_000, mode: 'BONUS' }, cfg)).toBe(100_000_000);
    expect(historyCost({ bet: 1_000_000, mode: 'ANTE' }, cfg)).toBe(1_500_000);
    expect(historyCost({ bet: 1_000_000, mode: 'UNKNOWN' }, cfg)).toBe(1_000_000);
  });

  it('formats time (same day: hour only, otherwise date + hour)', () => {
    const now = new Date(2026, 8, 28, 15, 0);
    expect(formatTime(new Date(2026, 8, 28, 9, 5), 'en-GB', now)).toBe('09:05');
    expect(formatTime(new Date(2026, 8, 27, 9, 5).getTime(), 'en-GB', now)).toContain('27/09');
    expect(formatTime('not a date', 'en-GB', now)).toBe('');
  });
});

describe('settings persistence', () => {
  it('sanitizes stored values (clamped, typed, defaults)', () => {
    expect(sanitizeSettings(null, true)).toEqual({ master: 0.8, music: 0.7, effects: 0.9, turbo: 0, reducedMotion: true, quality: 'high' });
    expect(sanitizeSettings({ master: 3, music: -1, effects: 'x', turbo: 7, reducedMotion: 'yes', quality: 'ultra' }, false)).toEqual({
      master: 1,
      music: 0,
      effects: 0.9,
      turbo: 0,
      reducedMotion: false,
      quality: 'high',
    });
    expect(sanitizeSettings({ turbo: 2, quality: 'low', reducedMotion: false }, true)).toMatchObject({ turbo: 2, quality: 'low', reducedMotion: false });
  });

  it('round-trips through storage and survives broken or throwing storage', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const s = { master: 0.5, music: 0.25, effects: 1, turbo: 1 as const, reducedMotion: true, quality: 'low' as const };
    expect(saveSettings(storage, s)).toBe(true);
    expect(mem.get(QUALITY_KEY)).toBe('low');
    expect(loadSettings(storage, false)).toEqual(s);
    mem.set(SETTINGS_KEY, '{broken');
    expect(loadSettings(storage, false).master).toBe(0.8);
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadSettings(throwing, true).reducedMotion).toBe(true);
    expect(saveSettings(throwing, s)).toBe(false);
    expect(saveSettings(null, s)).toBe(false);
  });
});
