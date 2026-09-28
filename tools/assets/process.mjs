// Traitement déterministe des assets (npm run assets).
// Entrée : assets/generated/<famille>/*.png + tools/assets/assets.config.json
// Sortie : public/assets/<famille>/*.webp, atlas éventuels, public/assets/manifest.json,
//          planches de contrôle docs/imagegen/checks/<famille>.png (fond clair / sombre)
// Étapes : alpha normalisé (>=250 -> 255, <=3 -> 0), clé chroma #00FF00 si pas d'alpha,
//          rognage avec marge anti-fuite, découpe de planches par composantes connexes,
//          redimensionnement, export WebP, atlas avec padding, manifeste (dims, source, pivots, 9-slice).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const CONFIG = path.join(ROOT, 'tools/assets/assets.config.json');
const OUT = path.join(ROOT, 'public/assets');
const CHECKS = path.join(ROOT, 'docs/imagegen/checks');
const args = new Set(process.argv.slice(2));
const only = [...args].find((a) => a.startsWith('--only='))?.slice(7);

const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CHECKS, { recursive: true });

const manifestPath = path.join(OUT, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { version: 1, assets: {} };
manifest.assets ??= {};
const report = [];

async function loadRgba(file) {
  const img = sharp(file).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function alphaStats(buf) {
  const h = new Array(8).fill(0);
  let opaqueCorners = 0;
  for (let i = 3; i < buf.data.length; i += 4) h[buf.data[i] >> 5]++;
  const corners = [0, buf.width - 1, (buf.height - 1) * buf.width, buf.height * buf.width - 1];
  for (const c of corners) if (buf.data[c * 4 + 3] > 200) opaqueCorners++;
  return { histogram: h, opaqueCorners };
}

function hasUsefulAlpha(buf) {
  let transparent = 0;
  for (let i = 3; i < buf.data.length; i += 4) if (buf.data[i] < 16) transparent++;
  return transparent > buf.width * buf.height * 0.02;
}

function chromaKey(buf) {
  // fond vert #00FF00 : clé douce + suppression du débordement vert
  const d = buf.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const greenness = g - Math.max(r, b);
    if (greenness > 90 && g > 150) d[i + 3] = 0;
    else if (greenness > 40 && g > 120) {
      d[i + 3] = Math.round(255 * (1 - (greenness - 40) / 50));
      d[i + 1] = Math.max(r, b);
    } else if (greenness > 0) d[i + 1] = Math.max(r, b) + Math.round(greenness * 0.3);
  }
}

function normalizeAlpha(buf, hi = 250, lo = 3) {
  const d = buf.data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] >= hi) d[i] = 255;
    else if (d[i] <= lo) { d[i] = 0; d[i - 1] = 0; d[i - 2] = 0; d[i - 3] = 0; }
  }
}

function bbox(buf, threshold = 8, rect = null) {
  const { width, height, data } = buf;
  const x0 = rect ? rect.x : 0, y0 = rect ? rect.y : 0;
  const x1 = rect ? rect.x + rect.w : width, y1 = rect ? rect.y + rect.h : height;
  let minX = x1, minY = y1, maxX = -1, maxY = -1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (data[(y * width + x) * 4 + 3] > threshold) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function components(buf, threshold = 24, minArea = 400, dilate = 6) {
  // composantes connexes 8-voisinage sur un masque dilaté (regroupe les petits éclats d'une même pièce)
  const { width: W, height: H, data } = buf;
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (data[i * 4 + 3] > threshold) mask[i] = 1;
  let m = mask;
  for (let k = 0; k < dilate; k++) {
    const n = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (m[i] || (x > 0 && m[i - 1]) || (x < W - 1 && m[i + 1]) || (y > 0 && m[i - W]) || (y < H - 1 && m[i + W])) n[i] = 1;
    }
    m = n;
  }
  const label = new Int32Array(W * H).fill(-1);
  const boxes = [];
  const stack = [];
  for (let s = 0; s < W * H; s++) {
    if (!m[s] || label[s] >= 0) continue;
    const id = boxes.length;
    let minX = W, minY = H, maxX = 0, maxY = 0, area = 0;
    stack.push(s); label[s] = id;
    while (stack.length) {
      const i = stack.pop();
      const x = i % W, y = (i / W) | 0;
      if (mask[i]) area++;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (m[j] && label[j] < 0) { label[j] = id; stack.push(j); }
      }
    }
    boxes.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area });
  }
  const parts = boxes.filter((b) => b.area >= minArea);
  // ordre de lecture : bandes horizontales puis gauche -> droite
  parts.sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const rows = [];
  for (const p of parts) {
    const cy = p.y + p.h / 2;
    const row = rows.find((r) => Math.abs(r.cy - cy) < Math.max(r.h, p.h) * 0.5);
    if (row) row.items.push(p); else rows.push({ cy, h: p.h, items: [p] });
  }
  return rows.flatMap((r) => r.items.sort((a, b) => a.x - b.x));
}

function expand(r, margin, W, H) {
  const x = Math.max(0, r.x - margin), y = Math.max(0, r.y - margin);
  return { x, y, w: Math.min(W, r.x + r.w + margin) - x, h: Math.min(H, r.y + r.h + margin) - y };
}

async function exportRegion(buf, rect, spec, outFile) {
  let img = sharp(buf.data, { raw: { width: buf.width, height: buf.height, channels: 4 } }).extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h });
  let w = rect.w, h = rect.h;
  const scale = spec.scale ?? (spec.maxSize ? Math.min(1, spec.maxSize / Math.max(w, h)) : 1);
  if (scale !== 1) { w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale)); img = img.resize(w, h, { kernel: 'lanczos3' }); }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const opaque = spec.opaque === true;
  if (opaque) await img.removeAlpha().webp({ quality: spec.quality ?? 86, effort: 5 }).toFile(outFile);
  else await img.webp({ quality: spec.quality ?? 90, alphaQuality: 100, effort: 5, smartSubsample: true }).toFile(outFile);
  return { w, h, scale };
}

async function contactSheet(family, files) {
  if (!files.length) return;
  const cell = 256, pad = 12, cols = Math.min(6, files.length);
  const rows = Math.ceil(files.length / cols);
  const W = cols * (cell + pad) + pad, H = rows * (cell * 2 + pad * 2) + pad;
  const composites = [];
  const bg = Buffer.alloc(W * H * 4);
  for (let r = 0; r < rows; r++) for (let y = 0; y < cell * 2 + pad * 2; y++) {
    const yy = pad + r * (cell * 2 + pad * 2) + y;
    if (yy >= H) continue;
    const light = y < cell + pad;
    for (let x = 0; x < W; x++) {
      const i = (yy * W + x) * 4;
      const v = light ? 236 : 28;
      bg[i] = v; bg[i + 1] = light ? v : 22; bg[i + 2] = light ? v - 12 : 40; bg[i + 3] = 255;
    }
  }
  for (let k = 0; k < files.length; k++) {
    const c = k % cols, r = Math.floor(k / cols);
    const input = await sharp(files[k]).resize(cell, cell, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const left = pad + c * (cell + pad);
    const top = pad + r * (cell * 2 + pad * 2);
    composites.push({ input, left, top }, { input, left, top: top + cell + pad });
  }
  await sharp(bg, { raw: { width: W, height: H, channels: 4 } }).composite(composites).png().toFile(path.join(CHECKS, `${family}.png`));
}

function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16); }

async function processAsset(key, spec) {
  const src = path.join(ROOT, spec.src);
  if (!fs.existsSync(src)) { report.push({ key, status: 'missing', src: spec.src }); return []; }
  const buf = await loadRgba(src);
  const before = alphaStats(buf);
  if (!spec.opaque) {
    if (!hasUsefulAlpha(buf)) chromaKey(buf);
    normalizeAlpha(buf);
  }
  const outputs = [];
  if (spec.split) {
    // planche : une pièce par composante connexe, noms dans l'ordre de lecture
    const comps = components(buf, 24, spec.split.minArea ?? 400, spec.split.dilate ?? 6);
    const names = spec.split.names ?? [];
    const order = spec.split.order ?? comps.map((_, i) => i);
    if (comps.length !== names.length) report.push({ key, status: 'warn', message: `${comps.length} composantes pour ${names.length} noms` });
    for (let n = 0; n < names.length; n++) {
      const comp = comps[order[n]];
      if (!comp) continue;
      const rect = expand(bbox(buf, 8, comp) ?? comp, spec.margin ?? 6, buf.width, buf.height);
      const name = names[n];
      const out = path.join(OUT, spec.family, `${key}.${name}.webp`);
      const dims = await exportRegion(buf, rect, spec, out);
      const pivot = spec.split.pivots?.[name] ?? null;
      manifest.assets[`${key}.${name}`] = {
        url: `assets/${spec.family}/${key}.${name}.webp`, w: dims.w, h: dims.h, source: spec.src, sourceHash: sha(src),
        frame: rect, scale: dims.scale, pivot, family: spec.family,
      };
      outputs.push(out);
    }
  } else {
    const trimmed = spec.opaque || spec.noTrim ? { x: 0, y: 0, w: buf.width, h: buf.height } : bbox(buf, 8);
    if (!trimmed) { report.push({ key, status: 'empty', src: spec.src }); return []; }
    const rect = spec.opaque || spec.noTrim ? trimmed : expand(trimmed, spec.margin ?? 6, buf.width, buf.height);
    const out = path.join(OUT, spec.family, `${key}.webp`);
    const dims = await exportRegion(buf, rect, spec, out);
    manifest.assets[key] = {
      url: `assets/${spec.family}/${key}.webp`, w: dims.w, h: dims.h, source: spec.src, sourceHash: sha(src),
      frame: rect, scale: dims.scale, pivot: spec.pivot ?? null, nineSlice: spec.nineSlice ?? null, family: spec.family,
      visibleFill: spec.opaque ? 1 : +(Math.max(trimmed.w, trimmed.h) / Math.max(rect.w, rect.h)).toFixed(3),
    };
    outputs.push(out);
  }
  const after = alphaStats(buf);
  report.push({ key, status: 'ok', src: spec.src, outputs: outputs.length, alphaBefore: before.histogram, alphaAfter: after.histogram, opaqueCorners: after.opaqueCorners });
  return outputs;
}

const families = new Map();
for (const [key, spec] of Object.entries(cfg.assets)) {
  if (only && spec.family !== only && key !== only) continue;
  const outs = await processAsset(key, spec);
  if (!families.has(spec.family)) families.set(spec.family, []);
  families.get(spec.family).push(...outs);
}
for (const [family, files] of families) await contactSheet(family, files.filter((f) => fs.existsSync(f)));

manifest.generatedAt = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
fs.writeFileSync(path.join(CHECKS, 'report.json'), JSON.stringify(report, null, 1));
const missing = report.filter((r) => r.status === 'missing').length;
const warns = report.filter((r) => r.status === 'warn');
console.log(`assets: ${report.filter((r) => r.status === 'ok').length} ok, ${missing} manquants, ${warns.length} avertissements`);
for (const w of warns) console.log(`  ! ${w.key}: ${w.message}`);
