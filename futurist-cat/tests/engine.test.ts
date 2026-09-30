import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RoundPlayer, type Presenter } from '../src/controller/round-player';
import { applyEvent, initialState, spinsLeft, DuplicateEvent } from '../src/controller/state';
import { Fsm } from '../src/controller/fsm';
import { GameClock } from '../src/core/clock';
import { CancelToken } from '../src/core/cancel';
import { Book } from '../src/contract/events';

const load = (id: string) => Book.parse(JSON.parse(readFileSync(resolve(__dirname, `../public/fixtures/${id}.json`), 'utf8')).book);

function drive(clock: GameClock, until: () => boolean, maxSec = 600) {
  return (async () => {
    for (let i = 0; i < maxSec * 60 && !until(); i++) { clock.advance(1 / 60); await Promise.resolve(); await Promise.resolve(); }
  })();
}

describe('state', () => {
  it('applies each event once', () => {
    const b = load('F07');
    const s = initialState(b.mode);
    for (const e of b.events) applyEvent(s, e);
    expect(s.roundWin).toBe(b.payoutMultiplier);
    expect(() => applyEvent(s, b.events[1]!)).toThrow(DuplicateEvent);
  });
  it('spins left: 8 during the first of 9, 0 during the last', () => {
    expect(spinsLeft({ kind: 'nineLives', total: 9, played: 1, win: 0 })).toBe(8);
    expect(spinsLeft({ kind: 'nineLives', total: 9, played: 9, win: 0 })).toBe(0);
  });
  it('bonus state cleared at the end (chips, counters)', () => {
    const b = load('F09');
    const s = initialState(b.mode);
    let maxChips = 0;
    for (const e of b.events) { applyEvent(s, e); maxChips = Math.max(maxChips, s.chips.size); }
    expect(maxChips).toBeGreaterThan(3);
    expect(s.chips.size).toBe(0);
    expect(s.bonus).toBe(null);
    expect(s.bonusEnded?.win).toBeGreaterThan(0);
  });
});

describe('round player', () => {
  it('presents every event in order, skip reaches the exact end', async () => {
    const clock = new GameClock(true);
    const seen: number[] = [];
    const presenter: Presenter = {
      reveal: async (e, ctx) => { seen.push(e.index); await ctx.wait(1.5); },
      laserDot: async (e, ctx) => { seen.push(e.index); await ctx.wait(3); },
      winInfo: async (e, ctx) => { seen.push(e.index); await ctx.wait(2); },
      setWin: async (e) => { seen.push(e.index); },
      finalWin: async (e) => { seen.push(e.index); },
    };
    const book = load('F07');
    const p = new RoundPlayer(book, { clock, presenter, nextClick: () => new Promise(() => {}) });
    const token = new CancelToken();
    let result = '';
    p.play(token).then((r) => { result = r; });
    await drive(clock, () => seen.length >= 2);
    p.skip(); // skip the laser presentation
    await drive(clock, () => result !== '');
    expect(result).toBe('done');
    expect(seen).toEqual([0, 1, 2, 3, 4]);
    expect(p.state.roundWin).toBe(book.payoutMultiplier);
  });

  it('cancel stops the round and runs end(cancelled)', async () => {
    const clock = new GameClock(true);
    let ended: boolean | null = null;
    const presenter: Presenter = { reveal: async (_e, ctx) => { await ctx.wait(10); }, end: (_s, c) => { ended = c; } };
    const p = new RoundPlayer(load('F01'), { clock, presenter, nextClick: () => new Promise(() => {}) });
    const token = new CancelToken();
    let result = '';
    p.play(token).then((r) => { result = r; });
    await drive(clock, () => clock.time > 1);
    token.cancel('test');
    await drive(clock, () => result !== '', 5);
    expect(result).toBe('cancelled');
    expect(ended).toBe(true);
  });

  it('resume: events before startIndex are applied silently, never presented twice', async () => {
    const clock = new GameClock(true);
    const book = load('F21');
    const start = book.events.findIndex((e) => e.type === 'updateFreeSpin' && e.amount === 4);
    const seen: number[] = [];
    let restored = -1;
    const presenter: Presenter = {
      restore: async (s) => { restored = s.lastIndex; },
      reveal: async (e) => { seen.push(e.index); },
      updateFreeSpin: async (e) => { seen.push(e.index); },
    };
    const p = new RoundPlayer(book, { clock, presenter, startIndex: start, nextClick: () => Promise.resolve() });
    const r = await p.play(new CancelToken());
    expect(r).toBe('done');
    expect(restored).toBe(start - 1);
    expect(Math.min(...seen)).toBe(start);
    expect(p.state.roundWin).toBe(book.payoutMultiplier);
  });
});

describe('fsm', () => {
  it('runs cleanups when leaving a state and rejects illegal transitions', () => {
    const f = new Fsm();
    const log: string[] = [];
    f.go('loading'); f.onLeave(() => log.push('loading-cleanup'));
    f.go('welcome');
    expect(log).toEqual(['loading-cleanup']);
    expect(() => f.go('round')).toThrow();
  });
});
