/**
 * Construit et valide toutes les fixtures : npm run fixtures
 * Sortie : public/fixtures/fixtures.json + docs/fixtures-ascii.txt (grilles imprimées).
 * Un scénario invalide fait échouer la commande (jamais « réparé » au rendu).
 */
import fs from 'node:fs';
import path from 'node:path';
import { validateBook } from './validate';
import { ALL } from './scenarios';

const cfg = JSON.parse(fs.readFileSync('public/game-math-config.json', 'utf8')) as { maxWinX: number };
const out: unknown[] = [];
const printed: string[] = [];
let bad = 0;
const ids = new Set<string>();
for (const make of ALL) {
  let b;
  try {
    b = make();
  } catch (e) {
    bad++;
    console.error(`✗ ${make.name || '?'} : ${(e as Error).message}`);
    continue;
  }
  const f = b.build();
  if (ids.has(f.id)) {
    console.error(`id en double ${f.id}`);
    bad++;
  }
  ids.add(f.id);
  const { issues } = validateBook(f.book, { maxWinX: cfg.maxWinX });
  printed.push(`==== ${f.id} (${f.mode}) ${f.note}\n${b.printed.join('\n')}\n`);
  if (issues.length) {
    bad++;
    console.error(`✗ ${f.id}\n  ${issues.join('\n  ')}`);
  } else {
    const book = f.book as { payoutMultiplier: number; events: unknown[] };
    console.log(`✓ ${f.id.padEnd(5)} ${f.mode.padEnd(6)} x${(book.payoutMultiplier / 100).toFixed(2).padStart(9)}  ${book.events.length} évts  ${f.note}`);
  }
  out.push(f);
}
fs.mkdirSync('public/fixtures', { recursive: true });
fs.writeFileSync(path.join('public/fixtures', 'fixtures.json'), JSON.stringify({ contract: '1.0.0', generated: new Date().toISOString(), fixtures: out }, null, 1));
fs.writeFileSync('docs/fixtures-ascii.txt', printed.join('\n'));
console.log(`${out.length} fixtures, ${bad} invalides`);
if (bad) process.exit(1);
