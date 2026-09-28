// Contrôle d'une build livrable :
//   node tools/check-release.mjs [--dir dist] [--stake] [--json=rapport.json] [--locales=src/i18n/locales] [--strict-urls]
// (a) game-math-config.json : provisional:true → « BLOQUANT pour Stake » (code 2 avec --stake, sinon avertissement)
// (b) aucune trace d'outils de dev dans les JS/HTML/CSS livrés (__qa, __qaBoot, mascot-bench, installQa, sourceMappingURL, *.map)
// (c) chaque entrée de assets/manifest.json existe dans la build (+ références locales de index.html : avertissement)
// (d) aucune URL externe http(s):// dans JS/CSS/HTML (hors espaces de noms w3.org), aucune police distante
//     (mentions inertes connues des bibliothèques : avertissement, échec avec --strict-urls ; URL dynamique https://${…} : info)
// (e) mots interdits (casse ignorée, mot entier) dans les locales et dans les chaînes des JS livrés :
//     démo, demo, fun, crédit(s), credit(s) ; « Continuer »/« Continue » en libellé de bouton
// (f) mode social : socialize() de src/i18n/social.ts appliqué à en.json, socialViolations() doit être vide
// (g) poids total, par type et les 10 plus gros fichiers
// Codes de sortie : 2 = bloquant Stake (--stake et provisional), 1 = échec, 0 = OK.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, parseArgs, walk, rel, human, readJson } from './lib/cli.mjs';

const { opt } = parseArgs(process.argv.slice(2), { booleans: ['stake', 'strict-urls'] });
const dir = path.resolve(typeof opt.dir === 'string' ? opt.dir : path.join(ROOT, 'dist'));
const localesDir = path.resolve(typeof opt.locales === 'string' ? opt.locales : path.join(ROOT, 'src/i18n/locales'));
const socialFile = path.join(ROOT, 'src/i18n/social.ts');
if (!fs.existsSync(path.join(dir, 'index.html'))) {
  console.error(`check-release : build introuvable (${dir}/index.html) — lancer « npm run build » ou passer --dir`);
  process.exit(1);
}

// ---------- rapport ----------
const report = { dir, generatedAt: new Date().toISOString(), stake: !!opt.stake, result: 'ok', stakeBlocked: false, sections: [] };
const section = (id, title) => {
  const s = { id, title, status: 'ok', items: [] };
  report.sections.push(s);
  return s;
};
const RANK = { ok: 0, avertissement: 1, échec: 2, bloquant: 3 };
const push = (s, level, msg, data) => {
  s.items.push({ level, msg, ...(data ?? {}) });
  const st = level === 'info' ? 'ok' : level;
  if (RANK[st] > RANK[s.status]) s.status = st;
};
const fail = (s, msg, d) => push(s, 'échec', msg, d);
const warn = (s, msg, d) => push(s, 'avertissement', msg, d);
const info = (s, msg, d) => push(s, 'info', msg, d);

const files = walk(dir).map((p) => ({ abs: p, rel: rel(dir, p), size: fs.statSync(p).size, ext: path.extname(p).toLowerCase() }));
const isCode = (f) => ['.js', '.mjs', '.cjs', '.css', '.html', '.htm'].includes(f.ext);
const text = new Map(files.filter(isCode).map((f) => [f.rel, fs.readFileSync(f.abs, 'utf8')]));
const snippet = (s, i, n = 40) => s.slice(Math.max(0, i - n), i + n).replace(/\s+/g, ' ');

// ---------- (a) configuration maths ----------
{
  const s = section('a', 'Config maths (game-math-config.json)');
  const p = path.join(dir, 'game-math-config.json');
  if (!fs.existsSync(p)) fail(s, 'game-math-config.json absent de la build');
  else {
    let cfg;
    try {
      cfg = readJson(p);
    } catch (e) {
      fail(s, `JSON invalide : ${e.message}`);
    }
    if (cfg) {
      if (cfg.provisional === true) {
        const msg = 'BLOQUANT pour Stake : provisional=true (valeurs de maths provisoires)';
        if (opt.stake) {
          push(s, 'bloquant', msg);
          report.stakeBlocked = true;
        } else warn(s, `${msg} — relancer avec --stake pour en faire une erreur`);
      } else info(s, 'provisional=false');
      const modes = Object.entries(cfg.modes ?? {}).map(([k, m]) => `${k} ${m.cost}×`).join(', ');
      info(s, `modes : ${modes || '—'} ; gain max ${cfg.maxWinX ?? '?'}×`);
    }
  }
}

// ---------- (b) traces d'outils de dev ----------
{
  const s = section('b', "Traces d'outils de dev");
  const PATTERNS = ['__qa', '__qaBoot', 'mascot-bench', 'installQa', 'sourceMappingURL'];
  for (const [f, src] of text) {
    for (const pat of PATTERNS) {
      const i = src.indexOf(pat);
      if (i < 0) continue;
      const n = src.split(pat).length - 1;
      fail(s, `${f} : « ${pat} » ×${n}`, { file: f, pattern: pat, count: n, context: snippet(src, i) });
    }
  }
  for (const f of files) {
    if (f.ext === '.map' || /mascot-bench/i.test(f.rel)) fail(s, `fichier de dev livré : ${f.rel}`, { file: f.rel });
  }
}

// ---------- (c) manifeste des assets ----------
{
  const s = section('c', 'Manifeste des assets');
  const mp = path.join(dir, 'assets/manifest.json');
  if (!fs.existsSync(mp)) fail(s, 'assets/manifest.json absent de la build');
  else {
    const man = readJson(mp);
    const entries = Object.entries(man.assets ?? {});
    const wanted = new Set();
    for (const [key, a] of entries) {
      const urls = [a.url, ...(Array.isArray(a.urls) ? a.urls : [])].filter((u) => typeof u === 'string');
      if (!urls.length) fail(s, `${key} : aucune url`);
      for (const u of urls) {
        const clean = u.split(/[?#]/)[0].replace(/^\.?\//, '');
        wanted.add(clean);
        if (!fs.existsSync(path.join(dir, clean))) fail(s, `${key} : ${clean} manquant`, { key, url: clean });
      }
    }
    const orphans = files.filter((f) => f.rel.startsWith('assets/') && /\.(webp|png|jpe?g|avif|json|ogg|mp3|m4a|webm)$/.test(f.ext) && f.rel !== 'assets/manifest.json' && !wanted.has(f.rel));
    info(s, `${entries.length} entrées vérifiées${orphans.length ? ` ; ${orphans.length} fichier(s) d'assets hors manifeste (${orphans.slice(0, 3).map((f) => f.rel).join(', ')}${orphans.length > 3 ? '…' : ''})` : ''}`);
  }
  // références locales de index.html (src / href)
  const html = text.get('index.html') ?? '';
  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const u = m[1];
    if (/^(?:[a-z]+:|\/\/|#|data:)/i.test(u)) continue;
    const clean = u.split(/[?#]/)[0].replace(/^\.?\//, '');
    if (clean && !fs.existsSync(path.join(dir, clean))) warn(s, `index.html référence ${u}, absent de la build`, { url: u });
  }
}

// ---------- (d) URL externes et polices distantes ----------
{
  const s = section('d', 'URL externes et polices');
  // mentions connues, inertes (aucune requête réseau) : bannière console PixiJS, message d'avertissement GSAP
  const TOLERATED = [
    { re: /^https?:\/\/(www\.)?pixijs\.com\/?$/, why: 'bannière console PixiJS' },
    { re: /^https:\/\/gsap\.com\/?$/, why: "message d'avertissement GSAP" },
  ];
  const seen = new Map();
  for (const [f, src] of text) {
    for (const m of src.matchAll(/\bhttps?:\/\/[^\s"'`<>()\\,;]*/gi)) {
      const url = m[0];
      const k = `${f} ${url}`;
      if (seen.has(k)) {
        seen.get(k).count++;
        continue;
      }
      const entry = { file: f, url, count: 1, context: snippet(src, m.index) };
      seen.set(k, entry);
      const host = url.replace(/^https?:\/\//i, '');
      if (/^www\.w3\.org\//i.test(host)) entry.kind = 'espace de noms';
      else if (host === '' || host.startsWith('$') || host.startsWith('{')) entry.kind = 'dynamique';
      else if (/fonts\.(googleapis|gstatic|bunny)\.|typekit\.net|fontawesome/i.test(host)) entry.kind = 'police distante';
      else {
        const tol = TOLERATED.find((t) => t.re.test(url));
        entry.kind = tol && !opt['strict-urls'] ? `tolérée (${tol.why})` : 'externe';
      }
    }
    // références protocol-relative (//hôte) en HTML/CSS
    if (/\.(html?|css)$/.test(f)) {
      for (const m of src.matchAll(/(?:\b(?:src|href)\s*=\s*["']|url\(\s*["']?)(\/\/[^"')\s]+)/gi)) {
        seen.set(`${f} ${m[1]}`, { file: f, url: m[1], count: 1, kind: 'externe', context: snippet(src, m.index) });
      }
    }
  }
  for (const e of seen.values()) {
    const label = `${e.file} : ${e.url}${e.count > 1 ? ` ×${e.count}` : ''}`;
    if (e.kind === 'espace de noms') continue;
    if (e.kind === 'dynamique') info(s, `${label} — URL construite à l'exécution (paramètre de lancement)`, e);
    else if (e.kind.startsWith('tolérée')) warn(s, `${label} — ${e.kind}, aucune requête`, e);
    else fail(s, `${label} — ${e.kind}`, e);
  }
  // polices : @font-face et @import doivent pointer vers des fichiers livrés
  for (const [f, src] of text) {
    if (!f.endsWith('.css')) continue;
    for (const block of src.match(/@font-face\s*{[^}]*}/gi) ?? []) {
      for (const m of block.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
        const u = m[1];
        if (/^data:/i.test(u)) continue;
        if (/^(?:https?:)?\/\//i.test(u)) {
          fail(s, `${f} : police distante ${u}`);
          continue;
        }
        const target = path.resolve(path.dirname(path.join(dir, f)), u.split(/[?#]/)[0]);
        if (!fs.existsSync(target)) fail(s, `${f} : police locale manquante ${u}`);
      }
    }
    for (const m of src.matchAll(/@import\s+(?:url\()?\s*["']?((?:https?:)?\/\/[^"')\s]+)/gi)) fail(s, `${f} : @import distant ${m[1]}`);
  }
}

// ---------- chaînes livrées (JS : AST ; HTML : textes et attributs) ----------
const socialSrc = fs.existsSync(socialFile) ? fs.readFileSync(socialFile, 'utf8') : '';
// termes du dictionnaire social (« credits », « credit »…) : présents par nature dans le JS livré
const SOCIAL_FROM = new Set([...socialSrc.matchAll(/\[\s*(['"])((?:(?!\1).)*)\1\s*,\s*(['"])((?:(?!\3).)*)\3\s*\]/g)].map((m) => m[2].toLowerCase()));

async function jsStrings(src) {
  try {
    const { parseAst } = await import('rollup/parseAst');
    const out = [];
    const stack = [parseAst(src)];
    while (stack.length) {
      const n = stack.pop();
      if (!n || typeof n !== 'object') continue;
      if (Array.isArray(n)) {
        for (const c of n) stack.push(c);
        continue;
      }
      if (n.type === 'Literal' && typeof n.value === 'string') out.push(n.value);
      else if (n.type === 'TemplateElement') out.push(n.value?.cooked ?? n.value?.raw ?? '');
      for (const k in n) if (k !== 'type' && n[k] && typeof n[k] === 'object') stack.push(n[k]);
    }
    return { strings: out, parsed: true };
  } catch {
    // repli grossier : littéraux entre guillemets
    return { strings: [...src.matchAll(/"((?:[^"\\\n]|\\.){1,400})"|'((?:[^'\\\n]|\\.){1,400})'/g)].map((m) => m[1] ?? m[2]), parsed: false };
  }
}

// ---------- (e) mots interdits ----------
const WORDS = /(?<![\p{L}\p{N}_])(démo|demo|fun|crédits?|credits?)(?![\p{L}\p{N}_])/giu;
const norm = (v) => String(v).normalize('NFC').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const BUTTON_KEY = /(^|[._-])(go|btn|button|cta|ok|next|resume|continue|confirm|action)$/i;
const isContinueButton = (value, key = '') => {
  const n = norm(value);
  return /^(continue|continuer)$/.test(n) || (BUTTON_KEY.test(key) && /(^| )(continue|continuer)( |$)/.test(n) && n.split(' ').length <= 3);
};
const forbiddenIn = (v) => [...new Set([...String(v).normalize('NFC').matchAll(WORDS)].map((m) => m[1].toLowerCase()))];

const locales = {};
{
  const s = section('e', 'Mots interdits (locales et JS livrés)');
  if (!fs.existsSync(localesDir)) fail(s, `dossier de locales introuvable : ${localesDir}`);
  else {
    for (const f of fs.readdirSync(localesDir).filter((x) => x.endsWith('.json')).sort()) {
      const flat = {};
      const rec = (o, pre) => {
        for (const [k, v] of Object.entries(o)) {
          if (v && typeof v === 'object') rec(v, `${pre}${k}.`);
          else if (typeof v === 'string') flat[`${pre}${k}`] = v;
        }
      };
      rec(readJson(path.join(localesDir, f)), '');
      locales[f] = flat;
      for (const [k, v] of Object.entries(flat)) {
        const w = forbiddenIn(v);
        if (w.length) fail(s, `${f} ${k} : « ${v} » contient ${w.join(', ')}`, { file: f, key: k, value: v, words: w });
        if (isContinueButton(v, k)) fail(s, `${f} ${k} : libellé de bouton « ${v} »`, { file: f, key: k, value: v, words: ['continue'] });
      }
    }
    info(s, `${Object.keys(locales).length} locale(s) : ${Object.keys(locales).join(', ')}`);
  }
  const localeValues = new Set(Object.values(locales).flatMap((d) => Object.values(d)));
  for (const [f, src] of text) {
    if (!/\.(m?js|cjs)$/.test(f)) continue;
    const { strings, parsed } = await jsStrings(src);
    if (!parsed) warn(s, `${f} : analyse AST impossible, repli par expression régulière`);
    const done = new Set();
    let ignored = 0;
    for (const str of strings) {
      if (done.has(str)) continue;
      done.add(str);
      const w = forbiddenIn(str);
      const btn = isContinueButton(str);
      if (!w.length && !btn) continue;
      const short = str.length > 90 ? `${str.slice(0, 90)}…` : str;
      const fromLocale = localeValues.has(str) ? ' (texte de locale)' : '';
      if (w.length && !btn && SOCIAL_FROM.has(str.toLowerCase())) ignored++;
      else if (w.length && !btn && /^[a-z][A-Za-z0-9_.:/-]*$/.test(str)) warn(s, `${f} : identifiant technique « ${short} » (${w.join(', ')}) — non affiché ?`, { file: f, value: str, words: w });
      else if (btn) fail(s, `${f} : libellé de bouton « ${short} »${fromLocale}`, { file: f, value: str, words: ['continue'] });
      else fail(s, `${f} : « ${short} »${fromLocale} contient ${w.join(', ')}`, { file: f, value: str, words: w });
    }
    if (ignored) info(s, `${f} : ${ignored} terme(s) du dictionnaire social ignoré(s)`);
  }
  // HTML : texte, boutons, attributs visibles
  for (const [f, src] of text) {
    if (!/\.html?$/.test(f)) continue;
    const body = src.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
    const visible = [...body.replace(/<[^>]+>/g, '\n').split('\n'), ...[...body.matchAll(/\b(?:aria-label|alt|title|placeholder|value)\s*=\s*["']([^"']*)["']/gi)].map((m) => m[1])];
    for (const t of visible.map((x) => x.trim()).filter(Boolean)) {
      const w = forbiddenIn(t);
      if (w.length) fail(s, `${f} : « ${t} » contient ${w.join(', ')}`, { file: f, value: t, words: w });
    }
    for (const m of body.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)) {
      if (isContinueButton(m[1].replace(/<[^>]+>/g, ' '))) fail(s, `${f} : bouton « ${m[1].trim()} »`);
    }
  }
}

// ---------- (f) mode social ----------
async function loadSocial() {
  try {
    const { tsImport } = await import('tsx/esm/api');
    return await tsImport(pathToFileURL(socialFile).href, import.meta.url);
  } catch {
    // repli : transpilation esbuild dans un module temporaire
    const { transform } = await import('esbuild');
    const out = await transform(socialSrc, { loader: 'ts', format: 'esm' });
    const tmp = path.join(os.tmpdir(), `boomtooth-social-${process.pid}.mjs`);
    fs.writeFileSync(tmp, out.code);
    try {
      return await import(pathToFileURL(tmp).href);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
}
{
  const s = section('f', 'Mode social (dictionnaire de social.ts sur en.json)');
  const en = locales['en.json'];
  if (!socialSrc) fail(s, `introuvable : ${socialFile}`);
  else if (!en) fail(s, 'en.json introuvable dans les locales');
  else {
    const mod = await loadSocial();
    if (typeof mod.socialize !== 'function' || typeof mod.socialViolations !== 'function') fail(s, 'socialize / socialViolations non exportés par social.ts');
    else {
      let changed = 0;
      for (const [k, v] of Object.entries(en)) {
        const out = mod.socialize(v);
        if (out !== v) changed++;
        const bad = mod.socialViolations(out);
        if (bad.length) fail(s, `en.json ${k} : « ${out} » garde ${bad.join(', ')}`, { key: k, before: v, after: out, words: bad });
      }
      info(s, `${Object.keys(en).length} chaînes, ${changed} transformée(s), ${SOCIAL_FROM.size} termes au dictionnaire`);
    }
  }
}

// ---------- (g) poids ----------
{
  const s = section('g', 'Poids de la build');
  const total = files.reduce((a, f) => a + f.size, 0);
  const byExt = {};
  for (const f of files) byExt[f.ext || '(sans)'] = (byExt[f.ext || '(sans)'] ?? 0) + f.size;
  info(s, `total ${human(total)} en ${files.length} fichiers`, { totalBytes: total, files: files.length });
  info(s, `par type : ${Object.entries(byExt).sort((a, b) => b[1] - a[1]).map(([e, b]) => `${e} ${human(b)}`).join(', ')}`, { byExt });
  const top = [...files].sort((a, b) => b.size - a.size).slice(0, 10);
  report.weights = { totalBytes: total, count: files.length, byExt, top: top.map((f) => ({ file: f.rel, bytes: f.size })) };
  for (const f of top) info(s, `${human(f.size).padStart(10)}  ${f.rel}`);
}

// ---------- sortie ----------
const failures = report.sections.reduce((a, s) => a + s.items.filter((i) => i.level === 'échec' || i.level === 'bloquant').length, 0);
const warnings = report.sections.reduce((a, s) => a + s.items.filter((i) => i.level === 'avertissement').length, 0);
report.result = report.stakeBlocked ? 'bloquant-stake' : failures ? 'échec' : 'ok';
report.counts = { failures, warnings };
const LABEL = { ok: 'OK', avertissement: 'AVERTISSEMENT', échec: 'ÉCHEC', bloquant: 'BLOQUANT' };
const MAX = 12;
console.log(`check-release — ${rel(process.cwd(), dir) || '.'} (${files.length} fichiers, ${human(report.weights.totalBytes)})${opt.stake ? ' [--stake]' : ''}`);
for (const s of report.sections) {
  console.log(`[${s.id}] ${s.title.padEnd(52, '.')} ${LABEL[s.status]}`);
  const shown = s.id === 'g' ? s.items : s.items.filter((i) => i.level !== 'info' || s.status === 'ok');
  for (const it of shown.slice(0, MAX)) console.log(`    ${it.level === 'info' ? '·' : it.level === 'avertissement' ? '!' : '✗'} ${it.msg}`);
  if (shown.length > MAX) console.log(`    … +${shown.length - MAX} (voir le JSON)`);
}
console.log(`Résultat : ${report.result.toUpperCase()} (${failures} échec(s), ${warnings} avertissement(s))`);
if (typeof opt.json === 'string') {
  fs.mkdirSync(path.dirname(path.resolve(opt.json)), { recursive: true });
  fs.writeFileSync(path.resolve(opt.json), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`JSON : ${opt.json}`);
}
process.exit(report.stakeBlocked ? 2 : failures ? 1 : 0);
