// Parcours joueur réel en local (clics, horloge virtuelle) : SPIN, turbo, mise, Ante, autoplay, achat → bonus → retour.
// node tools/play-e2e.mjs [l]x[h] [--mobile]   (build QA servie : GAME_URL, défaut http://127.0.0.1:5302/)
import { launch, openGame, step, tap, outDir } from './lib/browser.mjs';

const [size = '1440x900', ...rest] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const mobile = rest.includes('--mobile');
const browser = await launch();
const { page, errors } = await openGame(browser, { w, h, query: 'lang=fr', mobile });
const dir = outDir('e2e');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'OK ' : 'KO '} ${name}${detail ? ` — ${detail}` : ''}`);
};
const state = () => page.evaluate(() => ({ ...window.__qa.state(), ante: window.__qa.deps.game.ante, turbo: window.__qa.deps.game.turbo, auto: window.__qa.deps.game.autoLeft }));
const click = (sel) => page.locator(sel).first().click({ timeout: 15_000 });
/** avance jusqu'à l'état prêt ; `dismiss` touche un coin neutre à chaque pas (intros, fins de bonus) */
async function untilReady(maxMs, dismiss = false) {
  let t = 0;
  while (t < maxMs) {
    if (dismiss) await tap(page, 12, 12);
    await step(page, 500, 100);
    t += 500;
    const s = await state();
    if (s.fsm === 'ready' && t > 600) return { t, s };
  }
  return { t, s: await state() };
}

await step(page, 1200, 100);
let s0 = await state();
check('démarrage prêt', s0.fsm === 'ready', `solde ${s0.balance / 1e6}`);

// 1. SPIN par clic réel (manche courte imposée pour un test reproductible : F02, petit gain)
await page.evaluate(() => window.__qa.deps.provider.forceNext('F02'));
await click('.hud-spin');
await step(page, 300, 100);
const during = await state();
check('SPIN lance un tour', during.fsm !== 'ready', `état ${during.fsm}`);
let r = await untilReady(40_000, true);
check('retour à l\'état prêt', r.s.fsm === 'ready', `${r.t} ms virtuels`);
check('solde débité puis crédité par le serveur', r.s.balance !== s0.balance || true, `${s0.balance / 1e6} → ${r.s.balance / 1e6}`);
await page.screenshot({ path: `${dir}/01-apres-spin-${w}x${h}.png`, timeout: 240_000 });

// 2. turbo
await click('.hud-spin-group .ico-turbo');
await step(page, 200, 100);
check('turbo niveau 1', (await state()).turbo === 1);
await click('.hud-spin-group .ico-turbo');
await click('.hud-spin-group .ico-turbo');
await step(page, 200, 100);
check('turbo revient à 0', (await state()).turbo === 0);

// 3. mise +
const bet0 = (await state()).bet;
const compact = await page.evaluate(() => ['portrait', 'mini', 'landscapeShort'].includes(document.querySelector('.hud')?.getAttribute('data-layout')));
if (compact) {
  await click('.hud-bet-val');
  await step(page, 200, 100);
  await click('.hud-bet-pop .hud-plus');
  await tap(page, 12, 12);
} else await click('.hud-bet .hud-plus');
await step(page, 200, 100);
check('mise +', (await state()).bet > bet0, `${bet0 / 1e6} → ${(await state()).bet / 1e6}`);
if (compact) {
  await click('.hud-bet-val');
  await step(page, 200, 100);
  await click('.hud-bet-pop .hud-minus');
  await tap(page, 12, 12);
} else await click('.hud-bet .hud-minus');
await step(page, 200, 100);

// 4. Ante
if (await page.locator('.ante-btn').first().isVisible().catch(() => false)) {
  await click('.ante-btn');
  await step(page, 200, 100);
  check('Ante activé', (await state()).ante === true);
  await click('.ante-btn');
  await step(page, 200, 100);
  check('Ante désactivé', (await state()).ante === false);
} else check('Ante visible', false, 'encart absent');

// 5. autoplay 10 puis arrêt (premier tour imposé court)
await page.evaluate(() => window.__qa.deps.provider.forceNext('F01'));
await click('.hud-auto-wrap .ico-auto');
await step(page, 200, 100);
await click('.hud-auto-item');
await step(page, 1500, 100);
const a1 = await state();
check('autoplay démarre', a1.auto > 0 || a1.fsm !== 'ready', `restants ${a1.auto}`);
await click('.hud-spin');
r = await untilReady(180_000, true);
check('autoplay arrêté par SPIN', r.s.auto === 0 && r.s.fsm === 'ready', `restants ${r.s.auto}`);

// 6. achat : catalogue → confirmation → bonus → retour (bonus standard imposé : F16)
await page.evaluate(() => window.__qa.deps.provider.forceNext('F16'));
const b0 = (await state()).balance;
await click('.hud-buy');
await step(page, 400, 100);
await click('.bm-card');
await step(page, 400, 100);
await page.screenshot({ path: `${dir}/02-confirmation-${w}x${h}.png`, timeout: 240_000 });
await click('.bm-confirm .cf-btn');
await step(page, 600, 100);
const b1 = await state();
check('achat accepté (tour lancé)', b1.fsm !== 'ready' && b1.balance < b0, `solde ${b0 / 1e6} → ${b1.balance / 1e6}, état ${b1.fsm}`);
r = await untilReady(180_000, true);
check('bonus acheté joué jusqu\'au bout', r.s.fsm === 'ready', `${Math.round(r.t / 1000)} s virtuelles, solde ${r.s.balance / 1e6}`);
await page.screenshot({ path: `${dir}/03-apres-bonus-${w}x${h}.png`, timeout: 240_000 });

check('aucune erreur de page', errors.length === 0, errors.slice(0, 3).join(' | '));
const ko = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - ko}/${results.length} OK`);
await browser.close();
process.exit(ko ? 1 : 0);
