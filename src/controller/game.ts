import { Fsm } from '../core/fsm';
import { formatMoney, MONEY_BASE } from '../core/money';
import { RgsError } from '../stake/rgs';
import type { PlayedRound, RoundProvider, SessionInfo } from '../provider/types';
import { RoundPlayer } from './player';
import type { GamePresenter } from './presenter';
import { math, modeCost } from '../config/math';
import { T } from '../config/timings';
import type { Hud, TurboLevel } from '../ui/hud';

/**
 * Contrôleur : relie les commandes (HUD, clavier, achat) au fournisseur de manches et au lecteur.
 * - Le SPIN reflète la phase réelle ; un second clic ou Espace pendant le défilement = arrêt rapide.
 * - Le solde affiché est celui renvoyé par le fournisseur (serveur), jamais une addition locale.
 * - Une requête de pari incertaine bloque le jeu jusqu'à réconciliation (jamais de re-pari automatique).
 * - Les free spins s'enchaînent seuls (dans la manche), indépendamment de l'autoplay.
 */
export interface GameHooks {
  onError(e: unknown, ctx: 'play' | 'end' | 'auth'): Promise<'retry' | 'dismiss'>;
  onRoundStart?(round: PlayedRound): void;
  onRoundEnd?(round: PlayedRound, balance: number): void;
  beforeSpin?(): void;
  message?(text: string): void;
}

export class GameController {
  readonly fsm = new Fsm();
  readonly player: RoundPlayer;
  balance = 0;
  currency = 'EUR';
  betLevels: number[] = [MONEY_BASE];
  betIndex = 0;
  turbo: TurboLevel = 0;
  ante = false;
  autoLeft = 0;
  private busy = false;
  lastRound: PlayedRound | null = null;
  history: PlayedRound[] = [];
  flags = { turbo: true, autoplay: true, buy: true, spacebar: true };

  constructor(
    public provider: RoundProvider,
    readonly presenter: GamePresenter,
    readonly hud: Hud,
    readonly hooks: GameHooks,
  ) {
    this.player = new RoundPlayer(presenter);
    // phases de présentation -> machine à états (entrées permises : arrêt rapide, passer, menu…)
    presenter.onPhase = (st) => {
      if (this.fsm.state !== st && this.fsm.can(st)) this.fsm.go(st);
    };
  }

  get bet(): number {
    return this.betLevels[this.betIndex] ?? MONEY_BASE;
  }

  get speed(): number {
    return this.turbo === 0 ? 1 : this.turbo === 1 ? 1.8 : 3;
  }

  get baseMode(): string {
    return this.ante ? 'ANTE' : 'BASE';
  }

  /** coût du prochain spin (mise × facteur du mode, lu dans la config maths) */
  nextSpinCost(mode = this.baseMode): number {
    return Math.round(this.bet * modeCost(mode));
  }

  applySession(s: SessionInfo): void {
    this.balance = s.balance;
    this.currency = s.currency;
    this.betLevels = s.betLevels.length ? s.betLevels : [MONEY_BASE];
    const i = this.betLevels.indexOf(s.defaultBet);
    this.betIndex = i >= 0 ? i : 0;
    const j = s.jurisdiction;
    this.flags = {
      turbo: !j.disabledTurbo,
      autoplay: !j.disabledAutoplay,
      buy: !j.disabledBuyFeature,
      spacebar: !j.disabledSpacebar,
    };
    this.hud.setJurisdiction({ turbo: this.flags.turbo, autoplay: this.flags.autoplay, buy: this.flags.buy });
    this.refreshHud();
  }

  refreshHud(): void {
    this.hud.setBalance(this.balance);
    this.hud.setBet(this.nextSpinCost(), this.betIndex > 0, this.betIndex < this.betLevels.length - 1);
    this.hud.setTurbo(this.turbo);
  }

  changeBet(dir: -1 | 1): void {
    if (!this.fsm.accepts('bet')) return;
    this.betIndex = Math.max(0, Math.min(this.betLevels.length - 1, this.betIndex + dir));
    this.presenter.bet = this.bet;
    this.refreshHud();
  }

  cycleTurbo(): void {
    if (!this.flags.turbo) return;
    this.turbo = ((this.turbo + 1) % 3) as TurboLevel;
    this.player.setSpeed(this.speed);
    this.hud.setTurbo(this.turbo);
  }

  /** clic sur SPIN / Espace au repos */
  async spin(mode = this.baseMode): Promise<void> {
    if (this.busy || !this.fsm.accepts('spin')) return;
    const cost = this.nextSpinCost(mode);
    if (cost > this.balance) {
      this.autoLeft = 0;
      this.hooks.message?.('insufficient');
      return;
    }
    await this.playRound(mode, true);
  }

  /** achat confirmé (le débit n'a lieu qu'au serveur, après acceptation) */
  async buy(mode: string): Promise<boolean> {
    if (this.busy) return false;
    return this.playRound(mode, false);
  }

  private async playRound(mode: string, startReels: boolean): Promise<boolean> {
    this.busy = true;
    this.fsm.go('requesting');
    this.hud.setPhase(this.autoLeft > 0 ? 'autoplay' : 'spinning', this.autoLeft);
    this.hud.setWin(null);
    this.hooks.beforeSpin?.();
    this.presenter.bet = this.bet;
    this.presenter.quickStop = false;
    // départ immédiat des rouleaux au clic (retour tactile), le résultat arrive pendant le défilement
    if (startReels) {
      this.presenter.spinStarted = true;
      (this.presenter as unknown as { s: { grid: { spin(a: number, b: number): unknown }; sound: { play(n: string): void } } }).s.grid.spin(T.spin.speedCells, T.spin.stagger);
      (this.presenter as unknown as { s: { sound: { play(n: string): void } } }).s.sound.play('spinStart');
    }
    let round: PlayedRound;
    for (;;) {
      try {
        const r = await this.provider.play(this.bet, mode);
        this.balance = r.balance;
        round = r.round;
        break;
      } catch (e) {
        const uncertain = e instanceof RgsError && e.uncertain;
        this.fsm.go(uncertain ? 'waiting' : 'error');
        const choice = await this.hooks.onError(e, 'play');
        if (uncertain) {
          // réconciliation : on relit l'état serveur ; une manche ouverte est reprise sans nouveau débit
          try {
            const s = await this.provider.reconcile?.();
            if (s) {
              this.balance = s.balance;
              if (s.resume) {
                round = s.resume;
                this.fsm.go('spinning');
                break;
              }
            }
          } catch {
            /* reste bloqué : l'erreur sera reproposée */
          }
        }
        this.busy = false;
        this.autoLeft = 0;
        this.stopReelsIfNeeded();
        if (this.fsm.state !== 'ready') this.fsm.go('ready');
        this.hud.setPhase('idle');
        this.refreshHud();
        if (choice === 'retry' && !uncertain) return this.playRound(mode, startReels);
        return false;
      }
    }
    return this.finishRound(round);
  }

  /** présentation puis clôture d'une manche obtenue du serveur (nouvelle ou reprise) */
  private async finishRound(round: PlayedRound): Promise<boolean> {
    this.lastRound = round;
    this.history.unshift(round);
    if (this.history.length > 20) this.history.pop();
    this.hud.setBalance(this.balance);
    this.hooks.onRoundStart?.(round);
    if (this.fsm.state === 'requesting' || this.fsm.state === 'resume') this.fsm.go('spinning');
    await this.player.play(round.id, round.book, {
      startAt: round.startAt,
      speed: this.speed,
      // progression enregistrée côté serveur : une manche interrompue reprend à l'événement exact
      onEvent: (i) => {
        if (round.active) this.provider.saveProgress?.(round, i);
      },
    });
    // clôture
    for (;;) {
      try {
        this.balance = await this.provider.endRound(round);
        break;
      } catch (e) {
        const c = await this.hooks.onError(e, 'end');
        if (c !== 'retry') break;
      }
    }
    this.hud.setBalance(this.balance);
    this.hooks.onRoundEnd?.(round, this.balance);
    if (this.fsm.state !== 'returning' && this.fsm.can('returning')) this.fsm.go('returning');
    if (this.fsm.state !== 'ready') this.fsm.go(this.fsm.can('ready') ? 'ready' : 'error');
    if (this.fsm.state === 'error') this.fsm.go('ready');
    this.busy = false;
    if (this.autoLeft > 0) {
      this.autoLeft--;
      if (this.autoLeft > 0) {
        this.hud.setPhase('autoplay', this.autoLeft);
        window.setTimeout(() => void this.continueAuto(), 220 / this.speed);
        return true;
      }
    }
    this.hud.setPhase('idle');
    this.refreshHud();
    return true;
  }

  /** manche interrompue (session.resume) : rejouée depuis l'événement enregistré, sans nouveau débit */
  async resumeRound(round: PlayedRound): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    if (this.fsm.state !== 'resume' && this.fsm.can('resume')) this.fsm.go('resume');
    this.hud.setPhase('spinning');
    this.presenter.bet = round.bet;
    await this.finishRound(round);
  }

  /** relecture d'une manche de l'historique (aucun appel serveur, aucun débit) */
  async replayRound(round: PlayedRound): Promise<void> {
    if (this.busy || this.fsm.state !== 'ready') return;
    this.busy = true;
    this.fsm.go('replay');
    this.hud.setPhase('locked');
    this.presenter.bet = round.bet;
    try {
      await this.player.play(`replay:${round.id}:${Date.now()}`, round.book, { startAt: 0, speed: this.speed });
    } finally {
      this.presenter.bet = this.bet;
      this.fsm.go('ready');
      this.busy = false;
      this.hud.setPhase('idle');
      this.refreshHud();
    }
  }

  private stopReelsIfNeeded(): void {
    const grid = (this.presenter as unknown as { s: { grid: { anySpinning: boolean; setBoard(b: unknown, t: unknown): void } } }).s.grid;
    const model = this.player.model;
    if (grid.anySpinning && model) grid.setBoard(model.board, model.tnt);
  }

  private async continueAuto(): Promise<void> {
    if (this.autoLeft <= 0 || this.fsm.state !== 'ready') {
      this.hud.setPhase('idle');
      return;
    }
    if (this.nextSpinCost() > this.balance) {
      this.autoLeft = 0;
      this.hud.setPhase('idle');
      this.hooks.message?.('insufficient');
      return;
    }
    await this.playRound(this.baseMode, true);
  }

  startAuto(n: number): void {
    if (!this.flags.autoplay || this.fsm.state !== 'ready') return;
    this.autoLeft = n;
    void this.playRound(this.baseMode, true);
  }

  stopAuto(): void {
    this.autoLeft = 0;
    if (this.fsm.state === 'ready') this.hud.setPhase('idle');
    else this.hud.setPhase('spinning');
  }

  /** second clic / Espace pendant le défilement : arrêt rapide, résultat inchangé */
  quickStop(): void {
    this.presenter.quickStop = true;
    this.player.skipCurrent();
  }

  /** clic sur la grille pendant une connexion : passe au montant */
  skipPresentation(): void {
    this.player.skipCurrent();
  }

  maxWinText(): string {
    return formatMoney(this.bet * math().maxWinX);
  }
}
