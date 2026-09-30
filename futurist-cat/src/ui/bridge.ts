// What the presenter asks from the HTML UI (implemented by ui/ui.ts).
export type IntroKind = 'nineLives' | 'doubleGaze' | 'scan' | 'doubleScan';
export type SpinPhase = 'idle' | 'spinning' | 'stopping' | 'resolving' | 'celebrating' | 'bonus' | 'locked';

export interface UiBridge {
  /** HUD win field: `total` = bonus total label (GAIN TOTAL), else spin win (GAIN) */
  setWin(micros: number, total?: boolean): void;
  setBalance(micros: number): void;
  /** "Spins restants : N" above the grid; null hides it */
  setSpinsLeft(n: number | null, pulse?: boolean): void;
  setPhase(p: SpinPhase): void;
  /** click-anywhere popups: resolve when shown; the caller waits for the (consumed) click */
  showIntro(kind: IntroKind, spins: number): HTMLElement;
  /** the punch tears the popup in two (<= 0.3 s after the click) */
  tearIntro(el: HTMLElement, reduced: boolean): Promise<void>;
  showBonusEnd(title: string, amountText: string): HTMLElement;
  updateBonusEnd(el: HTMLElement, amountText: string): void;
  closePopup(el: HTMLElement): Promise<void>;
  /** position of the spins counter in screen px (for the +N FS banner flight) */
  spinsCounterPos(): { x: number; y: number } | null;
  announce(text: string): void; // aria-live
}
