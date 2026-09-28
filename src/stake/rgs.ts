/**
 * Client RGS Stake Engine (transport HTTP uniquement, aucune logique de jeu).
 * Endpoints : /wallet/authenticate, /wallet/play, /wallet/end-round, /wallet/balance,
 *             /bet/event, /bet/replay/{game}/{version}/{mode}/{event}.
 * Le sessionID n'est jamais journalisé.
 */
export interface RgsBalance {
  amount: number;
  currency: string;
}

export interface RgsJurisdiction {
  socialCasino?: boolean;
  disabledFullscreen?: boolean;
  disabledTurbo?: boolean;
  disabledSuperTurbo?: boolean;
  disabledAutoplay?: boolean;
  disabledSlamstop?: boolean;
  disabledSpacebar?: boolean;
  disabledBuyFeature?: boolean;
  displayNetPosition?: boolean;
  displayRTP?: boolean;
  displaySessionTimer?: boolean;
  minimumRoundDuration?: number;
  [k: string]: unknown;
}

export interface RgsConfig {
  minBet: number;
  maxBet: number;
  stepBet: number;
  defaultBetLevel: number;
  betLevels: number[];
  jurisdiction: RgsJurisdiction;
}

export interface RgsRound {
  id: string;
  mode: string;
  amount: number;
  payoutMultiplier: number;
  costMultiplier?: number;
  active: boolean;
  events: unknown[];
  /** index du dernier événement enregistré via /bet/event (reprise) */
  lastEvent?: number;
}

export interface AuthResponse {
  balance: RgsBalance;
  config: RgsConfig;
  round: RgsRound | null;
}

export type RgsErrorCode =
  | 'ERR_IS' | 'ERR_IB' | 'ERR_IPB' | 'ERR_BR' | 'ERR_OR' | 'ERR_NR' | 'ERR_TF'
  | 'ERR_VAL' | 'ERR_ATE' | 'ERR_GLE' | 'ERR_LOC' | 'ERR_GEN' | 'ERR_MAINTENANCE'
  | 'TIMEOUT' | 'NETWORK' | 'BAD_RESPONSE';

export class RgsError extends Error {
  constructor(
    readonly code: RgsErrorCode,
    readonly status: number,
    /** vrai si l'effet côté serveur est inconnu (pari peut-être accepté) */
    readonly uncertain: boolean,
    message: string = code,
  ) {
    super(message);
    this.name = 'RgsError';
  }
}

const KNOWN = new Set<RgsErrorCode>(['ERR_IS', 'ERR_IB', 'ERR_IPB', 'ERR_BR', 'ERR_OR', 'ERR_NR', 'ERR_TF', 'ERR_VAL', 'ERR_ATE', 'ERR_GLE', 'ERR_LOC', 'ERR_GEN', 'ERR_MAINTENANCE']);

function num(v: unknown, def = 0): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : def;
}

export function normalizeRound(raw: unknown): RgsRound | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const state = r.state as unknown;
  let events: unknown[] = [];
  if (Array.isArray(state)) events = state;
  else if (state && typeof state === 'object' && Array.isArray((state as { events?: unknown[] }).events)) events = (state as { events: unknown[] }).events;
  else if (Array.isArray(r.events)) events = r.events as unknown[];
  const id = r.betID ?? r.betId ?? r.id ?? r.roundID;
  return {
    id: String(id ?? ''),
    mode: String(r.mode ?? 'BASE'),
    amount: num(r.amount),
    payoutMultiplier: num(r.payoutMultiplier),
    ...(r.costMultiplier !== undefined ? { costMultiplier: num(r.costMultiplier) } : {}),
    active: r.active === undefined ? true : Boolean(r.active),
    events,
    ...(r.event !== undefined && r.event !== null && r.event !== '' ? { lastEvent: num(r.event, -1) } : {}),
  };
}

function normalizeConfig(raw: Record<string, unknown> | undefined): RgsConfig {
  const c = raw ?? {};
  const levels = Array.isArray(c.betLevels) ? (c.betLevels as unknown[]).map((v) => num(v)).filter((v) => v > 0) : [];
  const minBet = num(c.minBet, levels[0] ?? 0);
  const maxBet = num(c.maxBet, levels[levels.length - 1] ?? 0);
  const filtered = levels.filter((l) => (!minBet || l >= minBet) && (!maxBet || l <= maxBet));
  let def = num(c.defaultBetLevel, filtered[0] ?? minBet);
  if (filtered.length && !filtered.includes(def)) {
    // defaultBetLevel ajusté au palier autorisé le plus proche
    def = filtered.reduce((best, l) => (Math.abs(l - def) < Math.abs(best - def) ? l : best), filtered[0] as number);
  }
  return {
    minBet,
    maxBet,
    stepBet: num(c.stepBet, 0),
    defaultBetLevel: def,
    betLevels: filtered,
    jurisdiction: (c.jurisdiction as RgsJurisdiction) ?? {},
  };
}

export class RgsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly sessionID: string,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  private async post(path: string, body: Record<string, unknown>, timeoutMs: number, betLike = false): Promise<Record<string, unknown>> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionID: this.sessionID, ...body }),
        signal: ctrl.signal,
      });
    } catch (e) {
      const aborted = (e as { name?: string }).name === 'AbortError';
      throw new RgsError(aborted ? 'TIMEOUT' : 'NETWORK', 0, betLike);
    } finally {
      clearTimeout(timer);
    }
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      if (!res.ok) throw new RgsError('ERR_GEN', res.status, betLike && res.status >= 500);
      throw new RgsError('BAD_RESPONSE', res.status, betLike);
    }
    if (!res.ok || typeof data.code === 'string' || typeof data.error === 'string') {
      const raw = String(data.code ?? data.error ?? 'ERR_GEN');
      const code = (KNOWN.has(raw as RgsErrorCode) ? raw : 'ERR_GEN') as RgsErrorCode;
      // une erreur 5xx sur un pari laisse l'issue incertaine
      throw new RgsError(code, res.status, betLike && (res.status >= 500 || code === 'ERR_TF' || code === 'ERR_GEN'), String(data.message ?? raw));
    }
    return data;
  }

  async authenticate(language: string): Promise<AuthResponse> {
    const d = await this.post('/wallet/authenticate', { language }, 12_000);
    const bal = d.balance as Record<string, unknown> | undefined;
    return {
      balance: { amount: num(bal?.amount), currency: String(bal?.currency ?? 'USD') },
      config: normalizeConfig(d.config as Record<string, unknown>),
      round: normalizeRound(d.round),
    };
  }

  async play(amount: number, mode: string): Promise<{ balance: RgsBalance; round: RgsRound }> {
    const d = await this.post('/wallet/play', { amount, mode }, 20_000, true);
    const bal = d.balance as Record<string, unknown> | undefined;
    const round = normalizeRound(d.round);
    if (!round) throw new RgsError('BAD_RESPONSE', 200, true);
    return { balance: { amount: num(bal?.amount), currency: String(bal?.currency ?? 'USD') }, round };
  }

  async endRound(): Promise<RgsBalance> {
    const d = await this.post('/wallet/end-round', {}, 15_000);
    const bal = d.balance as Record<string, unknown> | undefined;
    return { amount: num(bal?.amount), currency: String(bal?.currency ?? 'USD') };
  }

  async balance(): Promise<RgsBalance> {
    const d = await this.post('/wallet/balance', {}, 10_000);
    const bal = d.balance as Record<string, unknown> | undefined;
    return { amount: num(bal?.amount), currency: String(bal?.currency ?? 'USD') };
  }

  /** Enregistre la progression (index d'événement) pour la reprise. Échec non bloquant. */
  async saveEvent(event: number): Promise<void> {
    try {
      await this.post('/bet/event', { event: String(event) }, 8_000);
    } catch {
      /* la reprise se fera depuis le début de la manche */
    }
  }
}

export async function fetchReplay(
  baseUrl: string,
  game: string,
  version: string,
  mode: string,
  event: string,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): Promise<{ payoutMultiplier: number; costMultiplier: number; events: unknown[] }> {
  const url = `${baseUrl}/bet/replay/${encodeURIComponent(game)}/${encodeURIComponent(version)}/${encodeURIComponent(mode)}/${encodeURIComponent(event)}`;
  let res: Response;
  try {
    res = await fetchImpl(url, { method: 'GET' });
  } catch {
    throw new RgsError('NETWORK', 0, false);
  }
  if (!res.ok) throw new RgsError('ERR_GEN', res.status, false);
  const d = (await res.json()) as Record<string, unknown>;
  const state = d.state as unknown;
  const events = Array.isArray(state) ? state : Array.isArray((state as { events?: unknown[] })?.events) ? (state as { events: unknown[] }).events : Array.isArray(d.events) ? (d.events as unknown[]) : [];
  return { payoutMultiplier: num(d.payoutMultiplier), costMultiplier: num(d.costMultiplier, 1), events };
}
