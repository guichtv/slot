// Local mode: plays the fixtures (public/fixtures) as a weighted playlist, keeps a local
// balance (1 000,00 EUR), and can simulate latency, errors, refusals and a resumable round
// (DEV panel). Never used on a production host without a session (see main.ts).
import type { ModeId } from '../contract/events';
import { bookToMicros, costMicros, unitsToMicros } from '../contract/money';
import type { GameConfig } from '../config/game-config';
import { DEFAULT_JURISDICTION, ProviderError, type ErrorCode, type PlayResult, type Provider, type SessionInfo } from './types';
import type { Rand } from '../core/rng';

interface PlaylistEntry { id: string; title: string; weight: number; modes: ModeId[]; tags: string[] }
interface Stored { balance: number; round: { fixture: string; mode: ModeId; bet: number; progress: number; roundId: number } | null }

export interface LocalDevOptions {
  forceNext: string | null; // fixture id for the next play
  latencyMs: number;
  failNext: ErrorCode | null; // simulated refusal / error on the next play
  failEndRound: boolean;
}

const KEY = 'cybercat.local.v1';

export class LocalProvider implements Provider {
  readonly kind = 'local' as const;
  private playlist: PlaylistEntry[] = [];
  private balanceMicros = unitsToMicros(1000);
  private pending: { fixture: string; mode: ModeId; bet: number; payout: number; roundId: number; progress: number } | null = null;
  private roundSeq = 1;
  readonly dev: LocalDevOptions = { forceNext: null, latencyMs: 0, failNext: null, failEndRound: false };
  private cache = new Map<string, unknown>();

  constructor(private readonly cfg: GameConfig, private readonly rand: Rand, private readonly baseUrl = './fixtures/', private readonly persist = true) {}

  private load(): Stored | null {
    if (!this.persist) return null;
    try { const s = sessionStorage.getItem(KEY); return s ? (JSON.parse(s) as Stored) : null; } catch { return null; }
  }
  private save(): void {
    if (!this.persist) return;
    try {
      const st: Stored = { balance: this.balanceMicros, round: this.pending ? { fixture: this.pending.fixture, mode: this.pending.mode, bet: this.pending.bet, progress: this.pending.progress, roundId: this.pending.roundId } : null };
      sessionStorage.setItem(KEY, JSON.stringify(st));
    } catch { /* private mode: in-memory only */ }
  }
  private async delay(): Promise<void> { if (this.dev.latencyMs > 0) await new Promise((r) => setTimeout(r, this.dev.latencyMs)); }

  async fixture(id: string): Promise<{ book: unknown; title: string }> {
    const c = this.cache.get(id);
    if (c) return c as { book: unknown; title: string };
    const res = await fetch(`${this.baseUrl}${id}.json`);
    if (!res.ok) throw new ProviderError('NETWORK', `fixture ${id} ${res.status}`);
    const j = (await res.json()) as { book: unknown; title: string };
    this.cache.set(id, j);
    return j;
  }
  get entries(): readonly PlaylistEntry[] { return this.playlist; }

  async authenticate(): Promise<SessionInfo> {
    const res = await fetch(`${this.baseUrl}playlist.json`, { cache: 'no-cache' });
    if (!res.ok) throw new ProviderError('NETWORK', 'playlist');
    this.playlist = ((await res.json()) as { entries: PlaylistEntry[] }).entries;
    const st = this.load();
    let active: SessionInfo['activeRound'] = null;
    if (st) {
      this.balanceMicros = st.balance;
      if (st.round) {
        const f = await this.fixture(st.round.fixture);
        const payout = bookToMicros((f.book as { payoutMultiplier: number }).payoutMultiplier, st.round.bet);
        this.pending = { ...st.round, payout, progress: st.round.progress };
        active = { book: withMode(f.book, st.round.mode), roundId: st.round.roundId, mode: st.round.mode, baseBetMicros: st.round.bet, resumeIndex: st.round.progress };
      }
    }
    return {
      balanceMicros: this.balanceMicros, currency: 'EUR',
      betLevels: this.cfg.localBetLadder.map(unitsToMicros), defaultBetMicros: unitsToMicros(this.cfg.defaultBet),
      jurisdiction: { ...DEFAULT_JURISDICTION }, activeRound: active, costs: {},
    };
  }

  private choose(mode: ModeId): string {
    const pool = this.playlist.filter((e) => e.modes.includes(mode) && e.weight > 0);
    const list = pool.length ? pool : this.playlist.filter((e) => e.modes.includes(mode));
    if (!list.length) throw new ProviderError('ERR_VAL', `aucune fixture pour ${mode}`);
    const tot = list.reduce((a, e) => a + Math.max(e.weight, 0.0001), 0);
    let x = this.rand() * tot;
    for (const e of list) { x -= Math.max(e.weight, 0.0001); if (x <= 0) return e.id; }
    return list[list.length - 1]!.id;
  }

  async play(mode: ModeId, baseBetMicros: number): Promise<PlayResult> {
    await this.delay();
    if (this.pending) throw new ProviderError('ERR_BE', 'manche deja active');
    const fail = this.dev.failNext; this.dev.failNext = null;
    if (fail === 'TIMEOUT') throw new ProviderError('TIMEOUT', 'delai depasse', false);
    if (fail) throw new ProviderError(fail);
    const cost = costMicros(baseBetMicros, this.cfg.modes[mode]?.cost ?? 1);
    if (cost > this.balanceMicros) throw new ProviderError('ERR_IPB');
    const forced = this.dev.forceNext; this.dev.forceNext = null;
    const id = forced ?? this.choose(mode);
    const f = await this.fixture(id);
    const book = withMode(f.book, mode);
    this.balanceMicros -= cost;
    const payout = bookToMicros((book as { payoutMultiplier: number }).payoutMultiplier, baseBetMicros);
    const roundId = this.roundSeq++;
    this.pending = { fixture: id, mode, bet: baseBetMicros, payout, roundId, progress: 0 };
    this.save();
    return { book, balanceMicros: this.balanceMicros, roundId, active: true };
  }

  async endRound(): Promise<{ balanceMicros: number }> {
    await this.delay();
    if (this.dev.failEndRound) { this.dev.failEndRound = false; throw new ProviderError('NETWORK', 'end-round', true); }
    if (!this.pending) throw new ProviderError('ERR_BNF');
    this.balanceMicros += this.pending.payout;
    this.pending = null;
    this.save();
    return { balanceMicros: this.balanceMicros };
  }

  async saveProgress(event: string): Promise<void> {
    if (this.pending) { this.pending.progress = Number(event) || 0; this.save(); }
  }
  async balance(): Promise<number> { return this.balanceMicros; }

  /** DEV: set the balance (10-digit amounts test) */
  setBalance(micros: number): void { this.balanceMicros = micros; this.save(); }
  /** DEV: forget any saved round */
  reset(): void { this.pending = null; this.balanceMicros = unitsToMicros(1000); try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } }
  lastFixture(): string | null { return this.pending?.fixture ?? null; }
}

/** a base-game fixture valid for BASE and ANTE is played with the requested mode label */
function withMode(book: unknown, mode: ModeId): unknown {
  const b = book as { mode: ModeId };
  return b.mode === mode ? book : { ...(book as object), mode };
}
