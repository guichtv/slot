import { parseBook } from '../contract/schema';
import { bookToMoney, MONEY_BASE } from '../core/money';
import { RgsError, type RgsErrorCode } from '../stake/rgs';
import type { PlayResult, PlayedRound, RoundProvider, SessionInfo } from './types';

/**
 * Mode local : les manches viennent de fixtures (books écrits à l'avance, montants illustratifs),
 * jouées par une playlist pondérée qui ne tourne pas en rond (sac pondéré sans remise).
 * Le solde local imite le serveur : débit à play(), crédit à endRound().
 */
export interface Fixture {
  id: string;
  mode: string;
  weight: number;
  tags: string[];
  book: unknown;
}

export interface DemoOptions {
  startBalance?: number;
  betLevels?: number[];
  defaultBet?: number;
  modeCost: (mode: string) => number;
  seed?: number;
}

export class DemoProvider implements RoundProvider {
  readonly kind = 'local' as const;
  balance: number;
  private bags = new Map<string, string[]>();
  private rng: number;
  private forced: string[] = [];
  private counter = 0;
  /** simulations DEV */
  latencyMs = 180;
  failNext: RgsErrorCode | null = null;
  uncertainNext = false;

  constructor(
    private readonly fixtures: Fixture[],
    private readonly opts: DemoOptions,
  ) {
    this.balance = opts.startBalance ?? 1000 * MONEY_BASE;
    this.rng = (opts.seed ?? 20260928) >>> 0 || 1;
  }

  private rand(): number {
    this.rng ^= this.rng << 13;
    this.rng ^= this.rng >>> 17;
    this.rng ^= this.rng << 5;
    return ((this.rng >>> 0) % 1_000_003) / 1_000_003;
  }

  /** attente simulée du réseau ; branchée sur l'horloge de présentation en local (captures reproductibles) */
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms));

  private delay(ms = this.latencyMs): Promise<void> {
    return this.wait(ms);
  }

  forceNext(id: string): void {
    this.forced.push(id);
  }

  fixtureById(id: string): Fixture | undefined {
    return this.fixtures.find((f) => f.id === id);
  }

  list(): Fixture[] {
    return this.fixtures;
  }

  private pick(mode: string): Fixture {
    const f = this.forced.shift();
    if (f) {
      const fx = this.fixtures.find((x) => x.id === f);
      if (fx) return fx;
    }
    let bag = this.bags.get(mode);
    if (!bag || bag.length === 0) {
      // sac pondéré : chaque fixture apparaît "weight" fois, ordre mélangé
      const pool = this.fixtures.filter((x) => x.mode === mode && x.weight > 0);
      if (!pool.length) throw new Error(`aucune fixture pour le mode ${mode}`);
      bag = pool.flatMap((x) => Array.from({ length: x.weight }, () => x.id));
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1));
        [bag[i], bag[j]] = [bag[j] as string, bag[i] as string];
      }
      this.bags.set(mode, bag);
    }
    const id = bag.pop() as string;
    return this.fixtures.find((x) => x.id === id) as Fixture;
  }

  async authenticate(): Promise<SessionInfo> {
    await this.delay(120);
    const levels = this.opts.betLevels ?? [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 30, 40, 50, 75, 100].map((u) => Math.round(u * MONEY_BASE));
    return {
      balance: this.balance,
      currency: 'EUR',
      betLevels: levels,
      defaultBet: this.opts.defaultBet ?? MONEY_BASE,
      jurisdiction: {},
      resume: null,
    };
  }

  async play(bet: number, mode: string): Promise<PlayResult> {
    const cost = Math.round(bet * this.opts.modeCost(mode));
    await this.delay();
    if (this.failNext) {
      const code = this.failNext;
      this.failNext = null;
      throw new RgsError(code, 400, false);
    }
    if (cost > this.balance) throw new RgsError('ERR_IB', 400, false);
    if (this.uncertainNext) {
      this.uncertainNext = false;
      throw new RgsError('TIMEOUT', 0, true);
    }
    const fx = this.pick(mode);
    const book = parseBook({ ...(fx.book as object), mode });
    this.balance -= cost;
    const round: PlayedRound = {
      id: `local-${++this.counter}-${fx.id}`,
      mode,
      bet,
      book,
      startAt: 0,
      active: book.payoutMultiplier > 0,
    };
    return { balance: this.balance, round };
  }

  async endRound(round: PlayedRound): Promise<number> {
    await this.delay(60);
    if (round.active) this.balance += bookToMoney(round.book.payoutMultiplier, round.bet);
    round.active = false;
    return this.balance;
  }

  /** DEV uniquement : recharge du solde local */
  refill(amount = 1000 * MONEY_BASE): void {
    this.balance += amount;
  }

  async reconcile(): Promise<SessionInfo> {
    return this.authenticate();
  }
}
