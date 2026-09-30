import type { Book, ModeId } from '../contract/events';

export interface Jurisdiction {
  socialCasino: boolean;
  disabledFullscreen: boolean;
  disabledTurbo: boolean;
  disabledSuperTurbo: boolean;
  disabledAutoplay: boolean;
  disabledSlamstop: boolean;
  disabledSpacebar: boolean;
  disabledBuyFeature: boolean;
  displayNetPosition: boolean;
  displayRTP: boolean;
  displaySessionTimer: boolean;
  minimumRoundDuration: number; // ms
}
export const DEFAULT_JURISDICTION: Jurisdiction = {
  socialCasino: false, disabledFullscreen: false, disabledTurbo: false, disabledSuperTurbo: false, disabledAutoplay: false,
  disabledSlamstop: false, disabledSpacebar: false, disabledBuyFeature: false, displayNetPosition: false, displayRTP: true,
  displaySessionTimer: false, minimumRoundDuration: 0,
};

export interface ActiveRound { book: unknown; roundId: number; mode: ModeId; baseBetMicros: number; resumeIndex: number }

export interface SessionInfo {
  balanceMicros: number;
  currency: string;
  betLevels: number[]; // base bets, micros
  defaultBetMicros: number;
  jurisdiction: Jurisdiction;
  activeRound: ActiveRound | null;
  /** cost multipliers announced by the RGS (betModes), when present */
  costs: Partial<Record<ModeId, number>>;
}

export interface PlayResult {
  book: unknown; // validated by the controller, never repaired
  balanceMicros: number; // after the debit, as given by the server
  roundId: number;
  active: boolean; // true = an end-round is required (payout to credit)
}

export type ErrorCode = 'ERR_IPB' | 'ERR_IS' | 'ERR_ATE' | 'ERR_GLE' | 'ERR_BNF' | 'ERR_BE' | 'ERR_UE' | 'ERR_GE' | 'ERR_SCR' | 'ERR_OPT' | 'ERR_VAL' | 'ERR_LOC' | 'ERR_MAINTENANCE' | 'NETWORK' | 'TIMEOUT' | 'INVALID_BOOK' | 'SESSION';

export class ProviderError extends Error {
  constructor(readonly code: ErrorCode, message: string = code, readonly uncertain = false) { super(message); this.name = 'ProviderError'; }
}

export interface Provider {
  readonly kind: 'local' | 'rgs' | 'replay';
  authenticate(): Promise<SessionInfo>;
  /** debit happens server side; `baseBetMicros` is the base bet, the mode carries the cost multiplier */
  play(mode: ModeId, baseBetMicros: number): Promise<PlayResult>;
  endRound(): Promise<{ balanceMicros: number }>;
  /** progress marker for resume (Stake /bet/event) */
  saveProgress(event: string): Promise<void>;
  balance(): Promise<number>;
}

export type { Book };
