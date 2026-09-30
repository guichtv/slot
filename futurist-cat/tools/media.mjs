// Stake media: checks CYBERCAT-BG (ImageGen, no text, no cat) + CYBERCAT-FG (HD render of the cat
// from the GLB, alpha) < 3 MB together, writes the overlay preview (FG on BG) and a size report.
//   node tools/media.mjs
import sharp from 'sharp';
import { existsSync, statSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const M = resolve(ROOT, 'media');
mkdirSync(M, { recursive: true });
const find = (base) => ['webp', 'png', 'jpg'].map((e) => join(M, `${base}.${e}`)).find(existsSync) ?? null;
const bg = find('CYBERCAT-BG'), fg = find('CYBERCAT-FG');
const report = { files: {}, ok: true, notes: [] };
for (const f of readdirSync(M)) report.files[f] = statSync(join(M, f)).size;
if (!bg) { report.ok = false; report.notes.push('CYBERCAT-BG absent (mission ImageGen media)'); }
if (!fg) { report.ok = false; report.notes.push('CYBERCAT-FG absent (npm run cat:poses depuis le GLB)'); }
if (bg && fg) {
  // FG must be a transparent PNG/WebP; BG + FG < 3 MB
  let fgBuf = await sharp(fg).webp({ quality: 90, alphaQuality: 100 }).toBuffer();
  const fgOut = join(M, 'CYBERCAT-FG.webp');
  if (!fg.endsWith('.webp')) writeFileSync(fgOut, fgBuf);
  const bgBuf = await sharp(bg).resize(1920, 1080, { fit: 'cover' }).webp({ quality: 86 }).toBuffer();
  writeFileSync(join(M, 'CYBERCAT-BG.webp'), bgBuf);
  const total = bgBuf.length + fgBuf.length;
  report.bgPlusFg = total;
  if (total > 3 * 1024 * 1024) { report.ok = false; report.notes.push(`BG + FG = ${(total / 1048576).toFixed(2)} Mo > 3 Mo`); }
  const meta = await sharp(fgBuf).metadata();
  const h = Math.round(1080 * 0.86), w = Math.round((meta.width / meta.height) * h);
  const fgSmall = await sharp(fgBuf).resize(w, h).png().toBuffer();
  await sharp(bgBuf).composite([{ input: fgSmall, left: 1920 - w - 120, top: 1080 - h - 20 }]).png().toFile(join(M, 'apercu-superpose.png'));
  report.notes.push('apercu-superpose.png ecrit');
}
writeFileSync(join(M, 'media-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
