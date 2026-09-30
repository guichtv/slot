// Shared game clock: image (Pixi + GSAP + three mixer), counters and sounds follow it. Suspended
// while the tab is hidden (no tick at all), dt clamped to 0.05 s on resume (no catch-up). In QA
// (?virtual=1) time only advances through advance(), so captures and videos are frame exact.
import type { CancelToken } from './cancel';
import { Cancelled } from './cancel';

interface Timer { at: number; fn: () => void; id: number }

export class GameClock {
  /** game time in seconds */
  time = 0;
  /** last frame dt in seconds (after clamp and speed) */
  dt = 0;
  speed = 1;
  readonly virtual: boolean;
  hidden = false;
  private timers: Timer[] = [];
  private nextId = 1;
  private frameListeners = new Set<(dt: number, time: number) => void>();

  constructor(virtual = false) { this.virtual = virtual; }

  /** real frame -> game dt (clamped). Returns 0 while hidden. */
  step(realDtSec: number): number {
    if (this.hidden) { this.dt = 0; return 0; }
    const dt = Math.min(0.05, Math.max(0, realDtSec)) * this.speed;
    this.advance(dt);
    return dt;
  }

  advance(dt: number): void {
    this.dt = dt;
    this.time += dt;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time + 1e-9).sort((a, b) => a.at - b.at);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > this.time + 1e-9);
        for (const t of due) t.fn();
      }
    }
    for (const l of this.frameListeners) l(dt, this.time);
  }

  onFrame(fn: (dt: number, time: number) => void): () => void { this.frameListeners.add(fn); return () => this.frameListeners.delete(fn); }

  after(sec: number, fn: () => void): number {
    const id = this.nextId++;
    this.timers.push({ at: this.time + Math.max(0, sec), fn, id });
    return id;
  }
  cancel(id: number): void { this.timers = this.timers.filter((t) => t.id !== id); }

  /** resolves after `sec` of GAME time; rejects with Cancelled when the token is cancelled */
  wait(sec: number, token?: CancelToken): Promise<void> {
    return new Promise((resolve, reject) => {
      if (token?.cancelled) { reject(new Cancelled(token.reason)); return; }
      const id = this.after(sec, () => { off?.(); resolve(); });
      const off = token?.onCancel((r) => { this.cancel(id); reject(new Cancelled(r)); });
    });
  }

  /** resolves on the next frame(s) */
  frames(n = 1): Promise<void> {
    return new Promise((resolve) => {
      let k = 0;
      const off = this.onFrame(() => { if (++k >= n) { off(); resolve(); } });
    });
  }

  pendingTimers(): number { return this.timers.length; }
}
