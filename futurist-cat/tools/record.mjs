// Frame-exact videos of the SERVED QA build on the virtual clock (?virtual=1): every frame is
// rendered at t = n/fps whatever the speed of the machine, then encoded with ffmpeg (H.264).
//   node tools/record.mjs --out captures/v.mp4 --size 1440x900 --dpr 1 --play F07,F13 [--testanim] [--fps 30]
//        [--url "&turbo=1"] [--tail 1.5] [--max 90]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';
import { launch } from './lib/browser.mjs';
import { serveDir } from './lib/serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const out = resolve(ROOT, opt('out', 'captures/video.mp4'));
const [w, h] = opt('size', '1440x900').split('x').map(Number);
const dpr = Number(opt('dpr', '1'));
const fps = Number(opt('fps', '30'));
const play = (opt('play', '') || '').split(',').filter(Boolean);
const tail = Number(opt('tail', '1.2'));
const maxSec = Number(opt('max', '120'));
const port = Number(opt('port', '5348'));
mkdirSync(dirname(out), { recursive: true });

const server = await serveDir(resolve(ROOT, opt('dist', 'dist-qa')), port);
const browser = await launch({ webgl: 'swiftshader' });
const ff = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-preset', 'veryfast', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', out], { stdio: ['pipe', 'ignore', 'inherit'] });
let frames = 0;
const logs = [];
try {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: dpr > 1, hasTouch: dpr > 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) logs.push(`[error] ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${port}/?virtual=1&seed=7&skipWelcome=1&persist=0${opt('url', '')}`);
  await page.waitForFunction(() => window.__qa && window.__qa().state === 'idle', null, { timeout: 120000 });
  const shot = async () => { const b = await page.screenshot({ type: 'jpeg', quality: 88 }); ff.stdin.write(b); frames++; };
  const step = async () => { await page.evaluate((ms) => window.__qaStep(ms), 1000 / fps); await shot(); };
  for (let i = 0; i < 3; i++) await page.evaluate((ms) => window.__qaStep(ms), 1000 / fps); // warm-up, not recorded
  for (let i = 0; i < fps * 0.8; i++) await step();
  const runUntilIdle = async (label) => {
    const t0 = frames;
    for (let i = 0; i < fps * maxSec; i++) {
      await step();
      if (i > fps * 0.5) { const st = await page.evaluate(() => window.__qa().state); if (st === 'idle' || st === 'error') break; }
    }
    for (let i = 0; i < fps * tail; i++) await step();
    console.log(`[record] ${label}: ${((frames - t0) / fps).toFixed(1)} s`);
  };
  if (args.includes('--testanim')) {
    await page.evaluate(() => { void window.__qaTestAnim(); });
    for (let i = 0; i < fps * 600; i++) {
      await step();
      if (i > fps * 2 && i % fps === 0) { const done = await page.evaluate(() => window.__qa().state === 'idle' && !window.__qaTestAnimRunning); if (done) break; }
    }
  }
  for (const id of play) {
    if (id.startsWith('eval:')) { await page.evaluate(id.slice(5)); continue; }
    await page.evaluate((f) => { void window.__qaPlay(f, { auto: true }); }, id);
    await runUntilIdle(id);
  }
} finally {
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await browser.close();
  server.close();
}
console.log(JSON.stringify({ out, frames, seconds: +(frames / fps).toFixed(1), logs: logs.slice(0, 10) }));
