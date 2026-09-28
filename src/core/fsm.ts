/**
 * Machine à états explicite du jeu.
 * Chaque état déclare ses transitions autorisées et les entrées qu'il bloque.
 * Les ressources d'un état (timers, écouteurs, tweens, particules, sons) sont enregistrées
 * avec own() et libérées à la sortie de l'état.
 */
export type GameState =
  | 'loading'
  | 'welcome'
  | 'entering'
  | 'ready'
  | 'requesting'
  | 'spinning'
  | 'anticipation'
  | 'resolving'
  | 'feature'
  | 'celebration'
  | 'bonusIntro'
  | 'bonus'
  | 'bonusOutro'
  | 'returning'
  | 'catalog'
  | 'confirm'
  | 'waiting'
  | 'error'
  | 'resume'
  | 'replay';

export type Input = 'spin' | 'quickStop' | 'bet' | 'buy' | 'menu' | 'autoplay' | 'ante' | 'skip' | 'dismiss';

const ROUND_STATES: GameState[] = ['spinning', 'anticipation', 'resolving', 'feature', 'celebration', 'bonusIntro', 'bonus', 'bonusOutro', 'returning'];

export const TRANSITIONS: Record<GameState, GameState[]> = {
  loading: ['welcome', 'error', 'replay'],
  welcome: ['entering', 'error'],
  entering: ['ready', 'resume', 'error'],
  ready: ['requesting', 'catalog', 'replay', 'error', 'waiting'],
  requesting: ['spinning', 'ready', 'error', 'waiting'],
  spinning: ['anticipation', 'resolving', 'bonusIntro', 'celebration', 'returning', 'error'],
  anticipation: ['resolving', 'bonusIntro', 'returning', 'error'],
  resolving: ['feature', 'celebration', 'bonusIntro', 'returning', 'spinning', 'anticipation', 'bonus', 'error'],
  feature: ['resolving', 'celebration', 'returning', 'bonusIntro', 'spinning', 'bonus', 'error'],
  celebration: ['returning', 'bonusIntro', 'bonus', 'bonusOutro', 'resolving', 'error'],
  bonusIntro: ['bonus', 'error'],
  bonus: ['spinning', 'anticipation', 'resolving', 'feature', 'celebration', 'bonusOutro', 'error'],
  bonusOutro: ['returning', 'celebration', 'error'],
  returning: ['ready', 'requesting', 'error'],
  catalog: ['confirm', 'ready', 'error'],
  confirm: ['catalog', 'requesting', 'ready', 'error'],
  waiting: ['ready', 'requesting', 'error', 'spinning'],
  error: ['ready', 'loading', 'resume', 'welcome', 'entering'],
  resume: ['spinning', 'bonus', 'bonusIntro', 'resolving', 'ready', 'error'],
  replay: ['ready', 'loading', 'replay', 'error'],
};

const ALLOWED_INPUTS: Partial<Record<GameState, Input[]>> = {
  ready: ['spin', 'bet', 'buy', 'menu', 'autoplay', 'ante'],
  spinning: ['quickStop', 'skip', 'menu'],
  anticipation: ['quickStop', 'skip', 'menu'],
  resolving: ['skip', 'menu'],
  feature: ['skip', 'menu'],
  celebration: ['skip', 'dismiss'],
  bonusIntro: ['dismiss'],
  bonus: ['skip', 'menu'],
  bonusOutro: ['dismiss', 'skip'],
  catalog: ['buy', 'dismiss', 'menu'],
  confirm: ['buy', 'dismiss'],
  welcome: ['dismiss'],
  error: ['dismiss'],
  replay: ['skip', 'menu'],
};

export class Fsm {
  state: GameState = 'loading';
  private owned: Array<() => void> = [];
  private listeners: Array<(s: GameState, prev: GameState) => void> = [];
  readonly history: GameState[] = ['loading'];

  can(to: GameState): boolean {
    return TRANSITIONS[this.state].includes(to);
  }

  go(to: GameState): void {
    if (to === this.state) return;
    if (!this.can(to)) {
      throw new Error(`transition interdite ${this.state} -> ${to}`);
    }
    const prev = this.state;
    const own = this.owned;
    this.owned = [];
    for (const d of own) {
      try {
        d();
      } catch (e) {
        console.error('cleanup', e);
      }
    }
    this.state = to;
    this.history.push(to);
    if (this.history.length > 200) this.history.splice(0, 100);
    for (const l of this.listeners) l(to, prev);
  }

  /** Ressource liée à l'état courant : libérée à la prochaine transition. */
  own(dispose: () => void): void {
    this.owned.push(dispose);
  }

  accepts(input: Input): boolean {
    return ALLOWED_INPUTS[this.state]?.includes(input) ?? false;
  }

  get inRound(): boolean {
    return ROUND_STATES.includes(this.state);
  }

  onChange(fn: (s: GameState, prev: GameState) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }
}
