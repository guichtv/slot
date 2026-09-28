import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StakeProvider } from '../src/provider/StakeProvider';
import { ReplayProvider } from '../src/provider/ReplayProvider';
import { RgsClient, RgsError } from '../src/stake/rgs';
import { ContractError } from '../src/contract/schema';
import FIXTURES from '../public/fixtures/fixtures.json';

/**
 * Fournisseurs Stake et Replay contre le faux RGS (tools/mock-rgs.mjs) démarré dans le test.
 * Le front ne calcule rien : solde = serveur ; end-round une fois, seulement si la manche est ouverte.
 */
interface LogEntry {
  method: string;
  path: string;
  body: Record<string, unknown>;
  status: number | null;
  code?: string;
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
  DEFAULT_BALANCE: number;
}
const MOCK_PATH = '../tools/mock-rgs.mjs';
const book = (id: string) => (FIXTURES.fixtures as Array<{ id: string; book: { payoutMultiplier: number; events: Array<{ index: number; type: string }> } }>).find((f) => f.id === id)!.book;

let mod: MockModule;
let rgs: MockRgs;
const START = () => mod.DEFAULT_BALANCE;
const provider = (session = 'test-session') => new StakeProvider(rgs.url, session);
const paths = () => rgs.log.map((e) => e.path);

beforeAll(async () => {
  mod = (await import(/* @vite-ignore */ MOCK_PATH)) as MockModule;
  rgs = await mod.createMockRgs().listen([5340, 5399]);
});
afterAll(() => rgs.close());
beforeEach(() => rgs.reset({}));

describe('StakeProvider.authenticate', () => {
  it('SessionInfo : solde, devise, mises, défaut, juridiction, pas de reprise', async () => {
    const s = await provider().authenticate('fr');
    expect(s).toMatchObject({ balance: START(), currency: 'EUR', defaultBet: 1_000_000, resume: null });
    expect(s.betLevels).toContain(1_000_000);
    expect(s.jurisdiction.disabledTurbo).toBe(false);
  });

  it('manche ouverte -> reprise à l’événement suivant le dernier enregistré, book validé', async () => {
    rgs.reset({ resume: { fixture: 'F10', event: 3 }, balance: START() - 1_000_000 });
    const s = await provider().authenticate('fr');
    expect(s.balance).toBe(START() - 1_000_000);
    expect(s.resume).not.toBeNull();
    const r = s.resume!;
    expect(r).toMatchObject({ mode: 'BASE', bet: 1_000_000, startAt: 4, active: true });
    expect(r.id).toBe(rgs.state.active!.id);
    expect(r.book.payoutMultiplier).toBe(1350);
    expect(r.book.events.map((e) => e.type)).toEqual(book('F10').events.map((e) => e.type));
    expect(paths()).toEqual(['/wallet/authenticate']);
  });

  it('manche ouverte sans progression enregistrée -> reprise au début', async () => {
    rgs.reset({ resume: { fixture: 'F16', event: -1 } });
    const r = (await provider().authenticate('en')).resume!;
    expect(r).toMatchObject({ mode: 'BONUS', startAt: 0, active: true });
    expect(r.book.costMultiplier).toBe(100);
  });
});

describe('StakeProvider.play / endRound', () => {
  it('perte : débit, manche inactive, pas d’end-round (le solde est relu)', async () => {
    const p = provider();
    await p.authenticate('fr');
    rgs.next({ fixture: 'F01' });
    const { balance, round } = await p.play(1_000_000, 'BASE');
    expect(balance).toBe(START() - 1_000_000);
    expect(round).toMatchObject({ mode: 'BASE', bet: 1_000_000, startAt: 0, active: false });
    expect(round.book.events[0]!.type).toBe('reveal');
    expect(await p.endRound(round)).toBe(START() - 1_000_000);
    expect(paths()).toEqual(['/wallet/authenticate', '/wallet/play', '/wallet/balance']);
  });

  it('gain : manche active, end-round une seule fois, solde serveur crédité', async () => {
    const p = provider();
    rgs.next({ fixture: 'F10' });
    const { balance, round } = await p.play(1_000_000, 'BASE');
    expect(balance).toBe(START() - 1_000_000);
    expect(round.active).toBe(true);
    expect(round.book.payoutMultiplier).toBe(1350);
    expect(await p.endRound(round)).toBe(START() - 1_000_000 + 13_500_000);
    // seconde clôture de la même manche : aucun second end-round
    expect(await p.endRound(round)).toBe(START() - 1_000_000 + 13_500_000);
    expect(rgs.calls('/wallet/end-round')).toHaveLength(1);
    expect(paths().at(-1)).toBe('/wallet/balance');
  });

  it('ERR_NR (manche déjà close côté serveur) : relit le solde sans erreur', async () => {
    const p = provider();
    rgs.next({ fixture: 'F10' });
    const { round } = await p.play(1_000_000, 'BASE');
    await new RgsClient(rgs.url, 'other-tab').endRound(); // close ailleurs
    expect(await p.endRound(round)).toBe(START() - 1_000_000 + 13_500_000);
    const ends = rgs.calls('/wallet/end-round');
    expect(ends.map((e) => [e.status, e.code])).toEqual([[200, undefined], [400, 'ERR_NR']]);
    expect(paths().at(-1)).toBe('/wallet/balance');
  });

  it('end-round en échec (5xx) : erreur remontée, nouvel essai possible', async () => {
    const p = provider();
    rgs.next({ fixture: 'F02' });
    const { round } = await p.play(1_000_000, 'BASE');
    rgs.next({ error: 'ERR_GEN', status: 500, on: '/wallet/end-round' });
    const e = await p.endRound(round).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(RgsError);
    expect((e as RgsError).uncertain).toBe(false);
    expect(await p.endRound(round)).toBe(START() - 1_000_000 + 500_000);
    expect(rgs.calls('/wallet/end-round').map((x) => x.status)).toEqual([500, 200]);
  });

  it('mise arrondie à l’entier, mode transmis tel quel', async () => {
    const p = provider();
    rgs.next({ fixture: 'F18' });
    const { round, balance } = await p.play(999_999.6, 'BLAST');
    expect(rgs.calls('/wallet/play')[0]!.body).toEqual({ amount: 1_000_000, mode: 'BLAST' });
    expect(round).toMatchObject({ mode: 'BLAST', bet: 1_000_000 });
    expect(balance).toBe(START() - 25_000_000);
  });

  it('ERR_IPB : erreur certaine, aucun débit', async () => {
    rgs.reset({ balance: 100_000 });
    const e = await provider().play(1_000_000, 'BASE').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(RgsError);
    expect([(e as RgsError).code, (e as RgsError).uncertain]).toEqual(['ERR_IPB', false]);
    expect(rgs.state.balance).toBe(100_000);
  });

  it('book invalide renvoyé par le serveur : refusé (ContractError), jamais réparé', async () => {
    const events = book('F10').events.slice(0, -1); // sans finalWin
    const fake = (async () =>
      new Response(JSON.stringify({ balance: { amount: 5, currency: 'EUR' }, round: { betID: 'x', amount: 1_000_000, payoutMultiplier: 1350, active: true, mode: 'BASE', state: events } }), { status: 200 })) as typeof fetch;
    await expect(new StakeProvider('http://x', 's', fake).play(1_000_000, 'BASE')).rejects.toBeInstanceOf(ContractError);
  });

  it('formes de transport : state.events, events, betId', async () => {
    const b = book('F02');
    for (const round of [
      { betId: 7, amount: '1000000', payoutMultiplier: 50, state: { events: b.events } },
      { id: 7, amount: 1_000_000, payoutMultiplier: 50, events: b.events, active: true },
    ]) {
      const fake = (async () => new Response(JSON.stringify({ balance: { amount: 5, currency: 'EUR' }, round }), { status: 200 })) as typeof fetch;
      const r = await new StakeProvider('http://x', 's', fake).play(1_000_000, 'BASE');
      expect(r.round).toMatchObject({ id: '7', bet: 1_000_000, active: true, startAt: 0 });
      expect(r.round.book.events).toHaveLength(b.events.length);
    }
  });
});

describe('progression (/bet/event)', () => {
  it('envois en série, index croissants, dernier index enregistré ; rien après la clôture', async () => {
    const p = provider();
    rgs.next({ fixture: 'F10' });
    const { round } = await p.play(1_000_000, 'BASE');
    for (let i = 0; i < round.book.events.length; i++) p.saveProgress(round, i);
    p.saveProgress(round, 2); // retour en arrière ignoré
    await p.progressIdle();
    const sent = rgs.calls('/bet/event').map((e) => Number(e.body.event));
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.length).toBeLessThanOrEqual(round.book.events.length);
    expect([...sent].sort((a, b) => a - b)).toEqual(sent);
    expect(new Set(sent).size).toBe(sent.length);
    expect(sent.at(-1)).toBe(round.book.events.length - 1);
    expect(rgs.state.lastEvent).toBe(round.book.events.length - 1);
    // reprise à ce stade : plus rien à présenter, seulement end-round
    const again = await provider().authenticate('fr');
    expect(again.resume!.startAt).toBe(round.book.events.length);
    await p.endRound(round);
    p.saveProgress(round, 99);
    await p.progressIdle();
    expect(rgs.calls('/bet/event')).toHaveLength(sent.length);
  });

  it('manche inactive (perte) : aucune progression envoyée', async () => {
    const p = provider();
    rgs.next({ fixture: 'F01' });
    const { round } = await p.play(1_000_000, 'BASE');
    p.saveProgress(round, 0);
    await p.progressIdle();
    expect(rgs.calls('/bet/event')).toHaveLength(0);
  });

  it('reprise : la progression repart après l’index déjà enregistré', async () => {
    rgs.reset({ resume: { fixture: 'F10', event: 5 } });
    const p = provider();
    const r = (await p.authenticate('fr')).resume!;
    p.saveProgress(r, 4); // déjà enregistré
    p.saveProgress(r, 5);
    await p.progressIdle();
    expect(rgs.calls('/bet/event')).toHaveLength(0);
    p.saveProgress(r, 6);
    await p.progressIdle();
    expect(rgs.calls('/bet/event').map((e) => e.body.event)).toEqual(['6']);
  });

  it('échec de /bet/event : non bloquant', async () => {
    const p = provider();
    rgs.next({ fixture: 'F10' });
    const { round } = await p.play(1_000_000, 'BASE');
    rgs.next({ error: 'ERR_GEN', status: 500, on: '/bet/event' });
    p.saveProgress(round, 0);
    await p.progressIdle();
    p.saveProgress(round, 1);
    await p.progressIdle();
    expect(rgs.calls('/bet/event').map((e) => [e.body.event, e.status])).toEqual([['0', 500], ['1', 200]]);
    expect(rgs.state.lastEvent).toBe(1);
  });
});

describe('réconciliation après un pari incertain', () => {
  it('délai dépassé mais pari accepté : la manche ouverte est rendue en reprise (sans nouveau débit), même langue', async () => {
    const p = new StakeProvider(rgs.url, 's', { timeouts: { play: 150 } });
    await p.authenticate('de');
    rgs.next({ timeout: 'after', fixture: 'F10' });
    const e = await p.play(1_000_000, 'BASE').catch((x: unknown) => x);
    expect([(e as RgsError).code, (e as RgsError).uncertain]).toEqual(['TIMEOUT', true]);
    const s = await p.reconcile();
    expect(s.balance).toBe(START() - 1_000_000);
    expect(s.resume).toMatchObject({ startAt: 0, active: true, bet: 1_000_000 });
    expect(rgs.calls('/wallet/authenticate').map((x) => x.body.language)).toEqual(['de', 'de']);
    expect(rgs.calls('/wallet/play')).toHaveLength(1);
    expect(await p.endRound(s.resume!)).toBe(START() - 1_000_000 + 13_500_000);
  });

  it('délai dépassé avant traitement : aucune manche, solde intact', async () => {
    const p = new StakeProvider(rgs.url, 's', { timeouts: { play: 150 } });
    rgs.next({ timeout: true });
    await expect(p.play(1_000_000, 'BASE')).rejects.toMatchObject({ code: 'TIMEOUT', uncertain: true });
    const s = await p.reconcile();
    expect(s).toMatchObject({ balance: START(), resume: null });
  });
});

describe('devises sociales', () => {
  it('XGC / XSC transmises telles quelles', async () => {
    for (const cur of ['XGC', 'XSC']) {
      rgs.reset({ currency: cur, social: true });
      const s = await provider().authenticate('en');
      expect(s.currency).toBe(cur);
      expect(s.jurisdiction.socialCasino).toBe(true);
    }
  });
});

describe('ReplayProvider (Stake)', () => {
  const src = () => ({ kind: 'stake' as const, rgsUrl: rgs.url, game: 'boomtooth', version: '1.0.0', mode: 'BASE', event: 'F10', amount: 200_000, currency: 'EUR' });

  it('charge le book par /bet/replay, sans authenticate ni pari', async () => {
    const p = new ReplayProvider(src());
    const s = await p.authenticate();
    expect(s).toMatchObject({ balance: 0, currency: 'EUR', betLevels: [200_000], defaultBet: 200_000, resume: null });
    const { round, balance } = await p.play();
    expect(balance).toBe(0);
    expect(round).toMatchObject({ mode: 'BASE', bet: 200_000, startAt: 0, active: false });
    expect(round.book.payoutMultiplier).toBe(1350);
    expect(await p.endRound()).toBe(0);
    expect(paths()).toEqual(['/bet/replay/boomtooth/1.0.0/BASE/F10']);
    expect(rgs.log[0]!.method).toBe('GET');
  });

  it('mise et devise par défaut ; relecture introuvable -> erreur', async () => {
    const p = new ReplayProvider({ kind: 'stake', rgsUrl: rgs.url, game: 'g', version: '1', mode: 'SUPER', event: 'F26' });
    expect(await p.authenticate()).toMatchObject({ currency: 'USD', defaultBet: 1_000_000 });
    expect((await p.play()).round.book.payoutMultiplier).toBe(2_500_000);
    await expect(new ReplayProvider({ ...src(), mode: 'NOPE', event: 'x' }).authenticate()).rejects.toMatchObject({ code: 'ERR_VAL', status: 404 });
  });
});
