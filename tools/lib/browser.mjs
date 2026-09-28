// Lancement Chromium headless (playwright-core) + helpers QA partagés par shot/record/parcours.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

function findChromium() {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean);
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    for (const d of fs.readdirSync(r).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
      const p = path.join(r, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  }
  const win = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'];
  for (const p of win) if (fs.existsSync(p)) return p;
  return undefined;
}

export async function launch() {
  return chromium.launch({
    executablePath: findChromium(),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'],
  });
}

export const BASE_URL = process.env.GAME_URL ?? 'http://127.0.0.1:5302/';

/** Ouvre le jeu en mode QA (horloge virtuelle) et attend window.__qa. */
export async function openGame(browser, { w = 1440, h = 900, query = '', dpr = 1, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const sep = BASE_URL.includes('?') ? '&' : '?';
  await page.goto(`${BASE_URL}${sep}qa${query ? `&${query}` : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__qa && window.__qa.ready === true, null, { timeout: 60_000 });
  return { ctx, page, errors };
}

/** Avance l'horloge virtuelle par tranches (évite de bloquer le thread de rendu). */
export async function step(page, ms, frame = 1000 / 60) {
  let left = ms;
  while (left > 0) {
    const d = Math.min(500, left);
    await page.evaluate(([dd, f]) => window.__qa.step(dd, f), [d, frame]);
    left -= d;
  }
}

/** Geste réel : pointerdown puis click, aux coordonnées écran. */
export async function tap(page, x, y) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

export function outDir(sub = '') {
  const d = path.resolve('captures', sub);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
