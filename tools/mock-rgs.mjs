// MOCK RGS LOCAL — outil de développement uniquement (jamais un test dans l'environnement Engine réel).
// Sert les fixtures sur les mêmes endpoints que le RGS Stake :
//   POST /wallet/authenticate {sessionID, language}
//   POST /wallet/play {sessionID, amount, mode}
//   POST /wallet/end-round {sessionID}
//   POST /wallet/balance {sessionID}
//   POST /bet/event {sessionID, event}
//   GET  /bet/replay/{game}/{version}/{mode}/{event}      (event = id de fixture, sinon tirage dans le mode)
// Pilotage (tests, e2e) :
//   POST /__mock/next  {"error":"ERR_IPB","status":400,"on":"/wallet/play","delayMs":n,"timeout":true|"after",
//                       "raw":"texte non JSON","fixture":"F07","resume":true|{"fixture":"F10","event":3}}
//        une directive par appel (file) ; consommée par la première requête dont le chemin vaut `on`
//        (défaut /wallet/play ; `resume` s'applique à /wallet/authenticate). timeout:true = aucune réponse ;
//        "after" = pari traité (débit, manche ouverte) puis aucune réponse (issue incertaine côté client).
//   POST /__mock/reset {balance, currency, social, resume:{fixture,event,amount}, betLevels, defaultBetLevel}
//   GET  /__mock/state · GET /__mock/log (journal des appels, sans sessionID)
// Usage : node tools/mock-rgs.mjs [port=5310] [--resume=F10:3] [--currency=XGC] [--social] [--balance=1000000000]
// Puis : http://127.0.0.1:5302/?sessionID=mock-session&rgs_url=127.0.0.1:5310&lang=fr
// Import : import { createMockRgs } from './mock-rgs.mjs' ; const rgs = createMockRgs(); await rgs.listen(5310);
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'public/fixtures/fixtures.json');
const CFG = path.join(ROOT, 'public/game-math-config.json');

export const BET_LEVELS = [100000, 200000, 400000, 600000, 800000, 1000000, 2000000, 4000000, 6000000, 8000000, 10000000, 20000000, 50000000, 100000000];
export const DEFAULT_BALANCE = 1_000_000_000; // 1000.00

const loadFixtures = () => JSON.parse(fs.readFileSync(FIX, 'utf8')).fixtures;

/** Gain d'une manche : mise (base 1e6) × payoutMultiplier (centièmes), arrondi au plus proche (moitié vers le haut). */
export function payoutOf(amount, payoutMultiplier) {
  const n = BigInt(Math.round(amount)) * BigInt(Math.round(payoutMultiplier));
  const q = n / 100n;
  return Number((n % 100n) * 2n >= 100n ? q + 1n : q);
}

/**
 * Crée un faux RGS (non démarré). `listen(port | [de, à])` le démarre (essaie les ports de la plage).
 * Options : balance, currency, social, resume {fixture, event, amount}, betLevels, defaultBetLevel, quiet.
 */
export function createMockRgs(options = {}) {
  const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
  const modeCost = (m) => cfg.modes?.[m]?.cost;
  let fixtures = loadFixtures();
  const quiet = options.quiet ?? true;
  const started = Date.now();

  const state = {};
  const log = [];
  let directives = [];

  function openRound(f, amount, lastEvent) {
    const r = { id: `mock-${++state.counter}`, amount, mode: f.mode, book: f.book, payout: payoutOf(amount, f.book.payoutMultiplier), active: true };
    state.active = r;
    state.lastEvent = lastEvent;
    state.history.set(r.id, r);
    return r;
  }

  function pick(mode) {
    const all = fixtures.filter((f) => f.mode === mode);
    if (!all.length) return null;
    const total = all.reduce((s, f) => s + (f.weight || 1), 0);
    let r = Math.random() * total;
    for (const f of all) {
      r -= f.weight || 1;
      if (r <= 0) return f;
    }
    return all[0];
  }

  function resumeRound(spec) {
    const s = spec === true ? {} : spec;
    const f = s.fixture ? fixtures.find((x) => x.id === s.fixture) : pick('BONUS') ?? pick('BASE');
    if (!f) throw new Error(`mock-rgs : fixture inconnue ${s.fixture}`);
    // manche ouverte (débit déjà fait lors du pari d'origine), progression enregistrée à l'index `event`
    return openRound(f, s.amount ?? 1_000_000, s.event ?? 3);
  }

  function reset(o = {}, initial = false) {
    fixtures = loadFixtures();
    Object.assign(state, {
      balance: o.balance ?? options.balance ?? DEFAULT_BALANCE,
      currency: o.currency ?? options.currency ?? 'EUR',
      social: o.social ?? options.social ?? false,
      betLevels: o.betLevels ?? options.betLevels ?? BET_LEVELS,
      defaultBetLevel: o.defaultBetLevel ?? options.defaultBetLevel ?? 1_000_000,
      active: null,
      lastEvent: -1,
      counter: 0,
      history: new Map(),
    });
    directives = [];
    log.length = 0;
    const res = initial ? options.resume : o.resume;
    if (res) resumeRound(res);
  }
  reset({}, true);

  const hanging = new Set();

  function send(res, entry, code, body, raw) {
    entry.status = code;
    if (body && typeof body.code === 'string') entry.code = body.code;
    res.writeHead(code, {
      'Content-Type': raw !== undefined ? 'text/plain' : 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end(code === 204 ? undefined : raw !== undefined ? raw : JSON.stringify(body));
    if (!quiet) console.log(`[mock-rgs] ${entry.method} ${entry.path} -> ${code}${entry.code ? ` ${entry.code}` : ''}`);
  }

  function hang(res, entry) {
    entry.status = 0;
    entry.code = 'NO_RESPONSE';
    hanging.add(res);
    res.on('close', () => hanging.delete(res));
  }

  const roundPayload = (r) => ({
    betID: r.id,
    amount: r.amount,
    payout: r.payout,
    payoutMultiplier: r.book.payoutMultiplier,
    ...(modeCost(r.mode) !== undefined ? { costMultiplier: modeCost(r.mode) } : {}),
    active: r.active,
    mode: r.mode,
    event: state.active === r && state.lastEvent >= 0 ? String(state.lastEvent) : null,
    state: r.book.events,
  });
  const balance = () => ({ amount: state.balance, currency: state.currency });

  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://x');
    const p = url.pathname;
    if (req.method === 'OPTIONS') return send(res, { method: 'OPTIONS', path: p }, 204, {});
    let body = {};
    let bad = false;
    if (req.method === 'POST') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        bad = true;
      }
    }
    // pilotage (hors journal)
    const ctl = { method: req.method, path: p };
    if (p === '/__mock/next') {
      directives.push(body);
      return send(res, ctl, 200, { ok: true, queued: directives.length });
    }
    if (p === '/__mock/reset') {
      reset(body);
      return send(res, ctl, 200, { ok: true });
    }
    if (p === '/__mock/state') return send(res, ctl, 200, { balance: state.balance, currency: state.currency, active: state.active?.id ?? null, lastEvent: state.lastEvent, rounds: state.counter });
    if (p === '/__mock/log') return send(res, ctl, 200, { log });

    const { sessionID, ...rest } = body;
    const entry = { i: log.length, t: Date.now() - started, method: req.method, path: p, body: rest, status: null };
    log.push(entry);
    if (bad) return send(res, entry, 400, { code: 'ERR_VAL', message: 'bad json' });

    const di = directives.findIndex((d) => (d.on ?? (d.resume ? '/wallet/authenticate' : '/wallet/play')) === p);
    const d = di >= 0 ? directives.splice(di, 1)[0] : {};
    if (d.delayMs) await new Promise((r) => setTimeout(r, d.delayMs));
    if (d.timeout === true) return hang(res, entry);
    if (d.raw !== undefined) return send(res, entry, d.status ?? 502, null, String(d.raw));

    if (p.startsWith('/wallet') || p === '/bet/event') {
      if (!sessionID) return send(res, entry, 400, { code: 'ERR_IS', message: 'missing session' });
      if (sessionID === 'expired') return send(res, entry, 401, { code: 'ERR_IS', message: 'session expired' });
    }
    if (d.error) return send(res, entry, d.status ?? 400, { code: d.error, message: d.error });

    switch (p) {
      case '/wallet/authenticate': {
        if (d.resume && !state.active) resumeRound(d.resume);
        return send(res, entry, 200, {
          balance: balance(),
          config: {
            minBet: state.betLevels[0],
            maxBet: state.betLevels.at(-1),
            stepBet: 100000,
            defaultBetLevel: state.defaultBetLevel,
            betLevels: state.betLevels,
            jurisdiction: { socialCasino: state.social, disabledFullscreen: false, disabledTurbo: false },
          },
          round: state.active ? roundPayload(state.active) : null,
        });
      }
      case '/wallet/play': {
        if (state.active) return send(res, entry, 400, { code: 'ERR_BR', message: 'round already active' });
        const amount = Number(body.amount);
        if (!Number.isInteger(amount) || !state.betLevels.includes(amount)) return send(res, entry, 400, { code: 'ERR_OR', message: 'bet out of range' });
        const mode = String(body.mode ?? 'BASE');
        const costX = modeCost(mode);
        if (costX === undefined) return send(res, entry, 400, { code: 'ERR_VAL', message: `unknown mode ${mode}` });
        const cost = Math.round(amount * costX);
        if (cost > state.balance) return send(res, entry, 400, { code: 'ERR_IPB', message: 'insufficient balance' });
        const f = d.fixture ? fixtures.find((x) => x.id === d.fixture) : pick(mode);
        if (!f) return send(res, entry, 400, { code: 'ERR_VAL', message: `no fixture for ${mode}` });
        state.balance -= cost;
        const r = openRound(f, amount, -1);
        entry.round = { id: r.id, fixture: f.id, payout: r.payout, cost };
        // une manche sans gain est close par le serveur (aucun end-round attendu)
        if (r.payout === 0) {
          r.active = false;
          state.active = null;
        }
        if (d.timeout === 'after') return hang(res, entry);
        return send(res, entry, 200, { balance: balance(), round: roundPayload(r) });
      }
      case '/wallet/end-round': {
        if (!state.active) return send(res, entry, 400, { code: 'ERR_NR', message: 'no active round' });
        state.balance += state.active.payout;
        state.active.active = false;
        entry.round = { id: state.active.id, payout: state.active.payout };
        state.active = null;
        state.lastEvent = -1;
        return send(res, entry, 200, { balance: balance() });
      }
      case '/wallet/balance':
        return send(res, entry, 200, { balance: balance() });
      case '/bet/event': {
        if (!state.active) return send(res, entry, 400, { code: 'ERR_NR', message: 'no active round' });
        const ev = Number(body.event);
        if (!Number.isInteger(ev) || ev < 0) return send(res, entry, 400, { code: 'ERR_VAL', message: 'bad event' });
        state.lastEvent = ev;
        return send(res, entry, 200, { event: String(body.event) });
      }
      default: {
        const m = p.match(/^\/bet\/replay\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)$/);
        if (m && req.method === 'GET') {
          const id = decodeURIComponent(m[4]);
          const mode = decodeURIComponent(m[3]);
          const f = fixtures.find((x) => x.id === id) ?? pick(mode);
          if (!f) return send(res, entry, 404, { code: 'ERR_VAL', message: 'unknown replay' });
          entry.round = { fixture: f.id };
          return send(res, entry, 200, { payoutMultiplier: f.book.payoutMultiplier, ...(modeCost(f.mode) !== undefined ? { costMultiplier: modeCost(f.mode) } : {}), state: f.book.events });
        }
        return send(res, entry, 404, { code: 'ERR_VAL', message: 'unknown endpoint' });
      }
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (!res.headersSent) send(res, { method: req.method, path: req.url }, 500, { code: 'ERR_GEN', message: String(e?.message ?? e) });
    });
  });

  const api = {
    server,
    state,
    log,
    port: 0,
    get url() {
      return `http://127.0.0.1:${api.port}`;
    },
    reset: (o) => reset(o),
    /** directive pour la prochaine requête correspondante (voir en-tête) */
    next(d) {
      directives.push(d);
    },
    /** entrées du journal pour un chemin (préfixe) */
    calls(prefix) {
      return log.filter((e) => e.path.startsWith(prefix));
    },
    listen(port = 5310) {
      const [from, to] = Array.isArray(port) ? port : [port, port];
      const tryPort = (p) =>
        new Promise((resolve, reject) => {
          const onErr = (e) => {
            server.off('listening', onOk);
            if (e.code === 'EADDRINUSE' && p < to) resolve(tryPort(p + 1));
            else reject(e);
          };
          const onOk = () => {
            server.off('error', onErr);
            api.port = p;
            resolve(api);
          };
          server.once('error', onErr);
          server.once('listening', onOk);
          server.listen(p, '127.0.0.1');
        });
      return tryPort(from);
    },
    close() {
      for (const r of hanging) r.destroy();
      hanging.clear();
      server.closeAllConnections?.();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
  return api;
}

// exécution directe : node tools/mock-rgs.mjs [port] [--resume=F10:3] [--currency=XGC] [--social] [--balance=n]
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => {
    const [k, ...v] = a.slice(2).split('=');
    return [k, v.length ? v.join('=') : true];
  }));
  const port = Number(args.find((a) => !a.startsWith('--')) ?? 5310);
  let resume;
  if (opt.resume) {
    const [fixture, event] = String(opt.resume === true ? '' : opt.resume).split(':');
    resume = { ...(fixture ? { fixture } : {}), ...(event ? { event: Number(event) } : {}) };
    if (!fixture && !event) resume = true;
  }
  const rgs = createMockRgs({
    quiet: false,
    ...(opt.currency ? { currency: String(opt.currency) } : {}),
    ...(opt.social ? { social: true } : {}),
    ...(opt.balance ? { balance: Number(opt.balance) } : {}),
    ...(resume ? { resume } : {}),
  });
  rgs.listen(port).then(
    () => console.log(`MOCK RGS (dev) ${rgs.url}${resume ? ` — manche ouverte ${rgs.state.active?.id} (reprise après l'événement ${rgs.state.lastEvent})` : ''}`),
    (e) => {
      console.error(`mock-rgs : port ${port} indisponible (${e.code ?? e.message})`);
      process.exit(1);
    },
  );
}
