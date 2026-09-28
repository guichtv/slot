import type { RgsJurisdiction } from '../stake/rgs';
import type { Book } from '../contract/schema';

/** Fournisseur de manches : le jeu est un lecteur d'événements, il ne calcule jamais. */
export interface SessionInfo {
  balance: number; // base 1e6
  currency: string;
  betLevels: number[]; // base 1e6
  defaultBet: number;
  jurisdiction: RgsJurisdiction;
  /** manche interrompue à reprendre exactement, sans nouveau débit */
  resume: PlayedRound | null;
}

export interface PlayedRound {
  id: string;
  mode: string;
  /** mise de base (base 1e6) */
  bet: number;
  book: Book;
  /** index du premier événement à présenter (reprise) */
  startAt: number;
  /** manche encore ouverte côté serveur : end-round requis (une manche perdante est déjà close) */
  active: boolean;
}

export interface PlayResult {
  balance: number;
  round: PlayedRound;
}

export interface RoundProvider {
  readonly kind: 'demo' | 'stake' | 'replay';
  authenticate(lang: string): Promise<SessionInfo>;
  /** débite bet × coût du mode (côté serveur) et renvoie la manche */
  play(bet: number, mode: string): Promise<PlayResult>;
  /** clôt la manche ; renvoie le solde serveur */
  endRound(round: PlayedRound): Promise<number>;
  /** progression pour la reprise (facultatif) */
  saveProgress?(round: PlayedRound, eventIndex: number): void;
  /** après une requête incertaine : relit l'état serveur */
  reconcile?(): Promise<SessionInfo>;
}
