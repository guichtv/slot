// Vidéo MP4 d'une fixture en horloge virtuelle (image par image, donc fluide même sous swiftshader) :
//   node tools/record.mjs <fixture> <l>x<h> [--fps=30] [--duration=ms] [--mobile] [--dpr=1]
//        [--query=lang=fr] [--out=captures/video] [--name=fichier] [--wait=800]
// À chaque image : __qa.step(1000/fps, 1000/fps), puis capture PNG de la page (canvas + HUD).
// Durée par défaut : jusqu'au retour de __qa.state().fsm à « ready » (plafond 40 s virtuelles) + 800 ms.
// Encodage H.264 yuv420p (ffmpeg-static, -crf 20, +faststart) ; les PNG temporaires sont supprimés.
// Serveur visé : GAME_URL ou http://127.0.0.1:5302/ (build QA servie par « npm run preview »).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { launch, openGame, step } from './lib/browser.mjs';
import { parseArgs, parseSize, human } from './lib/cli.mjs';

const CAP_MS = 40_000; // plafond d'attente du retour à « ready »
const TAIL_MS = 800; // queue après le retour à « ready »

const { pos, opt } = parseArgs(process.argv.slice(2), { booleans: ['mobile'] });
const [fixture, sizeArg = '1440x900'] = pos;
const size = parseSize(sizeArg);
const fps = Number(opt.fps ?? 30);
if (!fixture || !size || !(fps >= 1 && fps <= 120)) {
  console.error('usage : node tools/record.mjs <fixture> <l>x<h> [--fps=30] [--duration=ms] [--mobile] [--query=lang=fr] [--out=captures/video]');
  process.exit(1);
}
const fixed = opt.duration !== undefined ? Number(opt.duration) : null;
if (fixed !== null && !(fixed > 0)) {
  console.error('--duration doit être un nombre de ms > 0');
  process.exit(1);
}
const frameMs = 1000 / fps;
const outDir = path.resolve(opt.out ?? 'captures/video');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${opt.name ?? `${fixture}-${size.w}x${size.h}${opt.mobile ? '-mobile' : ''}`}.mp4`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'boomtooth-rec-'));

const browser = await launch();
let code = 0;
try {
  const { page, errors } = await openGame(browser, { w: size.w, h: size.h, query: opt.query ?? '', mobile: !!opt.mobile, dpr: Number(opt.dpr ?? 1) });
  const known = await page.evaluate(() => window.__qa.fixtures().map((f) => f.id));
  if (!known.includes(fixture)) throw new Error(`fixture inconnue « ${fixture} » (disponibles : ${known.join(' ')})`);
  // mise en place (non enregistrée) : entrée de scène, puis lancement de la fixture
  await step(page, Number(opt.wait ?? 800), 100);
  await page.evaluate((id) => window.__qa.play(id), fixture);
  console.log(`enregistrement ${fixture} ${size.w}x${size.h} à ${fps} i/s${fixed ? ` pendant ${fixed} ms` : ' (jusqu’au retour à ready)'}`);

  const t0 = Date.now();
  let n = 0;
  let t = 0;
  let left = false; // la fixture a quitté « ready »
  let tailFrom = null; // début de la queue de 800 ms
  let fsm = '';
  for (;;) {
    // une image : avance l'horloge, laisse les promesses du séquenceur se résoudre, puis capture
    fsm = await page.evaluate(async (ms) => {
      window.__qa.step(ms, ms);
      await new Promise((r) => setTimeout(r, 0));
      return window.__qa.state().fsm;
    }, frameMs);
    await page.screenshot({ path: path.join(tmp, `f${String(n).padStart(5, '0')}.png`) });
    n++;
    t += frameMs;
    if (n % 30 === 0) console.log(`  ${n} images · ${(t / 1000).toFixed(1)} s virtuelles · fsm=${fsm} · ${Math.round((Date.now() - t0) / 1000)} s réelles`);
    if (fixed !== null) {
      if (t >= fixed - 1e-6) break;
      continue;
    }
    if (fsm !== 'ready') left = true;
    if (tailFrom === null && left && fsm === 'ready') tailFrom = t;
    if (tailFrom === null && t >= CAP_MS) {
      console.log(`  plafond ${CAP_MS / 1000} s atteint sans retour à ready (fsm=${fsm})`);
      tailFrom = t;
    }
    if (tailFrom !== null && t - tailFrom >= TAIL_MS - 1e-6) break;
  }

  // encodage : dimensions paires imposées par yuv420p
  const enc = spawnSync(ffmpegPath, [
    '-y', '-loglevel', 'error',
    '-framerate', String(fps), '-i', path.join(tmp, 'f%05d.png'),
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart',
    outFile,
  ], { encoding: 'utf8' });
  if (enc.status !== 0) throw new Error(`ffmpeg a échoué : ${(enc.stderr || enc.error || '').toString().trim()}`);
  console.log(`${outFile} — ${n} images, ${(t / 1000).toFixed(2)} s, ${human(fs.statSync(outFile).size)}`);
  if (errors.length) console.log(`ERREURS PAGE (${errors.length}) :\n${errors.slice(0, 10).join('\n')}`);
} catch (e) {
  console.error(`ÉCHEC : ${e.message ?? e}`);
  code = 1;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  await browser.close();
}
process.exit(code);
