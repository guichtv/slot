// Test de chevauchement du HUD sur ~25 tailles d'écran (un navigateur, un contexte par taille, en série) :
//   node tools/hud-check.mjs [--sizes=390x844,1920x1080,400x700m] [--query=lang=fr] [--out=captures/hud]
//        [--wait=600] [--frame=100] [--no-annotate] [--mobile]
// Pour chaque taille : ouvre le jeu (?qa), avance 600 ms virtuelles, puis vérifie dans la page :
//  - chaque bouton visible de .hud (et chaque .hud-val) est entièrement dans la fenêtre ;
//  - aucun chevauchement entre deux éléments visibles du HUD (tolérance 1 px) ;
//  - cibles tactiles >= 44x44 px sur mobile (tolérance d'arrondi 0,5 px) ;
//  - aucune valeur tronquée (.hud-value : scrollWidth <= clientWidth + 1) ;
//  - aucun bouton du HUD ne recouvre la grille (__qa.layout().grid, tolérance 1 px).
// Sorties : captures/hud/<l>x<h>.png (éléments fautifs encadrés en rouge), report.json, sheet.png.
// Code de sortie 1 s'il y a un échec. Taille hors liste : suffixe « m » pour mobile (ex. 400x700m).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { launch, openGame, step, BASE_URL } from './lib/browser.mjs';
import { parseArgs, parseSize } from './lib/cli.mjs';

// [largeur, hauteur, famille, mobile (isMobile + hasTouch)]
const SIZES = [
  [2560, 1440, 'bureau', false], [1920, 1080, 'bureau', false], [1536, 864, 'bureau', false],
  [1440, 900, 'bureau', false], [1366, 768, 'bureau', false], [1280, 720, 'bureau', false],
  [1280, 800, 'portable', false], [1024, 768, 'portable', false],
  [768, 1024, 'tablette', true], [820, 1180, 'tablette', true], [1024, 1366, 'tablette', true], [1180, 820, 'tablette', true],
  [320, 568, 'téléphone portrait', true], [360, 640, 'téléphone portrait', true], [375, 667, 'téléphone portrait', true],
  [390, 844, 'téléphone portrait', true], [393, 852, 'téléphone portrait', true], [412, 915, 'téléphone portrait', true],
  [430, 932, 'téléphone portrait', true],
  [568, 320, 'téléphone paysage', true], [667, 375, 'téléphone paysage', true], [740, 360, 'téléphone paysage', true],
  [844, 390, 'téléphone paysage', true], [932, 430, 'téléphone paysage', true],
  [500, 500, 'carré', false],
];

const TOL = 1;
const MIN_TOUCH = 44;

const { opt } = parseArgs(process.argv.slice(2), { booleans: ['no-annotate', 'mobile'] });
let sizes = SIZES;
if (typeof opt.sizes === 'string') {
  sizes = opt.sizes.split(',').filter(Boolean).map((s) => {
    const mob = /m$/i.test(s.trim());
    const sz = parseSize(s.trim().replace(/m$/i, ''));
    if (!sz) throw new Error(`taille invalide : ${s}`);
    const known = SIZES.find(([w, h]) => w === sz.w && h === sz.h);
    return known ?? [sz.w, sz.h, 'personnalisée', mob];
  });
}
if (opt.mobile) sizes = sizes.map(([w, h, f]) => [w, h, f, true]);
const outDir = path.resolve(opt.out ?? 'captures/hud');
fs.mkdirSync(outDir, { recursive: true });
const waitMs = Number(opt.wait ?? 600);
const frame = Number(opt.frame ?? 100);

/** Exécuté dans la page : mesure le HUD et renvoie les échecs. */
function inspect({ tol, minTouch, mobile }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const hud = document.querySelector('.hud');
  if (!hud) return { error: 'élément .hud introuvable' };
  const L = window.__qa.layout();
  const grid = L && L.grid ? { x: L.grid.x, y: L.grid.y, w: L.grid.w, h: L.grid.h } : null;
  const visible = (el) =>
    typeof el.checkVisibility === 'function' ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : el.getClientRects().length > 0;
  const nameOf = (el) => {
    if (el.dataset.key) return el.dataset.key;
    const c = [...el.classList].find((x) => x !== 'hud-val' && x.startsWith('hud-'));
    return `val:${c ? c.replace(/^hud-/, '').replace(/-val$/, '') : '?'}`;
  };
  const r1 = (v) => Math.round(v * 10) / 10;
  const box = (r) => ({ x: r1(r.x), y: r1(r.y), w: r1(r.width ?? r.w), h: r1(r.height ?? r.h) });
  const fmt = (r) => `${r.x},${r.y} ${r.w}×${r.h}`;
  const inter = (a, b) => [Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)];

  const items = [];
  for (const el of hud.querySelectorAll('.hud-btn, .hud-val')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5) continue;
    items.push({ name: nameOf(el), kind: el.classList.contains('hud-btn') ? 'bouton' : 'valeur', r: box(r) });
  }
  const failures = [];
  const warnings = [];
  // 1. entièrement dans la fenêtre
  for (const it of items) {
    const { x, y, w, h } = it.r;
    if (x < -tol || y < -tol || x + w > vw + tol || y + h > vh + tol) failures.push({ type: 'hors-fenêtre', elements: [it.name], detail: `${fmt(it.r)} dépasse ${vw}x${vh}` });
  }
  // 2. chevauchements deux à deux
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const [ix, iy] = inter(items[i].r, items[j].r);
      if (ix > tol && iy > tol) failures.push({ type: 'chevauchement', elements: [items[i].name, items[j].name], detail: `${r1(ix)}×${r1(iy)} px` });
    }
  }
  // 3. cibles tactiles
  if (mobile) {
    for (const it of items) {
      if (it.kind !== 'bouton') continue;
      if (it.r.w < minTouch - 0.5 || it.r.h < minTouch - 0.5) failures.push({ type: 'cible-tactile', elements: [it.name], detail: `${it.r.w}×${it.r.h} < ${minTouch}×${minTouch}` });
    }
  }
  // 4. valeurs tronquées (+ étiquettes qui débordent de leur case : avertissement)
  for (const v of hud.querySelectorAll('.hud-value')) {
    if (!visible(v)) continue;
    if (v.scrollWidth > v.clientWidth + 1) {
      failures.push({ type: 'valeur-tronquée', elements: [nameOf(v.closest('.hud-val'))], detail: `« ${v.textContent} » ${v.scrollWidth} > ${v.clientWidth} px` });
    }
  }
  for (const lab of hud.querySelectorAll('.hud-label')) {
    if (!visible(lab)) continue;
    const pb = lab.parentElement.getBoundingClientRect();
    const lb = lab.getBoundingClientRect();
    if (lb.width > pb.width + 1) warnings.push({ type: 'étiquette-déborde', elements: [nameOf(lab.parentElement)], detail: `« ${lab.textContent} » ${r1(lb.width)} > ${r1(pb.width)} px` });
  }
  // 5. aucun bouton sur la grille
  if (grid) {
    for (const it of items) {
      if (it.kind !== 'bouton') continue;
      const [ix, iy] = inter(it.r, grid);
      if (ix > tol && iy > tol) failures.push({ type: 'recouvre-grille', elements: [it.name], detail: `${r1(ix)}×${r1(iy)} px sur la grille` });
    }
  } else warnings.push({ type: 'grille-inconnue', elements: [], detail: '__qa.layout().grid absent' });
  return { vw, vh, cls: L ? L.cls : hud.dataset.layout, grid: grid && box(grid), hud: box(hud.getBoundingClientRect()), items, failures, warnings };
}

/** Encadre les éléments fautifs (et la grille si elle est recouverte) avant la capture. */
function annotate({ rects, grid }) {
  const layer = document.createElement('div');
  layer.id = 'hud-check-overlay';
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  const add = (r, css) => {
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;box-sizing:border-box;${css}`;
    layer.append(d);
  };
  if (grid) add(grid, 'border:2px dashed #00e5ff');
  for (const r of rects) add(r, 'border:2px solid #ff1744;background:rgba(255,23,68,.18)');
  document.body.append(layer);
}

const browser = await launch();
const results = [];
const t0 = Date.now();
console.log(`hud-check : ${sizes.length} tailles sur ${BASE_URL}`);
for (const [w, h, family, mobile] of sizes) {
  const size = `${w}x${h}`;
  const png = path.join(outDir, `${size}.png`);
  const res = { size, w, h, family, mobile, ok: false, png: path.relative(process.cwd(), png) };
  let ctx;
  try {
    const g = await openGame(browser, { w, h, query: opt.query ?? '', mobile });
    ctx = g.ctx;
    await step(g.page, waitMs, frame);
    await g.page.evaluate(() => document.fonts.ready.then(() => true));
    const m = await g.page.evaluate(inspect, { tol: TOL, minTouch: MIN_TOUCH, mobile });
    if (m.error) throw new Error(m.error);
    Object.assign(res, m);
    res.ok = m.failures.length === 0;
    if (!res.ok && !opt['no-annotate']) {
      const bad = new Set(m.failures.flatMap((f) => f.elements));
      const rects = m.items.filter((it) => bad.has(it.name)).map((it) => it.r);
      const gridHit = m.failures.some((f) => f.type === 'recouvre-grille');
      await g.page.evaluate(annotate, { rects, grid: gridHit ? m.grid : null });
    }
    await g.page.screenshot({ path: png });
    if (g.errors.length) res.pageErrors = g.errors.slice(0, 10);
  } catch (e) {
    res.error = String(e.message ?? e).split('\n')[0];
    res.failures = [{ type: 'erreur', elements: [], detail: res.error }];
  } finally {
    await ctx?.close().catch(() => {});
  }
  results.push(res);
  const tag = res.ok ? 'OK ' : 'ÉCHEC';
  const why = res.ok ? '' : ` — ${res.failures.map((f) => `${f.type}(${f.elements.join('/')})`).join(', ')}`;
  console.log(`${tag} ${size.padEnd(9)} ${String(res.cls ?? '?').padEnd(14)}${mobile ? ' tactile' : '        '}${why}`);
}
await browser.close();

// planche de vignettes (bordure verte / rouge)
const TW = 300;
const TH = 210;
const LH = 26;
const PAD = 10;
const COLS = Math.min(5, results.length);
const tiles = [];
for (const [i, r] of results.entries()) {
  const x = PAD + (i % COLS) * (TW + PAD);
  const y = PAD + Math.floor(i / COLS) * (TH + LH + PAD);
  const color = r.ok ? '#2e7d32' : '#c62828';
  if (fs.existsSync(path.resolve(r.png))) {
    const buf = await sharp(path.resolve(r.png)).resize(TW - 6, TH - 6, { fit: 'contain', background: '#111111' }).png().toBuffer();
    tiles.push({ input: await sharp({ create: { width: TW, height: TH, channels: 3, background: color } }).composite([{ input: buf, left: 3, top: 3 }]).png().toBuffer(), left: x, top: y });
  }
  const label = `${r.size} ${r.cls ?? ''}${r.mobile ? ' ☐' : ''} — ${r.ok ? 'OK' : `${r.failures.length} échec(s)`}`.replace('☐', 'tactile');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${LH}"><rect width="100%" height="100%" fill="${color}"/><text x="8" y="18" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#fff">${label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`;
  tiles.push({ input: Buffer.from(svg), left: x, top: y + TH });
}
const rows = Math.ceil(results.length / COLS);
await sharp({ create: { width: PAD + COLS * (TW + PAD), height: PAD + rows * (TH + LH + PAD), channels: 3, background: '#1b1410' } })
  .composite(tiles)
  .png()
  .toFile(path.join(outDir, 'sheet.png'));

const failed = results.filter((r) => !r.ok);
const report = {
  generatedAt: new Date().toISOString(),
  url: BASE_URL,
  query: opt.query ?? '',
  rules: { tolerancePx: TOL, minTouchPx: MIN_TOUCH, waitMs, frameMs: frame },
  summary: { total: results.length, ok: results.length - failed.length, failed: failed.length, seconds: Math.round((Date.now() - t0) / 1000) },
  results,
};
fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n${results.length - failed.length}/${results.length} tailles OK en ${report.summary.seconds} s — ${path.relative(process.cwd(), outDir)}/report.json, sheet.png`);
for (const r of failed) for (const f of r.failures) console.log(`  ✗ ${r.size} ${f.type} [${f.elements.join(', ')}] ${f.detail}`);
const warned = results.filter((r) => r.warnings?.length);
if (warned.length) console.log(`  (avertissements : ${warned.map((r) => `${r.size} ${r.warnings.map((x) => x.type + '(' + x.elements.join('/') + ')').join(',')}`).join(' ; ')})`);
process.exit(failed.length ? 1 : 0);
