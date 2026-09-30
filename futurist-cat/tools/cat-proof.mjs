// Drives tools/cat-proof.html: 1440x900 DPR 1, then 390x844 DPR 3 with CPU x4 (section 4.3).
//   node tools/cat-proof.mjs [--testrig] [--gpu --headed]
// swiftshader (default, headless) is NOT representative of real fps: use --gpu --headed on a PC.
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/browser.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const TESTRIG = args.includes('--testrig');
const GPU = args.includes('--gpu');
const HEADED = args.includes('--headed');
const GLB = TESTRIG ? '/tools/.work/test-rig.prepared.glb' : '/assets/cat/cat.glb';
const OUTDIR = resolve(ROOT, TESTRIG ? 'tools/.work/report' : 'docs/preuves/chat');
mkdirSync(OUTDIR, { recursive: true });

const server = await createServer({ root: ROOT, configFile: resolve(ROOT, 'vite.config.ts'), logLevel: 'warn', server: { port: 5343, strictPort: true, host: '127.0.0.1', hmr: false } });
await server.listen();
const browser = await launch({ webgl: GPU ? 'gpu' : 'swiftshader', headless: !HEADED });
const runs = [
  { name: 'desktop-1440x900', viewport: { width: 1440, height: 900 }, dpr: 1, cpu: 1 },
  { name: 'mobile-390x844-dpr3-cpu4', viewport: { width: 390, height: 844 }, dpr: 3, cpu: 4 },
];
const out = { mode: GPU ? 'gpu' : 'swiftshader (non representatif des fps reels)', glb: GLB, runs: {} };
try {
  for (const r of runs) {
    const ctx = await browser.newContext({ viewport: r.viewport, deviceScaleFactor: r.dpr, isMobile: r.dpr > 1, hasTouch: r.dpr > 1 });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: r.cpu });
    await page.goto(`http://127.0.0.1:5343/tools/cat-proof.html?glb=${encodeURIComponent(GLB)}&seconds=6`);
    await page.waitForFunction(() => window.__proof?.done, null, { timeout: 240000 });
    const res = await page.evaluate(() => window.__proof);
    out.runs[r.name] = res;
    console.log(`[cat-proof] ${r.name}`, JSON.stringify(res));
    await page.screenshot({ path: resolve(OUTDIR, `proof-${r.name}.png`) });
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}
writeFileSync(resolve(OUTDIR, 'proof.json'), JSON.stringify(out, null, 2));
