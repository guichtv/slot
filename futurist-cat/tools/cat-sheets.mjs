// Renders one contact sheet per clip (section 4.8) with headless Chromium + swiftshader.
//   node tools/cat-sheets.mjs               -> docs/preuves/chat/<clip>.png (public/assets/cat/cat.glb)
//   node tools/cat-sheets.mjs --testrig     -> tools/.work/report/sheets/<clip>.png (dev test rig)
//   node tools/cat-sheets.mjs --clips idle,dive
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/browser.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const TESTRIG = args.includes('--testrig');
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const CLIPS = opt('clips', 'idle,alert,idle34,dance,hop,flip,hooks,dive,run').split(',');
const GLB = TESTRIG ? '/tools/.work/test-rig.prepared.glb' : '/assets/cat/cat.glb';
const OUTDIR = resolve(ROOT, TESTRIG ? 'tools/.work/report/sheets' : 'docs/preuves/chat');
const PORT = Number(opt('port', '5343'));
mkdirSync(OUTDIR, { recursive: true });

const server = await createServer({ root: ROOT, configFile: resolve(ROOT, 'vite.config.ts'), logLevel: 'warn', server: { port: PORT, strictPort: true, host: '127.0.0.1', hmr: false } });
await server.listen();
const browser = await launch({ webgl: 'swiftshader' });
const results = {};
try {
  const page = await browser.newPage({ viewport: { width: 2100, height: 1700 } });
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  for (const clip of CLIPS) {
    const url = `http://127.0.0.1:${PORT}/tools/cat-sheet.html?clip=${clip}&glb=${encodeURIComponent(GLB)}&label=${TESTRIG ? 'SQUELETTE+DE+TEST' : ''}`;
    await page.goto(url);
    await page.waitForFunction(() => window.__sheet?.done, null, { timeout: 180000 });
    const s = await page.evaluate(() => window.__sheet);
    if (s.error) { console.error(`[cat-sheets] ${clip}: ${s.error}`); results[clip] = { error: s.error }; continue; }
    const png = Buffer.from(s.dataURL.split(',')[1], 'base64');
    const file = resolve(OUTDIR, `${clip}.png`);
    writeFileSync(file, png);
    results[clip] = { file, ...s.info, frames: undefined };
    console.log(`[cat-sheets] ${clip} -> ${file} (draw calls ${s.info.drawCalls}, textures ${s.info.textures})`);
  }
} finally {
  await browser.close();
  await server.close();
}
writeFileSync(resolve(OUTDIR, 'sheets.json'), JSON.stringify(results, null, 2));
