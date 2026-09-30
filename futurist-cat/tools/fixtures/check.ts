// Checks every local fixture WITHOUT computing results: shape (zod), positions, ladder steps,
// chips, totals, order, counters, no undeclared winning way. Invalid = reported, never repaired.
//   npx tsx tools/fixtures/check.ts [file.json ...]
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBook } from '../../src/contract/validate';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cfg = JSON.parse(readFileSync(resolve(ROOT, 'public/game-math-config.json'), 'utf8')) as { maxWinX: number };
const dir = resolve(ROOT, 'public/fixtures');
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir).filter((f) => /^F\d+\.json$/.test(f)).map((f) => resolve(dir, f));
let bad = 0;
for (const f of files) {
  const raw = JSON.parse(readFileSync(f, 'utf8')) as { fixture?: string; book?: unknown };
  const v = validateBook(raw.book ?? raw, { maxWinX: cfg.maxWinX });
  const chipsMax = Math.max(0, ...((raw.book as { events?: { type: string; chips?: { level: number }[] }[] })?.events ?? []).flatMap((e) => (e.chips ?? []).map((c) => c.level)));
  console.log(`${v.ok ? 'OK ' : 'KO '} ${raw.fixture ?? f}${chipsMax ? `  (puce max +${chipsMax})` : ''}`);
  if (!v.ok) { bad++; for (const i of v.issues) console.log(`     #${i.index} ${i.message}`); }
}
console.log(bad ? `${bad} invalide(s)` : `${files.length} valides`);
process.exit(bad ? 1 : 0);
