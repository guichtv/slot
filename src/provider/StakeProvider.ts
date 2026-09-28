import { RgsClient, RgsError, type RgsRound } from '../stake/rgs';
import { parseBook } from '../contract/schema';
import type { PlayResult, PlayedRound, RoundProvider, SessionInfo } from './types';

/**
 * Session Stake Engine : authentification, pari, clôture, reprise.
 * - Le solde affiché est celui du serveur, sans addition locale.
 * - Une requête de pari incertaine (timeout, 5xx) bloque le jeu jusqu'à réconciliation : jamais de re-pari automatique.
 * - end-round une seule fois par manche.
 */
export class StakeProvider implements RoundProvider {
  readonly kind = 'stake' as const;
  private client: RgsClient;
  private ended = new Set<string>();

  constructor(rgsUrl: string, sessionID: string, fetchImpl?: typeof fetch) {
    this.client = new RgsClient(rgsUrl, sessionID, fetchImpl);
  }

  private toPlayed(r: RgsRound, betFallback: number): PlayedRound {
    const book = parseBook({
      id: r.id,
      mode: r.mode,
      payoutMultiplier: r.payoutMultiplier,
      ...(r.costMultiplier !== undefined ? { costMultiplier: r.costMultiplier } : {}),
      events: r.events,
    });
    return {
      id: r.id,
      mode: r.mode,
      bet: r.amount || betFallback,
      book,
      startAt: r.lastEvent !== undefined && r.lastEvent >= 0 ? r.lastEvent + 1 : 0,
      active: r.active,
    };
  }

  async authenticate(lang: string): Promise<SessionInfo> {
    const a = await this.client.authenticate(lang);
    const resume = a.round && a.round.active ? this.toPlayed(a.round, a.config.defaultBetLevel) : null;
    return {
      balance: a.balance.amount,
      currency: a.balance.currency,
      betLevels: a.config.betLevels,
      defaultBet: a.config.defaultBetLevel,
      jurisdiction: a.config.jurisdiction,
      resume,
    };
  }

  async play(bet: number, mode: string): Promise<PlayResult> {
    const r = await this.client.play(bet, mode);
    return { balance: r.balance.amount, round: this.toPlayed(r.round, bet) };
  }

  async endRound(round: PlayedRound): Promise<number> {
    if (!round.active || this.ended.has(round.id)) return (await this.client.balance()).amount;
    this.ended.add(round.id);
    try {
      return (await this.client.endRound()).amount;
    } catch (e) {
      // ERR_NR : aucune manche active côté serveur (déjà close) -> on relit le solde
      if (e instanceof RgsError && e.code === 'ERR_NR') return (await this.client.balance()).amount;
      this.ended.delete(round.id);
      throw e;
    }
  }

  saveProgress(_round: PlayedRound, eventIndex: number): void {
    void this.client.saveEvent(eventIndex);
  }

  reconcile(): Promise<SessionInfo> {
    return this.authenticate('en');
  }
}
