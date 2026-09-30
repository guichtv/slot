// Plays a book event by event. Logic first (applied once), then presentation. Skip = the current
// presentation jumps to its exact end (tweens progress(1)), nothing is re-applied. Cancel = the
// token stops everything and runs the cleanups. Resume = events before startIndex are applied
// silently, the presenter restores the visuals, then play continues. Anti-duplicate by index.
import type { Book, BookEvent, EventOf } from '../contract/events';
import { applyEvent, initialState, snapshot, type LogicalState } from './state';
import { CancelToken, Cancelled, isCancelled } from '../core/cancel';
import type { GameClock } from '../core/clock';

/** a GSAP timeline/tween (kept structural so the controller does not depend on gsap) */
export interface Playable { progress(p: number, suppressEvents?: boolean): unknown; kill(): unknown; eventCallback(type: 'onComplete', cb: (() => void) | null): unknown }

export interface PresentCtx {
  readonly book: Book;
  readonly state: Readonly<LogicalState>; // AFTER the event was applied
  readonly before: Readonly<LogicalState>; // BEFORE
  readonly token: CancelToken;
  readonly turbo: boolean;
  /** true once the player asked to skip this step (or the whole round is fast-forwarded) */
  skipped(): boolean;
  /** wait game time; resolves at once when skipped */
  wait(sec: number): Promise<void>;
  /** play a GSAP timeline to its end; on skip -> progress(1); on cancel -> kill */
  play(tl: Playable): Promise<void>;
  /** wait for a NEW click (consumed; a previous skip does not count); auto-resolves after `autoSec` if given */
  waitClick(autoSec?: number): Promise<void>;
  /** start a new skippable phase inside the same event (e.g. celebration: counter, then hold) */
  resetSkip(): void;
}

export type Handler<K extends BookEvent['type']> = (e: EventOf<K>, ctx: PresentCtx) => Promise<void>;
export type Presenter = { [K in BookEvent['type']]?: Handler<K> } & {
  begin?(book: Book, state: LogicalState): void;
  /** resume: set visuals to `state` instantly (no animation) */
  restore?(state: LogicalState, book: Book): Promise<void>;
  end?(state: LogicalState, cancelled: boolean): void;
};

export interface PlayerOptions {
  clock: GameClock;
  presenter: Presenter;
  turbo?: () => boolean;
  startIndex?: number;
  /** called after each presented event (e.g. /bet/event progress) */
  onProgress?: (e: BookEvent, state: LogicalState) => void | Promise<void>;
  /** click source: resolves on the next consumed click/Enter/Space */
  nextClick: (token: CancelToken) => Promise<void>;
}

export class RoundPlayer {
  readonly state: LogicalState;
  private skipFlag = false;
  private skipListeners = new Set<() => void>();
  private fastAll = false;
  private running = false;
  current: BookEvent | null = null;

  constructor(readonly book: Book, private readonly o: PlayerOptions) {
    this.state = initialState(book.mode);
  }

  /** skip the current presentation step (first click in a celebration = final state) */
  skip(): void { this.skipFlag = true; for (const l of [...this.skipListeners]) l(); }
  /** fast-forward the whole round (used by replay "stop" and tests) */
  skipAll(): void { this.fastAll = true; this.skip(); }
  get isRunning(): boolean { return this.running; }

  async play(token: CancelToken): Promise<'done' | 'cancelled'> {
    if (this.running) throw new Error('round already playing');
    this.running = true;
    const { presenter, clock } = this.o;
    try {
      const start = this.o.startIndex ?? 0;
      for (const e of this.book.events) { if (e.index < start) applyEvent(this.state, e); }
      if (start > 0) await presenter.restore?.(this.state, this.book);
      else presenter.begin?.(this.book, this.state);
      for (const e of this.book.events) {
        if (e.index < start) continue;
        token.throwIfCancelled();
        const before = snapshot(this.state);
        applyEvent(this.state, e);
        this.current = e;
        this.skipFlag = this.fastAll;
        const ctx = this.makeCtx(before, token, clock);
        const h = (presenter as Record<string, Handler<BookEvent['type']> | undefined>)[e.type];
        if (h) await h(e as never, ctx);
        await this.o.onProgress?.(e, this.state);
      }
      presenter.end?.(this.state, false);
      return 'done';
    } catch (err) {
      if (isCancelled(err)) { presenter.end?.(this.state, true); return 'cancelled'; }
      throw err;
    } finally {
      this.running = false;
      this.current = null;
    }
  }

  private makeCtx(before: LogicalState, token: CancelToken, clock: GameClock): PresentCtx {
    const self = this;
    const skipPromise = () => new Promise<void>((res) => {
      if (self.skipFlag) { res(); return; }
      const l = () => { self.skipListeners.delete(l); res(); };
      self.skipListeners.add(l);
      token.onCancel(() => self.skipListeners.delete(l));
    });
    return {
      book: this.book, state: this.state, before, token,
      turbo: this.o.turbo?.() ?? false,
      skipped: () => self.skipFlag,
      wait(sec: number) {
        if (self.skipFlag || sec <= 0) return token.cancelled ? Promise.reject(new Cancelled(token.reason)) : Promise.resolve();
        return Promise.race([clock.wait(sec, token), skipPromise()]);
      },
      play(tl) {
        return new Promise<void>((resolve, reject) => {
          const done = () => { off(); resolve(); };
          const t = tl;
          t.eventCallback('onComplete', done);
          const off = token.onCancel((r) => { t.kill(); reject(new Cancelled(r)); });
          if (self.skipFlag) { t.progress(1, false); done(); return; }
          skipPromise().then(() => { if (!token.cancelled) { t.progress(1, false); done(); } });
        });
      },
      waitClick(autoSec?: number) {
        if (self.fastAll) return Promise.resolve();
        self.skipFlag = false;
        const races: Promise<void>[] = [self.o.nextClick(token), skipPromise()];
        if (autoSec !== undefined) races.push(clock.wait(autoSec, token));
        return Promise.race(races);
      },
      resetSkip() { if (!self.fastAll) self.skipFlag = false; },
    };
  }
}
