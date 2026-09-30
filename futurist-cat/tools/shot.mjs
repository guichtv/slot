// Captures of the SERVED build (never the dev server: HMR disturbs captures), with real gestures.
//   node tools/shot.mjs --dist dist-qa --size 1440x900 --dpr 1 --out captures/x.png [--url "?lang=fr"]
//        [--play F07] [--wait 3000] [--steps "click:welcome;wait:1500;spin;wait:4000"]
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/browser.mjs';
import { serveDir } from './lib/serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const dist = resolve(ROOT, opt('dist', 'dist-qa'));
const [w, h] = opt('size', '1440x900').split('x').map(Number);
const dpr = Number(opt('dpr', '1'));
const out = resolve(ROOT, opt('out', 'captures/shot.png'));
const port = Number(opt('port', '5347'));
const steps = (opt('steps', 'click:welcome;wait:2500')).split(';').filter(Boolean);
mkdirSync(dirname(out), { recursive: true });

const server = await serveDir(dist, port);
const browser = await launch({ webgl: 'swiftshader' });
try {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: dpr > 1, hasTouch: dpr > 1 });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/${opt('url', '?seed=7')}`);
  await page.waitForFunction(() => document.querySelector('.welcome') || document.querySelector('.loading .err p'), null, { timeout: 90000 });
  for (const s of steps) {
    const [cmd, arg] = s.split(':');
    if (cmd === 'wait') await page.waitForTimeout(Number(arg));
    else if (cmd === 'click' && arg === 'welcome') { const b = await page.$('.welcome'); if (b) { const bb = await b.boundingBox(); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height * 0.9); await page.mouse.down(); await page.mouse.up(); } }
    else if (cmd === 'spin') { const b = await page.$('.btn.spin'); const bb = await b.boundingBox(); await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
    else if (cmd === 'play') await page.evaluate((id) => window.__qaPlay(id, { auto: true }), arg);
    else if (cmd === 'shot') await page.screenshot({ path: out.replace(/\.png$/, `-${arg}.png`) });
    else if (cmd === 'clickAt') { const [x, y] = arg.split(',').map(Number); await page.mouse.click(x, y); }
    else if (cmd === 'eval') await page.evaluate(arg);
  }
  await page.screenshot({ path: out });
  const qa = await page.evaluate(() => (window.__qa ? window.__qa() : null));
  console.log(JSON.stringify({ out, qa, logs: logs.slice(0, 20) }, null, 1));
} finally {
  await browser.close();
  server.close();
}
