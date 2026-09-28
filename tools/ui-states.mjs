// Captures des états d'interface (achat, confirmation, menu : règles / réglages / historique, dialogue de solde insuffisant).
// node tools/ui-states.mjs [l]x[h] [--mobile] [--query=lang=fr] [--dir=ui]
import { launch, openGame, step, outDir } from './lib/browser.mjs';

const [size = '1440x900', ...rest] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split(/=(.*)/s)).map(([k, v]) => [k, v ?? true]));
const browser = await launch();
const { page, errors } = await openGame(browser, { w, h, query: opt.query ?? 'lang=fr', mobile: !!opt.mobile });
const dir = outDir(opt.dir ?? 'ui');
const shot = async (name) => {
  await step(page, 500, 100);
  const file = `${dir}/${name}-${w}x${h}.png`;
  await page.screenshot({ path: file, timeout: 240_000 });
  console.log(file);
};
const click = async (sel) => {
  await page.locator(sel).first().click({ timeout: 10_000 });
};
await step(page, 1200, 100);
await shot('00-jeu');
// achat : catalogue puis confirmation, puis annulation
await click('.hud-buy');
await shot('01-achat');
await click('.bm-card');
await shot('02-achat-confirmation');
await page.keyboard.press('Escape');
await step(page, 300, 100);
await page.keyboard.press('Escape');
await step(page, 300, 100);
// menu : règles, réglages, historique
await click('.hud-small .ico-menu');
await shot('03-menu-regles');
const tabs = page.locator('[role="tab"]');
if ((await tabs.count()) >= 3) {
  await tabs.nth(1).click();
  await shot('04-menu-reglages');
  await tabs.nth(2).click();
  await shot('05-menu-historique');
}
await page.keyboard.press('Escape');
await step(page, 300, 100);
// dialogue d'erreur de solde insuffisant (déclenché par le hook de test)
const ok = await page.evaluate(() => {
  const d = window.__qa?.deps?.game;
  if (!d) return false;
  d.hooks.message?.('insufficient');
  return true;
});
if (ok) await shot('06-solde-insuffisant');
if (errors.length) console.log('ERREURS:', errors.join('\n'));
await browser.close();
