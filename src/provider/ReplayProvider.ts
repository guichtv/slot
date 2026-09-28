import { parseBook, type Book } from '../contract/schema';
import { fetchReplay } from '../stake/rgs';
import type { PlayResult, PlayedRound, RoundProvider, SessionInfo } from './types';

/**
 * Replay : relecture d'une manche, sans session, sans appel wallet, sans pari.
 * - Stake : GET {rgs_url}/bet/replay/{game}/{version}/{mode}/{event}
 * - Local : manches de l'historique de la session en cours.
 */
export class ReplayProvider implements RoundProvider {
  readonly kind = 'replay' as const;
  private book: Book | null = null;

  constructor(
    private readonly source:
      | { kind: 'stake'; rgsUrl: string; game: string; version: string; mode: string; event: string; amount?: number; currency?: string }
      | { kind: 'local'; book: Book; bet: number; currency: string },
  ) {}

  async load(): Promise<Book> {
    if (this.book) return this.book;
    if (this.source.kind === 'local') {
      this.book = this.source.book;
      return this.book;
    }
    const s = this.source;
    const r = await fetchReplay(s.rgsUrl, s.game, s.version, s.mode, s.event);
    this.book = parseBook({ id: s.event, mode: s.mode, payoutMultiplier: r.payoutMultiplier, costMultiplier: r.costMultiplier, events: r.events });
    return this.book;
  }

  get bet(): number {
    return this.source.kind === 'local' ? this.source.bet : this.source.amount ?? 1_000_000;
  }

  get currency(): string {
    return this.source.kind === 'local' ? this.source.currency : this.source.currency ?? 'USD';
  }

  async authenticate(): Promise<SessionInfo> {
    await this.load();
    return { balance: 0, currency: this.currency, betLevels: [this.bet], defaultBet: this.bet, jurisdiction: {}, resume: null };
  }

  /** Aucune commande de pari en replay : play() rend la manche relue, sans débit. */
  async play(): Promise<PlayResult> {
    const book = await this.load();
    const round: PlayedRound = { id: `replay-${book.id}`, mode: book.mode, bet: this.bet, book, startAt: 0, active: false };
    return { balance: 0, round };
  }

  async endRound(): Promise<number> {
    return 0;
  }
}
