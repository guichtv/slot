// Renders still poses of the cat from the prepared GLB (same lighting as the game):
//   public/assets/cat/poses/{rest,alert,win,bigwin}.webp + poses.json  (fallback, section 4.6)
//   docs/imagegen/ref/cat-pose-ref.png                                  (palette/material reference for ImageGen)
//   media/CYBERCAT-FG.png                                               (Stake FG, HD with alpha)
//   node tools/cat-poses.mjs [--testrig]
import { createServer } from 'vite';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/browser.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TESTRIG = process.argv.includes('--testrig');
const GLB = TESTRIG ? '/tools/.work/test-rig.prepared.glb' : '/assets/cat/cat.glb';
const OUT = TESTRIG ? resolve(ROOT, 'tools/.work/poses') : resolve(ROOT, 'public/assets/cat/poses');
const REF = TESTRIG ? resolve(ROOT, 'tools/.work/poses') : resolve(ROOT, 'docs/imagegen/ref');
const MEDIA = TESTRIG ? resolve(ROOT, 'tools/.work/poses') : resolve(ROOT, 'media');
for (const d of [OUT, REF, MEDIA]) mkdirSync(d, { recursive: true });

// clip + time of each still (checked on the contact sheets)
const POSES = {
  rest: { clip: 'idle', t: 0 },
  alert: { clip: 'alert', t: 1.0 },
  win: { clip: 'hop', t: 0.55 },
  bigwin: { clip: 'dance', t: 0.9 },
};

const server = await createServer({ root: ROOT, configFile: resolve(ROOT, 'vite.config.ts'), logLevel: 'warn', server: { port: 5343, strictPort: true, host: '127.0.0.1', hmr: false } });
await server.listen();
const browser = await launch({ webgl: 'swiftshader' });
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });

async function still(clip, t, h, yaw = 0) {
  await page.goto(`http://127.0.0.1:5343/tools/cat-still.html?clip=${clip}&t=${t}&h=${h}&yaw=${yaw}&glb=${encodeURIComponent(GLB)}`);
  await page.waitForFunction(() => window.__still?.done, null, { timeout: 180000 });
  const s = await page.evaluate(() => window.__still);
  if (s.error) throw new Error(`${clip}@${t}: ${s.error}`);
  return { ...s, buf: Buffer.from(s.png.split(',')[1], 'base64') };
}
async function crop(s, marginPct = 0.04) {
  const img = sharp(s.buf).ensureAlpha();
  const { data, info } = await img.clone().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) throw new Error('image vide');
  // the feet anchor must stay inside (the shadow sits there)
  y1 = Math.max(y1, Math.ceil(s.anchor[1]));
  const m = Math.round(Math.max(x1 - x0, y1 - y0) * marginPct);
  const left = Math.max(0, x0 - m), top = Math.max(0, y0 - m);
  const width = Math.min(info.width - left, x1 - x0 + 2 * m), height = Math.min(info.height - top, y1 - y0 + 2 * m);
  const touches = x0 === 0 || y0 === 0 || x1 === info.width - 1 || y1 === info.height - 1;
  return { img: img.extract({ left, top, width, height }), width, height, anchor: [s.anchor[0] - left, s.anchor[1] - top], eyes: [s.eyes[0] - left, s.eyes[1] - top], heightPx: s.heightPx, touches };
}

const manifest = { poses: {}, heightPx: 0, source: GLB, testRig: TESTRIG };
try {
  for (const [name, p] of Object.entries(POSES)) {
    const c = await crop(await still(p.clip, p.t, 1100));
    if (c.touches) console.warn(`[cat-poses] ATTENTION ${name} touche le bord du rendu`);
    await c.img.webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(resolve(OUT, `${name}.webp`));
    manifest.poses[name] = { file: `${name}.webp`, anchor: c.anchor.map((v) => +v.toFixed(1)), eyes: c.eyes.map((v) => +v.toFixed(1)), size: [c.width, c.height] };
    manifest.heightPx = +c.heightPx.toFixed(1);
    console.log(`[cat-poses] ${name}: ${c.width}x${c.height}`);
  }
  writeFileSync(resolve(OUT, 'poses.json'), JSON.stringify(manifest, null, 2));
  const ref = await crop(await still('idle', 0, 1400, 12));
  await ref.img.png().toFile(resolve(REF, 'cat-pose-ref.png'));
  const fg = await crop(await still('idle', 0, 2600, 8), 0.03);
  await fg.img.png({ compressionLevel: 9 }).toFile(resolve(MEDIA, 'CYBERCAT-FG.png'));
  console.log(`[cat-poses] ref + FG ecrits`);
} finally {
  await browser.close();
  await server.close();
}
