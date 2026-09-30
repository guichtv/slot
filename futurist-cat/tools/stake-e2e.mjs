// RGS flow end to end against tools/mock-rgs.mjs (a DEV mock of the public API shape, NOT an
// Engine test). Served QA build, virtual clock driven in the background, real gestures.
//   node tools/stake-e2e.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/browser.mjs';
import { serveDir } from './lib/serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'docs/preuves/e2e');
mkdirSync(OUT, { recursive: true });
const GAME = 5346, RGS = 5345;
const server = await serveDir(resolve(ROOT, 'dist-qa'), GAME);
const browser = await launch({ webgl: 'swiftshader' });
const results = [];
let mock = null;
async function startMock(extra = []) {
  if (mock) { mock.kill(); await new Promise((r) => setTimeout(r, 300)); }
  mock = spawn(process.execPath, [resolve(ROOT, 'tools/mock-rgs.mjs'), '--port', String(RGS), ...extra], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => mock.stdout.once('data', r));
}
const rgsLog = async () => (await fetch(`http://127.0.0.1:${RGS}/__log`)).json();
async function open(q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('   [pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${GAME}/?virtual=1&seed=3&lang=fr&${q}`);
  return { ctx, page };
}
const qa = (p) => p.evaluate(() => window.__qa());
async function until(page, pred, label, timeout = 300000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const s = await qa(page).catch(() => null); if (s && pred(s)) return s; await page.waitForTimeout(150); }
  throw new Error(`delai: ${label}`);
}
async function enter(page) {
  await page.waitForSelector('.welcome', { timeout: 120000 });
  const b = await (await page.$('.welcome')).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height - 30); await page.mouse.down(); await page.mouse.up();
  await page.evaluate(() => { window.__qaAuto(true); window.__qaDrive(true, 100); });
}
async function tap(page, sel) { const el = await page.waitForSelector(sel, { state: 'visible' }); const b = await el.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.up(); }
const S = `sessionID=mock&rgs_url=http://127.0.0.1:${RGS}`;

const scenarios = {
  async play_end_round_once() {
    await startMock();
    const { ctx, page } = await open(S);
    await enter(page);
    await until(page, (q) => q.state === 'idle', 'idle');
    await fetch(`http://127.0.0.1:${RGS}/__force?f=F03`);
    await tap(page, '.btn.spin');
    await until(page, (q) => q.state === 'idle' && q.history === 1, 'fin de manche');
    const log = (await rgsLog()).map((l) => l.path);
    await ctx.close();
    const ends = log.filter((p) => p === '/wallet/end-round').length;
    if (log[0] !== '/wallet/authenticate' || !log.includes('/wallet/play') || ends !== 1) throw new Error(log.join(' > '));
    return log.join(' > ');
  },
  async resume_active_round_no_new_debit() {
    await startMock(['--active', 'F21@12']);
    const { ctx, page } = await open(S);
    await enter(page);
    const s = await until(page, (q) => q.state === 'idle' && q.history === 1, 'reprise terminee', 600000);
    const log = (await rgsLog()).map((l) => l.path);
    await ctx.close();
    if (log.includes('/wallet/play')) throw new Error('nouveau debit pendant la reprise');
    if (log.filter((p) => p === '/wallet/end-round').length !== 1) throw new Error('end-round manquant ou double');
    return `reprise depuis l'evenement 12, ${log.join(' > ')}`;
  },
  async insufficient_balance() {
    await startMock(['--fail-play', 'ERR_IPB']);
    const { ctx, page } = await open(S);
    await enter(page);
    await until(page, (q) => q.state === 'idle', 'idle');
    await tap(page, '.btn.spin');
    const s = await until(page, (q) => !!q.errorDialog, 'erreur affichee');
    await ctx.close();
    return `message : ${s.errorDialog}`;
  },
  async invalid_session_no_local_fallback() {
    await startMock();
    const { ctx, page } = await open(`sessionID=bad&rgs_url=http://127.0.0.1:${RGS}`);
    const txt = await page.waitForSelector('.loading .err p', { timeout: 60000 }).then((e) => e.textContent());
    const welcome = await page.$('.welcome');
    await ctx.close();
    if (welcome) throw new Error('le jeu a demarre avec une session invalide');
    return `erreur propre au chargement : "${txt}"`;
  },
  async social_mode_no_dollar() {
    await startMock(['--jurisdiction', 'social,noBuy,noTurbo,net,timer']);
    const { ctx, page } = await open(S);
    await enter(page);
    await until(page, (q) => q.state === 'idle', 'idle');
    const r = await page.evaluate(() => ({ bal: document.querySelector('.field.balance .val').textContent, bet: document.querySelector('.bet-lbl').textContent, buyHidden: document.querySelector('.btn.buy').hidden, turboHidden: document.querySelector('.btn.turbo').hidden, session: document.querySelector('.session-info').textContent }));
    await ctx.close();
    if (/\$/.test(r.bal)) throw new Error(`$ devant SC : ${r.bal}`);
    if (!r.buyHidden || !r.turboHidden) throw new Error('drapeaux de juridiction ignores');
    return JSON.stringify(r);
  },
  async replay_no_wallet() {
    await startMock();
    const { ctx, page } = await open(`replay=true&game=cyber-cat&version=1&mode=base&event=7&rgs_url=http://127.0.0.1:${RGS}&amount=1000000&currency=EUR`);
    await page.waitForSelector('.replay-bar', { timeout: 120000 });
    await page.evaluate(() => { window.__qaAuto(true); window.__qaDrive(true, 100); });
    await until(page, (q) => q.state === 'idle', 'fin du replay');
    const log = (await rgsLog()).map((l) => l.path);
    await ctx.close();
    if (log.some((p) => p.startsWith('/wallet'))) throw new Error(`appel wallet en replay : ${log.join(' > ')}`);
    return log.join(' > ');
  },
};

for (const [name, fn] of Object.entries(scenarios)) {
  try { const msg = await fn(); results.push({ name, ok: true, msg }); console.log(`OK  ${name} : ${msg}`); }
  catch (e) { results.push({ name, ok: false, msg: e.message }); console.log(`KO  ${name} : ${e.message}`); }
}
mock?.kill();
await browser.close();
server.close();
writeFileSync(resolve(OUT, 'stake-e2e.json'), JSON.stringify(results, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
