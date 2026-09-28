// Planche du banc mascotte : chaque action capturée à plusieurs instants (horloge virtuelle), fond clair et sombre.
// Usage : node tools/bench-mascot.mjs [--zoom=1] [--actions=a,b] [--times=0,150,300,600]
// Sortie : captures/bench/<action>-<t>.png + docs/imagegen/checks/mascot-bench-<zoom>.png
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { launch, outDir } from './lib/browser.mjs';

const opt = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const base = process.env.GAME_URL ?? 'http://127.0.0.1:5301/';
const zoom = Number(opt.zoom ?? 1);
const times = String(opt.times ?? '0,120,260,500,900').split(',').map(Number);
const dir = outDir('bench');
const browser = await launch();
const tiles = [];
for (const dark of [false, true]) {
  const page = await browser.newPage({ viewport: { width: 520, height: 640 } });
  const extra = zoom > 1 ? `&zoom=${zoom}&fy=${opt.fy ?? 0.55}&fx=${opt.fx ?? 0.5}` : '';
  await page.goto(`${base}mascot-bench.html?qa${dark ? '&dark' : ''}${extra}`);
  await page.waitForFunction(() => window.__bench && window.__bench.ready, null, { timeout: 60000 });
  await page.evaluate(() => window.__bench.hideBar());
  const actions = opt.actions ? String(opt.actions).split(',') : await page.evaluate(() => window.__bench.actions);
  for (const a of actions) {
    await page.evaluate((n) => window.__bench.play(n), a);
    let t = 0;
    for (const target of times) {
      await page.evaluate((ms) => window.__bench.step(ms), target - t);
      t = target;
      const file = path.join(dir, `${a}-${target}${dark ? '-dark' : ''}.png`);
      await page.screenshot({ path: file });
      tiles.push({ file, a, t: target, dark });
    }
  }
  await page.close();
}
await browser.close();
// planche : une ligne par action, colonnes = instants (clair puis sombre)
const W = 260, H = 320;
const rows = [...new Set(tiles.map((x) => x.a))];
const cols = times.length * 2;
const composites = [];
for (const x of tiles) {
  const r = rows.indexOf(x.a);
  const c = times.indexOf(x.t) + (x.dark ? times.length : 0);
  composites.push({ input: await sharp(x.file).resize(W, H).png().toBuffer(), left: c * W, top: r * H });
}
const out = `docs/imagegen/checks/mascot-bench-${zoom}.png`;
await sharp({ create: { width: cols * W, height: rows.length * H, channels: 4, background: '#808080' } }).composite(composites).png().toFile(out);
console.log(out, rows.length, 'actions');
fs.writeFileSync('captures/bench/index.json', JSON.stringify(tiles, null, 1));
