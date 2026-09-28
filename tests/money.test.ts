import { describe, expect, it } from 'vitest';
import { bookToMoney, formatMoney, setMoneyFormat } from '../src/core/money';

describe('money', () => {
  it('converts book amounts (100 = x1) to money (1e6 base) with integers', () => {
    expect(bookToMoney(100, 1_000_000)).toBe(1_000_000);
    expect(bookToMoney(2_500_000, 1_000_000)).toBe(25_000_000_000);
    expect(bookToMoney(1, 100_000)).toBe(1_000);
    expect(bookToMoney(33, 300_000)).toBe(99_000);
    // gros montants : pas de perte de précision
    expect(bookToMoney(2_500_000, 1_000_000_000)).toBe(25_000_000_000_000);
  });
  it('never shows a sub-cent as 0.00', () => {
    setMoneyFormat({ currency: 'EUR', locale: 'en-US' });
    expect(formatMoney(4_000)).toContain('0.004');
    expect(formatMoney(0)).toContain('0.00');
    expect(formatMoney(1_234_567_890_000)).toContain('1,234,567.89');
  });
  it('formats social currencies without a dollar sign', () => {
    setMoneyFormat({ currency: 'XSC', locale: 'en-US' });
    expect(formatMoney(12_500_000)).toBe('12.50 SC');
    setMoneyFormat({ currency: 'XGC', locale: 'en-US' });
    expect(formatMoney(12_500_000)).toBe('12.50 GC');
    setMoneyFormat({ currency: 'XEC', locale: 'en-US' });
    expect(formatMoney(1_000_000)).not.toContain('$');
  });
});
