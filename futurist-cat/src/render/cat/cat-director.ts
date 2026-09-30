// Decides which clip the cat plays (section 4.4 / 4.6). The cat is living decor: the game never
// waits for it. Priorities: 0 background, 1 tension, 2 small gestures, 3 big moments. A request of
// equal or higher priority interrupts; a lower one is ignored (no queue); only the targeted
// background is remembered. Every timing runs on the shared game clock (update(dt)).
import type { CatRig, ClipId } from './cat-rig';

export type CatMoment =
  | 'intro' | 'bonusReturn' // dive -> background
  | 'spinStart' // look at the grid (no clip change)
  | 'laser' | 'scatterLand' | 'anticipation' // alert (tension)
  | 'nothing' // back to background (0.4 s)
  | 'smallWin' // hop
  | 'tier1' // dance loop while the counter runs
  | 'tierHigh' | 'maxWin' // flip (salto) -> dance
  | 'bonusEnter' // hooks (punch tears the popup) -> run -> alert
  | 'trigger' // bonus triggered: salto, back to the background
  | 'winEnd'; // gain over: back to background in 0.2 s

export type Background = 'idle' | 'idle34';

interface Step { at: number; run: () => void }

export const CAT_FADES = {
  loopToLoop: 0.45,
  loopToGesture: 0.22,
  gestureToBg: 0.35,
  afterDive: 0.6,
  interrupt: 0.15,
  idle34Swap: 0.5, // idle <-> idle34: 10 cm left / 8.5 cm lower, handled by a longer fade
};

export class CatDirector {
  background: Background = 'idle';
  private priority = 0;
  private steps: Step[] = [];
  private t = 0;
  turbo = false;
  reduced = false;
  /** called when a pose-only fallback should show (reduced motion win pose, etc.) */
  onStill: ((pose: 'rest' | 'alert' | 'win' | 'bigwin') => void) | null = null;
  onCue: ((cue: 'punch' | 'land' | 'flipApex') => void) | null = null;

  constructor(private readonly rig: CatRig, private readonly rand: () => number) {}

  get currentPriority(): number { return this.priority; }

  /** Starts the background loop at a random time (idle must not look synchronised). */
  start(bg: Background = 'idle', { randomStart = true } = {}): void {
    this.background = bg;
    this.priority = 0;
    this.steps = [];
    const d = this.rig.duration(bg) || 1;
    this.rig.play(bg, { fade: 0, startAt: randomStart ? this.rand() * d : 0 });
  }

  setBackground(bg: Background): void {
    if (this.background === bg) return;
    this.background = bg;
    if (this.priority === 0) this.rig.play(this.reduced ? 'idle' : bg, { fade: CAT_FADES.idle34Swap });
  }

  private fade(d: number): number { return this.turbo ? d * 0.7 : d; }
  private scale(big: boolean): number { return this.turbo && big ? 1.3 : 1; }
  private schedule(delay: number, run: () => void): void { this.steps.push({ at: this.t + delay, run }); }

  /** Back to the targeted background loop. */
  toBackground(fade = CAT_FADES.gestureToBg): void {
    this.steps = [];
    this.priority = 0;
    this.rig.play(this.reduced ? 'idle' : this.background, { fade: this.fade(fade) });
    this.onStill?.('rest');
  }

  /** Plays a once-clip then returns to the background at duration - fade (finished = safety net only). */
  private gesture(id: ClipId, prio: number, opts: { fadeIn: number; fadeOut: number; speed?: number; then?: () => void }): void {
    const speed = opts.speed ?? 1;
    const interrupting = this.priority > 0;
    this.rig.play(id, { fade: this.fade(interrupting ? CAT_FADES.interrupt : opts.fadeIn), timeScale: speed });
    this.priority = prio;
    const len = this.rig.duration(id) / speed;
    const out = this.fade(opts.fadeOut);
    this.schedule(Math.max(0.05, len - out), () => {
      if (opts.then) opts.then();
      else this.toBackground(opts.fadeOut);
    });
  }

  request(m: CatMoment): boolean {
    const prio = PRIORITY[m];
    if (this.reduced) return this.requestReduced(m);
    if (prio === 2 && this.turbo) return false; // no small gestures in turbo
    const ending = m === 'nothing' || m === 'winEnd'; // the moment is over: always honoured
    if (!ending && prio < this.priority) return false; // lower priority: ignored, no queue
    this.steps = [];
    switch (m) {
      case 'intro':
      case 'bonusReturn':
        this.gesture('dive', 3, { fadeIn: 0, fadeOut: CAT_FADES.afterDive, speed: this.scale(true) });
        this.schedule(0.3, () => this.onCue?.('land'));
        return true;
      case 'spinStart':
        return true; // look handled by the view (procedural head look toward the grid)
      case 'laser':
      case 'scatterLand':
        this.gesture('alert', 1, { fadeIn: CAT_FADES.loopToGesture, fadeOut: CAT_FADES.gestureToBg });
        return true;
      case 'anticipation':
        this.rig.play('alert', { fade: this.fade(0.25), timeScale: 1.15 });
        this.priority = 1; // held until the result (nothing / win) arrives
        return true;
      case 'nothing':
        this.toBackground(0.4);
        return true;
      case 'smallWin':
        this.gesture('hop', 2, { fadeIn: CAT_FADES.loopToGesture, fadeOut: CAT_FADES.gestureToBg });
        return true;
      case 'tier1':
        this.rig.play('dance', { fade: this.fade(this.priority > 0 ? CAT_FADES.interrupt : CAT_FADES.loopToGesture), timeScale: this.scale(true) });
        this.priority = 3;
        return true;
      case 'tierHigh':
      case 'maxWin':
        this.gesture('flip', 3, {
          fadeIn: CAT_FADES.loopToGesture, fadeOut: 0.3, speed: this.scale(true),
          then: () => { this.rig.play('dance', { fade: this.fade(0.3), timeScale: this.scale(true) }); this.priority = 3; },
        });
        this.schedule(1.1 / this.scale(true), () => this.onCue?.('flipApex'));
        return true;
      case 'bonusEnter': {
        // a hook from the punch sub-clip tears the popup (<= 0.3 s after the click), then run, then alert
        this.gesture('hooks', 3, { fadeIn: 0.12, fadeOut: 0.2, speed: 1.25 * this.scale(true), then: () => {
          this.rig.play('run', { fade: this.fade(0.2) });
          this.priority = 3;
          this.schedule(0.9 / this.scale(true), () => { this.rig.play('alert', { fade: this.fade(0.25) }); this.priority = 1;
            this.schedule((this.rig.duration('alert') - 0.4), () => this.toBackground()); });
        } });
        this.schedule(0.22, () => this.onCue?.('punch'));
        return true;
      }
      case 'trigger':
        this.gesture('flip', 3, { fadeIn: CAT_FADES.loopToGesture, fadeOut: CAT_FADES.gestureToBg, speed: this.scale(true) });
        return true;
      case 'winEnd':
        this.toBackground(0.2);
        return true;
    }
  }

  private requestReduced(m: CatMoment): boolean {
    // reduced motion: idle only, still win pose + eye halo, entrances as fades (handled by the view)
    if (m === 'smallWin' || m === 'tier1' || m === 'tierHigh' || m === 'maxWin') { this.onStill?.(m === 'smallWin' ? 'win' : 'bigwin'); return true; }
    if (m === 'winEnd' || m === 'nothing') { this.onStill?.('rest'); return true; }
    return false;
  }

  update(dt: number): void {
    this.t += dt;
    if (!this.steps.length) return;
    const due = this.steps.filter((s) => s.at <= this.t);
    if (!due.length) return;
    this.steps = this.steps.filter((s) => s.at > this.t);
    for (const s of due) s.run();
  }
}

const PRIORITY: Record<CatMoment, number> = {
  intro: 3, bonusReturn: 3, spinStart: 0, laser: 1, scatterLand: 1, anticipation: 1, nothing: 0,
  smallWin: 2, tier1: 3, tierHigh: 3, maxWin: 3, bonusEnter: 3, trigger: 3, winEnd: 0,
};
