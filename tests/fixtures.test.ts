import { describe, expect, it } from 'vitest';
import cfg from '../public/game-math-config.json';
import type { Book, GameEvent } from '../src/contract/schema';
import { ALL } from '../tools/fixtures/scenarios';
import { validateBook } from '../tools/fixtures/validate';

type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>;

type Built = ReturnType<ReturnType<(typeof ALL)[number]>['build']>;

// un scénario qui lève une erreur (grille ou chute incohérente) est signalé sous son id, sans bloquer les autres
const runs = ALL.map((make) => {
  try {
    return { id: make.name, f: make().build() as Built | null, error: '' };
  } catch (e) {
    return { id: make.name, f: null, error: (e as Error).message };
  }
});
const fixtures = runs.flatMap((r) => (r.f ? [r.f] : []));
const books = fixtures.flatMap((f) => {
  const book = validateBook(f.book, { maxWinX: cfg.maxWinX }).book;
  return book ? [{ f, book }] : [];
});
const paytable = cfg.paytable as unknown as Record<string, Record<string, number>>;
const modes = cfg.modes as Record<string, { cost: number }>;
const SIZE = { stick: 2, bundle: 3, crate: 4 } as const;

const boardsOf = (book: Book) =>
  book.events.filter((e): e is Ev<'reveal'> | Ev<'tumbleBoard'> => e.type === 'reveal' || e.type === 'tumbleBoard');
const scatters = (e: Ev<'reveal'>) => e.board.flat().filter((s) => s.name === 'S').length;

describe('fixtures (books de démonstration)', () => {
  it.each(runs.map((r) => [r.id, r] as const))('%s : construit, validateur vert', (_id, r) => {
    expect(r.error).toBe('');
    expect(validateBook(r.f?.book, { maxWinX: cfg.maxWinX }).issues).toEqual([]);
  });

  it('ids F01..F28 présents, uniques, avec poids, tags et note', () => {
    const ids = fixtures.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i <= 28; i++) expect(ids).toContain(`F${String(i).padStart(2, '0')}`);
    for (const f of fixtures) {
      expect(f.weight, f.id).toBeGreaterThanOrEqual(1);
      expect(f.tags.length, f.id).toBeGreaterThan(0);
      expect(f.note, f.id).not.toBe('');
      expect(Object.keys(modes), f.id).toContain(f.mode);
    }
  });

  it('chaque connexion vaut paytable × ways (× multiplicateur)', () => {
    for (const { f, book } of books) {
      for (const e of book.events) {
        if (e.type !== 'winInfo') continue;
        for (const w of e.wins) {
          const base = (paytable[w.symbol]?.[String(w.reels)] ?? NaN) * w.ways;
          const where = `${f.id}#${e.index} ${w.symbol}×${w.reels}`;
          if (w.mult && w.mult > 1) {
            expect(w.baseWin, where).toBe(base);
            expect(w.win, where).toBe(base * w.mult);
          } else expect(w.win, where).toBe(base);
        }
      }
    }
  });

  it('coût des modes, déclenchements achetés et features', () => {
    for (const { f, book } of books) {
      const first = book.events[0] as Ev<'reveal'>;
      const triggers = book.events.filter((e): e is Ev<'freeSpinTrigger'> => e.type === 'freeSpinTrigger');
      const reveals = book.events.filter((e) => e.type === 'reveal');
      if (f.mode === 'BASE') expect(book.costMultiplier, f.id).toBeUndefined();
      else expect(book.costMultiplier, f.id).toBe(modes[f.mode]?.cost);
      if (f.mode === 'BONUS') {
        expect(scatters(first), f.id).toBe(3);
        expect(triggers.map((t) => [t.bonus, t.totalFs]), f.id).toEqual([['standard', cfg.freeSpins.standard.spins]]);
      }
      if (f.mode === 'SUPER') {
        expect(scatters(first), f.id).toBe(4);
        expect(triggers.map((t) => [t.bonus, t.totalFs]), f.id).toEqual([['super', cfg.freeSpins.super.spins]]);
      }
      if (f.mode === 'BLAST' || f.mode === 'MEGA') {
        expect(reveals.length, f.id).toBe(1);
        expect(triggers.length, f.id).toBe(0);
        const blasts = book.events.filter((e): e is Ev<'blast'> => e.type === 'blast');
        if (f.mode === 'BLAST') expect(blasts.length, f.id).toBeGreaterThanOrEqual(2);
        else expect(blasts.some((x) => x.tnt.kind === 'crate'), f.id).toBe(true);
      }
    }
  });

  it('explosions : zones disjointes par étape, super bonus sans bâton', () => {
    for (const { f, book } of books) {
      let bonus: 'standard' | 'super' | null = null;
      let step: Set<string> = new Set();
      for (const e of book.events) {
        if (e.type === 'freeSpinTrigger') bonus = e.bonus;
        if (e.type === 'freeSpinEnd') bonus = null;
        if (e.type === 'blast') {
          if (bonus === 'super') expect(e.tnt.kind, `${f.id}#${e.index}`).not.toBe('stick');
          expect(e.area.w, `${f.id}#${e.index}`).toBe(SIZE[e.tnt.kind]);
          for (let c = e.area.col; c < e.area.col + e.area.w; c++)
            for (let r = e.area.row; r < e.area.row + e.area.h; r++) {
              expect(step.has(`${c},${r}`), `${f.id}#${e.index} chevauchement en ${c},${r}`).toBe(false);
              step.add(`${c},${r}`);
            }
        } else if (e.type !== 'updateGlobalMult') step = new Set();
      }
    }
  });

  it('au plus un Scatter par rouleau, jamais de Scatter qui tombe, jamais 3+ sans (re)déclenchement', () => {
    for (const { f, book } of books) {
      const evs = book.events;
      for (const e of boardsOf(book)) {
        for (const col of e.board) expect(col.filter((s) => s.name === 'S').length, `${f.id}#${e.index}`).toBeLessThanOrEqual(1);
        if (e.type === 'tumbleBoard') expect(e.newSymbols.flat(), `${f.id}#${e.index}`).not.toContain('S');
        if (e.type === 'reveal' && scatters(e) >= 3) {
          const next = evs.slice(evs.indexOf(e) + 1).find((x) => x.type === 'freeSpinTrigger' || x.type === 'freeSpinRetrigger' || x.type === 'reveal');
          expect(next?.type, `${f.id}#${e.index} : ${scatters(e)} Scatters`).toMatch(/^freeSpin(Re)?[tT]rigger$/);
        }
      }
    }
  });

  it('chaque gain est suivi d’une chute (sauf plafond), le plafond est atteint réellement', () => {
    for (const { f, book } of books) {
      const evs = book.events;
      let paid = 0;
      evs.forEach((e, i) => {
        if (e.type === 'setWin') paid += e.amount;
        if (e.type === 'winInfo') {
          const next = evs.slice(i + 1).find((x) => x.type !== 'updateTumbleWin');
          expect(['tumbleBoard', 'wincap'], `${f.id}#${e.index}`).toContain(next?.type);
        }
        if (e.type === 'wincap') {
          const spin = [...evs.slice(0, i)].reverse().find((x): x is Ev<'updateTumbleWin'> => x.type === 'updateTumbleWin');
          expect(paid + (spin?.amount ?? 0), f.id).toBeGreaterThanOrEqual(e.amount);
          expect(evs[i + 1]?.type, f.id).toBe('finalWin');
        }
      });
    }
  });
});
