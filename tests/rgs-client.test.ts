import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RgsClient, RgsError, fetchReplay, normalizeConfig, normalizeRound, replayUrl } from '../src/stake/rgs';
import { normalizeRgsUrl, parseLaunchParams } from '../src/stake/params';
import { bookToMoney, formatMoney, setMoneyFormat } from '../src/core/money';
import FIXTURES from '../public/fixtures/fixtures.json';

/**
 * Client RGS contre le faux RGS (tools/mock-rgs.mjs) démarré dans le test, sur un port 5340-5399.
 * Montants en base 1e6 ; erreurs traduites en RgsError (incertaines seulement sur un pari).
 */
interface LogEntry {
  method: string;
  path: string;
  body: Record<string, unknown>;
  status: number | null;
  code?: string;
  round?: { id?: string; fixture?: string; payout?: number; cost?: number };
}
interface MockRgs {
  url: string;
  state: { balance: number; currency: string; active: { id: string } | null; lastEvent: number };
  log: LogEntry[];
  reset(o?: Record<string, unknown>): void;
  next(d: Record<string, unknown>): void;
  calls(prefix: string): LogEntry[];
  listen(port: number | [number, number]): Promise<MockRgs>;
  close(): Promise<void>;
}
interface MockModule {
  createMockRgs(o?: Record<string, unknown>): MockRgs;
  payoutOf(amount: number, payoutMultiplier: number): number;
  BET_LEVELS: number[];
  DEFAULT_BALANCE: number;
}
const MOCK_PATH = '../tools/mock-rgs.mjs';
const fixture = (id: string) => (FIXTURES.fixtures as Array<{ id: string; book: { events: unknown[] } }>).find((f) => f.id === id)!;

let mod: MockModule;
let rgs: MockRgs;
const client = (session = 'test-session', timeouts?: Record<string, number>) => new RgsClient(rgs.url, session, timeouts ? { timeouts } : undefined);

async function rgsError(p: Promise<unknown>): Promise<RgsError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(RgsError);
    return e as RgsError;
  }
  throw new Error('RgsError attendue');
}

beforeAll(async () => {
  mod = (await import(/* @vite-ignore */ MOCK_PATH)) as MockModule;
  rgs = await mod.createMockRgs().listen([5340, 5399]);
});
afterAll(() => rgs.close());
beforeEach(() => rgs.reset({}));

describe('authenticate', () => {
  it('rend solde, devise, niveaux de mise, défaut et juridiction ; aucun round', async () => {
    const a = await client().authenticate('fr');
    expect(a.balance).toEqual({ amount: mod.DEFAULT_BALANCE, currency: 'EUR' });
    expect(a.config.betLevels).toEqual(mod.BET_LEVELS);
    expect(a.config.defaultBetLevel).toBe(1_000_000);
    expect(a.config.minBet).toBe(100_000);
    expect(a.config.maxBet).toBe(100_000_000);
    expect(a.config.stepBet).toBe(100_000);
    expect(a.config.jurisdiction).toMatchObject({ socialCasino: false, disabledTurbo: false });
    expect(a.round).toBeNull();
    const call = rgs.calls('/wallet/authenticate')[0]!;
    expect(call.body).toEqual({ language: 'fr' });
    expect(call.status).toBe(200);
  });

  it('manche ouverte : round actif avec le dernier événement enregistré', async () => {
    rgs.reset({ resume: { fixture: 'F10', event: 3 } });
    const a = await client().authenticate('en');
    expect(a.round).toMatchObject({ mode: 'BASE', amount: 1_000_000, payoutMultiplier: 1350, active: true, lastEvent: 3, costMultiplier: 1 });
    expect(a.round!.id).toMatch(/^mock-/);
    expect(a.round!.events).toHaveLength(fixture('F10').book.events.length);
  });

  it('progression enregistrée par /bet/event relue à la réauthentification', async () => {
    rgs.reset({ resume: { fixture: 'F10', event: 3 } });
    const c = client();
    expect(await c.saveEvent(6)).toBe(true);
    expect(rgs.calls('/bet/event')[0]!.body).toEqual({ event: '6' });
    expect((await c.authenticate('en')).round!.lastEvent).toBe(6);
  });
});

describe('play / end-round', () => {
  it('débite mise × coût du mode ; perte = manche close (inactive)', async () => {
    const c = client();
    rgs.next({ fixture: 'F01' });
    const r = await c.play(1_000_000, 'BASE');
    expect(r.balance.amount).toBe(mod.DEFAULT_BALANCE - 1_000_000);
    expect(r.round).toMatchObject({ mode: 'BASE', amount: 1_000_000, payoutMultiplier: 0, active: false });
    expect(r.round.events).toHaveLength(fixture('F01').book.events.length);
    expect(rgs.state.active).toBeNull();
    // aucune manche ouverte : end-round refusé (ERR_NR), certain
    const e = await rgsError(c.endRound());
    expect(e.code).toBe('ERR_NR');
    expect(e.uncertain).toBe(false);
    expect(e.status).toBe(400);
  });

  it('gain = manche active jusqu’à end-round, qui crédite le gain', async () => {
    const c = client();
    rgs.next({ fixture: 'F10' });
    const r = await c.play(1_000_000, 'BASE');
    expect(r.round.active).toBe(true);
    expect(r.balance.amount).toBe(mod.DEFAULT_BALANCE - 1_000_000);
    const b = await c.endRound();
    expect(b.amount).toBe(mod.DEFAULT_BALANCE - 1_000_000 + 13_500_000);
    expect((await c.balance()).amount).toBe(b.amount);
    expect((await rgsError(c.endRound())).code).toBe('ERR_NR');
  });

  it('coût des modes (ANTE 1,5×, BONUS 100×) débité côté serveur', async () => {
    const c = client();
    rgs.next({ fixture: 'F28' });
    expect((await c.play(1_000_000, 'ANTE')).balance.amount).toBe(mod.DEFAULT_BALANCE - 1_500_000);
    rgs.next({ fixture: 'F16' });
    const r = await c.play(1_000_000, 'BONUS');
    expect(r.balance.amount).toBe(mod.DEFAULT_BALANCE - 1_500_000 - 100_000_000);
    expect(r.round).toMatchObject({ mode: 'BONUS', costMultiplier: 100, active: true });
  });

  it('manche déjà ouverte : ERR_BR', async () => {
    const c = client();
    rgs.next({ fixture: 'F10' });
    await c.play(1_000_000, 'BASE');
    expect((await rgsError(c.play(1_000_000, 'BASE'))).code).toBe('ERR_BR');
  });

  it('mise hors paliers : ERR_OR, aucun débit', async () => {
    const e = await rgsError(client().play(1_500_000, 'BASE'));
    expect(e.code).toBe('ERR_OR');
    expect(e.uncertain).toBe(false);
    expect(rgs.state.balance).toBe(mod.DEFAULT_BALANCE);
  });

  it('saveEvent sans manche ouverte : échec non bloquant (false)', async () => {
    expect(await client().saveEvent(2)).toBe(false);
  });
});

describe('erreurs', () => {
  it('ERR_IPB : solde insuffisant, certain, solde inchangé', async () => {
    rgs.reset({ balance: 500_000 });
    const e = await rgsError(client().play(1_000_000, 'BASE'));
    expect(e.code).toBe('ERR_IPB');
    expect(e.uncertain).toBe(false);
    expect(rgs.state.balance).toBe(500_000);
  });

  it('ERR_IS : session absente ou expirée', async () => {
    const a = await rgsError(client('').authenticate('en'));
    expect([a.code, a.status]).toEqual(['ERR_IS', 400]);
    const b = await rgsError(client('expired').play(1_000_000, 'BASE'));
    expect([b.code, b.status, b.uncertain]).toEqual(['ERR_IS', 401, false]);
  });

  it('5xx : incertain sur un pari seulement', async () => {
    rgs.next({ error: 'ERR_GEN', status: 500 });
    const p = await rgsError(client().play(1_000_000, 'BASE'));
    expect([p.code, p.status, p.uncertain]).toEqual(['ERR_GEN', 500, true]);
    rgs.next({ error: 'ERR_MAINTENANCE', status: 503, on: '/wallet/balance' });
    const b = await rgsError(client().balance());
    expect([b.code, b.status, b.uncertain]).toEqual(['ERR_MAINTENANCE', 503, false]);
  });

  it('réponse illisible : 502 HTML -> ERR_GEN incertain ; 200 illisible -> BAD_RESPONSE incertain', async () => {
    rgs.next({ raw: '<html>Bad Gateway</html>', status: 502 });
    const a = await rgsError(client().play(1_000_000, 'BASE'));
    expect([a.code, a.uncertain]).toEqual(['ERR_GEN', true]);
    rgs.next({ raw: 'ok', status: 200 });
    const b = await rgsError(client().play(1_000_000, 'BASE'));
    expect([b.code, b.uncertain]).toEqual(['BAD_RESPONSE', true]);
    rgs.next({ raw: 'nope', status: 401, on: '/wallet/authenticate' });
    const c = await rgsError(client().authenticate('en'));
    expect([c.code, c.uncertain]).toEqual(['ERR_ATE', false]);
  });

  it('délai dépassé : TIMEOUT incertain sur un pari, certain ailleurs', async () => {
    rgs.next({ timeout: true });
    const p = await rgsError(client('s', { play: 150 }).play(1_000_000, 'BASE'));
    expect([p.code, p.uncertain]).toEqual(['TIMEOUT', true]);
    expect(rgs.state.balance).toBe(mod.DEFAULT_BALANCE); // pari jamais traité
    rgs.next({ timeout: true, on: '/wallet/authenticate' });
    const a = await rgsError(client('s', { authenticate: 150 }).authenticate('en'));
    expect([a.code, a.uncertain]).toEqual(['TIMEOUT', false]);
  });

  it('délai dépassé après traitement : le pari a bien eu lieu (réconciliation nécessaire)', async () => {
    rgs.next({ timeout: 'after', fixture: 'F10' });
    const p = await rgsError(client('s', { play: 150 }).play(1_000_000, 'BASE'));
    expect([p.code, p.uncertain]).toEqual(['TIMEOUT', true]);
    const a = await client().authenticate('en');
    expect(a.balance.amount).toBe(mod.DEFAULT_BALANCE - 1_000_000);
    expect(a.round).toMatchObject({ active: true, payoutMultiplier: 1350 });
  });

  it('réseau coupé : NETWORK (incertain sur un pari)', async () => {
    const failing = (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch;
    const c = new RgsClient(rgs.url, 's', failing);
    expect((await rgsError(c.play(1_000_000, 'BASE'))).uncertain).toBe(true);
    const e = await rgsError(c.balance());
    expect([e.code, e.uncertain]).toEqual(['NETWORK', false]);
  });

  it('code inconnu -> ERR_GEN ; pari réussi sans round -> BAD_RESPONSE incertain', async () => {
    rgs.next({ error: 'ERR_WHATEVER', on: '/wallet/balance' });
    expect((await rgsError(client().balance())).code).toBe('ERR_GEN');
    const fake = (async () => new Response(JSON.stringify({ balance: { amount: 1, currency: 'EUR' } }), { status: 200 })) as typeof fetch;
    const e = await rgsError(new RgsClient('http://x', 's', fake).play(1_000_000, 'BASE'));
    expect([e.code, e.uncertain]).toEqual(['BAD_RESPONSE', true]);
  });
});

describe('montants (base 1e6) et arrondis', () => {
  it('mise envoyée entière ; mise nulle ou invalide refusée sans requête', async () => {
    const c = client();
    rgs.next({ fixture: 'F01' });
    await c.play(1_000_000.4, 'BASE');
    expect(rgs.calls('/wallet/play')[0]!.body).toEqual({ amount: 1_000_000, mode: 'BASE' });
    expect((await rgsError(c.play(0, 'BASE'))).code).toBe('ERR_VAL');
    expect((await rgsError(c.play(Number.NaN, 'BASE'))).code).toBe('ERR_VAL');
    expect(rgs.calls('/wallet/play')).toHaveLength(1);
  });

  it('montants reçus en chaîne ou décimaux : entiers', () => {
    const r = normalizeRound({ betID: 42, amount: '1000000.6', payoutMultiplier: '1350', costMultiplier: '25', active: 'true', event: '7', state: { events: [{ index: 0 }] } });
    expect(r).toEqual({ id: '42', mode: 'BASE', amount: 1_000_001, payoutMultiplier: 1350, costMultiplier: 25, active: true, events: [{ index: 0 }], lastEvent: 7 });
    // sans « active » : un gain attend son end-round, une perte est close
    expect(normalizeRound({ betId: 'a', payoutMultiplier: 0, events: [] })!.active).toBe(false);
    expect(normalizeRound({ id: 'b', payoutMultiplier: 50, events: [] })!.active).toBe(true);
    expect(normalizeRound({ roundID: 'c', active: false, event: null })).toMatchObject({ id: 'c', active: false });
    expect(normalizeRound({ roundID: 'c', active: false, event: null })!.lastEvent).toBeUndefined();
    expect(normalizeRound(null)).toBeNull();
  });

  it('niveaux de mise triés, filtrés par min / max, défaut recalé au palier le plus proche', () => {
    const c = normalizeConfig({ betLevels: ['2000000', 100000, 1000000, 1000000, 0, 50000000], minBet: 100000, maxBet: 20000000, defaultBetLevel: 1_200_000 });
    expect(c.betLevels).toEqual([100_000, 1_000_000, 2_000_000]);
    expect(c.defaultBetLevel).toBe(1_000_000);
    expect(normalizeConfig({ betLevels: [300000, 100000] }).defaultBetLevel).toBe(100_000);
    expect(normalizeConfig({ defaultBetLevel: 1_000_000 }).betLevels).toEqual([1_000_000]);
    expect(normalizeConfig(undefined).jurisdiction).toEqual({});
  });

  it('gain crédité par le serveur = conversion du front (bookToMoney), sous-centimes compris', async () => {
    for (const [bet, pm] of [[100_000, 5], [100_000, 50], [200_000, 1350], [600_000, 5], [1_000_000, 2_500_000], [100_000_000, 272_040]] as const) {
      expect(mod.payoutOf(bet, pm)).toBe(bookToMoney(pm, bet));
    }
    const c = client();
    rgs.next({ fixture: 'F27' }); // ×0,05
    await c.play(600_000, 'BASE');
    const b = await c.endRound();
    expect(b.amount).toBe(mod.DEFAULT_BALANCE - 600_000 + bookToMoney(5, 600_000));
    expect(b.amount).toBe(mod.DEFAULT_BALANCE - 600_000 + 30_000);
  });
});

describe('devises sociales', () => {
  it.each([
    ['XGC', 'GC'],
    ['XSC', 'SC'],
  ])('%s : devise transmise telle quelle, affichée %s', async (cur, label) => {
    rgs.reset({ currency: cur, social: true });
    const a = await client().authenticate('en');
    expect(a.balance.currency).toBe(cur);
    expect(a.config.jurisdiction.socialCasino).toBe(true);
    setMoneyFormat({ currency: cur, locale: 'en-US' });
    expect(formatMoney(a.balance.amount)).toBe(`1,000.00 ${label}`);
    setMoneyFormat({ currency: 'EUR', locale: 'fr-FR' });
  });
});

describe('fetchReplay', () => {
  it('GET {rgs_url}/bet/replay/{game}/{version}/{mode}/{event}, sans session', async () => {
    const seen: Array<{ url: string; method?: string; body?: unknown }> = [];
    const spy = ((u: string, init?: RequestInit) => {
      seen.push({ url: u, method: init?.method, body: init?.body });
      return fetch(u, init);
    }) as typeof fetch;
    const r = await fetchReplay(rgs.url, 'boomtooth', '1.0.0', 'BASE', 'F10', spy);
    expect(seen).toEqual([{ url: `${rgs.url}/bet/replay/boomtooth/1.0.0/BASE/F10`, method: 'GET', body: undefined }]);
    expect(r.payoutMultiplier).toBe(1350);
    expect(r.costMultiplier).toBe(1);
    expect(r.events).toHaveLength(fixture('F10').book.events.length);
    expect(rgs.calls('/wallet')).toHaveLength(0);
  });

  it('segments encodés ; erreur serveur -> RgsError certaine', async () => {
    expect(replayUrl('https://rgs.example', 'my game', '1/2', 'BASE', '12 3')).toBe('https://rgs.example/bet/replay/my%20game/1%2F2/BASE/12%203');
    const e = await rgsError(fetchReplay(rgs.url, 'g', 'v', 'NOPE', 'x'));
    expect([e.code, e.status, e.uncertain]).toEqual(['ERR_VAL', 404, false]);
  });

  it('délai dépassé et réponse illisible', async () => {
    const hang = ((_u: string, init?: RequestInit) =>
      new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))) as typeof fetch;
    const t = await rgsError(fetchReplay('http://x', 'g', 'v', 'BASE', '1', { fetch: hang, timeouts: { replay: 50 } }));
    expect([t.code, t.uncertain]).toEqual(['TIMEOUT', false]);
    const bad = (async () => new Response('<html>', { status: 200 })) as typeof fetch;
    expect((await rgsError(fetchReplay('http://x', 'g', 'v', 'BASE', '1', bad))).code).toBe('BAD_RESPONSE');
  });
});

describe('paramètres de lancement', () => {
  it('rgs_url normalisée : https par défaut, http pour la boucle locale, schémas exotiques refusés', () => {
    expect(normalizeRgsUrl('rgs.stake-engine.com/')).toBe('https://rgs.stake-engine.com');
    expect(normalizeRgsUrl('127.0.0.1:5310')).toBe('http://127.0.0.1:5310');
    expect(normalizeRgsUrl('localhost:5310/rgs/')).toBe('http://localhost:5310/rgs');
    expect(normalizeRgsUrl('http://127.0.0.1:5310')).toBe('http://127.0.0.1:5310');
    expect(normalizeRgsUrl('https://127.0.0.1:5310')).toBe('https://127.0.0.1:5310');
    expect(normalizeRgsUrl('127.0.0.1.evil.com')).toBe('https://127.0.0.1.evil.com');
    expect(normalizeRgsUrl('ftp://x.y')).toBeNull();
    expect(normalizeRgsUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeRgsUrl('  ')).toBeNull();
  });

  it('session, replay et cas invalides', () => {
    expect(parseLaunchParams('?sessionID=abc&rgs_url=127.0.0.1:5310&lang=fr-FR&currency=EUR').mode).toEqual({ kind: 'stake', sessionID: 'abc', rgsUrl: 'http://127.0.0.1:5310' });
    expect(parseLaunchParams('?sessionID=abc&rgs_url=127.0.0.1:5310&lang=fr-FR').lang).toBe('fr');
    expect(parseLaunchParams('?replay=true&game=g&version=1&mode=BASE&event=9&rgs_url=127.0.0.1:5310&amount=200000&currency=XGC').mode).toEqual({
      kind: 'replay', rgsUrl: 'http://127.0.0.1:5310', game: 'g', version: '1', mode: 'BASE', event: '9', currency: 'XGC', amount: 200_000,
    });
    expect(parseLaunchParams('?replay=true&game=g&version=1&mode=BASE&rgs_url=x.y').mode.kind).toBe('invalid');
    expect(parseLaunchParams('?sessionID=abc').mode.kind).toBe('invalid');
    expect(parseLaunchParams('?rgs_url=x.y').mode.kind).toBe('invalid');
    expect(parseLaunchParams('?sessionID=abc&rgs_url=ftp://x').mode.kind).toBe('invalid');
    expect(parseLaunchParams('').mode.kind).toBe('local');
    expect(parseLaunchParams('?sessionID=a&rgs_url=x.y&social=true').social).toBe(true);
  });
});
