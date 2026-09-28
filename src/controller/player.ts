import { Beat, CancelToken, Cancelled } from '../core/beat';
import type { Book, GameEvent } from '../contract/schema';
import { RoundModel } from './model';

/**
 * Lecteur de manche : joue les événements un par un (jamais en parallèle).
 * - Pour chaque événement : copie de l'état précédent, application logique (une seule fois), puis présentation.
 * - skip() : l'événement en cours et les suivants atteignent leur état final exact, sans rien réappliquer.
 * - seek(n) / reprise : application logique silencieuse jusqu'à n, puis restauration visuelle directe.
 * - Un identifiant de manche + d'événement empêche les doubles traitements ; un jeton annule la séquence.
 */
export interface Presenter {
  /** présente l'événement : prev = état avant, next = état après application */
  present(e: GameEvent, prev: RoundModel, next: RoundModel, beat: Beat): Promise<void>;
  /** remet la scène directement dans l'état du modèle (reprise, seek, replay) */
  restore(model: RoundModel): void;
  /** appelé après chaque événement présenté (progression, sauvegarde de reprise) */
  afterEvent?(e: GameEvent, model: RoundModel): void;
}

export interface PlayOptions {
  startAt?: number;
  speed?: number;
  /** passe automatiquement chaque événement (mode rapide / tests) */
  instant?: boolean;
  /** après chaque événement présenté (sauvegarde de progression /bet/event) */
  onEvent?: (index: number) => void;
}

export class RoundPlayer {
  private beat: Beat | null = null;
  private token: CancelToken | null = null;
  private done = new Set<string>();
  model: RoundModel | null = null;
  currentIndex = -1;

  constructor(private presenter: Presenter) {}

  get playing(): boolean {
    return this.beat !== null;
  }

  get currentBeat(): Beat | null {
    return this.beat;
  }

  async play(roundId: string, book: Book, opts: PlayOptions = {}): Promise<RoundModel> {
    if (this.beat) throw new Error('une manche est déjà en lecture');
    const model = new RoundModel(book);
    this.model = model;
    const token = new CancelToken();
    this.token = token;
    const beat = new Beat(token, opts.speed ?? 1);
    this.beat = beat;
    if (opts.instant) beat.skipping = true;
    const start = opts.startAt ?? 0;
    try {
      if (start > 0) {
        for (const e of book.events) if (e.index < start) model.apply(e);
        this.presenter.restore(model);
      }
      for (const e of book.events) {
        if (e.index < start) continue;
        const key = `${roundId}#${e.index}`;
        if (this.done.has(key)) continue;
        this.done.add(key);
        this.currentIndex = e.index;
        const prev = model.clone();
        model.apply(e);
        await this.presenter.present(e, prev, model, beat);
        this.presenter.afterEvent?.(e, model);
        opts.onEvent?.(e.index);
        token.throwIfCancelled();
        // après un skip ponctuel (un événement), on revient à la vitesse normale
        if (!opts.instant && beat.skipping && !this.skipAll) beat.skipping = false;
        if (model.capped && e.type === 'wincap') {
          // MAX WIN : arrêt propre de la suite, sauf l'événement final
          const fin = book.events.find((x) => x.type === 'finalWin');
          if (fin && fin.index > e.index) {
            model.apply(fin);
            this.presenter.afterEvent?.(fin, model);
          }
          break;
        }
      }
      return model;
    } catch (err) {
      if (err instanceof Cancelled) return model;
      throw err;
    } finally {
      this.beat = null;
      this.token = null;
      this.skipAll = false;
      if (this.done.size > 5000) this.done.clear();
    }
  }

  private skipAll = false;

  /** passe l'événement en cours (clic sur la grille pendant une connexion) */
  skipCurrent(): void {
    this.beat?.skip();
  }

  /** passe toute la fin de la manche (arrêt rapide global) */
  skipRest(): void {
    this.skipAll = true;
    this.beat?.skip();
  }

  setSpeed(speed: number): void {
    if (this.beat) this.beat.speed = speed;
  }

  cancel(reason = 'cancel'): void {
    this.token?.cancel(reason);
  }
}
