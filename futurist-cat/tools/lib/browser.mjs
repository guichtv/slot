// Portable headless Chromium launcher for the tools (Linux container and Windows PC).
// Order: CHROME_PATH env -> Playwright browsers dir -> installed Chrome -> Edge.
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function playwrightChromium() {
  const dirs = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')].filter(Boolean);
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const sub of readdirSync(d).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
      for (const rel of ['chrome-linux/chrome', 'chrome-win/chrome.exe', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = join(d, sub, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  return null;
}

/** swiftshader = software WebGL (contact sheets, stills); gpu = real GPU (fps measurements, headed). */
export async function launch({ webgl = 'swiftshader', headless = true, args = [] } = {}) {
  const extra = webgl === 'swiftshader'
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    : ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'];
  const base = { headless, args: [...extra, '--autoplay-policy=no-user-gesture-required', ...args] };
  const exe = process.env.CHROME_PATH || playwrightChromium();
  if (exe) return chromium.launch({ ...base, executablePath: exe });
  for (const channel of ['chrome', 'msedge']) {
    try { return await chromium.launch({ ...base, channel }); } catch { /* next */ }
  }
  throw new Error('Aucun Chromium trouve : definis CHROME_PATH ou installe Google Chrome.');
}
