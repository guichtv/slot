// Stake Engine RGS provider. authenticate -> play -> (animate every event) -> end-round once.
// A request whose outcome is unknown (timeout / network after sending) is "uncertain": the game
// blocks and reconciles through authenticate (an active round is resumed, never re-bet).
import type { ModeId } from '../contract/events';
import { MODES } from '../contract/events';
import { DEFAULT_JURISDICTION, ProviderError, type ErrorCode, type Jurisdiction, type PlayResult, type Provider, type SessionInfo } from './types';

export interface RgsParams { sessionID: string; rgsUrl: string; lang: string }

interface RgsBalance { amount: number; currency: string }
interface RgsRound { roundID?: number; betID?: number; amount?: number; payout?: number; payoutMultiplier?: number; active?: boolean; mode?: string; event?: string | null; state?: unknown[] }
interface RgsStatus { statusCode?: string; statusMessage?: string }
interface RgsAuth { balance?: RgsBalance; config?: { betLevels?: number[]; defaultBetLevel?: number; minBet?: number; maxBet?: number; stepBet?: number; jurisdiction?: Partial<Jurisdiction>; betModes?: Record<string, { costMultiplier?: number }> }; round?: RgsRound | null; status?: RgsStatus; error?: unknown }

const TIMEOUT_MS = 15000;

export function rgsBase(rgsUrl: string): string {
  const u = rgsUrl.replace(/\/+$/, '');
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

export function normaliseMode(m: string | undefined): ModeId {
  const up = (m ?? 'BASE').toUpperCase().replace(/[\s-]+/g, '_');
  return (MODES as readonly string[]).includes(up) ? (up as ModeId) : 'BASE';
}

/** RGS round -> contract book (payoutMultiplier float -> hundredths int). Never repaired: validated later. */
export function roundToBook(r: RgsRound): unknown {
  return {
    id: r.roundID ?? r.betID ?? 0,
    mode: normaliseMode(r.mode),
    payoutMultiplier: Math.round((r.payoutMultiplier ?? 0) * 100),
    events: r.state ?? [],
  };
}

export class RgsProvider implements Provider {
  readonly kind = 'rgs' as const;
  private currency = 'USD';
  constructor(private readonly p: RgsParams, private readonly fetchFn: typeof fetch = fetch.bind(globalThis)) {}

  private async post<T extends { status?: RgsStatus; error?: unknown }>(path: string, body: Record<string, unknown>, sending = true): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await this.fetchFn(`${rgsBase(this.p.rgsUrl)}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    } catch (e) {
      clearTimeout(timer);
      const aborted = (e as Error)?.name === 'AbortError';
      // once sent, a play/end-round may have been processed: uncertain
      throw new ProviderError(aborted ? 'TIMEOUT' : 'NETWORK', String((e as Error)?.message ?? e), sending);
    }
    clearTimeout(timer);
    let json: T;
    try { json = (await res.json()) as T; } catch { throw new ProviderError(res.ok ? 'ERR_UE' : httpCode(res.status), `HTTP ${res.status}`, !res.ok && res.status >= 500); }
    const code = json.status?.statusCode;
    if (code && code !== 'SUCCESS') throw new ProviderError(code as ErrorCode, json.status?.statusMessage ?? code, code === 'ERR_UE');
    if (!res.ok) throw new ProviderError(httpCode(res.status), `HTTP ${res.status}`, res.status >= 500);
    return json;
  }

  async authenticate(): Promise<SessionInfo> {
    const r = await this.post<RgsAuth>('/wallet/authenticate', { sessionID: this.p.sessionID, language: this.p.lang }, false);
    if (!r.balance || !r.config) throw new ProviderError('SESSION', 'reponse authenticate incomplete');
    this.currency = r.balance.currency;
    const levels = (r.config.betLevels ?? []).filter((x) => Number.isFinite(x) && x > 0);
    if (!levels.length) throw new ProviderError('SESSION', 'betLevels absents');
    const def = r.config.defaultBetLevel && levels.includes(r.config.defaultBetLevel) ? r.config.defaultBetLevel : levels[Math.min(levels.length - 1, Math.floor(levels.length / 4))]!;
    const round = r.round && r.round.active ? r.round : null;
    const costs: SessionInfo['costs'] = {};
    for (const [k, v] of Object.entries(r.config.betModes ?? {})) if (v?.costMultiplier) costs[normaliseMode(k)] = v.costMultiplier;
    return {
      balanceMicros: r.balance.amount, currency: r.balance.currency, betLevels: levels, defaultBetMicros: def,
      jurisdiction: { ...DEFAULT_JURISDICTION, ...(r.config.jurisdiction ?? {}) }, costs,
      activeRound: round ? { book: roundToBook(round), roundId: round.roundID ?? round.betID ?? 0, mode: normaliseMode(round.mode), baseBetMicros: round.amount ?? def, resumeIndex: Number(round.event ?? 0) || 0 } : null,
    };
  }

  async play(mode: ModeId, baseBetMicros: number): Promise<PlayResult> {
    const r = await this.post<{ balance?: RgsBalance; round?: RgsRound; status?: RgsStatus; error?: unknown }>('/wallet/play', { sessionID: this.p.sessionID, amount: baseBetMicros, currency: this.currency, mode: mode.toLowerCase() });
    if (!r.round || !r.balance) throw new ProviderError('ERR_UE', 'reponse play incomplete', true);
    return { book: roundToBook(r.round), balanceMicros: r.balance.amount, roundId: r.round.roundID ?? r.round.betID ?? 0, active: r.round.active ?? true };
  }

  async endRound(): Promise<{ balanceMicros: number }> {
    const r = await this.post<{ balance?: RgsBalance; status?: RgsStatus }>('/wallet/end-round', { sessionID: this.p.sessionID });
    if (!r.balance) throw new ProviderError('ERR_UE', 'reponse end-round incomplete', true);
    return { balanceMicros: r.balance.amount };
  }

  async saveProgress(event: string): Promise<void> {
    try { await this.post('/bet/event', { sessionID: this.p.sessionID, event }, false); } catch { /* progress marker only: never blocks the round */ }
  }

  async balance(): Promise<number> {
    const r = await this.post<{ balance?: RgsBalance; status?: RgsStatus }>('/wallet/balance', { sessionID: this.p.sessionID }, false);
    return r.balance?.amount ?? 0;
  }
}

function httpCode(status: number): ErrorCode {
  if (status === 401 || status === 403) return 'ERR_IS';
  if (status === 503) return 'ERR_MAINTENANCE';
  return 'ERR_GE';
}

export interface ReplayParams { rgsUrl: string; game: string; version: string; mode: string; event: string; amountMicros: number; currency: string }

/** Replay: GET /bet/replay/{game}/{version}/{mode}/{event}. No wallet call, no bet. */
export async function fetchReplay(p: ReplayParams, fetchFn: typeof fetch = fetch.bind(globalThis)): Promise<{ book: unknown; costMultiplier: number }> {
  const url = `${rgsBase(p.rgsUrl)}/bet/replay/${encodeURIComponent(p.game)}/${encodeURIComponent(p.version)}/${encodeURIComponent(p.mode)}/${encodeURIComponent(p.event)}`;
  const res = await fetchFn(url, { method: 'GET' });
  if (!res.ok) throw new ProviderError(httpCode(res.status), `replay HTTP ${res.status}`);
  const j = (await res.json()) as { payoutMultiplier?: number; costMultiplier?: number; state?: unknown[]; error?: unknown };
  if (!j.state) throw new ProviderError('INVALID_BOOK', 'replay sans state');
  return { book: roundToBook({ mode: p.mode, payoutMultiplier: j.payoutMultiplier ?? 0, state: j.state, roundID: Number(p.event) || 0 }), costMultiplier: j.costMultiplier ?? 1 };
}
