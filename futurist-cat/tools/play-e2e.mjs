// End-to-end on the SERVED QA build with real gestures (mouse down/up = pointerdown + click),
// the virtual clock advanced by a background driver. Local provider (fixtures).
//   node tools/play-e2e.mjs [--size 1280x720] [--only name]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/browser.mjs';
import { serveDir } from './lib/serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const ONLY = opt('only', null);
const OUT = resolve(ROOT, 'docs/preuves/e2e');
mkdirSync(OUT, { recursive: true });
const PORT = 5346;
const server = await serveDir(resolve(ROOT, opt('dist', 'dist-qa')), PORT);
const browser = await launch({ webgl: 'swiftshader' });
const results = [];

async function open(extra = '', persist = '0') {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('   [pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?virtual=1&seed=3&persist=${persist}&lang=fr${extra}`);
  await page.waitForSelector('.welcome', { timeout: 240000 });
  return { ctx, page };
}
const qa = (page) => page.evaluate(() => window.__qa());
const drive = (page, on = true, ms = 100) => page.evaluate(([o, m]) => window.__qaDrive(o, m), [on, ms]);
async function tap(page, sel) {
  const el = await page.waitForSelector(sel, { state: 'visible', timeout: 20000 });
  const b = await el.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.mouse.up();
}
async function tapAt(page, x, y) { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up(); }
async function until(page, pred, label, timeout = 240000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const s = await qa(page); if (pred(s)) return s; await page.waitForTimeout(150); }
  throw new Error(`delai: ${label} (${JSON.stringify(await qa(page))})`);
}
async function enter(page) {
  // the welcome click (consumed: it must not spin)
  const b = await (await page.$('.welcome')).boundingBox();
  await tapAt(page, b.x + b.width / 2, b.y + b.height - 30);
  await drive(page, true);
  const s = await until(page, (q) => q.state === 'idle', 'idle apres accueil');
  if (s.plays !== 0) throw new Error('le clic d\'accueil a lance un spin');
  return s;
}
const eur = (s) => Number(String(s).replace(/[^\d,.-]/g, '').replace(/ |\s/g, '').replace(',', '.'));

const scenarios = {
  async spin_and_win(page) {
    const s0 = await enter(page);
    await page.evaluate(() => { window.__qaGame.d.provider.dev.forceNext = 'F03'; });
    await tap(page, '.btn.spin');
    const s1 = await until(page, (q) => q.state === 'idle' && q.plays === 1, 'fin du spin');
    const want = s0.balance - 1e6 + 1.3e6;
    if (s1.balance !== want) throw new Error(`solde ${s1.balance} attendu ${want}`);
    if (s1.endRounds !== 1) throw new Error(`end-round x${s1.endRounds}`);
    return `solde ${s0.balance / 1e6} -> ${s1.balance / 1e6}, gain affiche "${s1.win}"`;
  },
  async quick_stop_same_result(page) {
    const s0 = await enter(page);
    await page.evaluate(() => { window.__qaGame.d.provider.dev.forceNext = 'F07'; window.__qaGame.d.provider.dev.latencyMs = 300; });
    await drive(page, false);
    await tap(page, '.btn.spin');
    await drive(page, true, 30);
    await page.waitForTimeout(700);
    await tap(page, '.btn.spin'); // second press while spinning = quick stop
    const s1 = await until(page, (q) => q.state === 'idle' && q.plays === 1, 'fin apres arret rapide');
    if (s1.balance !== s0.balance - 1e6 + 1.6e6) throw new Error(`solde ${s1.balance}`);
    return `resultat inchange (F07, +0,60 EUR), une seule requete`;
  },
  async buy_bonus_single_request(page) {
    const s0 = await enter(page);
    await page.evaluate(() => { window.__qaAuto(true); });
    await tap(page, '.btn.buy');
    await page.waitForSelector('.dialog.shop.in');
    await tap(page, '.card-bonus');
    await page.waitForSelector('.dialog.confirm.in');
    const quote = await page.$eval('.confirm .cost', (e) => e.textContent);
    // double click on BUY: one request only
    const b = await (await page.$('.confirm .btn.primary')).boundingBox();
    await tapAt(page, b.x + b.width / 2, b.y + b.height / 2); await tapAt(page, b.x + b.width / 2, b.y + b.height / 2);
    const s1 = await until(page, (q) => q.state === 'idle' && q.plays >= 1 && q.history >= 1, 'fin du bonus achete', 600000);
    if (s1.plays !== 1) throw new Error(`${s1.plays} requetes pour un achat`);
    return `devis ${quote}, 1 requete, solde ${s0.balance / 1e6} -> ${s1.balance / 1e6}`;
  },
  async buy_cancel_no_debit(page) {
    const s0 = await enter(page);
    await tap(page, '.btn.buy');
    await tap(page, '.card-scan');
    await tap(page, '.confirm .btn.secondary');
    await page.waitForTimeout(400);
    const s1 = await qa(page);
    if (s1.plays !== 0 || s1.balance !== s0.balance) throw new Error('debit ou requete apres annulation');
    return 'ouvert puis annule : aucune requete, solde inchange';
  },
  async ante_cost(page) {
    const s0 = await enter(page);
    await tap(page, '.ante');
    const txt = await page.$eval('.ante', (e) => e.textContent);
    await page.evaluate(() => { window.__qaGame.d.provider.dev.forceNext = 'F01'; });
    await tap(page, '.btn.spin');
    const s1 = await until(page, (q) => q.state === 'idle' && q.plays === 1, 'spin ante');
    if (s0.balance - s1.balance !== 1.25e6) throw new Error(`debit ${(s0.balance - s1.balance) / 1e6}`);
    return `Ante actif "${txt}", debit 1,25 EUR`;
  },
  async refusal_consistent(page) {
    const s0 = await enter(page);
    await page.evaluate(() => { window.__qaGame.d.provider.dev.failNext = 'ERR_IPB'; });
    await tap(page, '.btn.spin');
    const s1 = await until(page, (q) => q.errorDialog, 'dialogue d\'erreur');
    if (s1.balance !== s0.balance) throw new Error('solde modifie par un refus');
    await tap(page, '.dialog.error .btn.primary');
    const s2 = await until(page, (q) => q.state === 'idle' && !q.dialog, 'retour idle');
    return `refus "${s1.errorDialog}", solde inchange, etat ${s2.state}`;
  },
  async uncertain_reconcile(page) {
    const s0 = await enter(page);
    await page.evaluate(() => { window.__qaGame.d.provider.dev.failNext = 'TIMEOUT'; });
    await tap(page, '.btn.spin');
    const s1 = await until(page, (q) => q.state === 'idle', 'reconciliation');
    if (s1.balance !== s0.balance) throw new Error('solde modifie');
    return `requete incertaine -> reconciliation -> ${s1.state}, solde inchange`;
  },
  async autoplay_counter_and_stop(page) {
    await enter(page);
    await tap(page, '.btn.auto');
    await page.waitForSelector('.dialog.auto.in');
    await tap(page, '.dialog.auto .btn.chip-n');
    await until(page, (q) => q.plays >= 2, 'deux spins auto');
    const label = await page.$eval('.btn.auto .auto-count', (e) => e.textContent);
    await tap(page, '.btn.auto');
    const s = await until(page, (q) => q.state === 'idle' && q.auto === null, 'arret autoplay');
    const plays = s.plays;
    await page.waitForTimeout(1500);
    const s2 = await qa(page);
    if (s2.plays !== plays) throw new Error('un spin est parti apres l\'arret');
    return `compteur "${label}", arrete apres ${plays} spins`;
  },
  async keyboard_space(page) {
    await enter(page);
    await page.evaluate(() => { window.__qaGame.d.provider.dev.forceNext = 'F01'; });
    await page.keyboard.press('Space');
    const s = await until(page, (q) => q.state === 'idle' && q.plays === 1, 'spin clavier');
    return `Espace lance un spin (${s.plays})`;
  },
  async menu_rules(page) {
    await enter(page);
    await tap(page, '.btn.menu');
    await page.waitForSelector('.dialog.menu.in');
    const txt = await page.$eval('.tab-panel', (e) => e.textContent);
    const need = ['dysfonctionnement', '1024', 'WILD', 'SCATTER', 'ANTE', 'RTP'];
    const miss = need.filter((n) => !txt.includes(n));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    if (miss.length) throw new Error(`regles incompletes : ${miss.join(', ')}`);
    return 'regles completes, fermeture Echap';
  },
};

for (const [name, fn] of Object.entries(scenarios)) {
  if (ONLY && !ONLY.split(',').includes(name)) continue;
  let ctx = null, page = null;
  const t0 = Date.now();
  try {
    ({ ctx, page } = await open());
    const msg = await fn(page);
    results.push({ name, ok: true, msg, sec: Math.round((Date.now() - t0) / 1000) });
    console.log(`OK  ${name} : ${msg}`);
  } catch (e) {
    results.push({ name, ok: false, msg: e.message });
    console.log(`KO  ${name} : ${e.message}`);
    if (page) await page.screenshot({ path: resolve(OUT, `KO-${name}.png`), timeout: 8000 }).catch(() => console.log('   (capture impossible : page figee)'));
  }
  await ctx?.close();
}
await browser.close();
server.close();
writeFileSync(resolve(OUT, 'e2e.json'), JSON.stringify(results, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
