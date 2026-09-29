// Images fixes de la mascotte à des instants précis (banc, horloge virtuelle), avec zoom : contrôle des raccords.
// Usage : node tools/mascot-still.mjs --shots=rest@0,cheer@300,duck@200 [--zoom=1.6] [--fy=0.33] [--size=900x1100] [--out=captures/mascot-still]
// Sortie : <out>/<action>-<ms>.png + <out>/sheet.png (planche de toutes les images)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { launch } from './lib/browser.mjs';

const opt = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const base = process.env.GAME_URL ?? 'http://127.0.0.1:5301/';
const out = path.resolve(String(opt.out ?? 'captures/mascot-still'));
const [w, h] = String(opt.size ?? '700x875').split('x').map(Number);
const shots = String(opt.shots ?? 'rest@0').split(',').map((s) => {
  const [a, t] = s.split('@');
  return { a, t: Number(t ?? 0) };
});
fs.mkdirSync(out, { recursive: true });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: w, height: h } });
const q = [`qa`, opt.zoom ? `zoom=${opt.zoom}` : '', opt.fy ? `fy=${opt.fy}` : '', opt.fx ? `fx=${opt.fx}` : ''].filter(Boolean).join('&');
await page.goto(`${base}mascot-bench.html?${q}`);
await page.waitForFunction(() => window.__bench && window.__bench.ready, null, { timeout: 90000 });
await page.evaluate(() => window.__bench.hideBar());
const files = [];
for (const s of shots) {
  await page.evaluate((n) => window.__bench.play(n), s.a);
  let done = 0;
  while (done < s.t) {
    const dt = Math.min(100, s.t - done);
    await page.evaluate((ms) => window.__bench.step(ms), dt);
    done += dt;
  }
  const f = path.join(out, `${s.a}-${String(s.t).padStart(4, '0')}.png`);
  await page.screenshot({ path: f, timeout: 120000 });
  files.push({ f, label: `${s.a} t=${s.t} ms` });
  console.log(f);
}
await browser.close();
const cols = Math.min(4, files.length);
const tw = Math.round(w / 1.6);
const th = Math.round(h / 1.6);
const composites = [];
for (let i = 0; i < files.length; i++) {
  const img = await sharp(files[i].f).resize(tw, th).png().toBuffer();
  const label = Buffer.from(`<svg width="${tw}" height="22"><rect width="100%" height="100%" fill="#000" opacity="0.55"/><text x="6" y="16" font-family="monospace" font-size="14" fill="#fff">${files[i].label}</text></svg>`);
  composites.push({ input: img, left: (i % cols) * tw, top: Math.floor(i / cols) * th }, { input: label, left: (i % cols) * tw, top: Math.floor(i / cols) * th });
}
await sharp({ create: { width: cols * tw, height: Math.ceil(files.length / cols) * th, channels: 3, background: '#e9e6dc' } }).composite(composites).png().toFile(path.join(out, 'sheet.png'));
