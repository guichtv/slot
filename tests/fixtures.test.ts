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
const SIZE = { stick: 2, bundle: 3, keg: 4 } as const;

const boardsOf = (book: Book) =>
  book.events.filter((e): e is Ev<'reveal'> | Ev<'tumbleBoard'> => e.type === 'reveal' || e.type === 'tumbleBoard');
const scatters = (e: Ev<'reveal'>) => e.board.flat().filter((s) => s.name === 'S').length;

type Zone = Ev<'blast'>['area'];
const cellsOf = (a: Zone) => {
  const out: string[] = [];
  for (let c = a.col; c < a.col + a.w; c++) for (let r = a.row; r < a.row + a.h; r++) out.push(`${c},${r}`);
  return out;
};
const inZone = (a: Zone, [c, r]: readonly [number, number]) => c >= a.col && c < a.col + a.w && r >= a.row && r < a.row + a.h;
const samePos = (a: readonly [number, number], b?: readonly [number, number]) => !!b && a[0] === b[0] && a[1] === b[1];

/**
 * Explosions et chaînes (docs/CONTRAT-EVENTS.md § 7), étape par étape (reveal ou tumbleBoard) :
 * - dans une chaîne, les zones se recouvrent librement : la charge prise (from) est par construction dans la zone
 *   de celle qui la déclenche ; les zones de charges reliées (wired) peuvent aussi se recouvrer ;
 * - lien k = rang dans la chaîne ; lien > 0 : from = charge précédente de la chaîne dont la zone contient la charge,
 *   ou wired (super bonus seulement) ; une charge n'explose qu'une fois ;
 * - carve = rectangle englobant des zones de sa chaîne, cells = w × h ;
 * - chaînes distinctes d'une étape : numérotées 0, 1, 2…, zones et géants disjoints ;
 * - super bonus : pas de bâton, une seule chaîne par étape (toutes les charges reliées).
 */
function blastIssues(book: Book): string[] {
  const issues: string[] = [];
  let bonus: 'standard' | 'super' | null = null;
  let carved = new Set<string>(); // géants déjà sculptés dans l'étape
  let closed = 0; // chaînes closes dans l'étape
  let open: { chain: number; links: Array<{ pos: readonly [number, number]; area: Zone }> } | null = null;
  for (const e of book.events) {
    const at = `#${e.index}`;
    if (e.type === 'freeSpinTrigger') bonus = e.bonus;
    if (e.type === 'freeSpinEnd') bonus = null;
    if (e.type === 'reveal' || e.type === 'tumbleBoard') {
      if (open) issues.push(`${at}: chaîne ${open.chain} sans carve`);
      carved = new Set();
      closed = 0;
      open = null;
    }
    if (e.type === 'blast') {
      const { pos, kind } = e.tnt;
      if (bonus === 'super' && kind === 'stick') issues.push(`${at}: bâton en super bonus`);
      if (e.area.w !== SIZE[kind] || e.area.h !== SIZE[kind]) issues.push(`${at}: zone ${e.area.w}x${e.area.h} pour ${kind}`);
      if (e.link === 0) {
        if (open) issues.push(`${at}: chaîne ${open.chain} non close avant la chaîne ${e.chain}`);
        if (e.chain !== closed) issues.push(`${at}: chaîne ${e.chain}, attendu ${closed}`);
        if (bonus === 'super' && closed > 0) issues.push(`${at}: plusieurs chaînes dans une étape du super bonus`);
        open = { chain: e.chain, links: [] };
      } else if (!open || open.chain !== e.chain || e.link !== open.links.length) {
        issues.push(`${at}: lien ${e.link} de la chaîne ${e.chain} hors séquence`);
      }
      const links = open?.links ?? [];
      if (e.link > 0) {
        if (e.wired) {
          if (bonus !== 'super') issues.push(`${at}: charge reliée (wired) hors super bonus`);
        } else {
          const src = links.find((l) => samePos(l.pos, e.from));
          if (!src) issues.push(`${at}: origine ${e.from} absente de la chaîne`);
          else if (!inZone(src.area, pos)) issues.push(`${at}: charge ${pos} hors de la zone de ${e.from}`);
        }
      }
      if (links.some((l) => samePos(l.pos, pos))) issues.push(`${at}: la charge ${pos} explose deux fois`);
      for (const k of cellsOf(e.area)) if (carved.has(k)) issues.push(`${at}: zone sur le géant d'une autre chaîne en ${k}`);
      links.push({ pos, area: e.area });
    }
    if (e.type === 'carve') {
      if (!open || open.chain !== e.chain || !open.links.length) {
        issues.push(`${at}: carve de la chaîne ${e.chain} sans explosion`);
        continue;
      }
      const zs = open.links.map((l) => l.area);
      const col = Math.min(...zs.map((z) => z.col));
      const row = Math.min(...zs.map((z) => z.row));
      const box = { col, row, w: Math.max(...zs.map((z) => z.col + z.w)) - col, h: Math.max(...zs.map((z) => z.row + z.h)) - row };
      if (JSON.stringify(e.area) !== JSON.stringify(box)) issues.push(`${at}: géant ${JSON.stringify(e.area)} ≠ rectangle englobant ${JSON.stringify(box)}`);
      if (e.cells !== e.area.w * e.area.h) issues.push(`${at}: cells ${e.cells} ≠ ${e.area.w}×${e.area.h}`);
      for (const k of cellsOf(e.area)) {
        if (carved.has(k)) issues.push(`${at}: géant sur celui d'une autre chaîne en ${k}`);
        carved.add(k);
      }
      closed++;
      open = null;
    }
  }
  if (open) issues.push(`chaîne ${(open as { chain: number }).chain} sans carve en fin de book`);
  return issues;
}

describe('fixtures (books de démonstration)', () => {
  it.each(runs.map((r) => [r.id, r] as const))('%s : construit, validateur vert', (_id, r) => {
    expect(r.error).toBe('');
    expect(validateBook(r.f?.book, { maxWinX: cfg.maxWinX }).issues).toEqual([]);
  });

  it('ids F01..F33 présents, uniques, avec poids, tags et note', () => {
    const ids = fixtures.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i <= 33; i++) expect(ids).toContain(`F${String(i).padStart(2, '0')}`);
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
        else expect(blasts.some((x) => x.tnt.kind === 'keg'), f.id).toBe(true);
      }
    }
  });

  it('explosions : chaînes valides, zones de chaînes distinctes disjointes, super bonus sans bâton et à chaîne unique', () => {
    for (const { f, book } of books) expect(blastIssues(book), f.id).toEqual([]);
  });

  it('le contrôle des explosions accepte les chaînes et rejette les cas invalides', () => {
    const mk = (events: object[]) => ({ id: 't', mode: 'BASE', payoutMultiplier: 0, events: events.map((e, index) => ({ index, ...e })) }) as unknown as Book;
    const reveal = { type: 'reveal' };
    const superFs = { type: 'freeSpinTrigger', bonus: 'super' };
    const blast = (chain: number, link: number, pos: [number, number], kind: keyof typeof SIZE, col: number, row: number, extra: object = {}) =>
      ({ type: 'blast', chain, link, tnt: { pos, kind }, area: { col, row, w: SIZE[kind], h: SIZE[kind] }, ...extra });
    const carve = (chain: number, col: number, row: number, w: number, h: number) => ({ type: 'carve', chain, area: { col, row, w, h }, giant: 'H1', cells: w * h });
    // chaîne par contact : zones qui se recouvrent, un géant sur le rectangle englobant
    const chained = [reveal, blast(0, 0, [0, 0], 'stick', 0, 0), blast(0, 1, [1, 1], 'bundle', 0, 1, { from: [0, 0] }), carve(0, 0, 0, 3, 4)];
    expect(blastIssues(mk(chained))).toEqual([]);
    // fil de mise à feu : super bonus uniquement
    const wired = [reveal, blast(0, 0, [0, 1], 'bundle', 0, 0), blast(0, 1, [4, 1], 'bundle', 2, 0, { wired: true }), carve(0, 0, 0, 5, 3)];
    expect(blastIssues(mk([superFs, ...wired]))).toEqual([]);
    expect(blastIssues(mk(wired)).join()).toMatch(/hors super bonus/);
    // deux chaînes distinctes dont les zones se recouvrent
    expect(blastIssues(mk([reveal, blast(0, 0, [0, 0], 'stick', 0, 0), carve(0, 0, 0, 2, 2), blast(1, 0, [2, 2], 'bundle', 1, 1), carve(1, 1, 1, 3, 3)])).join()).toMatch(/autre chaîne/);
    // lien dont la charge n'est pas dans la zone de son origine
    expect(blastIssues(mk([reveal, blast(0, 0, [0, 0], 'stick', 0, 0), blast(0, 1, [3, 3], 'bundle', 2, 2, { from: [0, 0] }), carve(0, 0, 0, 5, 5)])).join()).toMatch(/hors de la zone/);
    // géant différent du rectangle englobant, lien hors séquence, carve manquant
    expect(blastIssues(mk([...chained.slice(0, 3), carve(0, 0, 0, 3, 3)])).join()).toMatch(/rectangle englobant/);
    expect(blastIssues(mk([reveal, blast(0, 0, [0, 0], 'stick', 0, 0), blast(0, 2, [1, 1], 'bundle', 0, 1, { from: [0, 0] }), carve(0, 0, 0, 3, 4)])).join()).toMatch(/hors séquence/);
    expect(blastIssues(mk(chained.slice(0, 3))).join()).toMatch(/sans carve/);
    // super bonus : bâton interdit, une seule chaîne par étape
    expect(blastIssues(mk([superFs, reveal, blast(0, 0, [0, 0], 'stick', 0, 0), carve(0, 0, 0, 2, 2)])).join()).toMatch(/bâton/);
    expect(blastIssues(mk([superFs, reveal, blast(0, 0, [0, 0], 'bundle', 0, 0), carve(0, 0, 0, 3, 3), blast(1, 0, [4, 4], 'bundle', 2, 2), carve(1, 2, 2, 3, 3)])).join()).toMatch(/plusieurs chaînes/);
  });

  it('relances conformes à la table (2 Scatters : +2, 3 : +5, 4 et plus : +8 en super)', () => {
    for (const { f, book } of books) {
      let bonus: 'standard' | 'super' = 'standard';
      let board: Ev<'reveal'>['board'] = [];
      for (const e of book.events) {
        if (e.type === 'freeSpinTrigger') bonus = e.bonus;
        if (e.type === 'reveal' || e.type === 'tumbleBoard') board = e.board;
        if (e.type !== 'freeSpinRetrigger') continue;
        const n = board.flat().filter((s) => s.name === 'S').length;
        const table = cfg.freeSpins[bonus].retriggers as Record<string, number>;
        const top = Math.max(...Object.keys(table).map(Number));
        expect(e.positions.length, `${f.id}#${e.index}`).toBe(n);
        expect(e.extra, `${f.id}#${e.index} : ${n} Scatters en ${bonus}`).toBe(table[String(Math.min(n, top))]);
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

  it('chaque grille révélée est unique (aucune grille recopiée d’un book ou d’un tour à l’autre)', () => {
    const seen = new Map<string, string>();
    for (const { f, book } of books) {
      for (const e of book.events) {
        if (e.type !== 'reveal') continue;
        const key = e.board.map((c) => c.map((s) => s.name).join(' ')).join('|');
        expect(seen.get(key), `${f.id}#${e.index}`).toBeUndefined();
        seen.set(key, `${f.id}#${e.index}`);
      }
    }
  });

  it('les vitrines montrent ce qu’elles annoncent', () => {
    const byId = new Map(books.map((x) => [x.f.id, x.book]));
    const get = (id: string) => {
      const b = byId.get(id);
      expect(b, id).toBeDefined();
      return b as Book;
    };
    const evs = <T extends GameEvent['type']>(b: Book, t: T) => b.events.filter((e): e is Ev<T> => e.type === t);
    const cap = cfg.maxWinX * 100;
    // paliers de célébration (centièmes de mise : x10 = 1000)
    const tiers: Record<string, [number, number]> = {
      F20: [900, 999],
      F21: [1000, 1000],
      F22: [2500, 9999],
      F23: [10000, 49999],
      F24: [50000, 99999],
      F25: [100000, cap - 1],
    };
    for (const [id, [lo, hi]] of Object.entries(tiers)) {
      expect(get(id).payoutMultiplier, id).toBeGreaterThanOrEqual(lo);
      expect(get(id).payoutMultiplier, id).toBeLessThanOrEqual(hi);
    }
    expect(get('F01').payoutMultiplier).toBe(0);
    expect(get('F02').payoutMultiplier).toBeGreaterThan(0);
    expect(get('F02').payoutMultiplier).toBeLessThan(100);
    expect(evs(get('F03'), 'winInfo').some((w) => new Set(w.wins.map((x) => x.symbol)).size >= 2)).toBe(true);
    const premiums = ['F04', 'F05', 'F06', 'F07'].map((id) => evs(get(id), 'winInfo').flatMap((w) => w.wins));
    expect(premiums.map((ws) => ws.map((w) => w.symbol).find((s) => s.startsWith('H')))).toEqual(['H1', 'H2', 'H3', 'H4']);
    expect(premiums.flat().some((w) => w.reels === 5)).toBe(true);
    expect(evs(get('F08'), 'tumbleBoard').length).toBeGreaterThanOrEqual(3);
    expect(evs(get('F09'), 'blast').map((x) => [x.tnt.kind, x.area.w])).toEqual([['stick', 2]]);
    expect(evs(get('F10'), 'blast').map((x) => x.tnt.kind)).toEqual(['bundle']);
    expect(evs(get('F10'), 'carve')[0]?.giant).toMatch(/^H/);
    expect(get('F10').payoutMultiplier).toBeGreaterThanOrEqual(1000);
    // F11 : deux charges sur la grille révélée, puis une charge qui tombe pendant une chute et explose à l'étape suivante
    const f11 = get('F11').events;
    expect((f11[0] as Ev<'reveal'>).tnt.length).toBeGreaterThanOrEqual(2);
    const drop = f11.findIndex((e) => e.type === 'tumbleBoard' && e.tnt.length > 0);
    expect(drop).toBeGreaterThan(0);
    expect(f11[drop + 1]?.type).toBe('blast');
    expect(f11[drop + 2]?.type).toBe('carve');
    expect(evs(get('F12'), 'carve').some((x) => x.giant === 'W')).toBe(true);
    // F13 : anticipation ratée
    const f13 = get('F13');
    expect((f13.events[0] as Ev<'reveal'>).anticipation.some((a) => a > 0)).toBe(true);
    expect(scatters(f13.events[0] as Ev<'reveal'>)).toBe(2);
    expect(f13.payoutMultiplier).toBe(0);
    // F14 : anticipation réussie -> bonus standard 10 FS + relance +5 = 15, multiplicateur qui monte, dernier tour sans gain
    const f14 = get('F14');
    expect((f14.events[0] as Ev<'reveal'>).anticipation.some((a) => a > 0)).toBe(true);
    expect(evs(f14, 'freeSpinTrigger').map((t) => [t.bonus, t.totalFs])).toEqual([['standard', 10]]);
    expect(evs(f14, 'freeSpinRetrigger').map((t) => [t.extra, t.totalFs])).toEqual([[5, 15]]);
    expect(evs(f14, 'updateFreeSpin').map((u) => u.amount)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(evs(f14, 'updateFreeSpin').at(-1)?.total).toBe(15);
    expect(evs(f14, 'updateGlobalMult').length).toBeGreaterThanOrEqual(3);
    expect(evs(f14, 'setWin').at(-1)?.amount).toBe(0);
    // F15 : super bonus déclenché en base par 4 Scatters, 12 FS
    const f15 = get('F15');
    expect(scatters(f15.events[0] as Ev<'reveal'>)).toBeGreaterThanOrEqual(4);
    expect(evs(f15, 'updateFreeSpin').at(-1)).toMatchObject({ amount: 12, total: 12 });
    // F19 : caisse 4x4 ; F26 : plafond exact, suivi uniquement de finalWin ; F27 : x0,05
    expect(evs(get('F19'), 'blast').some((x) => x.tnt.kind === 'keg' && x.area.w === 4)).toBe(true);
    const f26 = get('F26').events;
    expect(f26.at(-2)).toMatchObject({ type: 'wincap', amount: cap });
    expect(get('F26').payoutMultiplier).toBe(cap);
    expect(get('F27').payoutMultiplier).toBe(5);
    expect(new Set(fixtures.filter((f) => f.mode === 'ANTE').map((f) => (f.book as Book).payoutMultiplier > 0))).toEqual(new Set([true, false]));
    // F31 : chaîne de 2 (le bâton prend le fagot dans sa zone), UN géant sur le rectangle englobant, gain de ways, chute
    const f31 = get('F31');
    const b31 = evs(f31, 'blast');
    expect(b31.map((x) => [x.chain, x.link, x.tnt.kind])).toEqual([[0, 0, 'stick'], [0, 1, 'bundle']]);
    expect(b31[1]?.from).toEqual(b31[0]?.tnt.pos);
    expect(evs(f31, 'carve')).toHaveLength(1);
    const c31 = evs(f31, 'carve')[0] as Ev<'carve'>;
    expect(c31.cells).toBeGreaterThan(Math.max(...b31.map((x) => x.area.w * x.area.h)));
    expect(evs(f31, 'winInfo')[0]?.wins.map((w) => w.symbol)).toEqual([c31.giant]);
    expect(evs(f31, 'tumbleBoard').length).toBeGreaterThanOrEqual(1);
    // F32 : chaîne de 3 bâton -> fagot -> baril, géant 5x5, gros gain
    const f32 = get('F32');
    const b32 = evs(f32, 'blast');
    expect(b32.map((x) => [x.link, x.tnt.kind])).toEqual([[0, 'stick'], [1, 'bundle'], [2, 'keg']]);
    expect(b32.slice(1).map((x) => x.from)).toEqual(b32.slice(0, 2).map((x) => x.tnt.pos));
    expect(evs(f32, 'carve').map((x) => x.area)).toEqual([{ col: 0, row: 0, w: 5, h: 5 }]);
    expect(f32.payoutMultiplier).toBeGreaterThanOrEqual(2500);
    // F33 : super bonus acheté, charges reliées en une seule explosion, Cornerstone +cases, relance, fin du bonus
    const f33 = get('F33');
    const wiredLinks = evs(f33, 'blast').filter((x) => x.wired);
    expect(wiredLinks.length).toBeGreaterThanOrEqual(1);
    expect(evs(f33, 'updateGlobalMult').map((m) => m.added)).toEqual(evs(f33, 'carve').map((c) => c.cells));
    expect(evs(f33, 'freeSpinRetrigger')).toHaveLength(1);
    const lastFs = evs(f33, 'updateFreeSpin').at(-1);
    expect(lastFs?.total).toBe(cfg.freeSpins.super.spins + (evs(f33, 'freeSpinRetrigger')[0]?.extra ?? 0));
    expect(lastFs?.amount).toBe(lastFs?.total);
    expect(evs(f33, 'freeSpinEnd').at(-1)?.amount).toBe(f33.payoutMultiplier);
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
