// npm run assets : ImageGen sources (assets/generated/<mission>/<id>.png) -> public/assets/<out>.webp
// + public/assets/manifest.json + contact sheets (light/dark) + provenance (docs/IMAGEGEN.md).
// Steps per image: chroma key if needed (#00FF00, reported), alpha normalised (<=3 -> 0,
// >=252 -> 255), halo check on the alpha edge, trim with margin (not for 9-slice / sheets /
// full-bleed decor), resize, WebP. The visible alpha box is stored for symbol sizing.
import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.CC_ROOT ? resolve(process.env.CC_ROOT) : resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const plan = JSON.parse(readFileSync(resolve(ROOT, 'assets/plan.json'), 'utf8'));
const OUT = resolve(ROOT, 'public/assets');
const PROOF = resolve(ROOT, 'docs/preuves/assets');
mkdirSync(OUT, { recursive: true }); mkdirSync(PROOF, { recursive: true });
const manifestPath = resolve(OUT, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { version: 1, images: {} };
manifest.version = 1;
const report = { processed: [], missing: [], warnings: [] };

const MAX = { symbols: 512, decor: 1920, ui: 1024, mech: 256, grid: 1024, shop: 600, fx: 1024 };
function targetMax(id, v) {
  if (v.maxW) return v.maxW;
  if (id.startsWith('sym.')) return id.includes('.rotor') ? 128 : id.split('.').length > 2 ? 256 : MAX.symbols;
  if (id.startsWith('decor.')) return MAX.decor;
  if (id.startsWith('mech.')) return MAX.mech;
  if (id.startsWith('shop.')) return MAX.shop;
  if (id.startsWith('grid.')) return MAX.grid;
  return MAX.ui;
}

function findSource(id, lot) {
  for (const ext of ['png', 'webp', 'jpg', 'jpeg']) { const p = resolve(ROOT, `assets/generated/${lot}/${id}.${ext}`); if (existsSync(p)) return p; }
  return null;
}

async function processOne(id, v) {
  const src = findSource(id, v.lot);
  if (!src) { report.missing.push({ id, lot: v.lot, required: v.required }); return; }
  let img = sharp(src).ensureAlpha();
  let { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const px = W * H;
  let chroma = false;
  if (v.alpha) {
    // real alpha present?
    let transparent = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 250) transparent++;
    if (transparent < px * 0.002) {
      // no alpha: chroma #00FF00 key (with spill suppression), reported
      let keyed = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const greenness = g - Math.max(r, b);
        if (g > 150 && greenness > 90) { data[i + 3] = 0; keyed++; }
        else if (greenness > 30) { data[i + 1] = Math.max(r, b) + 10; data[i + 3] = Math.min(data[i + 3], 255 - Math.min(255, greenness * 2)); }
      }
      chroma = keyed > px * 0.05;
      if (chroma) report.warnings.push(`${id}: fond chroma #00FF00 detoure (${Math.round((100 * keyed) / px)} %)`);
      else report.warnings.push(`${id}: image opaque alors qu'un alpha est attendu`);
    }
    // alpha normalisation
    for (let i = 3; i < data.length; i += 4) { if (data[i] >= 252) data[i] = 255; else if (data[i] <= 3) data[i] = 0; }
    // halo check: semi-transparent light pixels on the silhouette edge
    let edge = 0, halo = 0;
    for (let y = 1; y < H - 1; y += 2) for (let x = 1; x < W - 1; x += 2) {
      const i = (y * W + x) * 4, a = data[i + 3];
      if (a > 0 && a < 200) { edge++; if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200 && a < 120) halo++; }
    }
    if (edge && halo / edge > 0.35) report.warnings.push(`${id}: frange claire probable sur ${Math.round((100 * halo) / edge)} % du bord`);
    // cut subject: opaque pixels touching the canvas border
    let touch = 0;
    for (let x = 0; x < W; x++) { if (data[(x) * 4 + 3] > 128) touch++; if (data[((H - 1) * W + x) * 4 + 3] > 128) touch++; }
    for (let y = 0; y < H; y++) { if (data[(y * W) * 4 + 3] > 128) touch++; if (data[(y * W + W - 1) * 4 + 3] > 128) touch++; }
    if (touch > 8 && !v.slice9 && !id.startsWith('decor.') && !id.startsWith('ui.panel')) report.warnings.push(`${id}: le sujet touche le bord (${touch} px) : possiblement coupe`);
  }
  img = sharp(data, { raw: { width: W, height: H, channels: 4 } });
  // trim (sprites only)
  const trim = v.alpha && !v.slice9 && !v.sheet && !id.startsWith('decor.') && !id.startsWith('ui.panel') && !id.startsWith('ui.popup');
  let box = [0, 0, W, H];
  if (v.alpha) {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 >= 0) box = [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
  }
  let cropped = { left: 0, top: 0, width: W, height: H };
  if (trim && box[2] < W) {
    const m = Math.round(Math.max(box[2], box[3]) * 0.04);
    const side = id.startsWith('sym.') ? Math.max(box[2], box[3]) + 2 * m : 0; // symbols stay square
    if (side) {
      const cx = box[0] + box[2] / 2, cy = box[1] + box[3] / 2;
      const left = Math.round(cx - side / 2), top = Math.round(cy - side / 2);
      const ext = { left: Math.max(0, -left), top: Math.max(0, -top), right: Math.max(0, left + side - W), bottom: Math.max(0, top + side - H) };
      img = img.extend({ ...ext, background: { r: 0, g: 0, b: 0, alpha: 0 } });
      cropped = { left: left + ext.left, top: top + ext.top, width: side, height: side };
    } else {
      cropped = { left: Math.max(0, box[0] - m), top: Math.max(0, box[1] - m), width: Math.min(W, box[2] + 2 * m), height: Math.min(H, box[3] + 2 * m) };
      cropped.width = Math.min(cropped.width, W - cropped.left); cropped.height = Math.min(cropped.height, H - cropped.top);
    }
    img = sharp(await img.png().toBuffer()).extract(cropped);
  }
  const maxD = targetMax(id, v);
  const cw = cropped.width, ch = cropped.height;
  const k = Math.min(1, maxD / Math.max(cw, ch));
  const w = Math.round(cw * k), h = Math.round(ch * k);
  const outRel = v.out.replace(/\.(png|jpg|jpeg)$/, '.webp').startsWith('../../') ? v.out : v.out.replace(/\.(png|jpg|jpeg)$/, '.webp');
  const outPath = resolve(OUT, outRel);
  mkdirSync(dirname(outPath), { recursive: true });
  let pipe = img.resize(w, h, { kernel: 'lanczos3' });
  if (outPath.endsWith('.png')) await pipe.png({ compressionLevel: 9 }).toFile(outPath);
  else await pipe.webp({ quality: 88, alphaQuality: 100, effort: 6, smartSubsample: true }).toFile(outPath);
  const bbox = [Math.round((box[0] - cropped.left) * k), Math.round((box[1] - cropped.top) * k), Math.round(box[2] * k), Math.round(box[3] * k)];
  if (!outRel.startsWith('../')) {
    manifest.images[id] = { file: outRel, w, h, ...(v.alpha ? { bbox } : {}), ...(v.slice9 ? { slice9: v.slice9.map((x) => Math.round(x * (w / v.size[0]))) } : {}), ...(v.sheet ? { sheet: v.sheet } : {}) };
  }
  const fill = v.alpha ? +(Math.max(bbox[2] / w, bbox[3] / h)).toFixed(3) : 1;
  report.processed.push({ id, lot: v.lot, src: relative(ROOT, src), out: relative(ROOT, outPath), w, h, bytes: statSync(outPath).size, chroma, fill, prompt: existsSync(src.replace(/\.\w+$/, '.prompt.txt')) });
}

const ids = Object.entries(plan.images).filter(([, v]) => v.out);
for (const [id, v] of ids) {
  try { await processOne(id, v); } catch (e) { report.warnings.push(`${id}: ${e.message}`); }
}
manifest.images = Object.fromEntries(Object.entries(manifest.images).filter(([k]) => plan.images[k]));
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// contact sheets on light and dark
async function sheet(bg, name) {
  const items = report.processed.filter((p) => !p.out.includes('media/') && existsSync(resolve(ROOT, p.out)));
  if (!items.length) return;
  const cell = 220, cols = 8, rows = Math.ceil(items.length / cols);
  const comps = [];
  for (let i = 0; i < items.length; i++) {
    const p = items[i];
    const buf = await sharp(resolve(ROOT, p.out)).resize(cell - 20, cell - 40, { fit: 'inside' }).png().toBuffer();
    const m = await sharp(buf).metadata();
    comps.push({ input: buf, left: (i % cols) * cell + Math.round((cell - m.width) / 2), top: Math.floor(i / cols) * cell + 6 });
    const label = Buffer.from(`<svg width="${cell}" height="24"><text x="${cell / 2}" y="16" font-family="monospace" font-size="12" text-anchor="middle" fill="${bg === '#E9EEF5' ? '#223' : '#cde'}">${p.id}</text></svg>`);
    comps.push({ input: label, left: (i % cols) * cell, top: Math.floor(i / cols) * cell + cell - 26 });
  }
  await sharp({ create: { width: cols * cell, height: rows * cell, channels: 4, background: bg } }).composite(comps).png().toFile(resolve(PROOF, name));
}
await sheet('#E9EEF5', 'planche-claire.png');
await sheet('#0B1230', 'planche-sombre.png');
writeFileSync(resolve(PROOF, 'assets-report.json'), JSON.stringify(report, null, 2));

// provenance
const prov = [
  '# IMAGEGEN - provenance des illustrations', '',
  'Toutes les illustrations viennent d\'ImageGen (outil natif image_gen de Codex CLI), une mission par lot (`docs/imagegen/<mission>.txt`). Sources : `assets/generated/`. Exports : `public/assets/`.', '',
  `Traitées : ${report.processed.length} ; manquantes : ${report.missing.length} (dont requises : ${report.missing.filter((m) => m.required).length}).`, '',
  '| id | mission | source | prompt | sortie | taille | Ko | alpha | remplissage |', '|---|---|---|---|---|---|---|---|---|',
  ...report.processed.map((p) => `| ${p.id} | ${p.lot} | \`${p.src}\` | ${p.prompt ? 'oui' : 'NON'} | \`${p.out}\` | ${p.w}x${p.h} | ${Math.round(p.bytes / 1024)} | ${p.chroma ? 'chroma' : 'oui'} | ${p.fill} |`),
  '', '## Manquantes', '', ...(report.missing.length ? report.missing.map((m) => `- ${m.id} (${m.lot})${m.required ? ' **requise**' : ''}`) : ['- aucune']),
  '', '## Alertes', '', ...(report.warnings.length ? report.warnings.map((w) => `- ${w}`) : ['- aucune']), '',
];
writeFileSync(resolve(ROOT, 'docs/IMAGEGEN.md'), prov.join('\n'));
console.log(`[assets] ${report.processed.length} traitees, ${report.missing.length} manquantes (${report.missing.filter((m) => m.required).length} requises), ${report.warnings.length} alerte(s)`);
