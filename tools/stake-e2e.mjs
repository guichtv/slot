// Parcours de bout en bout Stake RGS, sur une build de PRODUCTION (aucun __qa) et le faux RGS local.
//   node tools/stake-e2e.mjs [--dir=<build existante>] [--only=session,resume,replay] [--size=960x540]
//                            [--rgs-port=5310] [--timeout=240000] [--keep]
// Étapes : build `vite build --mode production` dans un dossier temporaire, serveur statique sur un port
// libre 5330-5399, faux RGS (tools/mock-rgs.mjs) sur 5310, Chromium (tools/lib/browser.mjs, SwiftShader).
// Scénarios :
//   session : authentification (solde affiché), spin gagnant par un vrai clic sur SPIN (débit, /bet/event,
//             end-round, solde crédité), puis spin perdant (pas d'end-round, solde relu)
//   resume  : manche ouverte au démarrage -> dialogue de reprise, clic, manche rejouée sans nouveau débit, end-round
//   replay  : ?replay=true… -> /bet/replay seulement (ni authenticate ni play), manche jouée, badge de relecture
// L'état du jeu est lu dans le DOM (classe .in-round du HUD, data-phase du SPIN, textes du HUD) et dans le
// journal du faux RGS. Captures : captures/stake/. Code de sortie : 0 OK, 1 échec d'un scénario, 2 mise en place.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { launch } from './lib/browser.mjs';
import { ROOT, parseArgs, parseSize } from './lib/cli.mjs';
import { createMockRgs } from './mock-rgs.mjs';

const { opt } = parseArgs(process.argv.slice(2), { booleans: ['keep'] });
const SIZE = parseSize(opt.size ?? '960x540') ?? { w: 960, h: 540 };
const RGS_PORT = Number(opt['rgs-port'] ?? 5310);
const TIMEOUT = Number(opt.timeout ?? 240_000);
const ONLY = opt.only ? String(opt.only).split(',') : ['session', 'resume', 'replay'];
const OUT = path.join(ROOT, 'captures', 'stake');
const FIXTURES = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/fixtures/fixtures.json'), 'utf8')).fixtures;
const FR = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/i18n/locales/fr.json'), 'utf8'));
const fixture = (id) => FIXTURES.find((f) => f.id === id);
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s]`, ...a);

// ---------------------------------------------------------------- build de production
function build() {
  if (opt.dir) {
    const d = path.resolve(String(opt.dir));
    if (!fs.existsSync(path.join(d, 'index.html'))) throw new Error(`--dir : ${d}/index.html introuvable`);
    return { dir: d, temp: false };
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boomtooth-stake-e2e-'));
  log(`build de production -> ${dir}`);
  const r = spawnSync('npx', ['vite', 'build', '--mode', 'production', '--outDir', dir, '--emptyOutDir', '--logLevel', 'error'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`vite build a échoué (code ${r.status})`);
  return { dir, temp: true };
}

function assertProduction(dir) {
  const js = fs.readdirSync(path.join(dir, 'assets')).filter((f) => f.endsWith('.js'));
  const leaks = js.filter((f) => /__qa|installQa/.test(fs.readFileSync(path.join(dir, 'assets', f), 'utf8')));
  if (leaks.length) throw new Error(`build non « production » : outils QA présents dans ${leaks.join(', ')}`);
}

// ---------------------------------------------------------------- serveur statique
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };

function serveStatic(dir) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    let p = path.normalize(path.join(dir, decodeURIComponent(u.pathname)));
    if (!p.startsWith(dir)) return void res.writeHead(403).end();
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    fs.readFile(p, (err, data) => {
      if (err) return void res.writeHead(404).end('not found');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });
  const reserved = new Set([5301, 5302, 5310, 5320, RGS_PORT]);
  const tryPort = (port) =>
    new Promise((resolve, reject) => {
      if (port > 5399) return reject(new Error('aucun port libre entre 5330 et 5399'));
      if (reserved.has(port)) return resolve(tryPort(port + 1));
      server.once('error', (e) => (e.code === 'EADDRINUSE' ? resolve(tryPort(port + 1)) : reject(e)));
      server.listen(port, '127.0.0.1', () => {
        server.removeAllListeners('error');
        resolve({ server, port, url: `http://127.0.0.1:${port}/` });
      });
    });
  return tryPort(5330);
}

// ---------------------------------------------------------------- aides
/** Instrumentation passive (aucun hook du jeu) : historique des textes du solde et des phases du SPIN. */
function observeHud() {
  window.__e2e = { balances: [], phases: [], inRound: [] };
  const rec = () => {
    const b = document.querySelector('.hud-balance .hud-value')?.textContent ?? null;
    const e = window.__e2e;
    if (b && e.balances.at(-1) !== b) e.balances.push(b);
    const s = document.querySelector('.hud-spin')?.getAttribute('data-phase');
    if (s && e.phases.at(-1) !== s) e.phases.push(s);
    const r = document.querySelector('.hud')?.classList.contains('in-round');
    if (r !== undefined && e.inRound.at(-1) !== r) e.inRound.push(r);
  };
  new MutationObserver(rec).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'data-phase'] });
}

/** Montant affiché -> centimes (le HUD affiche 2 décimales au-delà d'un centime). */
const cents = (text) => (text ? Number(String(text).replace(/[^\d]/g, '')) : NaN);
const toCents = (amount) => Math.round(amount / 10_000);

async function hudIdle(page, timeout = TIMEOUT) {
  await page.waitForFunction(
    () => {
      const hud = document.querySelector('.hud');
      const spin = document.querySelector('.hud-spin');
      return !!hud && !!spin && !hud.classList.contains('in-round') && spin.getAttribute('data-phase') === 'idle' && !spin.disabled && !document.querySelector('.dlg-panel');
    },
    null,
    { timeout, polling: 250 },
  );
}

async function waitFor(pred, what, timeout = TIMEOUT) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`délai dépassé : ${what}`);
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  try {
    await page.screenshot({ path: file, timeout: 90_000 });
    log(`  capture ${path.relative(ROOT, file)}`);
  } catch (e) {
    log(`  capture ${name} impossible : ${e.message.split('\n')[0]}`);
  }
}

async function balanceText(page) {
  return page.locator('.hud-balance .hud-value').textContent();
}

/** Scénario : contexte neuf, erreurs de page collectées, vérifications nommées. */
async function scenario(browser, name, fn) {
  const checks = [];
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: SIZE.w, height: SIZE.h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(observeHud);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()} ${r.request().method()} ${r.url()}`);
  });
  const check = (label, ok, detail = '') => {
    checks.push({ label, ok: !!ok, detail });
    log(`  ${ok ? 'ok ' : 'KO '} ${label}${detail ? ` — ${detail}` : ''}`);
    return !!ok;
  };
  log(`scénario ${name}`);
  const started = Date.now();
  let fatal = null;
  try {
    await fn({ page, check });
  } catch (e) {
    fatal = e.message.split('\n')[0];
    log(`  KO  ${fatal}`);
    await shot(page, `${name}-echec`);
  }
  const trace = await page.evaluate(() => window.__e2e).catch(() => null);
  await ctx.close();
  // erreurs attendues : réponses 4xx volontaires du faux RGS (ex. /bet/event tardif) journalisées par le navigateur
  const unexpected = errors.filter((e) => !/Failed to load resource: the server responded with a status of 4\d\d/.test(e) && !/^http 4\d\d .*(\/favicon\.ico|\/bet\/event)$/.test(e));
  if (unexpected.length) checks.push({ label: 'aucune erreur JavaScript', ok: !unexpected.some((e) => e.startsWith('pageerror')), detail: unexpected.slice(0, 5).join(' | ') });
  const ok = !fatal && checks.every((c) => c.ok);
  log(`scénario ${name} : ${ok ? 'OK' : 'KO'} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
  return { name, ok, fatal, checks, errors, trace, seconds: Math.round((Date.now() - started) / 1000) };
}

async function gotoGame(page, url) {
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  // chargement réel (textures, envoi au GPU) : le HUD est monté quand la session est prête
  await page.waitForSelector('.hud .hud-spin', { state: 'attached', timeout: TIMEOUT });
  await page.waitForFunction(() => !document.getElementById('loader') || document.getElementById('loader').classList.contains('done'), null, { timeout: TIMEOUT, polling: 250 });
}

// ---------------------------------------------------------------- scénarios
async function runSession(browser, rgs, base) {
  return scenario(browser, 'session', async ({ page, check }) => {
    rgs.reset({});
    const start = rgs.state.balance;
    await gotoGame(page, `${base}?sessionID=e2e-session&rgs_url=127.0.0.1:${rgs.port}&lang=fr&currency=EUR`);
    const auth = rgs.calls('/wallet/authenticate');
    check('authenticate appelé une fois (langue fr)', auth.length === 1 && auth[0].body.language === 'fr' && auth[0].status === 200, `${auth.length} appel(s)`);
    // écran d'accueil : un clic n'importe où le ferme
    if (await page.locator('.wel').count()) {
      await page.waitForTimeout(600);
      await page.mouse.click(SIZE.w / 2, SIZE.h * 0.3);
      await page.waitForSelector('.wel', { state: 'detached', timeout: TIMEOUT });
    }
    await hudIdle(page);
    const b0 = await balanceText(page);
    check('solde du RGS affiché dans le HUD', cents(b0) === toCents(start), `${b0} (serveur ${start})`);
    await shot(page, 'session-pret');

    // spin gagnant : F02 (×0,50)
    rgs.next({ fixture: 'F02' });
    const f02 = fixture('F02').book;
    const n0 = rgs.log.length;
    await page.locator('.hud-spin').click();
    await waitFor(() => rgs.calls('/wallet/play').length === 1, 'appel /wallet/play', 30_000);
    const play = rgs.calls('/wallet/play')[0];
    check('clic SPIN -> /wallet/play (mise 1,00, BASE)', play.status === 200 && play.body.amount === 1_000_000 && play.body.mode === 'BASE', JSON.stringify(play.body));
    await waitFor(() => rgs.calls('/wallet/end-round').length >= 1, 'appel /wallet/end-round (manche gagnante)');
    await hudIdle(page);
    const afterWin = rgs.state.balance;
    await page.waitForFunction((c) => Number((document.querySelector('.hud-balance .hud-value')?.textContent ?? '').replace(/[^\d]/g, '')) === c, toCents(afterWin), { timeout: 10_000 }).catch(() => undefined);
    const b1 = await balanceText(page);
    check('solde crédité = réponse de end-round', cents(b1) === toCents(afterWin) && afterWin === start - 1_000_000 + 500_000, `${b1} (serveur ${afterWin})`);
    const trace = await page.evaluate(() => window.__e2e.balances.slice());
    check('solde débité affiché pendant la manche (réponse de play)', trace.some((t) => cents(t) === toCents(start - 1_000_000)), trace.join(' → '));
    const round1 = rgs.log.slice(n0);
    const events = round1.filter((e) => e.path === '/bet/event');
    const endIdx = round1.findIndex((e) => e.path === '/wallet/end-round');
    const okEvents = events.filter((e) => e.status === 200).map((e) => Number(e.body.event));
    check('/bet/event : progression enregistrée (index croissants) avant end-round', okEvents.length > 0 && okEvents.every((v, i) => i === 0 || v > okEvents[i - 1]) && round1.findIndex((e) => e.path === '/bet/event') < endIdx, `index ${okEvents.join(',')} / ${f02.events.length} événements`);
    check('end-round une seule fois', rgs.calls('/wallet/end-round').length === 1 && rgs.calls('/wallet/end-round')[0].status === 200);
    await shot(page, 'session-gain');

    // spin perdant : F01 -> manche close par le serveur, pas d'end-round, solde relu
    rgs.next({ fixture: 'F01' });
    const n1 = rgs.log.length;
    await page.locator('.hud-spin').click();
    await waitFor(() => rgs.calls('/wallet/play').length === 2, 'second /wallet/play', 30_000);
    await waitFor(() => rgs.log.slice(n1).some((e) => e.path === '/wallet/balance'), 'relecture du solde après la perte');
    await hudIdle(page);
    const round2 = rgs.log.slice(n1).map((e) => e.path);
    check('perte : ni end-round ni /bet/event, solde relu (/wallet/balance)', !round2.includes('/wallet/end-round') && !round2.includes('/bet/event') && round2.includes('/wallet/balance'), round2.join(' '));
    const b2 = await balanceText(page);
    check('solde après la perte = serveur', cents(b2) === toCents(rgs.state.balance) && rgs.state.balance === afterWin - 1_000_000, `${b2} (serveur ${rgs.state.balance})`);
    check('aucun pari en double', rgs.calls('/wallet/play').length === 2);
  });
}

async function runResume(browser, rgs, base) {
  return scenario(browser, 'resume', async ({ page, check }) => {
    // manche F10 (×13,50) ouverte, déjà débitée, progression enregistrée jusqu'à l'événement 3
    rgs.reset({ resume: { fixture: 'F10', event: 3 }, balance: 999_000_000 });
    const openId = rgs.state.active.id;
    await gotoGame(page, `${base}?sessionID=e2e-resume&rgs_url=127.0.0.1:${rgs.port}&lang=fr&currency=EUR`);
    const dlg = page.locator('.dlg-panel.dlg-resume');
    await dlg.waitFor({ state: 'visible', timeout: TIMEOUT });
    const title = (await dlg.locator('.dlg-title').textContent())?.trim();
    check('dialogue de reprise affiché', title === FR['dlg.resume.title'], title ?? '');
    check('pas de nouveau pari avant la reprise', rgs.calls('/wallet/play').length === 0);
    await shot(page, 'reprise-dialogue');
    await dlg.locator('.cf-btn.is-primary').click();
    await dlg.waitFor({ state: 'detached', timeout: 10_000 });
    check('un clic ferme le dialogue', true);
    await waitFor(() => rgs.calls('/wallet/end-round').length >= 1, 'end-round de la manche reprise');
    await hudIdle(page);
    const end = rgs.calls('/wallet/end-round')[0];
    check('end-round de la manche reprise', end.status === 200 && end.round?.id === openId, `${end.status} ${end.round?.id}`);
    check('aucun nouveau débit (pas de /wallet/play)', rgs.calls('/wallet/play').length === 0);
    const idx = rgs.calls('/bet/event').filter((e) => e.status === 200).map((e) => Number(e.body.event));
    check('progression reprise après l’index 3 (croissante, jamais en arrière), avant end-round', idx.length > 0 && idx.every((v, i) => v > 3 && (i === 0 || v > idx[i - 1])) && rgs.log.findIndex((e) => e.path === '/bet/event') < rgs.log.findIndex((e) => e.path === '/wallet/end-round'), `index ${idx.join(',')}`);
    const expected = 999_000_000 + 13_500_000;
    await page.waitForFunction((c) => Number((document.querySelector('.hud-balance .hud-value')?.textContent ?? '').replace(/[^\d]/g, '')) === c, toCents(expected), { timeout: 10_000 }).catch(() => undefined);
    const b = await balanceText(page);
    check('solde final = serveur (gain crédité)', rgs.state.balance === expected && cents(b) === toCents(expected), `${b} (serveur ${rgs.state.balance})`);
    await shot(page, 'reprise-fin');
  });
}

async function runReplay(browser, rgs, base) {
  return scenario(browser, 'replay', async ({ page, check }) => {
    rgs.reset({});
    const q = `replay=true&game=boomtooth&version=1.0.0&mode=BASE&event=F10&rgs_url=127.0.0.1:${rgs.port}&lang=fr&currency=EUR&amount=1000000`;
    await gotoGame(page, `${base}?${q}`);
    await page.waitForSelector('.hud.is-replay', { timeout: 30_000 });
    const badge = page.locator('.ovl-fs');
    await badge.waitFor({ state: 'visible', timeout: 30_000 });
    const label = (await badge.locator('.ovl-fs-label').textContent())?.trim();
    check('badge de relecture affiché', label === FR['replay.badge'], label ?? '');
    // la manche relue se joue d'elle-même : HUD verrouillé puis de nouveau au repos
    await page.waitForFunction(() => window.__e2e?.phases.includes('locked'), null, { timeout: TIMEOUT, polling: 250 });
    await shot(page, 'replay-en-cours');
    await hudIdle(page);
    const phases = await page.evaluate(() => window.__e2e.phases.slice());
    check('manche jouée (SPIN verrouillé puis au repos)', phases.indexOf('locked') >= 0 && phases.lastIndexOf('idle') > phases.indexOf('locked'), phases.join(' → '));
    const replay = rgs.calls('/bet/replay');
    check('/bet/replay/{game}/{version}/{mode}/{event} appelé', replay.length === 1 && replay[0].method === 'GET' && replay[0].path === '/bet/replay/boomtooth/1.0.0/BASE/F10' && replay[0].status === 200, replay.map((e) => e.path).join(' '));
    const wallet = rgs.log.filter((e) => e.path.startsWith('/wallet') || e.path === '/bet/event');
    check('ni authenticate, ni play, ni end-round, ni /bet/event', wallet.length === 0, wallet.map((e) => e.path).join(' '));
    await shot(page, 'replay-fin');
  });
}

// ---------------------------------------------------------------- principal
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let built;
  let web;
  let rgs;
  let browser;
  const results = [];
  try {
    built = build();
    assertProduction(built.dir);
    web = await serveStatic(built.dir);
    log(`build servie sur ${web.url}`);
    rgs = await createMockRgs({ quiet: true }).listen(RGS_PORT);
    log(`faux RGS sur ${rgs.url}`);
    browser = await launch();
  } catch (e) {
    console.error(`mise en place impossible : ${e.message}`);
    await cleanup();
    process.exit(2);
  }
  const runners = { session: runSession, resume: runResume, replay: runReplay };
  for (const name of ONLY) {
    const run = runners[name];
    if (!run) {
      results.push({ name, ok: false, fatal: 'scénario inconnu', checks: [] });
      continue;
    }
    results.push(await run(browser, rgs, web.url));
    results.at(-1).rgsLog = rgs.log.map(({ path: p, method, body, status, code }) => ({ method, path: p, body, status, ...(code ? { code } : {}) }));
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ date: new Date().toISOString(), size: SIZE, results }, null, 1));
  await cleanup();
  console.log('\nRésultat');
  for (const r of results) console.log(`  ${r.ok ? 'OK' : 'KO'}  ${r.name}${r.seconds !== undefined ? ` (${r.seconds} s)` : ''}${r.fatal ? ` — ${r.fatal}` : ''}`);
  console.log(`  rapport : ${path.relative(ROOT, path.join(OUT, 'report.json'))}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);

  async function cleanup() {
    await browser?.close().catch(() => undefined);
    await rgs?.close().catch(() => undefined);
    web?.server.closeAllConnections?.();
    await new Promise((r) => (web ? web.server.close(() => r()) : r()));
    if (built?.temp && !opt.keep) fs.rmSync(built.dir, { recursive: true, force: true });
    else if (built?.temp) log(`build conservée : ${built.dir}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
