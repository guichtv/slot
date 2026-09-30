// DEV TOOL - local mock of the Stake Engine RGS (NOT an Engine test: it only mimics the public
// API shape so the RGS provider can be exercised end to end). Serves the fixtures as rounds.
//   node tools/mock-rgs.mjs [--port 5345] [--fail-play ERR_IPB] [--active F21@12] [--jurisdiction social,noTurbo,...]
// Then open the game with ?sessionID=mock&rgs_url=http://127.0.0.1:5345
import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const PORT = Number(opt('port', '5345'));
const cfg = JSON.parse(readFileSync(resolve(ROOT, 'public/game-math-config.json'), 'utf8'));
const fixtures = Object.fromEntries(readdirSync(resolve(ROOT, 'public/fixtures')).filter((f) => /^F\d+\.json$/.test(f)).map((f) => [f.slice(0, -5), JSON.parse(readFileSync(resolve(ROOT, 'public/fixtures', f), 'utf8'))]));
const J = new Set((opt('jurisdiction', '') || '').split(',').filter(Boolean));
let balance = 1000 * 1e6;
let round = null; // { book, amount, payout, mode, id, event }
let nextId = 1000;
let failPlay = opt('fail-play', null);
const forced = [];
const act = opt('active', null);
if (act) { const [fid, ev] = act.split('@'); const f = fixtures[fid]; round = { book: f.book, amount: 1e6, payout: f.book.payoutMultiplier / 100 * 1e6, mode: f.book.mode.toLowerCase(), id: nextId++, event: ev ?? '0' }; balance -= 1e6 * (cfg.modes[f.book.mode]?.cost ?? 1); }
const LEVELS = [100000, 200000, 500000, 1000000, 2000000, 5000000, 10000000, 20000000, 50000000, 100000000];
const log = [];

function json(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' }); res.end(JSON.stringify(body)); }
function pick(mode) {
  const f = forced.shift();
  if (f) return fixtures[f];
  const pool = Object.values(fixtures).filter((x) => x.modes.map((m) => m.toLowerCase()).includes(mode));
  return pool[Math.floor(Math.random() * pool.length)];
}
const status = (code, msg) => ({ status: { statusCode: code, statusMessage: msg ?? code } });

createServer((req, res) => {
  if (req.method === 'OPTIONS') { json(res, 204, {}); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const b = body ? JSON.parse(body) : {};
    log.push({ t: Date.now(), path: url.pathname, body: b });
    if (url.pathname === '/__log') { json(res, 200, log); return; }
    if (url.pathname === '/__force') { forced.push(url.searchParams.get('f')); json(res, 200, { ok: true }); return; }
    if (url.pathname === '/__fail') { failPlay = url.searchParams.get('code'); json(res, 200, { ok: true }); return; }
    if (b.sessionID !== 'mock' && url.pathname.startsWith('/wallet')) { json(res, 200, status('ERR_IS', 'invalid session')); return; }
    switch (url.pathname) {
      case '/wallet/authenticate':
        json(res, 200, { balance: { amount: balance, currency: J.has('social') ? 'SC' : 'EUR' }, config: { betLevels: LEVELS, defaultBetLevel: 1000000, minBet: LEVELS[0], maxBet: LEVELS.at(-1), stepBet: 100000,
          betModes: Object.fromEntries(Object.entries(cfg.modes).map(([k, v]) => [k.toLowerCase(), { costMultiplier: v.cost, feature: v.feature }])),
          jurisdiction: { socialCasino: J.has('social'), disabledFullscreen: J.has('noFullscreen'), disabledTurbo: J.has('noTurbo'), disabledSuperTurbo: true, disabledAutoplay: J.has('noAutoplay'), disabledSlamstop: J.has('noSlamstop'), disabledSpacebar: J.has('noSpacebar'), disabledBuyFeature: J.has('noBuy'), displayNetPosition: J.has('net'), displayRTP: !J.has('noRtp'), displaySessionTimer: J.has('timer'), minimumRoundDuration: J.has('minDuration') ? 2500 : 0 } },
          round: round ? { roundID: round.id, amount: round.amount, payout: round.payout, payoutMultiplier: round.book.payoutMultiplier / 100, active: true, mode: round.mode, event: round.event, state: round.book.events } : null, ...status('SUCCESS') });
        return;
      case '/wallet/play': {
        if (failPlay) { const c = failPlay; failPlay = null; json(res, 200, status(c)); return; }
        if (round) { json(res, 200, status('ERR_BE', 'active bet')); return; }
        if (!LEVELS.includes(b.amount)) { json(res, 200, status('ERR_VAL', 'bet level')); return; }
        const mode = String(b.mode).toLowerCase();
        const cost = b.amount * (cfg.modes[mode.toUpperCase()]?.cost ?? 1);
        if (cost > balance) { json(res, 200, status('ERR_IPB')); return; }
        const f = pick(mode);
        balance -= cost;
        const payout = Math.round((f.book.payoutMultiplier / 100) * b.amount);
        round = { book: f.book, amount: b.amount, payout, mode, id: nextId++, event: '0' };
        json(res, 200, { balance: { amount: balance, currency: J.has('social') ? 'SC' : 'EUR' }, round: { roundID: round.id, amount: b.amount, payout, payoutMultiplier: f.book.payoutMultiplier / 100, active: true, mode, event: null, state: f.book.events }, ...status('SUCCESS') });
        return;
      }
      case '/wallet/end-round':
        if (!round) { json(res, 200, status('ERR_BNF')); return; }
        balance += round.payout; round = null;
        json(res, 200, { balance: { amount: balance, currency: J.has('social') ? 'SC' : 'EUR' }, ...status('SUCCESS') });
        return;
      case '/wallet/balance': json(res, 200, { balance: { amount: balance, currency: J.has('social') ? 'SC' : 'EUR' }, ...status('SUCCESS') }); return;
      case '/bet/event': if (round) round.event = String(b.event); json(res, 200, { event: b.event, ...status('SUCCESS') }); return;
      default: {
        const m = /^\/bet\/replay\/[^/]+\/[^/]+\/([^/]+)\/([^/]+)$/.exec(url.pathname);
        if (m) { const f = fixtures[`F${String(Number(m[2]) % 100).padStart(2, '0')}`] ?? fixtures.F07; json(res, 200, { payoutMultiplier: f.book.payoutMultiplier / 100, costMultiplier: cfg.modes[f.book.mode]?.cost ?? 1, state: f.book.events }); return; }
        json(res, 404, { error: 'not found' });
      }
    }
  });
}).listen(PORT, '127.0.0.1', () => console.log(`[mock-rgs] outil de dev (pas Engine) sur http://127.0.0.1:${PORT}  ?sessionID=mock&rgs_url=http://127.0.0.1:${PORT}`));
