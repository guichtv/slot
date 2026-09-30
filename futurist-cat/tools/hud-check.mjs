// HUD non-overlap test on 6 sizes with 10-digit amounts, on the SERVED QA build.
//   node tools/hud-check.mjs [--dist dist-qa] [--out docs/preuves/hud] [--lang fr] [--only 960x720,popout-S-400x300]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/browser.mjs';
import { serveDir } from './lib/serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const OUT = resolve(ROOT, opt('out', 'docs/preuves/hud'));
mkdirSync(OUT, { recursive: true });
const SIZES = [
  { name: '1920x1080', w: 1920, h: 1080, dpr: 1, touch: false },
  { name: '1440x900', w: 1440, h: 900, dpr: 1, touch: false },
  { name: '960x720', w: 960, h: 720, dpr: 1, touch: false },
  { name: 'tablet-1024x768', w: 1024, h: 768, dpr: 2, touch: true },
  { name: 'portrait-390x844', w: 390, h: 844, dpr: 3, touch: true },
  { name: 'short-844x390', w: 844, h: 390, dpr: 3, touch: true },
  { name: 'popout-S-400x300', w: 400, h: 300, dpr: 1, touch: false },
];
const server = await serveDir(resolve(ROOT, opt('dist', 'dist-qa')), 5349);
const browser = await launch({ webgl: 'swiftshader' });
const results = [];
let failures = 0;
try {
  const only = opt('only', null)?.split(',');
  for (const s of SIZES.filter((x) => !only || only.includes(x.name))) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr, isMobile: s.touch, hasTouch: s.touch });
    const page = await ctx.newPage();
    // virtual clock: the intro is stepped through without waiting for software rendering
    await page.goto(`http://127.0.0.1:5349/?virtual=1&seed=7&skipWelcome=1&persist=0&lang=${opt('lang', 'fr')}`);
    await page.waitForFunction(() => typeof window.__qaStep === 'function', null, { timeout: 120000 });
    for (let i = 0; i < 400 && (await page.evaluate(() => window.__qa().state)) !== 'idle'; i++) await page.evaluate(() => window.__qaStep(250, false));
    await page.evaluate(() => { window.__qaSetBalance(1234567890.12); window.__qaSetWin(9876543210.99); window.__qaStep(600, true); });
    await page.waitForTimeout(300);
    const r = await page.evaluate((touch) => {
      const vis = (e) => { const cs = getComputedStyle(e); const b = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && !e.hidden && b.width > 0 && b.height > 0; };
      const pick = [...document.querySelectorAll('.hud .btn, .hud .field, .ante, .top .logo')].filter(vis);
      const boxes = pick.map((e) => { const b = e.getBoundingClientRect(); return { name: e.className.replace(/\s+/g, '.'), x: b.left, y: b.top, w: b.width, h: b.height }; });
      const issues = [];
      const ov = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i], B = boxes[j];
        if (A.name.includes('field') && B.name.includes('btn') && pick[i].contains(pick[j])) continue;
        if (ov(A, B)) issues.push(`chevauchement ${A.name} / ${B.name}`);
      }
      for (const b of boxes) if (b.x < -1 || b.y < -1 || b.x + b.w > innerWidth + 1 || b.y + b.h > innerHeight + 1) issues.push(`hors ecran ${b.name}`);
      for (const v of document.querySelectorAll('.hud .field .val')) if (vis(v) && v.scrollWidth > v.clientWidth + 1) issues.push(`montant tronque dans ${v.parentElement.className} (${v.textContent})`);
      // the Ante button shows its whole text (no clipped line, no cut word)
      const ante = document.querySelector('.ante');
      if (ante && vis(ante)) for (const e of [ante, ...ante.querySelectorAll('.ante-title, .ante-state, .ante-cost, .ante-desc')].filter(vis)) if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) issues.push(`Ante tronque (${e.className} : ${e.textContent})`);
      if (touch) for (const b of boxes.filter((x) => x.name.includes('btn'))) if (Math.min(b.w, b.h) < 43.5) issues.push(`cible < 44 px : ${b.name} ${Math.round(b.w)}x${Math.round(b.h)}`);
      const R = window.__qaRects();
      for (const b of boxes.filter((x) => !x.name.includes('logo') && !x.name.includes('ante'))) if (ov(b, R.grid)) issues.push(`le HUD couvre la grille : ${b.name}`);
      for (const k of ['logo', 'ante']) if (ov(R[k], R.grid)) issues.push(`${k} chevauche la grille`);
      if (R.grid.x < -1 || R.grid.y < -1 || R.grid.x + R.grid.w > innerWidth + 1 || R.grid.y + R.grid.h > innerHeight + 1) issues.push('grille tronquee');
      return { cls: R.cls, grid: R.grid, count: boxes.length, issues, bal: document.querySelector('.field.balance .val')?.textContent, win: document.querySelector('.field.win .val')?.textContent };
    }, s.touch);
    await page.screenshot({ path: resolve(OUT, `${s.name}.png`), timeout: 120000 });
    results.push({ size: s.name, ...r });
    failures += r.issues.length;
    console.log(`${r.issues.length ? 'KO' : 'OK'} ${s.name} (${r.cls}) ${r.count} elements${r.issues.length ? '\n   ' + r.issues.join('\n   ') : ''}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
writeFileSync(resolve(OUT, 'hud-check.json'), JSON.stringify(results, null, 2));
process.exit(failures ? 1 : 0);
