// Capture réelle (canvas + HUD) : node tools/shot.mjs <nom> <l>x<h> [--query=...] [--wait=ms] [--play=F10] [--steps=ms,ms,...] [--mobile]
// Horloge virtuelle (?qa) : l'animation avance par __qa.step ; chaque valeur de --steps produit une capture.
import { launch, openGame, step, outDir } from './lib/browser.mjs';

const [name = 'shot', size = '1440x900', ...rest] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
// coupe au premier « = » : --query=lang=fr donne bien query = « lang=fr »
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '')).map((a) => (a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, true])));
const browser = await launch();
const { page, errors } = await openGame(browser, { w, h, query: opt.query ?? 'lang=fr', mobile: !!opt.mobile, dpr: Number(opt.dpr ?? 1) });
const frame = Number(opt.frame ?? 100);
await step(page, Number(opt.wait ?? 800), frame);
const dir = outDir(opt.dir ?? '');
if (opt.play) await page.evaluate((id) => window.__qa.play(id), opt.play);
const steps = String(opt.steps ?? '0').split(',').map(Number);
let i = 0;
for (const s of steps) {
  await step(page, s, frame);
  const file = `${dir}/${name}-${w}x${h}${steps.length > 1 ? `-${String(i).padStart(2, '0')}` : ''}.png`;
  await page.screenshot({ path: file, timeout: 240_000 });
  console.log(file);
  i++;
}
if (errors.length) console.log('ERREURS:', errors.join('\n'));
await browser.close();
