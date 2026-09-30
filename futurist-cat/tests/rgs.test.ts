import { describe, it, expect } from 'vitest';
import { RgsProvider, roundToBook, rgsBase, fetchReplay } from '../src/provider/rgs';
import { ProviderError } from '../src/provider/types';

type Handler = (path: string, body: Record<string, unknown>) => { status?: number; json: unknown } | 'network' | 'abort';
function fakeFetch(h: Handler): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    const r = h(u.pathname, init?.body ? JSON.parse(String(init.body)) : {});
    if (r === 'network') throw new TypeError('Failed to fetch');
    if (r === 'abort') { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
}
const AUTH = { balance: { amount: 100_000_000, currency: 'EUR' }, config: { betLevels: [100_000, 1_000_000, 2_000_000], defaultBetLevel: 1_000_000, jurisdiction: { disabledTurbo: true, socialCasino: false }, betModes: { bonus: { costMultiplier: 100 } } }, round: null, status: { statusCode: 'SUCCESS' } };

describe('rgs provider', () => {
  it('https by default, keeps an explicit scheme', () => {
    expect(rgsBase('rgs.example.com')).toBe('https://rgs.example.com');
    expect(rgsBase('http://127.0.0.1:5345/')).toBe('http://127.0.0.1:5345');
  });
  it('authenticate: bet levels, jurisdiction, costs, no active round', async () => {
    const p = new RgsProvider({ sessionID: 's', rgsUrl: 'rgs.test', lang: 'fr' }, fakeFetch((path, body) => { expect(path).toBe('/wallet/authenticate'); expect(body).toEqual({ sessionID: 's', language: 'fr' }); return { json: AUTH }; }));
    const s = await p.authenticate();
    expect(s.betLevels).toEqual([100_000, 1_000_000, 2_000_000]);
    expect(s.defaultBetMicros).toBe(1_000_000);
    expect(s.jurisdiction.disabledTurbo).toBe(true);
    expect(s.costs.BONUS).toBe(100);
    expect(s.activeRound).toBe(null);
  });
  it('authenticate: active round is returned for resume (event = progress)', async () => {
    const p = new RgsProvider({ sessionID: 's', rgsUrl: 'r', lang: 'en' }, fakeFetch(() => ({ json: { ...AUTH, round: { roundID: 7, amount: 1_000_000, payoutMultiplier: 12.5, active: true, mode: 'bonus', event: '14', state: [{ index: 0, type: 'reveal' }] } } })));
    const s = await p.authenticate();
    expect(s.activeRound?.resumeIndex).toBe(14);
    expect(s.activeRound?.mode).toBe('BONUS');
    expect((s.activeRound?.book as { payoutMultiplier: number }).payoutMultiplier).toBe(1250);
  });
  it('play sends the BASE bet and the mode (the RGS applies the cost multiplier once)', async () => {
    const p = new RgsProvider({ sessionID: 's', rgsUrl: 'r', lang: 'en' }, fakeFetch((path, body) => {
      if (path === '/wallet/authenticate') return { json: AUTH };
      expect(body.amount).toBe(1_000_000); expect(body.mode).toBe('bonus');
      return { json: { balance: { amount: 0, currency: 'EUR' }, round: { roundID: 9, payoutMultiplier: 0, active: false, mode: 'bonus', state: [] }, status: { statusCode: 'SUCCESS' } } };
    }));
    await p.authenticate();
    const r = await p.play('BONUS', 1_000_000);
    expect(r.active).toBe(false);
    expect(r.roundId).toBe(9);
  });
  it('status codes become ProviderError; a timeout after sending is uncertain', async () => {
    const ipb = new RgsProvider({ sessionID: 's', rgsUrl: 'r', lang: 'en' }, fakeFetch(() => ({ json: { status: { statusCode: 'ERR_IPB' } } })));
    await expect(ipb.play('BASE', 1)).rejects.toMatchObject({ code: 'ERR_IPB', uncertain: false });
    const to = new RgsProvider({ sessionID: 's', rgsUrl: 'r', lang: 'en' }, fakeFetch(() => 'abort'));
    await expect(to.play('BASE', 1)).rejects.toMatchObject({ code: 'TIMEOUT', uncertain: true });
    const net = new RgsProvider({ sessionID: 's', rgsUrl: 'r', lang: 'en' }, fakeFetch(() => 'network'));
    await expect(net.authenticate()).rejects.toMatchObject({ code: 'NETWORK', uncertain: false });
    await expect(net.endRound()).rejects.toBeInstanceOf(ProviderError);
  });
  it('incomplete authenticate = session error (never a silent local fallback)', async () => {
    const p = new RgsProvider({ sessionID: 's', rgsUrl: 'r', lang: 'en' }, fakeFetch(() => ({ json: { status: { statusCode: 'SUCCESS' } } })));
    await expect(p.authenticate()).rejects.toMatchObject({ code: 'SESSION' });
  });
  it('round -> book: float multiplier to hundredths', () => {
    expect(roundToBook({ roundID: 3, mode: 'base', payoutMultiplier: 0.05, state: [] })).toEqual({ id: 3, mode: 'BASE', payoutMultiplier: 5, events: [] });
  });
  it('replay: GET without wallet call', async () => {
    const calls: string[] = [];
    const f = fakeFetch((path) => { calls.push(path); return { json: { payoutMultiplier: 1.6, costMultiplier: 1, state: [] } }; });
    const r = await fetchReplay({ rgsUrl: 'r', game: 'g', version: '1', mode: 'base', event: '42', amountMicros: 1e6, currency: 'EUR' }, f);
    expect(calls).toEqual(['/bet/replay/g/1/base/42']);
    expect((r.book as { payoutMultiplier: number }).payoutMultiplier).toBe(160);
  });
});
