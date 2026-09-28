import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MathConfigSchema } from '../src/config/math';
import { BuyFlow, bonusSpins, buyBlock, buyModes, buyPrice, quoteFor, type BuyQuote } from '../src/ui/buy';

const cfg = MathConfigSchema.parse(JSON.parse(readFileSync('public/game-math-config.json', 'utf8')));

describe('buy prices', () => {
  it('price = bet x mode cost, integer in base 1e6', () => {
    expect(buyPrice(1_000_000, 100)).toBe(100_000_000);
    expect(buyPrice(200_000, 1.5)).toBe(300_000);
    expect(buyPrice(333_333, 1.5)).toBe(500_000);
    expect(Number.isInteger(buyPrice(123_457, 0.37))).toBe(true);
    // 10-digit amounts stay exact
    expect(buyPrice(1_000_000_000, 350)).toBe(350_000_000_000);
  });

  it('reads costs from the math config and freezes a full quote', () => {
    expect(buyModes(cfg)).toEqual(['BONUS', 'SUPER', 'BLAST', 'MEGA']);
    const q = quoteFor(cfg, 'SUPER', 2_000_000, 'EUR');
    expect(q).toEqual({ mode: 'SUPER', bet: 2_000_000, cost: cfg.modes.SUPER?.cost, price: 2_000_000 * (cfg.modes.SUPER?.cost ?? 0), currency: 'EUR' });
    for (const m of buyModes(cfg)) expect(quoteFor(cfg, m, 1_000_000, 'USD').price).toBe(Math.round(1_000_000 * (cfg.modes[m]?.cost ?? 1)));
  });

  it('shows spin counts for bonuses only', () => {
    expect(bonusSpins(cfg, 'BONUS')).toBe(10);
    expect(bonusSpins(cfg, 'SUPER')).toBe(12);
    expect(bonusSpins(cfg, 'BLAST')).toBeNull();
    expect(bonusSpins(cfg, 'MEGA')).toBeNull();
  });

  it('blocks buying when ante is on (first) or balance is below the price', () => {
    expect(buyBlock(100, 1000, true)).toBe('ante');
    expect(buyBlock(1001, 1000, true)).toBe('ante');
    expect(buyBlock(1001, 1000, false)).toBe('balance');
    expect(buyBlock(1000, 1000, false)).toBeNull();
  });
});

describe('buy flow', () => {
  const quote = (mode: BuyQuote['mode'] = 'BONUS'): BuyQuote => ({ mode, bet: 1_000_000, cost: 100, price: 100_000_000, currency: 'EUR' });

  it('catalog -> select -> confirm -> cancel keeps the card selected', () => {
    const f = new BuyFlow();
    expect(f.open()).toBe(true);
    expect(f.review(quote())).toBe(false); // nothing selected yet
    f.select('BONUS');
    expect(f.review(quote('SUPER'))).toBe(false); // quote must match the selection
    expect(f.review(quote())).toBe(true);
    expect(f.step).toBe('confirm');
    expect(f.cancel()).toBe(true);
    expect(f.step).toBe('catalog');
    expect(f.selected).toBe('BONUS');
    expect(f.quote).toBeNull();
  });

  it('freezes the quote at confirmation time', () => {
    const f = new BuyFlow();
    f.open();
    f.select('MEGA');
    const q = quote('MEGA');
    f.review(q);
    q.price = 1;
    q.bet = 5;
    expect(f.quote?.price).toBe(100_000_000);
    expect(f.quote?.bet).toBe(1_000_000);
  });

  it('invokes the purchase once even on a double click', async () => {
    const f = new BuyFlow();
    f.open();
    f.select('BONUS');
    f.review(quote());
    let calls = 0;
    let release!: (v: boolean) => void;
    const run = () => {
      calls++;
      return new Promise<boolean>((r) => (release = r));
    };
    const a = f.confirm(run);
    const b = f.confirm(run);
    expect(f.step).toBe('pending');
    expect(f.close()).toBe(false); // no closing while the request is in flight
    release(true);
    expect(await b).toBe('ignored');
    expect(await a).toBe('done');
    expect(calls).toBe(1);
    expect(f.confirmCalls).toBe(1);
    expect(f.step).toBe('closed');
    expect(f.selected).toBeNull();
  });

  it('returns to a coherent catalog when the purchase is refused or throws', async () => {
    const f = new BuyFlow();
    f.open();
    f.select('SUPER');
    f.review(quote('SUPER'));
    expect(await f.confirm(async () => false)).toBe('refused');
    expect(f.step).toBe('catalog');
    expect(f.selected).toBe('SUPER');
    expect(f.quote).toBeNull();
    f.review(quote('SUPER'));
    expect(
      await f.confirm(async () => {
        throw new Error('network');
      }),
    ).toBe('refused');
    expect(f.step).toBe('catalog');
    // a later confirmation works again
    f.review(quote('SUPER'));
    expect(await f.confirm(async () => true)).toBe('done');
  });

  it('closing returns to the game without purchase', () => {
    const f = new BuyFlow();
    f.open();
    f.select('BLAST');
    f.review(quote('BLAST'));
    expect(f.close()).toBe(true);
    expect(f.step).toBe('closed');
    expect(f.selected).toBeNull();
    expect(f.confirmCalls).toBe(0);
  });
});
