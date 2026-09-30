import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateBook } from '../src/contract/validate';
import { bookToMicros, formatMoney, displayDigits, costMicros } from '../src/contract/money';
import { GameConfig, tierFor } from '../src/config/game-config';

const dir = resolve(__dirname, '../public/fixtures');
const load = (id: string) => JSON.parse(readFileSync(resolve(dir, `${id}.json`), 'utf8')).book;
const cfg = GameConfig.parse(JSON.parse(readFileSync(resolve(__dirname, '../public/game-math-config.json'), 'utf8')));

describe('fixtures', () => {
  it('all fixtures are valid', () => {
    for (const f of readdirSync(dir).filter((x) => /^F\d+\.json$/.test(x))) {
      const v = validateBook(JSON.parse(readFileSync(resolve(dir, f), 'utf8')).book, { maxWinX: cfg.maxWinX });
      expect(v.issues, f).toEqual([]);
    }
  });
});

describe('validator reports (never repairs)', () => {
  const mutate = (id: string, fn: (b: any) => void) => { const b = structuredClone(load(id)); fn(b); return validateBook(b, { maxWinX: cfg.maxWinX }); };
  it('dot on a Wild', () => {
    const v = mutate('F07', (b) => { b.events[0].board[0][0] = 'W'; b.events[1].upgrades[0].from = 'W'; });
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => /touche W/.test(i.message))).toBe(true);
  });
  it('upgrade skipping a step', () => {
    const v = mutate('F07', (b) => { b.events[1].upgrades[0].to = 'H3'; });
    expect(v.issues.some((i) => /un cran/.test(i.message))).toBe(true);
  });
  it('multiplier not on the landing cell', () => {
    const v = mutate('F07', (b) => { b.events[1].mult.pos = [0, 0]; });
    expect(v.issues.some((i) => /case d arrivee/.test(i.message))).toBe(true);
  });
  it('winInfo total mismatch', () => {
    const v = mutate('F03', (b) => { const wi = b.events.find((e: any) => e.type === 'winInfo'); wi.totalWin += 1; });
    expect(v.ok).toBe(false);
  });
  it('undeclared winning way', () => {
    const v = mutate('F03', (b) => { const wi = b.events.find((e: any) => e.type === 'winInfo'); const w = wi.wins.pop(); wi.totalWin -= w.win; });
    expect(v.issues.some((i) => /non declaree/.test(i.message))).toBe(true);
  });
  it('free spin counter jump', () => {
    const v = mutate('F21', (b) => { const u = b.events.filter((e: any) => e.type === 'updateFreeSpin'); u[2].amount = 5; });
    expect(v.issues.some((i) => /spin 5 attendu 3/.test(i.message))).toBe(true);
  });
  it('chip level skipping', () => {
    const v = mutate('F09', (b) => { const d = b.events.find((e: any) => e.type === 'laserDot' && e.chips); d.chips[0].level = 3; });
    expect(v.ok).toBe(false);
  });
  it('finalWin mismatch', () => {
    const v = mutate('F02', (b) => { b.payoutMultiplier += 5; });
    expect(v.issues.some((i) => /payoutMultiplier/.test(i.message))).toBe(true);
  });
});

describe('money', () => {
  it('book hundredths x bet', () => {
    expect(bookToMicros(100, 1_000_000)).toBe(1_000_000);
    expect(bookToMicros(5, 100_000)).toBe(5_000); // 0.05x at 0.10 = 0.005
    expect(bookToMicros(2_500_000, 100_000_000)).toBe(2_500_000_000_000);
    expect(bookToMicros(2_500_000, 1_000_000_000)).toBe(25_000_000_000_000); // BigInt path
  });
  it('cost multiplier applied once', () => { expect(costMicros(1_000_000, 1.25)).toBe(1_250_000); });
  it('sub-cent never shows 0.00', () => {
    expect(displayDigits(5_000, 'EUR')).toBe(3);
    expect(formatMoney(5_000, { currency: 'EUR', locale: 'fr-FR' })).toMatch(/0,005/);
    expect(formatMoney(0, { currency: 'EUR', locale: 'fr-FR' })).toMatch(/0,00/);
  });
  it('social coins: no $ in front of SC/GC', () => {
    const s = formatMoney(1_500_000, { currency: 'SC', locale: 'en-US' });
    expect(s).toBe('1.50 SC');
    expect(formatMoney(1_500_000, { currency: 'GC', locale: 'en-US' })).not.toMatch(/\$/);
  });
  it('10-digit amounts', () => {
    expect(formatMoney(1_234_567_890_120_000, { currency: 'EUR', locale: 'fr-FR' }).replace(/\s/g, ' ')).toMatch(/1 234 567 890,12/);
  });
});

describe('tiers', () => {
  it('threshold included, spin win only', () => {
    expect(tierFor(999, cfg)).toBe(null);
    expect(tierFor(1000, cfg)).toBe('big');
    expect(tierFor(2500, cfg)).toBe('super');
    expect(tierFor(50000, cfg)).toBe('cyber');
  });
});
