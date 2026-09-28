import { describe, expect, it } from 'vitest';
import { socialize, socialViolations } from '../src/i18n/social';

describe('social dictionary', () => {
  it('replaces long expressions before single words, keeping case', () => {
    expect(socialize('Place your bets')).toBe('Come and play');
    expect(socialize('BUY BONUS')).toBe('GET BONUS');
    expect(socialize('Total bet')).toBe('Total play');
    expect(socialize('Malfunction voids all pays and plays.')).toBe('Malfunction voids all wins and plays.');
    expect(socialize('The bonus was bought')).toBe('The bonus was instantly triggered');
  });
  it('does not touch words containing forbidden fragments', () => {
    expect(socialize('Alphabet payload')).toBe('Alphabet payload');
  });
  it('leaves no violation', () => {
    const s = socialize('Bet 10, buy the feature at the cost of 100x your bet. Wins are paid out.');
    expect(socialViolations(s)).toEqual([]);
  });
});
