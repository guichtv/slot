// MOCK RGS LOCAL — outil de développement uniquement (jamais un test dans l'environnement Engine réel).
// Sert les fixtures sur les mêmes endpoints que le RGS Stake :
//   POST /wallet/authenticate {sessionID, language}
//   POST /wallet/play {sessionID, amount, mode}
//   POST /wallet/end-round {sessionID}
//   POST /wallet/balance {sessionID}
//   POST /bet/event {sessionID, event}
//   GET  /bet/replay/{game}/{version}/{mode}/{event}
// Pilotage des cas d'erreur : POST /__mock/next {"error":"ERR_IB"|"ERR_IS"|...,"delayMs":n,"timeout":true,"fixture":"F07","resume":true}
// Usage : node tools/mock-rgs.mjs [port=5310]
// Puis : http://127.0.0.1:5302/?sessionID=mock-session&rgs_url=http://127.0.0.1:5310&lang=fr
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.argv[2] ?? 5310);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const FIX = path.join(ROOT, 'public/fixtures/fixtures.json');
const CFG = path.join(ROOT, 'public/game-math-config.json');

const load = () => JSON.parse(fs.readFileSync(FIX, 'utf8'));
const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
const modeCost = (m) => cfg.modes?.[m]?.cost ?? 1;

const state = {
  balance: 1_000_000_000, // 1000.00
  currency: 'EUR',
  active: null, // manche ouverte
  lastEvent: -1,
  next: {},
  counter: 0,
  history: new Map(),
};

const BET_LEVELS = [100000, 200000, 400000, 600000, 800000, 1000000, 2000000, 4000000, 6000000, 8000000, 10000000, 20000000, 50000000, 100000000];

function send(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function pick(mode) {
  const all = load().fixtures.filter((f) => f.mode === mode);
  if (!all.length) return null;
  const total = all.reduce((s, f) => s + f.weight, 0) || all.length;
  let r = Math.random() * total;
  for (const f of all) { r -= f.weight || 1; if (r <= 0) return f; }
  return all[0];
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  let body = {};
  if (req.method === 'POST') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return send(res, 400, { code: 'ERR_VAL', message: 'bad json' }); }
  }
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (p === '/__mock/next') { state.next = body; return send(res, 200, { ok: true }); }
  if (p === '/__mock/state') return send(res, 200, { balance: state.balance, active: state.active?.id ?? null, lastEvent: state.lastEvent });

  const n = state.next;
  if (n.delayMs) await new Promise((r) => setTimeout(r, n.delayMs));
  if (n.timeout && p === '/wallet/play') { state.next = {}; return; } // pas de réponse : le client expire
  if (p.startsWith('/wallet') || p.startsWith('/bet/event')) {
    if (!body.sessionID) return send(res, 400, { code: 'ERR_IS', message: 'missing session' });
    if (body.sessionID === 'expired') return send(res, 401, { code: 'ERR_IS', message: 'session expired' });
  }
  if (n.error && p !== '/wallet/authenticate') { const code = n.error; state.next = {}; return send(res, 400, { code, message: code }); }

  const roundPayload = (r) => ({ betID: r.id, amount: r.amount, payout: r.payout, payoutMultiplier: r.book.payoutMultiplier, costMultiplier: modeCost(r.mode), active: r.active, mode: r.mode, event: state.lastEvent >= 0 ? String(state.lastEvent) : null, state: r.book.events });

  switch (p) {
    case '/wallet/authenticate': {
      if (n.resume && !state.active) {
        const f = pick('BONUS') ?? pick('BASE');
        state.active = { id: `mock-${++state.counter}`, amount: 1000000, mode: f.mode, book: f.book, payout: 0, active: true };
        state.lastEvent = 3;
        state.next = {};
      }
      return send(res, 200, {
        balance: { amount: state.balance, currency: state.currency },
        config: { minBet: BET_LEVELS[0], maxBet: BET_LEVELS.at(-1), stepBet: 100000, defaultBetLevel: 1000000, betLevels: BET_LEVELS, jurisdiction: { socialCasino: false, disabledFullscreen: false, disabledTurbo: false } },
        round: state.active ? roundPayload(state.active) : null,
      });
    }
    case '/wallet/play': {
      if (state.active) return send(res, 400, { code: 'ERR_BR', message: 'round already active' });
      const amount = Number(body.amount);
      if (!BET_LEVELS.includes(amount)) return send(res, 400, { code: 'ERR_OR', message: 'bet out of range' });
      const mode = String(body.mode ?? 'BASE');
      const cost = Math.round(amount * modeCost(mode));
      if (cost > state.balance) return send(res, 400, { code: 'ERR_IB', message: 'insufficient balance' });
      const f = n.fixture ? load().fixtures.find((x) => x.id === n.fixture) : pick(mode);
      state.next = {};
      if (!f) return send(res, 400, { code: 'ERR_VAL', message: `no fixture for ${mode}` });
      state.balance -= cost;
      const payout = Math.round((amount * f.book.payoutMultiplier) / 100);
      const r = { id: `mock-${++state.counter}`, amount, mode, book: f.book, payout, active: payout > 0 };
      state.lastEvent = -1;
      state.history.set(r.id, r);
      if (r.active) state.active = r;
      return send(res, 200, { balance: { amount: state.balance, currency: state.currency }, round: roundPayload(r) });
    }
    case '/wallet/end-round': {
      if (!state.active) return send(res, 400, { code: 'ERR_NR', message: 'no active round' });
      state.balance += state.active.payout;
      state.active = null;
      state.lastEvent = -1;
      return send(res, 200, { balance: { amount: state.balance, currency: state.currency } });
    }
    case '/wallet/balance':
      return send(res, 200, { balance: { amount: state.balance, currency: state.currency } });
    case '/bet/event':
      state.lastEvent = Number(body.event);
      return send(res, 200, { event: body.event });
    default: {
      const m = p.match(/^\/bet\/replay\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)$/);
      if (m) {
        const f = load().fixtures.find((x) => x.id === decodeURIComponent(m[4])) ?? pick(decodeURIComponent(m[3]));
        if (!f) return send(res, 404, { code: 'ERR_VAL' });
        return send(res, 200, { payoutMultiplier: f.book.payoutMultiplier, costMultiplier: modeCost(f.mode), state: f.book.events });
      }
      return send(res, 404, { code: 'ERR_VAL', message: 'unknown endpoint' });
    }
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`MOCK RGS (dev) http://127.0.0.1:${PORT}`));
