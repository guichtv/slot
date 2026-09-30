// Explicit game states, each with its own cleanup (run when the state is left).
export type GameState =
  | 'boot' | 'loading' | 'welcome' | 'entering' | 'idle' | 'requesting' | 'round'
  | 'reconcile' | 'error' | 'replay';

const ALLOWED: Record<GameState, GameState[]> = {
  boot: ['loading', 'error'],
  loading: ['welcome', 'error', 'replay'],
  welcome: ['entering', 'error'],
  entering: ['idle', 'round', 'error'],
  idle: ['requesting', 'round', 'error', 'reconcile', 'replay'],
  requesting: ['round', 'idle', 'error', 'reconcile'],
  round: ['idle', 'error', 'reconcile', 'requesting'],
  reconcile: ['idle', 'error', 'round'],
  error: ['idle', 'reconcile', 'loading'],
  replay: ['idle', 'error', 'replay'],
};

export class Fsm {
  state: GameState = 'boot';
  private cleanups: (() => void)[] = [];
  private listeners = new Set<(s: GameState, prev: GameState) => void>();
  readonly history: GameState[] = ['boot'];

  go(next: GameState): void {
    if (next === this.state) return;
    if (!ALLOWED[this.state].includes(next)) throw new Error(`transition interdite ${this.state} -> ${next}`);
    const prev = this.state;
    const cl = this.cleanups; this.cleanups = [];
    for (const f of cl.reverse()) { try { f(); } catch (e) { console.error(e); } }
    this.state = next;
    this.history.push(next);
    if (this.history.length > 50) this.history.shift();
    for (const l of this.listeners) l(next, prev);
  }
  /** registers a cleanup for the CURRENT state */
  onLeave(fn: () => void): void { this.cleanups.push(fn); }
  on(fn: (s: GameState, prev: GameState) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  is(...s: GameState[]): boolean { return s.includes(this.state); }
}
