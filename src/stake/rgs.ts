/**
 * Client RGS Stake Engine (transport HTTP uniquement, aucune logique de jeu).
 * Endpoints : /wallet/authenticate, /wallet/play, /wallet/end-round, /wallet/balance,
 *             /bet/event, /bet/replay/{game}/{version}/{mode}/{event}.
 * Montants : entiers, base 1e6 (1 000 000 = 1 unité de devise), arrondis à l'entier à la lecture.
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

/** Opérations du client et délais par défaut (ms). */
export type RgsOp = 'authenticate' | 'play' | 'endRound' | 'balance' | 'event' | 'replay';
export const RGS_TIMEOUTS: Readonly<Record<RgsOp, number>> = {
  authenticate: 12_000,
  play: 20_000,
  endRound: 15_000,
  balance: 10_000,
  event: 8_000,
  replay: 15_000,
};

export interface RgsClientOptions {
  fetch?: typeof fetch;
  /** délais par opération (tests, réseau lent) */
  timeouts?: Partial<Record<RgsOp, number>>;
}

const KNOWN = new Set<RgsErrorCode>(['ERR_IS', 'ERR_IB', 'ERR_IPB', 'ERR_BR', 'ERR_OR', 'ERR_NR', 'ERR_TF', 'ERR_VAL', 'ERR_ATE', 'ERR_GLE', 'ERR_LOC', 'ERR_GEN', 'ERR_MAINTENANCE']);

function num(v: unknown, def = 0): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : def;
}

/** montant monétaire (base 1e6) : toujours un entier */
function money(v: unknown, def = 0): number {
  return Math.round(num(v, def));
}

function bool(v: unknown): boolean {
  return v === true || v === 'true' || v === 1;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function parseBalance(raw: unknown, betLike: boolean): RgsBalance {
  // solde absent ou illisible : réponse inexploitable
  if (!isObj(raw) || !Number.isFinite(num(raw.amount, NaN))) throw new RgsError('BAD_RESPONSE', 200, betLike, 'balance manquant');
  return { amount: money(raw.amount), currency: String(raw.currency ?? 'USD') };
}

function eventsOf(src: Record<string, unknown>): unknown[] {
  const state = src.state as unknown;
  if (Array.isArray(state)) return state;
  if (isObj(state) && Array.isArray(state.events)) return state.events as unknown[];
  if (Array.isArray(src.events)) return src.events as unknown[];
  return [];
}

export function normalizeRound(raw: unknown): RgsRound | null {
  if (!isObj(raw)) return null;
  const r = raw;
  const id = r.betID ?? r.betId ?? r.id ?? r.roundID;
  const payoutMultiplier = num(r.payoutMultiplier);
  const costMultiplier = num(r.costMultiplier, 0);
  return {
    id: String(id ?? ''),
    mode: String(r.mode ?? 'BASE'),
    amount: money(r.amount),
    payoutMultiplier,
    ...(costMultiplier > 0 ? { costMultiplier } : {}),
    // manche ouverte côté serveur ; sans indication, une manche gagnante attend son end-round, une perte est close
    active: r.active === undefined || r.active === null ? payoutMultiplier > 0 : bool(r.active),
    events: eventsOf(r),
    ...(r.event !== undefined && r.event !== null && r.event !== '' ? { lastEvent: num(r.event, -1) } : {}),
  };
}

export function normalizeConfig(raw: Record<string, unknown> | undefined): RgsConfig {
  const c = raw ?? {};
  const levels = [...new Set((Array.isArray(c.betLevels) ? (c.betLevels as unknown[]) : []).map((v) => money(v)).filter((v) => v > 0))].sort((a, b) => a - b);
  const minBet = money(c.minBet, levels[0] ?? 0);
  const maxBet = money(c.maxBet, levels[levels.length - 1] ?? 0);
  let filtered = levels.filter((l) => (!minBet || l >= minBet) && (!maxBet || l <= maxBet));
  let def = money(c.defaultBetLevel, filtered[0] ?? minBet);
  if (!filtered.length && def > 0) filtered = [def];
  if (filtered.length && !filtered.includes(def)) {
    // defaultBetLevel ajusté au palier autorisé le plus proche
    def = filtered.reduce((best, l) => (Math.abs(l - def) < Math.abs(best - def) ? l : best), filtered[0] as number);
  }
  return {
    minBet,
    maxBet,
    stepBet: money(c.stepBet, 0),
    defaultBetLevel: def,
    betLevels: filtered,
    jurisdiction: isObj(c.jurisdiction) ? (c.jurisdiction as RgsJurisdiction) : {},
  };
}

/** Code d'une réponse HTTP en échec sans corps lisible. */
function statusCode(status: number): RgsErrorCode {
  if (status === 401 || status === 403) return 'ERR_ATE';
  return 'ERR_GEN';
}

interface Http {
  fetch: typeof fetch;
  timeout: number;
  betLike: boolean;
}

/**
 * Une requête : délai couvrant l'en-tête ET le corps ; erreurs traduites en RgsError.
 * Sur un pari (betLike), toute issue inconnue (délai, réseau, 5xx, réponse illisible) est « incertaine ».
 */
async function request(url: string, init: RequestInit, h: Http): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, h.timeout);
  try {
    let res: Response;
    try {
      res = await h.fetch(url, { ...init, signal: ctrl.signal });
    } catch {
      throw new RgsError(timedOut ? 'TIMEOUT' : 'NETWORK', 0, h.betLike);
    }
    let text: string;
    try {
      text = await res.text();
    } catch {
      throw new RgsError(timedOut ? 'TIMEOUT' : 'NETWORK', res.status, h.betLike);
    }
    let data: unknown;
    try {
      data = text.trim() ? JSON.parse(text) : {};
    } catch {
      data = undefined;
    }
    if (!isObj(data)) {
      if (!res.ok) throw new RgsError(statusCode(res.status), res.status, h.betLike && res.status >= 500);
      throw new RgsError('BAD_RESPONSE', res.status, h.betLike);
    }
    const errField = typeof data.code === 'string' && data.code ? data.code : typeof data.error === 'string' && data.error ? data.error : null;
    if (!res.ok || errField) {
      const raw = errField ?? statusCode(res.status);
      const code = (KNOWN.has(raw as RgsErrorCode) ? raw : 'ERR_GEN') as RgsErrorCode;
      // une erreur 5xx (ou générique) sur un pari laisse l'issue incertaine
      throw new RgsError(code, res.status, h.betLike && (res.status >= 500 || code === 'ERR_TF' || code === 'ERR_GEN'), String(data.message ?? raw));
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function resolveOptions(o: RgsClientOptions | typeof fetch | undefined): { fetch: typeof fetch; timeouts: Record<RgsOp, number> } {
  const opts: RgsClientOptions = typeof o === 'function' ? { fetch: o } : o ?? {};
  return {
    fetch: opts.fetch ?? ((...a) => fetch(...a)),
    timeouts: { ...RGS_TIMEOUTS, ...opts.timeouts },
  };
}

export class RgsClient {
  private readonly http: { fetch: typeof fetch; timeouts: Record<RgsOp, number> };

  constructor(
    private readonly baseUrl: string,
    private readonly sessionID: string,
    options?: RgsClientOptions | typeof fetch,
  ) {
    this.http = resolveOptions(options);
  }

  private post(path: string, body: Record<string, unknown>, op: RgsOp, betLike = false): Promise<Record<string, unknown>> {
    return request(
      `${this.baseUrl}${path}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionID: this.sessionID, ...body }) },
      { fetch: this.http.fetch, timeout: this.http.timeouts[op], betLike },
    );
  }

  async authenticate(language: string): Promise<AuthResponse> {
    const d = await this.post('/wallet/authenticate', { language }, 'authenticate');
    return {
      balance: parseBalance(d.balance, false),
      config: normalizeConfig(d.config as Record<string, unknown>),
      round: normalizeRound(d.round),
    };
  }

  /** Pari : `amount` = mise de base (base 1e6, entière) ; le serveur débite amount × coût du mode. */
  async play(amount: number, mode: string): Promise<{ balance: RgsBalance; round: RgsRound }> {
    const a = Math.round(amount);
    // garde locale : rien n'est envoyé (aucun débit possible)
    if (!Number.isFinite(a) || a <= 0) throw new RgsError('ERR_VAL', 0, false, `mise invalide ${amount}`);
    const d = await this.post('/wallet/play', { amount: a, mode }, 'play', true);
    const round = normalizeRound(d.round);
    // pari peut-être accepté mais réponse inexploitable : issue incertaine (réconciliation)
    if (!round || !round.id) throw new RgsError('BAD_RESPONSE', 200, true, 'round manquant');
    return { balance: parseBalance(d.balance, true), round };
  }

  async endRound(): Promise<RgsBalance> {
    const d = await this.post('/wallet/end-round', {}, 'endRound');
    return parseBalance(d.balance, false);
  }

  async balance(): Promise<RgsBalance> {
    const d = await this.post('/wallet/balance', {}, 'balance');
    return parseBalance(d.balance, false);
  }

  /** Enregistre la progression (index d'événement) pour la reprise. Échec non bloquant : rend false. */
  async saveEvent(event: number): Promise<boolean> {
    try {
      await this.post('/bet/event', { event: String(Math.round(event)) }, 'event');
      return true;
    } catch {
      /* la reprise se fera depuis le dernier index enregistré */
      return false;
    }
  }
}

/** URL de relecture : {rgs_url}/bet/replay/{game}/{version}/{mode}/{event} */
export function replayUrl(baseUrl: string, game: string, version: string, mode: string, event: string): string {
  return `${baseUrl}/bet/replay/${encodeURIComponent(game)}/${encodeURIComponent(version)}/${encodeURIComponent(mode)}/${encodeURIComponent(event)}`;
}

export async function fetchReplay(
  baseUrl: string,
  game: string,
  version: string,
  mode: string,
  event: string,
  options?: RgsClientOptions | typeof fetch,
): Promise<{ payoutMultiplier: number; costMultiplier: number; events: unknown[] }> {
  const o = resolveOptions(options);
  const d = await request(replayUrl(baseUrl, game, version, mode, event), { method: 'GET' }, { fetch: o.fetch, timeout: o.timeouts.replay, betLike: false });
  const src = isObj(d.round) ? d.round : d;
  const cost = num(src.costMultiplier, 1);
  return { payoutMultiplier: num(src.payoutMultiplier), costMultiplier: cost > 0 ? cost : 1, events: eventsOf(src) };
}
