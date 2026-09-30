// Game controller: one explicit state machine, one round at a time.
// authenticate -> play -> animate every event -> end-round once -> idle. Never re-bets on its own
// (autoplay is the player's explicit series). An uncertain request blocks the game until it is
// reconciled through authenticate (an active round is resumed without a new debit).
import { Fsm } from './fsm';
import { RoundPlayer } from './round-player';
import { CancelToken, isCancelled } from '../core/cancel';
import type { GameClock } from '../core/clock';
import type { Provider, SessionInfo, ActiveRound } from '../provider/types';
import { ProviderError } from '../provider/types';
import { validateBook } from '../contract/validate';
import type { Book, ModeId } from '../contract/events';
import { costMicros, bookToMicros } from '../contract/money';
import type { GameConfig } from '../config/game-config';
import type { GamePresenter } from '../render/presenter';
import type { Ui } from '../ui/ui';
import { t, i18n } from '../i18n/i18n';

export interface GameDeps {
  clock: GameClock;
  provider: Provider;
  cfg: GameConfig;
  presenter: GamePresenter;
  ui: Ui;
  format: (micros: number) => string;
  onSound?: (id: string) => void;
  jumping?: (on: boolean) => void;
}

export interface RoundRecord { id: number; mode: ModeId; betMicros: number; winMicros: number; book: Book }

export class GameController {
  readonly fsm = new Fsm();
  session: SessionInfo | null = null;
  balance = 0;
  betIndex = 0;
  ante = false;
  turbo = false;
  autoLeft: number | null = null;
  private player: RoundPlayer | null = null;
  private roundToken: CancelToken | null = null;
  private busy = false;
  readonly history: RoundRecord[] = [];
  lastBook: Book | null = null;
  onRoundEnd = new Set<(r: RoundRecord | null) => void>();
  onState = new Set<() => void>();
  replaying = false;
  /** session net position (wins - bets), for jurisdictions that display it */
  sessionBets = 0;
  sessionWins = 0;
  readonly sessionStart = Date.now();

  constructor(private readonly d: GameDeps) {}

  get bet(): number { return this.session?.betLevels[this.betIndex] ?? 0; }
  get baseMode(): ModeId { return this.ante ? 'ANTE' : 'BASE'; }
  cost(mode: ModeId): number { return this.session?.costs[mode] ?? this.d.cfg.modes[mode]?.cost ?? 1; }
  costOf(mode: ModeId): number { return costMicros(this.bet, this.cost(mode)); }
  get idle(): boolean { return this.fsm.is('idle') && !this.busy && !this.d.ui.dialogOpen; }

  init(s: SessionInfo): void {
    this.session = s;
    this.balance = s.balanceMicros;
    const i = s.betLevels.indexOf(s.defaultBetMicros);
    this.betIndex = i >= 0 ? i : 0;
    this.refreshHud();
  }

  refreshHud(): void {
    const ui = this.d.ui, f = this.d.format;
    ui.setBalance(this.balance);
    ui.setBet(f(this.bet), this.betIndex > 0, this.betIndex < (this.session?.betLevels.length ?? 1) - 1);
    const antex = this.cost('ANTE');
    ui.setAnte(this.ante, `×${fmtNum(antex)}`, t('ante.desc', { x: fmtNum(this.d.cfg.modes.ANTE?.scatterChanceX ?? 2) }), f(this.costOf(this.baseMode)));
    ui.setAuto(this.autoLeft);
    for (const l of this.onState) l();
  }

  // ------------------------------------------------------------------ inputs
  betStep(dir: 1 | -1): void {
    if (!this.idle || !this.session) return;
    this.betIndex = Math.max(0, Math.min(this.session.betLevels.length - 1, this.betIndex + dir));
    this.d.onSound?.(dir > 0 ? 'ui_bet_up' : 'ui_bet_down');
    this.refreshHud();
  }
  setAnte(on: boolean): void { if (!this.idle) return; this.ante = on; this.d.onSound?.('ui_toggle'); this.refreshHud(); }

  /** SPIN button / Space: spin when idle, quick stop while spinning, skip during a presentation */
  press(): void {
    if (this.fsm.is('round', 'requesting')) {
      const phase = this.d.ui.root.dataset.phase;
      const slamOk = !this.session?.jurisdiction.disabledSlamstop;
      if ((phase === 'spinning' || phase === 'stopping') && !slamOk) return;
      if (this.autoLeft !== null) { this.stopAuto(); return; }
      this.player?.skip();
      this.d.ui.catcher.poke();
      return;
    }
    if (this.autoLeft !== null) { this.stopAuto(); return; }
    void this.play(this.baseMode);
  }

  startAuto(n: number): void {
    if (!this.idle || this.session?.jurisdiction.disabledAutoplay) return;
    this.autoLeft = n;
    this.d.onSound?.('ui_autoplay_start');
    this.refreshHud();
    void this.play(this.baseMode);
  }
  stopAuto(): void { this.autoLeft = null; this.refreshHud(); }

  buy(mode: ModeId): void {
    if (!this.idle || this.session?.jurisdiction.disabledBuyFeature) return;
    void this.play(mode);
  }

  // ------------------------------------------------------------------ one round
  async play(mode: ModeId): Promise<void> {
    if (!this.idle || !this.session) return;
    const cost = this.costOf(mode);
    if (cost > this.balance) {
      this.stopAuto();
      this.d.ui.error(t('err.ERR_IPB'), [{ label: t('err.ok'), run: () => {}, primary: true }]);
      return;
    }
    this.busy = true;
    const started = performance.now();
    const bet = this.bet;
    this.fsm.go('requesting');
    // one-spin features show their intro BEFORE the reels move (the reveal starts them)
    if (mode !== 'SCAN' && mode !== 'DOUBLE_SCAN') this.d.presenter.startSpin();
    else this.d.ui.setPhase('resolving');
    let res;
    try {
      res = await this.d.provider.play(mode, bet);
    } catch (e) {
      await this.failedPlay(e);
      this.busy = false;
      return;
    }
    this.sessionBets += cost;
    this.balance = res.balanceMicros; // server balance after the debit
    this.d.ui.setBalance(this.balance);
    await this.runRound(res.book, mode, bet, res.roundId, res.active, 0, started);
  }

  private async runRound(raw: unknown, mode: ModeId, bet: number, roundId: number, active: boolean, startIndex: number, started: number): Promise<void> {
    const v = validateBook(raw, { maxWinX: this.d.cfg.maxWinX });
    if (!v.ok || !v.book) {
      // reported, never repaired: the server's result stands, the round is closed normally
      console.error('[book invalide]', v.issues);
      this.stopReels();
      if (this.fsm.state !== 'round') this.fsm.go('round');
      await this.finishRound(active);
      this.d.ui.error(t('err.book'), [{ label: t('err.ok'), run: () => {}, primary: true }]);
      this.toIdle(null, started);
      return;
    }
    const book = v.book;
    this.lastBook = book;
    this.fsm.go('round');
    const token = new CancelToken();
    this.roundToken = token;
    const player = new RoundPlayer(book, {
      clock: this.d.clock, presenter: this.d.presenter, turbo: () => this.turbo, startIndex, ...(this.d.jumping ? { jumping: this.d.jumping } : {}),
      nextClick: (tk) => new Promise<void>((res) => { const p = this.d.ui.catcher.next(); tk.onCancel(() => res()); void p.then(res); }),
      onProgress: async (e) => {
        if (e.type === 'updateFreeSpin' || e.type === 'freeSpinTrigger' || e.type === 'freeSpinEnd') await this.d.provider.saveProgress(String(e.index + 1));
      },
    });
    this.player = player;
    try {
      await player.play(token);
    } catch (e) {
      if (!isCancelled(e)) console.error(e);
    }
    this.player = null;
    await this.finishRound(active);
    const rec: RoundRecord = { id: roundId, mode, betMicros: bet, winMicros: bookToMicros(book.payoutMultiplier, bet), book };
    this.sessionWins += rec.winMicros;
    this.history.unshift(rec);
    if (this.history.length > 50) this.history.pop();
    this.d.ui.addHistory({ id: rec.id, mode, bet: this.d.format(bet), win: this.d.format(rec.winMicros) });
    this.toIdle(rec, started);
  }

  private async finishRound(active: boolean): Promise<void> {
    if (!active) return;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await this.d.provider.endRound();
        this.balance = r.balanceMicros;
        this.d.ui.setBalance(this.balance);
        return;
      } catch (e) {
        const err = e as ProviderError;
        if (err.code === 'ERR_BNF') { await this.refreshBalance(); return; } // already closed
        if (err.code === 'ERR_IS' || err.code === 'ERR_ATE') { this.fatal(t(`err.${err.code}`)); return; }
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
    // still unknown: block until reconciled
    await this.reconcile();
  }

  private toIdle(rec: RoundRecord | null, started: number): void {
    const minDur = this.session?.jurisdiction.minimumRoundDuration ?? 0;
    const wait = Math.max(0, minDur - (performance.now() - started));
    const done = () => {
      if (this.fsm.state !== 'idle') this.fsm.go('idle');
      this.busy = false;
      this.d.ui.setPhase('idle');
      this.refreshHud();
      for (const l of this.onRoundEnd) l(rec);
      this.nextAuto();
    };
    if (wait > 0) setTimeout(done, wait); else done();
  }

  private nextAuto(): void {
    if (this.autoLeft === null) return;
    this.autoLeft -= 1;
    if (this.autoLeft <= 0 || this.costOf(this.baseMode) > this.balance) { this.stopAuto(); return; }
    this.refreshHud();
    this.d.clock.after(this.turbo ? 0.15 : 0.35, () => { if (this.autoLeft !== null && this.idle) void this.play(this.baseMode); });
  }

  private stopReels(): void { this.d.presenter.abortSpin(); }

  private async failedPlay(e: unknown): Promise<void> {
    const err = e instanceof ProviderError ? e : new ProviderError('ERR_UE', String(e));
    this.stopAuto();
    this.stopReels();
    if (err.uncertain) { this.fsm.go('reconcile'); await this.reconcile(); return; }
    this.fsm.go('idle');
    this.d.ui.setPhase('idle');
    if (err.code === 'ERR_IS' || err.code === 'ERR_ATE' || err.code === 'SESSION') { this.fatal(t(`err.${err.code === 'SESSION' ? 'session' : err.code}`)); return; }
    if (err.code === 'ERR_BE') { this.fsm.go('reconcile'); await this.reconcile(); return; }
    const known = ['ERR_IPB', 'ERR_GLE', 'ERR_LOC', 'ERR_MAINTENANCE'];
    const msg = known.includes(err.code) ? t(`err.${err.code}`) : err.code === 'NETWORK' || err.code === 'TIMEOUT' ? t('err.network') : t('err.generic');
    if (err.code === 'ERR_IPB') await this.refreshBalance();
    this.d.ui.error(msg, [{ label: t('err.ok'), run: () => {}, primary: true }]);
  }

  /** uncertain outcome: ask the server what happened (active round -> resume, never a new debit) */
  async reconcile(): Promise<void> {
    if (this.fsm.state !== 'reconcile') { try { this.fsm.go('reconcile'); } catch { /* from round */ } }
    this.d.ui.setPhase('locked');
    this.d.ui.announce(t('err.uncertain'));
    for (let attempt = 0; ; attempt++) {
      try {
        const s = await this.d.provider.authenticate();
        this.session = { ...this.session!, ...s };
        this.balance = s.balanceMicros;
        this.d.ui.setBalance(this.balance);
        if (s.activeRound) { this.busy = true; await this.resume(s.activeRound); return; }
        this.fsm.go('idle'); this.busy = false; this.d.ui.setPhase('idle'); this.refreshHud();
        return;
      } catch (e) {
        const err = e as ProviderError;
        if (err.code === 'ERR_IS' || err.code === 'ERR_ATE' || err.code === 'SESSION') { this.fatal(t(`err.${err.code === 'SESSION' ? 'session' : err.code}`)); return; }
        await new Promise<void>((res) => {
          if (attempt < 2) setTimeout(res, 1200 * (attempt + 1));
          else this.d.ui.error(t('err.network'), [{ label: t('err.retry'), run: () => res(), primary: true }]);
        });
      }
    }
  }

  /** resume an active round (reload in the middle of a bonus, reconnection) */
  async resume(a: ActiveRound): Promise<void> {
    const started = performance.now();
    const mode = a.mode;
    const idx = this.session!.betLevels.indexOf(a.baseBetMicros);
    if (idx >= 0) this.betIndex = idx;
    this.refreshHud();
    await this.runRound(a.book, mode, a.baseBetMicros, a.roundId, true, a.resumeIndex, started);
  }

  /** local replay of a past round: no wallet call, no bet */
  async replay(book: Book, betMicros: number, o: { bar?: boolean } = {}): Promise<void> {
    if (!this.idle) return;
    this.busy = true;
    this.replaying = true;
    this.d.ui.hide(false);
    this.fsm.go('replay');
    const saveBet = this.betIndex;
    const bi = this.session?.betLevels.indexOf(betMicros) ?? -1;
    if (bi >= 0) this.betIndex = bi;
    let again = true;
    while (again) {
      again = false;
      if (o.bar !== false) {
        this.d.ui.showReplayBar({
          bet: this.d.format(betMicros),
          onStop: () => { this.d.clock.speed = 1; this.player?.skipAll(); },
          onAgain: () => { this.d.clock.speed = 1; again = true; this.player?.skipAll(); },
          onPause: (p) => { this.d.clock.speed = p ? 0 : 1; },
        });
      }
      this.d.presenter.startSpin();
      const token = new CancelToken();
      this.roundToken = token;
      const player = new RoundPlayer(book, { clock: this.d.clock, presenter: this.d.presenter, turbo: () => this.turbo, ...(this.d.jumping ? { jumping: this.d.jumping } : {}), nextClick: (tk) => new Promise<void>((res) => { void this.d.ui.catcher.next().then(res); tk.onCancel(() => res()); }) });
      this.player = player;
      try { await player.play(token); } catch (e) { if (!isCancelled(e)) console.error(e); }
      this.player = null;
      this.d.ui.setReplayWin(this.d.format(bookToMicros(book.payoutMultiplier, betMicros)));
      if (again) this.d.presenter.resetVisuals();
    }
    this.d.clock.speed = 1;
    this.betIndex = saveBet;
    this.replaying = false;
    this.fsm.go('idle');
    this.busy = false;
    this.d.ui.setPhase('idle');
    this.refreshHud();
    if (o.bar !== false) setTimeout(() => this.d.ui.hideReplayBar(), 2500);
  }

  stopReplay(): void { this.player?.skipAll(); }
  skipAll(): void { this.player?.skipAll(); }

  private async refreshBalance(): Promise<void> {
    try { this.balance = await this.d.provider.balance(); this.d.ui.setBalance(this.balance); } catch { /* keep the last server value */ }
  }

  fatal(message: string): void {
    this.stopAuto();
    try { this.fsm.go('error'); } catch { /* already */ }
    this.d.ui.setPhase('locked');
    this.d.ui.error(message, [{ label: t('err.reload'), run: () => location.reload(), primary: true }]);
  }

  cancelRound(reason: string): void { this.roundToken?.cancel(reason); }
}

// in the GAME language (Latin digits), never the browser's
function fmtNum(x: number): string { return new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 }).format(x); }
