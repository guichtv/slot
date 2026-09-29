// Pellicules de mouvement de la mascotte : pour chaque action, une image par pas de temps (horloge virtuelle),
// assemblées en planche (lecture de gauche à droite, ligne par ligne). Sert à juger le mouvement, pas seulement la pose.
// Usage : node tools/mascot-motion.mjs [--actions=a,b] [--step=90] [--frames=16] [--dark] [--out=captures/mascot]
// Sortie : <out>/<action>.png (pellicule) + <out>/index.json (actions, pas, nombre d'images)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { launch } from './lib/browser.mjs';

const opt = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const base = process.env.GAME_URL ?? 'http://127.0.0.1:5301/';
const step = Number(opt.step ?? 90);
const frames = Number(opt.frames ?? 16);
const out = path.resolve(String(opt.out ?? 'captures/mascot'));
fs.mkdirSync(out, { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 560, height: 700 } });
await page.goto(`${base}mascot-bench.html?qa${opt.dark ? '&dark' : ''}`);
await page.waitForFunction(() => window.__bench && window.__bench.ready, null, { timeout: 90000 });
await page.evaluate(() => window.__bench.hideBar());
const actions = opt.actions ? String(opt.actions).split(',') : await page.evaluate(() => window.__bench.actions);
const index = [];
for (const a of actions) {
  await page.evaluate((n) => window.__bench.play(n), a);
  const shots = [];
  for (let i = 0; i < frames; i++) {
    if (i > 0) await page.evaluate((ms) => window.__bench.step(ms), step);
    shots.push(await page.screenshot({ timeout: 120000 }));
  }
  // planche : 8 colonnes, chaque vignette 280×350 annotée du temps
  const cols = 8;
  const tw = 280;
  const th = 350;
  const rows = Math.ceil(shots.length / cols);
  const composites = [];
  for (let i = 0; i < shots.length; i++) {
    const img = await sharp(shots[i]).resize(tw, th).png().toBuffer();
    const label = Buffer.from(`<svg width="${tw}" height="22"><rect width="100%" height="100%" fill="#000" opacity="0.55"/><text x="6" y="16" font-family="monospace" font-size="14" fill="#fff">${a} t=${i * step} ms</text></svg>`);
    composites.push({ input: img, left: (i % cols) * tw, top: Math.floor(i / cols) * th });
    composites.push({ input: label, left: (i % cols) * tw, top: Math.floor(i / cols) * th });
  }
  const file = path.join(out, `${a}.png`);
  await sharp({ create: { width: cols * tw, height: rows * th, channels: 3, background: opt.dark ? '#1c1628' : '#e9e6dc' } }).composite(composites).png().toFile(file);
  index.push({ action: a, file, step, frames });
  console.log(file);
}
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 1));
await browser.close();
