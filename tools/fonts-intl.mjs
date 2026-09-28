// Polices OFL des écritures absentes de Lilita One / Baloo 2 (arabe, cyrillique, japonais, coréen, chinois) :
// copie des woff2 depuis @fontsource vers public/fonts/ (+ licences) et génération de src/ui/fonts-intl.css.
//   node tools/fonts-intl.mjs            (à relancer après toute modification des locales ja / ko / zh)
// CJK : fontsource découpe chaque police en ~120 tranches unicode-range ; seules les tranches contenant au moins
// un caractère des locales (plus quelques symboles de formatage Intl) sont copiées et déclarées.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/cli.mjs';

const FS = path.join(ROOT, 'node_modules/@fontsource');
const OUT = path.join(ROOT, 'public/fonts');
const LOCALES = path.join(ROOT, 'src/i18n/locales');
const CSS = path.join(ROOT, 'src/ui/fonts-intl.css');
const THEME = path.join(ROOT, 'src/ui/theme.css');

// ---------- plages unicode ----------
const parseRanges = (s) =>
  s.split(',').map((p) => p.trim().replace(/^U\+/i, '')).filter(Boolean).map((p) => {
    const [a, b = a] = p.split('-');
    return [parseInt(a, 16), parseInt(b, 16)];
  });
const covers = (ranges, cp) => ranges.some(([a, b]) => cp >= a && cp <= b);
const unicodeOf = (pkg) => JSON.parse(fs.readFileSync(path.join(FS, pkg, 'unicode.json'), 'utf8'));

// faces déjà déclarées par theme.css (Lilita One, Baloo 2) : plages et fichiers
const themeFaces = [...fs.readFileSync(THEME, 'utf8').matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => ({
  family: m[1].match(/font-family:\s*'([^']+)'/)?.[1],
  weight: Number(m[1].match(/font-weight:\s*(\d+)/)?.[1] ?? 400),
  file: m[1].match(/url\('\/fonts\/([^']+)'\)/)?.[1],
  range: m[1].match(/unicode-range:\s*([^;]+)/)?.[1].trim(),
}));
const baseRanges = themeFaces.filter((f) => f.range).flatMap((f) => parseRanges(f.range));

const locale = (l) => JSON.parse(fs.readFileSync(path.join(LOCALES, `${l}.json`), 'utf8'));

// ---------- copie + déclarations ----------
const copied = new Set();
const licences = [];
function copy(pkg, file) {
  fs.copyFileSync(path.join(FS, pkg, 'files', file), path.join(OUT, file));
  copied.add(file);
}
function licence(pkg, name) {
  fs.copyFileSync(path.join(FS, pkg, 'LICENSE'), path.join(OUT, `LICENSE-${name}-OFL.txt`));
  licences.push(`LICENSE-${name}-OFL.txt`);
}
const face = (family, weight, file, range) =>
  `@font-face { font-family: '${family}'; font-weight: ${weight}; src: url('/fonts/${file}') format('woff2'); font-display: swap; unicode-range: ${range.replace(/,\s*/g, ', ')}; }`;

const css = [];
const section = (title) => css.push('', `/* ---------- ${title} ---------- */`);

// Baloo 2 : theme.css ne déclare latin-ext / vietnamese / devanagari qu'en 700 ; les fichiers 600 / 800 sont déjà
// livrés dans public/fonts. Sans ces faces, un texte 600 ou 800 en polonais, turc, vietnamien ou hindi retombe
// sur une autre famille (le choix de graisse se fait avant le découpage unicode-range).
section('Baloo 2 : graisses 600 / 800 des sous-ensembles latin-ext, vietnamese, devanagari (fichiers déjà livrés)');
for (const f of themeFaces.filter((x) => x.family === 'Baloo 2' && x.weight === 700 && !/-latin-700-/.test(x.file ?? ''))) {
  for (const w of [600, 800]) {
    const file = f.file.replace('-700-', `-${w}-`);
    if (fs.existsSync(path.join(OUT, file))) css.push(face('Baloo 2', w, file, f.range));
  }
}

// Titres : Lilita One n'a ni les lettres polonaises / turques / vietnamiennes (ą ę ś ż, ş ğ İ, ắ ộ ư…) ni la
// devanagari. « Baloo 2 Display » = Baloo 2 en 800 quelle que soit la graisse demandée (une seule graisse déclarée).
section('Baloo 2 Display : Baloo 2 800 pour les titres (repli de Lilita One)');
for (const sub of ['latin', 'latin-ext', 'vietnamese', 'devanagari']) {
  const ref = themeFaces.find((x) => x.family === 'Baloo 2' && x.file === `baloo-2-${sub}-${sub === 'latin' ? 800 : 700}-normal.woff2`);
  const file = `baloo-2-${sub}-800-normal.woff2`;
  if (ref && fs.existsSync(path.join(OUT, file))) css.push(face('Baloo 2 Display', 800, file, ref.range));
}

// Arabe : Baloo Bhaijaan 2 (famille Baloo, même dessin), 700 seulement (sert aussi aux chiffres arabes-indiens d'Intl 'ar').
section('Arabe : Baloo Bhaijaan 2 (OFL)');
{
  const u = unicodeOf('baloo-bhaijaan-2');
  const file = 'baloo-bhaijaan-2-arabic-700-normal.woff2';
  copy('baloo-bhaijaan-2', file);
  css.push(face('Baloo Bhaijaan 2', 700, file, u.arabic));
  licence('baloo-bhaijaan-2', 'BalooBhaijaan2');
}

// Cyrillique : Rubik 600 / 700 / 800 ; « Rubik Display » = Rubik 800 pour les titres.
section('Cyrillique : Rubik (OFL)');
{
  const u = unicodeOf('rubik');
  for (const w of [600, 700, 800]) {
    for (const sub of ['cyrillic-ext', 'cyrillic']) {
      const file = `rubik-${sub}-${w}-normal.woff2`;
      copy('rubik', file);
      css.push(face('Rubik', w, file, u[sub]));
    }
  }
  for (const sub of ['cyrillic-ext', 'cyrillic']) css.push(face('Rubik Display', 800, `rubik-${sub}-800-normal.woff2`, u[sub]));
  licence('rubik', 'Rubik');
}

// CJK : tranches utiles seulement. Symboles ajoutés : formatage Intl (￥ japonais), ponctuation pleine chasse.
const CJK = [
  { lang: 'ja', pkg: 'noto-sans-jp', family: 'Noto Sans JP', lic: 'NotoSansJP', extra: '￥、。：（）！？「」・ー' },
  { lang: 'ko', pkg: 'noto-sans-kr', family: 'Noto Sans KR', lic: 'NotoSansKR', extra: '' },
  { lang: 'zh', pkg: 'noto-sans-sc', family: 'Noto Sans SC', lic: 'NotoSansSC', extra: '￥，。：（）！？、' },
];
const report = [];
for (const { lang, pkg, family, lic, extra } of CJK) {
  section(`${family} 700 (OFL) : tranches utilisées par ${lang}.json`);
  const slices = Object.entries(unicodeOf(pkg)).filter(([k]) => /^\[\d+\]$/.test(k)).map(([k, r]) => ({ id: k.slice(1, -1), range: r, ranges: parseRanges(r) }));
  const text = Object.values(locale(lang)).join('') + extra;
  const need = [...new Set([...text])].map((c) => c.codePointAt(0)).filter((cp) => cp > 0x20 && !covers(baseRanges, cp));
  const used = new Map();
  const missing = [];
  for (const cp of need) {
    const s = slices.find((x) => covers(x.ranges, cp));
    if (s) used.set(s.id, s);
    else missing.push(String.fromCodePoint(cp));
  }
  if (missing.length) throw new Error(`${family} : aucune tranche pour ${missing.join(' ')}`);
  for (const s of [...used.values()].sort((a, b) => Number(a.id) - Number(b.id))) {
    const file = `${pkg}-${s.id}-700-normal.woff2`;
    copy(pkg, file);
    css.push(face(family, 700, file, s.range));
  }
  licence(pkg, lic);
  report.push(`${family} : ${used.size} tranches pour ${need.length} caractères`);
}

// fichiers CJK d'une génération précédente devenus inutiles
for (const f of fs.readdirSync(OUT)) {
  if (/^noto-sans-(jp|kr|sc)-\d+-700-normal\.woff2$/.test(f) && !copied.has(f)) fs.rmSync(path.join(OUT, f));
}

const INTL = "'Rubik', 'Baloo Bhaijaan 2'";
const header = `/* Polices locales OFL des écritures absentes de Lilita One / Baloo 2 : arabe (Baloo Bhaijaan 2), cyrillique (Rubik),
   japonais / coréen / chinois simplifié (Noto Sans JP / KR / SC, tranches unicode-range chargées à la demande).
   GÉNÉRÉ par tools/fonts-intl.mjs — ne pas éditer à la main ; relancer « node tools/fonts-intl.mjs » après toute
   modification de ja.json, ko.json ou zh.json (le test i18n-locales vérifie la couverture).
   Importé en tête de theme.css ; les variables sont posées sur « html:root » pour primer sur le « :root » de theme.css. */`;
const vars = `
/* ---------- piles de polices (aucune police système : « sans-serif » n'est que le dernier recours générique) ---------- */
html:root {
  /* ordre des familles CJK : dépend de la langue (unification Han : un même idéogramme n'a pas le même dessin) */
  --font-cjk: 'Noto Sans JP', 'Noto Sans KR', 'Noto Sans SC';
  --font-display: 'Lilita One', 'Baloo 2 Display', 'Rubik Display', 'Baloo Bhaijaan 2', var(--font-cjk), sans-serif;
  --font-ui: 'Baloo 2', 'Lilita One', ${INTL}, var(--font-cjk), sans-serif;
  --font-num: 'Baloo 2', ${INTL}, var(--font-cjk), sans-serif;
}
html:root:lang(ko) { --font-cjk: 'Noto Sans KR', 'Noto Sans JP', 'Noto Sans SC'; }
html:root:lang(zh) { --font-cjk: 'Noto Sans SC', 'Noto Sans JP', 'Noto Sans KR'; }
/* polonais, turc, vietnamien : Lilita One n'a pas toutes leurs lettres → titres entiers en Baloo 2 800 (pas de mélange dans un mot) */
html:root:lang(pl), html:root:lang(tr), html:root:lang(vi) {
  --font-display: 'Baloo 2 Display', 'Lilita One', 'Rubik Display', 'Baloo Bhaijaan 2', var(--font-cjk), sans-serif;
}`;
fs.writeFileSync(CSS, `${header}\n${vars}\n${css.join('\n')}\n`);

const bytes = [...copied].reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);
console.log(report.join('\n'));
console.log(`${copied.size} fichiers woff2 copiés (${(bytes / 1024).toFixed(0)} Ko), licences : ${licences.join(', ')}`);
console.log(`écrit : ${path.relative(ROOT, CSS)}`);
