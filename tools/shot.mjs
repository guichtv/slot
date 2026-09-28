// Capture réelle (canvas + HUD) : node tools/shot.mjs <nom> <l>x<h> [--query=...] [--wait=ms] [--play=F10] [--steps=ms,ms,...] [--mobile]
// Horloge virtuelle (?qa) : l'animation avance par __qa.step ; chaque valeur de --steps produit une capture.
import { launch, openGame, step, outDir } from './lib/browser.mjs';

const [name = 'shot', size = '1440x900', ...rest] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const browser = await launch();
const { page, errors } = await openGame(browser, { w, h, query: opt.query ?? 'lang=fr', mobile: !!opt.mobile, dpr: Number(opt.dpr ?? 1) });
await step(page, Number(opt.wait ?? 800));
const dir = outDir(opt.dir ?? '');
if (opt.play) await page.evaluate((id) => window.__qa.play(id), opt.play);
const steps = String(opt.steps ?? '0').split(',').map(Number);
let i = 0;
for (const s of steps) {
  await step(page, s);
  const file = `${dir}/${name}-${w}x${h}${steps.length > 1 ? `-${String(i).padStart(2, '0')}` : ''}.png`;
  await page.screenshot({ path: file });
  console.log(file);
  i++;
}
if (errors.length) console.log('ERREURS:', errors.join('\n'));
await browser.close();
