// Builds the local fixtures (public/fixtures/*.json + playlist.json) from hand-designed boards.
//   npx tsx tools/fixtures/build.ts
// Each fixture states its intent (expect); the build fails if the authored book misses it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameConfig, tierFor } from '../../src/config/game-config';
import { validateBook } from '../../src/contract/validate';
import { COLS, ROWS, posKey, isSpecial, type SymbolId, type Pos } from '../../src/contract/symbols';
import type { Book } from '../../src/contract/events';
import { BookBuilder, grid, rng, preview, evaluate, type Board, type DotSpec } from './author';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cfg = GameConfig.parse(JSON.parse(readFileSync(resolve(ROOT, 'public/game-math-config.json'), 'utf8')));
const OUT = resolve(ROOT, 'public/fixtures');
mkdirSync(OUT, { recursive: true });

interface Fixture { id: string; title: string; book: Book; weight: number; modes: Book['mode'][]; tags: string[] }
const fixtures: Fixture[] = [];
let nextId = 1;
function add(id: string, title: string, weight: number, modes: Book['mode'][], tags: string[], make: (b: BookBuilder) => void, mode: Book['mode'] = modes[0]!): Fixture {
  const b = new BookBuilder(nextId++, mode, cfg);
  make(b);
  const book = b.build();
  const f = { id, title, book, weight, modes, tags };
  fixtures.push(f);
  return f;
}
const intentErrors: string[] = [];
const expectRange = (f: Fixture, minX: number, maxX: number) => {
  const x = f.book.payoutMultiplier / 100;
  if (x < minX || x > maxX) intentErrors.push(`${f.id} ${f.title}: x${x} hors [${minX}, ${maxX}] ; gains ${JSON.stringify(f.book.events.filter((e) => e.type === 'winInfo').flatMap((e) => (e as { wins: { symbol: string; kind: number; ways: number; win: number; meta: { mult: number } }[] }).wins.map((w) => `${w.symbol}${w.kind}x${w.ways}w=${w.win}(m${w.meta.mult})`)))}`);
};
const spinWinsOf = (f: Fixture) => f.book.events.filter((e) => e.type === 'setWin').map((e) => (e as { amount: number }).amount);

// ---------- random helpers (bonus filler) ----------
const LOW_W: [SymbolId, number][] = [['L1', 10], ['L2', 10], ['L3', 9], ['L4', 8], ['H1', 5], ['H2', 4], ['H3', 3], ['H4', 2]];
function pick(r: () => number, table: [SymbolId, number][]): SymbolId {
  const tot = table.reduce((a, [, w]) => a + w, 0); let x = r() * tot;
  for (const [s, w] of table) { x -= w; if (x < 0) return s; }
  return table[0]![0];
}
function randomBoard(r: () => number, o: { scatters?: number; wilds?: number } = {}): Board {
  const b: Board = Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => pick(r, LOW_W)));
  const cols = [0, 1, 2, 3, 4].sort(() => r() - 0.5);
  for (let i = 0; i < (o.scatters ?? 0); i++) b[cols[i]!]![Math.floor(r() * ROWS)] = 'S';
  for (let i = 0; i < (o.wilds ?? 0); i++) { const c = 1 + Math.floor(r() * 4), rr = Math.floor(r() * ROWS); if (b[c]![rr] !== 'S') b[c]![rr] = 'W'; }
  return b;
}
function randomPath(r: () => number, b: Board, len: number, prefer: Pos[] = []): Pos[] {
  const free: Pos[] = [];
  for (let c = 0; c < COLS; c++) for (let rr = 0; rr < ROWS; rr++) if (!isSpecial(b[c]![rr]!)) free.push([c, rr]);
  const out: Pos[] = [];
  const used = new Set<string>();
  const pref = prefer.filter((p) => !isSpecial(b[p[0]]![p[1]]!));
  while (out.length < len && out.length < free.length) {
    const fromPref = pref.length && r() < 0.55;
    const pool = fromPref ? pref : free;
    const p = pool[Math.floor(r() * pool.length)]!;
    if (used.has(posKey(p))) { if (fromPref && pref.every((q) => used.has(posKey(q)))) pref.length = 0; continue; }
    used.add(posKey(p)); out.push(p);
  }
  return out;
}
const multPick = (r: () => number) => [2, 2, 2, 3, 3, 4, 5, 6, 8, 10][Math.floor(r() * 10)]!;
function chipCells(b: BookBuilder): Pos[] { return [...b.chipMap.keys()].map((k) => k.split(',').map(Number) as unknown as Pos); }
/** bonus spin satisfying a predicate on the win (rejection sampling on seeded boards) */
function bonusSpin(b: BookBuilder, r: () => number, dots: number, pred: (w: number, board: Board) => boolean, o: { scatters?: number; wilds?: number } = {}): number {
  for (let tries = 0; tries < 20000; tries++) {
    const board = randomBoard(r, o);
    const ds: DotSpec[] = [];
    for (let d = 0; d < dots; d++) ds.push({ path: randomPath(r, board, 3 + Math.floor(r() * 6), chipCells(b)), mult: multPick(r) });
    if (ds.some((d) => d.path.length < 3)) continue;
    const w = preview(board, b.chipMap, ds, cfg);
    if (w < 0 || !pred(w, board)) continue;
    return b.spin({ board, dots: ds }).win;
  }
  throw new Error('bonusSpin: aucune grille trouvee');
}

// =============================== BASE GAME ===============================
add('F01', 'perte', 30, ['BASE', 'ANTE'], ['perte'], (b) => { b.spin({ board: grid([
  'L1 L3 H2 L4 L2',
  'L2 H4 L1 S  L3',
  'H3 L2 L4 H1 L1',
  'L4 H1 L3 L2 H2']) }); });

add('F02', 'petit gain (glyphes)', 22, ['BASE', 'ANTE'], ['petit gain'], (b) => { b.spin({ board: grid([
  'L2 L3 H2 L4 L1',
  'L1 H4 L2 S  L3',
  'H3 L2 L4 H1 L1',
  'L4 H1 L3 L2 H2']) }); });

add('F03', 'gain canette (H1)', 8, ['BASE', 'ANTE'], ['premium', 'H1'], (b) => { b.spin({ board: grid([
  'H1 L3 H1 H1 L2',
  'L1 H1 L2 L4 H1',
  'L2 L2 L4 H2 L1',
  'L4 H3 L3 L2 H2']) }); });

add('F04', 'gain pelote (H2)', 7, ['BASE', 'ANTE'], ['premium', 'H2'], (b) => { b.spin({ board: grid([
  'H2 L3 L1 H2 L2',
  'L1 H2 H2 L4 L3',
  'L3 L4 L2 H1 L1',
  'L4 H3 L3 L2 H2']) }); });

add('F05', 'gain poisson (H3, 5 colonnes)', 6, ['BASE', 'ANTE'], ['premium', 'H3'], (b) => { b.spin({ board: grid([
  'L1 H3 L2 L4 H3',
  'H3 L4 H3 H3 L2',
  'L2 L1 L4 H1 L1',
  'L4 H1 L1 L2 H2']) }); });

add('F06', 'gain souris-drone (H4)', 5, ['BASE', 'ANTE'], ['premium', 'H4'], (b) => { b.spin({ board: grid([
  'H4 L3 H4 L4 L2',
  'L1 H4 L2 H4 L3',
  'L3 W  L4 H1 H4',
  'L4 H1 L1 L2 H2']) }); });

add('F07', 'point laser (3 cases, x2)', 7, ['BASE', 'ANTE'], ['laser'], (b) => { b.spin({ board: grid([
  'L3 L1 H2 L4 L2',
  'H1 L3 L2 S  L3',
  'L2 H1 L3 H2 L1',
  'L4 L4 H4 L2 H3']), dots: [{ path: [[0, 0], [1, 1], [2, 2]], mult: 2 }] }); });

const f08 = add('F08', 'point laser long (8 cases, x10) -> BIG WIN', 3, ['BASE', 'ANTE'], ['laser', 'big'], (b) => { b.spin({ board: grid([
  'H3 H2 H3 L4 H3',
  'L1 H3 L2 H3 L3',
  'H3 L2 H3 L1 L1',
  'L4 H1 L3 L2 H2']), dots: [{ path: [[0, 0], [1, 1], [2, 0], [3, 1], [4, 0], [0, 2], [2, 2], [4, 3]], mult: 10 }] }); });

add('F25', 'point laser sur souris-drone (H4 ne monte plus)', 3, ['BASE', 'ANTE'], ['laser', 'H4'], (b) => { b.spin({ board: grid([
  'H4 L2 H4 L4 L2',
  'L1 H4 L2 H3 L3',
  'L3 L1 L4 H1 L1',
  'L4 H1 L3 L2 H2']), dots: [{ path: [[0, 0], [1, 1], [2, 0], [3, 1]], mult: 3 }] }); });

// ---------- anticipation ----------
const r9 = rng(9009);
const f09 = add('F09', 'anticipation reussie -> 9 VIES complet (puces +1/+2/+3, +3 FS, dernier tour sans gain)', 2, ['BASE', 'ANTE'], ['anticipation', 'bonus', '9vies', 'retrigger'], (b) => {
  b.spin({ board: grid([
    'S  L3 H2 L4 L2',
    'L2 H4 S  L1 L3',
    'H3 L2 L4 H1 S ',
    'L4 H1 L3 L2 H2']), anticipation: [0, 0, 0, 1, 2] });
  b.trigger('nineLives', [[0, 0], [2, 1], [4, 2]]);
  for (let k = 1; k <= 12; k++) {
    if (k === 5) { bonusSpin(b, r9, 1, (w, board) => board.flat().filter((s) => s === 'S').length === 3 && w >= 0, { scatters: 3 }); b.retrigger(3, scattersOf(lastBoard(b))); continue; }
    if (k === 7) { bonusSpin(b, r9, 1, (w) => w >= 1000 && w < 2500); continue; }
    if (k === 12) { bonusSpin(b, r9, 1, (w) => w === 0); continue; }
    bonusSpin(b, r9, 1, (w) => w < 800);
  }
  b.endBonus();
});

add('F10', 'anticipation ratee (2 Scatters)', 3, ['BASE', 'ANTE'], ['anticipation'], (b) => { b.spin({ board: grid([
  'S  L3 H2 L4 L2',
  'L2 S  L1 H2 L3',
  'H3 L2 L4 H1 L1',
  'L4 H1 L3 L2 H2']), anticipation: [0, 0, 1, 2, 3] }); });

// ---------- tiers (spin win / base bet) ----------
add('F14', 'gain juste sous x10', 2, ['BASE', 'ANTE'], ['seuil'], (b) => { b.spin({ board: grid([
  'H4 H4 H4 H4 H4',
  'H3 H3 H4 H3 L2',
  'H2 H2 H3 H2 H3',
  'L2 L4 H2 L4 H2']) }); });

add('F15', 'gain exactement x10 (BIG WIN inclus)', 2, ['BASE', 'ANTE'], ['seuil', 'big'], (b) => { b.spin({ board: grid([
  'H4 H4 H4 H4 H4',
  'H3 H3 H4 H3 H3',
  'L1 L3 H3 H3 L4',
  'L2 L4 L1 L1 L3']) }); });

add('F16', 'SUPER WIN (>= x25)', 1, ['BASE', 'ANTE'], ['super'], (b) => { b.spin({ board: grid([
  'H4 H4 H4 H4 H4',
  'H4 H3 H4 H3 L2',
  'L1 L3 H3 L1 H3',
  'L2 L4 L1 L4 L3']), dots: [{ path: [[1, 1], [3, 1], [1, 2]], mult: 2 }] }); });

add('F17', 'MEGA WIN (>= x50)', 1, ['BASE', 'ANTE'], ['mega'], (b) => { b.spin({ board: grid([
  'H4 H4 H4 H4 H4',
  'L1 L3 H4 H4 L2',
  'L2 L1 L3 L2 L3',
  'L4 L2 L1 L1 H1']), dots: [{ path: [[1, 1], [2, 2], [0, 0]], mult: 5 }] }); });

add('F18', 'EPIC WIN (>= x100)', 1, ['BASE', 'ANTE'], ['epic'], (b) => { b.spin({ board: grid([
  'H4 H4 H4 H4 H4',
  'L1 L3 H4 H4 H4',
  'L2 L1 L3 L2 L3',
  'L4 L2 L1 L1 H1']), dots: [{ path: [[1, 1], [2, 2], [0, 0]], mult: 5 }] }); });

add('F19', 'CYBER WIN (>= x500)', 1, ['BASE', 'ANTE'], ['cyber'], (b) => { b.spin({ board: grid([
  'H4 H4 H4 H4 H4',
  'H4 H4 H4 H3 L2',
  'H4 H4 H4 L1 L3',
  'H4 H4 H4 L4 L3']), dots: [{ path: [[3, 1], [2, 0], [4, 0]], mult: 4 }] }); });

add('F24', 'sous-centime (x0,05 : 0,005 EUR a 0,10 EUR)', 1, ['BASE', 'ANTE'], ['sous-centime'], (b) => { b.spin({ board: grid([
  'L1 L1 L1 L4 H1',
  'L2 H4 L3 S  L3',
  'H3 L2 L4 H1 L4',
  'L4 H1 L3 H2 H2']) }); });

add('F26', 'gros gain en bonus (montants longs avec une grosse mise, panneau DEV)', 0, ['BASE'], ['long'], (b) => {
  // deliberately not in the random playlist: forced from the DEV panel with a big bet
  b.spin({ board: grid([
    'S  L3 H2 L4 L2',
    'L2 H4 S  L1 S ',
    'H3 L2 L4 H1 L4',
    'L4 H1 L3 L2 H2']), anticipation: [0, 0, 0, 1, 2] });
  b.trigger('nineLives', [[0, 0], [2, 1], [4, 1]]);
  const r = rng(26);
  for (let k = 1; k <= 9; k++) {
    if (k === 9) { b.spin({ board: grid([
      'H4 H4 H4 H4 H4',
      'H4 H4 H4 H4 L2',
      'H4 H4 H3 L1 L3',
      'L2 H4 L1 L4 L3']), dots: [{ path: [[3, 1], [2, 2], [4, 1]], mult: 9 }] }); continue; }
    bonusSpin(b, r, 1, (w) => w < 300);
  }
  b.endBonus();
});

// =============================== FEATURES ===============================
add('F12', 'SCAN : 1 spin, 1 point garanti', 1, ['SCAN'], ['feature', 'scan'], (b) => {
  b.featureStart('scan');
  b.spin({ board: grid([
    'L3 L1 H2 L4 L2',
    'H2 L3 L2 H1 L3',
    'L2 H2 L3 H2 L1',
    'L4 L4 H4 L2 H3']), dots: [{ path: [[0, 1], [1, 2], [2, 0], [3, 2], [2, 2]], mult: 4 }] });
});
add('F13', 'DOUBLE SCAN : 1 spin, 2 points (multiplicateurs croises x3 x x5)', 1, ['DOUBLE_SCAN'], ['feature', 'doublescan', 'croisement'], (b) => {
  b.featureStart('doubleScan');
  b.spin({ board: grid([
    'H3 L1 H3 L4 H3',
    'L2 H2 L1 H2 L3',
    'L3 L4 L3 L1 L1',
    'L4 L1 L4 L2 H1']), dots: [
    { eye: 'left', path: [[0, 2], [2, 2], [1, 1]], mult: 3 },
    { eye: 'right', path: [[4, 3], [2, 1], [3, 1]], mult: 5 }] });
});

function lastBoard(b: BookBuilder): Board {
  const ev = (b as unknown as { events: { type: string; board?: Board }[] }).events;
  for (let i = ev.length - 1; i >= 0; i--) if (ev[i]!.type === 'reveal') return ev[i]!.board!;
  throw new Error('no reveal');
}
function scattersOf(board: Board): Pos[] {
  const out: Pos[] = [];
  board.forEach((col, c) => col.forEach((s, r) => { if (s === 'S') out.push([c, r]); }));
  return out;
}

// BONUS buy -> 9 VIES (scatters land one by one in the front)
add('F21', 'achat 9 VIES', 1, ['BONUS'], ['achat', 'bonus', '9vies'], (b) => {
  b.spin({ board: grid([
    'L1 L3 S  L4 L2',
    'S  H4 L1 L2 L3',
    'H3 L2 L4 H1 S ',
    'L4 H1 L3 L2 H2']) });
  b.trigger('nineLives', [[0, 1], [2, 0], [4, 2]]);
  const r = rng(2121);
  for (let k = 1; k <= 9; k++) bonusSpin(b, r, 1, (w) => (k === 9 ? w === 0 : w < 1200));
  b.endBonus();
});

// SUPER buy -> DOUBLE REGARD (start chips, two dots per spin, crossing multipliers)
add('F22', 'achat DOUBLE REGARD', 1, ['SUPER'], ['achat', 'bonus', 'double'], (b) => {
  b.spin({ board: grid([
    'S  L3 S  L4 L2',
    'L2 H4 L1 S  L3',
    'H3 L2 L4 H1 S ',
    'L4 H1 L3 L2 H2']) });
  b.trigger('doubleGaze', [[0, 0], [2, 0], [3, 1], [4, 2]]);
  b.overclock([{ pos: [1, 1], level: 1 }, { pos: [2, 2], level: 1 }, { pos: [3, 0], level: 1 }, { pos: [4, 3], level: 1 }]);
  const r = rng(2222);
  for (let k = 1; k <= 9; k++) bonusSpin(b, r, 2, (w) => (k === 9 ? w === 0 : k === 4 ? w >= 1500 && w < 5000 : w < 1500));
  b.endBonus();
});

// DOUBLE REGARD from 4 scatters in base game
add('F11', 'DOUBLE REGARD (4 Scatters) complet', 1, ['BASE', 'ANTE'], ['bonus', 'double', 'anticipation'], (b) => {
  b.spin({ board: grid([
    'S  L3 H2 S  L2',
    'L2 H4 S  L1 L3',
    'H3 L2 L4 H1 S ',
    'L4 H1 L3 L2 H2']), anticipation: [0, 0, 0, 0, 1] });
  b.trigger('doubleGaze', [[0, 0], [2, 1], [3, 0], [4, 2]]);
  b.overclock([{ pos: [0, 1], level: 1 }, { pos: [1, 2], level: 1 }, { pos: [3, 3], level: 1 }]);
  const r = rng(1111);
  for (let k = 1; k <= 9; k++) bonusSpin(b, r, 2, (w) => (k === 9 ? w === 0 : w < 2000));
  b.endBonus();
});

// MAX WIN: cap reached in the bonus, the rest of the round stops
add('F20', 'MAX WIN (plafond 25 000x en bonus)', 0, ['SUPER'], ['max'], (b) => {
  b.spin({ board: grid([
    'S  L3 S  L4 L2',
    'L2 H4 L1 S  L3',
    'H3 L2 L4 H1 S ',
    'L4 H1 L3 L2 H2']) });
  b.trigger('doubleGaze', [[0, 0], [2, 0], [3, 1], [4, 2]]);
  b.overclock([{ pos: [1, 1], level: 2 }, { pos: [2, 2], level: 2 }, { pos: [3, 3], level: 1 }]);
  const r = rng(2020);
  bonusSpin(b, r, 2, (w) => w > 0 && w < 600);
  b.spin({ board: grid([
    'H4 H4 H4 H4 H4',
    'H4 H4 H4 H4 H4',
    'H4 H4 H3 H4 H4',
    'H4 H4 H4 H3 H4']), dots: [
    { eye: 'left', path: [[2, 2], [3, 3], [1, 0]], mult: 10 },
    { eye: 'right', path: [[0, 3], [4, 1], [2, 1]], mult: 10 }] });
  if (!b.isCapped) throw new Error('F20 : plafond non atteint');
  b.endBonus();
});

// ANTE example (a normal spin played in ANTE mode)
add('F23', 'Ante : spin normal en mode ANTE', 0, ['ANTE'], ['ante'], (b) => { b.spin({ board: grid([
  'L2 L3 H2 L4 L1',
  'L1 H4 L2 S  L3',
  'H3 L2 L4 H1 L1',
  'L4 H1 L3 L2 H2']) }); }, 'ANTE');

// ---------- intents ----------
expectRange(fixtures.find((f) => f.id === 'F01')!, 0, 0);
expectRange(f08, 10, 24.99);
const intent: Record<string, [number, number]> = { F14: [9, 9.99], F15: [10, 10], F16: [25, 49.99], F17: [50, 99.99], F18: [100, 499.99], F19: [500, 5000], F24: [0.05, 0.05] };
for (const [id, [a, z]] of Object.entries(intent)) expectRange(fixtures.find((f) => f.id === id)!, a, z);
if (f09.book.events.filter((e) => e.type === 'freeSpinRetrigger').length !== 1) throw new Error('F09 sans retrigger');
const lastSpinWin = (f: Fixture) => spinWinsOf(f).at(-1);
for (const id of ['F09', 'F11', 'F21', 'F22']) if (lastSpinWin(fixtures.find((f) => f.id === id)!) !== 0) throw new Error(`${id}: dernier tour avec gain`);
void evaluate; void tierFor;

// ---------- write + validate ----------
let bad = 0;
const summary: string[] = ['| id | titre | mode(s) | poids | gain x | spins | paliers de spin |', '|---|---|---|---|---|---|---|'];
for (const f of fixtures.sort((a, b) => a.id.localeCompare(b.id))) {
  const v = validateBook(f.book, { maxWinX: cfg.maxWinX });
  if (!v.ok) { bad++; console.error(`${f.id} INVALIDE:`, v.issues.slice(0, 6)); }
  writeFileSync(resolve(OUT, `${f.id}.json`), JSON.stringify({ fixture: f.id, title: f.title, tags: f.tags, modes: f.modes, book: f.book }));
  const spins = spinWinsOf(f);
  const tiers = spins.map((w) => tierFor(w, cfg)).filter(Boolean);
  summary.push(`| ${f.id} | ${f.title} | ${f.modes.join(', ')} | ${f.weight} | ${(f.book.payoutMultiplier / 100).toFixed(2)} | ${spins.length} | ${tiers.join(' ') || '-'} |`);
}
writeFileSync(resolve(OUT, 'playlist.json'), JSON.stringify({ version: 1, entries: fixtures.map((f) => ({ id: f.id, title: f.title, weight: f.weight, modes: f.modes, tags: f.tags })) }, null, 2));
writeFileSync(resolve(ROOT, 'docs/FIXTURES.md'), `# Fixtures locales\n\nGenerees par \`npm run fixtures\` (tools/fixtures/build.ts), controlees par \`npm run fixtures:check\`.\nMontants des books en centiemes de mise (100 = x1).\n\n${summary.join('\n')}\n`);
console.log(summary.join('\n'));
if (intentErrors.length) { console.error(intentErrors.join('\n')); bad++; }
if (bad) { console.error(`${bad} fixture(s) invalide(s)`); process.exit(1); }
console.log(`${fixtures.length} fixtures valides`);
