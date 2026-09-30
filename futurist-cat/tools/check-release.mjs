// Release gate.
//   node tools/check-release.mjs --pre [--stake]   before `vite build` (public): required images present,
//                                                  config not provisional for a Stake build
//   node tools/check-release.mjs --post <dir>      after the build: no dev tools, no forbidden words,
//                                                  relative paths only, no external call
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, resolve, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fail = [];
const warn = [];

if (args.includes('--pre')) {
  const plan = JSON.parse(readFileSync(resolve(ROOT, 'assets/plan.json'), 'utf8'));
  const man = existsSync(resolve(ROOT, 'public/assets/manifest.json')) ? JSON.parse(readFileSync(resolve(ROOT, 'public/assets/manifest.json'), 'utf8')) : { images: {} };
  const missing = Object.entries(plan.images).filter(([id, v]) => v.required && v.out && !man.images[id]).map(([id]) => id);
  if (missing.length) fail.push(`${missing.length} illustration(s) requise(s) absente(s) du manifeste (ImageGen) : ${missing.join(', ')}`);
  if (!existsSync(resolve(ROOT, 'public/assets/cat/cat.glb'))) fail.push('public/assets/cat/cat.glb absent : npm run cat:prepare (GLB Meshy a la racine)');
  else {
    const meta = JSON.parse(readFileSync(resolve(ROOT, 'public/assets/cat/cat.meta.json'), 'utf8'));
    if (meta.testRig) fail.push('cat.glb provient du squelette de test : relancer npm run cat:prepare sur le vrai GLB');
  }
  if (!existsSync(resolve(ROOT, 'public/assets/cat/poses/poses.json'))) fail.push('poses de repli absentes : npm run cat:poses');
  if (!existsSync(resolve(ROOT, 'public/audio/manifest.json'))) fail.push('sons absents : node tools/audio/render.mjs');
  if (args.includes('--stake')) {
    const cfg = JSON.parse(readFileSync(resolve(ROOT, 'public/game-math-config.json'), 'utf8'));
    if (cfg.provisional) fail.push('game-math-config.json est "provisional": true : build Stake bloque tant que les maths ne l\'ont pas remplacee');
  }
}

if (args.includes('--post')) {
  const dir = resolve(ROOT, args[args.indexOf('--post') + 1] ?? 'dist-public');
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else files.push(p); } };
  walk(dir);
  const text = files.filter((f) => ['.js', '.html', '.css', '.json'].includes(extname(f)));
  const DEV_MARKERS = ['__qaPlay', '__qaStep', 'dev-panel', 'TEST ANIM', 'standInTexture', 'stand-ins', 'forcer le prochain', 'test-rig', '__DEV_TOOLS__'];
  // visible-word check on translations + html (JS identifiers like .test( are not visible text)
  const FORBIDDEN = [/\bd[ée]mo\b/i, /\btest\b/i, /\bfun\b/i, /\bcr[ée]dits?\b/i, /\bPROVISOIRE\b/i, /placeholder/i, /\blorem\b/i];
  for (const f of text) {
    const s = readFileSync(f, 'utf8');
    const rel = relative(dir, f);
    for (const m of DEV_MARKERS) if (s.includes(m)) fail.push(`${rel} contient un outil de dev : "${m}"`);
    if (extname(f) === '.html' && /(src|href)="\/(?!\/)/.test(s)) fail.push(`${rel} : chemin absolu`);
    const urls = [...s.matchAll(/https?:\/\/[a-z0-9.-]+/gi)].map((m) => m[0]).filter((u) => !/w3\.org|khronos\.org|github\.com\/mrdoob|threejs\.org|pixijs|greensock|gsap\.com|mozilla\.org|mdn|ecma|json-schema|webkit\.org|chromium\.org|schema\.org|example\.com|localhost|127\.0\.0\.1/.test(u));
    if (urls.length) warn.push(`${rel} : URL(s) externes presentes (a verifier, aucun appel attendu) : ${[...new Set(urls)].slice(0, 6).join(', ')}`);
  }
  // translations: forbidden visible words in every language
  for (const f of text.filter((x) => /locales|i18n|index-.*\.js$/.test(x))) {
    const s = readFileSync(f, 'utf8');
    const strings = [...s.matchAll(/"([^"\\]{3,200})"/g)].map((m) => m[1]);
    for (const str of strings) for (const re of FORBIDDEN) if (re.test(str) && !/^[a-z]+\.[a-z.@]+$/i.test(str)) { fail.push(`${relative(dir, f)} : mot interdit dans "${str.slice(0, 60)}"`); break; }
  }
  if (!existsSync(join(dir, 'index.html'))) fail.push('index.html absent a la racine');
  const bigs = files.filter((f) => statSync(f).size > 3 * 1024 * 1024).map((f) => `${relative(dir, f)} ${(statSync(f).size / 1048576).toFixed(1)} Mo`);
  if (bigs.length) warn.push(`fichiers > 3 Mo : ${bigs.join(', ')}`);
}

for (const w of warn) console.warn('[check-release] ATTENTION', w);
if (fail.length) { for (const f of fail) console.error('[check-release] BLOQUANT', f); process.exit(1); }
console.log('[check-release] ok');
