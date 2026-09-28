import { RgsClient, RgsError, type RgsClientOptions, type RgsRound } from '../stake/rgs';
import { parseBook } from '../contract/schema';
import type { PlayResult, PlayedRound, RoundProvider, SessionInfo } from './types';

/**
 * Session Stake Engine : authentification, pari, clôture, reprise.
 * - Le solde affiché est celui du serveur, sans addition locale.
 * - Une requête de pari incertaine (timeout, 5xx) bloque le jeu jusqu'à réconciliation : jamais de re-pari automatique.
 * - end-round une seule fois par manche, et seulement si la manche est ouverte côté serveur.
 * - Progression (/bet/event) : envois en série, jamais en parallèle (l'index enregistré ne recule pas),
 *   les index intermédiaires sont regroupés ; plus rien n'est envoyé après la clôture.
 */
export class StakeProvider implements RoundProvider {
  readonly kind = 'stake' as const;
  private client: RgsClient;
  private ended = new Set<string>();
  private lang = 'en';
  private progress: { roundId: string; sent: number; pending: number | null; busy: Promise<void> | null } | null = null;

  constructor(rgsUrl: string, sessionID: string, options?: RgsClientOptions | typeof fetch) {
    this.client = new RgsClient(rgsUrl, sessionID, options);
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
    this.lang = lang || this.lang;
    const a = await this.client.authenticate(this.lang);
    const resume = a.round && a.round.active ? this.toPlayed(a.round, a.config.defaultBetLevel) : null;
    // manche reprise : la progression repart de l'index déjà enregistré
    if (resume) this.progress = { roundId: resume.id, sent: resume.startAt - 1, pending: null, busy: null };
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
    const r = await this.client.play(Math.round(bet), mode);
    const round = this.toPlayed(r.round, Math.round(bet));
    this.progress = null;
    return { balance: r.balance.amount, round };
  }

  async endRound(round: PlayedRound): Promise<number> {
    if (this.progress?.roundId === round.id) this.progress = null;
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

  saveProgress(round: PlayedRound, eventIndex: number): void {
    if (!round.active || this.ended.has(round.id)) return;
    if (!this.progress || this.progress.roundId !== round.id) this.progress = { roundId: round.id, sent: -1, pending: null, busy: null };
    const p = this.progress;
    if (eventIndex <= p.sent || (p.pending !== null && eventIndex <= p.pending)) return;
    p.pending = eventIndex;
    if (!p.busy) p.busy = this.flushProgress(p);
  }

  /** attend la fin des envois de progression en cours (tests, diagnostic) */
  async progressIdle(): Promise<void> {
    while (this.progress?.busy) await this.progress.busy;
  }

  private async flushProgress(p: NonNullable<StakeProvider['progress']>): Promise<void> {
    try {
      while (p.pending !== null && this.progress === p) {
        const i = p.pending;
        p.pending = null;
        if (await this.client.saveEvent(i)) p.sent = Math.max(p.sent, i);
      }
    } finally {
      p.busy = null;
    }
  }

  reconcile(): Promise<SessionInfo> {
    return this.authenticate(this.lang);
  }
}
