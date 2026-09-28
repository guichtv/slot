import type { gsap } from 'gsap';
import type { Beat } from '../core/beat';
import type { EventOf, GameEvent, SymbolName } from '../contract/schema';
import { COLS } from '../contract/schema';
import { bookToMoney, bookToX, formatMoney, formatMult } from '../core/money';
import { math } from '../config/math';
import { T } from '../config/timings';
import type { Presenter } from './player';
import { RoundModel } from './model';

/**
 * Traduit chaque événement en mise en scène. Les gains affichés sont ceux du book (conversion monétaire seulement).
 * Les acteurs (grille, mascotte, décor, HUD, dialogues, son) sont injectés par la scène.
 */
export interface Stage {
  grid: {
    spin(speed: number, stagger: number): gsap.core.Timeline;
    anySpinning: boolean;
    land(board: SymbolName[][], tnt: Map<string, 'stick' | 'bundle' | 'keg'>, anticipation: number[], beat: Beat, opts: { gap: number; antiMs: number; onAnticipate?: (col: number) => void; quick?: () => boolean }): Promise<void>;
    setBoard(board: SymbolName[][], tnt: Map<string, 'stick' | 'bundle' | 'keg'>): void;
    presentWin(w: EventOf<'winInfo'>['wins'][number], amountText: string, beat: Beat): Promise<void>;
    endWinPresentation(beat: Beat): void;
    tumble(removed: Array<[number, number]>, newSymbols: SymbolName[][], board: SymbolName[][], tnt: Map<string, 'stick' | 'bundle' | 'keg'>, beat: Beat): Promise<void>;
    crackAll(instant?: boolean): void;
    viewAt(c: number, r: number): { react(): gsap.core.Timeline; land(s?: number): gsap.core.Timeline; sym: SymbolName } | undefined;
    cellCenter(c: number, r: number): { x: number; y: number };
    onColumnStop: ((col: number) => void) | null;
  };
  blast: {
    fuse(pos: [number, number], beat: Beat, ms?: number): Promise<void>;
    explode(area: EventOf<'blast'>['area'], giant: SymbolName, beat: Beat, opts?: { reduced?: boolean }): Promise<void>;
  };
  mascot: {
    perform(name: string, beat: Beat, arg?: unknown): Promise<void>;
    react(name: string): void;
  };
  camera: { zoomTo(f: number, x: number, y: number, d?: number): gsap.core.Timeline; reset(d?: number): gsap.core.Timeline };
  decor: { setDim(v: number): unknown; setAmbience(a: 'base' | 'bonus' | 'super', d?: number): gsap.core.Timeline; setMonument(stage: number, animate?: boolean): gsap.core.Timeline };
  ui: {
    setSpinWin(amount: number | null, label?: string): void;
    setFs(remaining: number | null, total?: number): void;
    plusFs(n: number, beat: Beat): Promise<void>;
    setMultiplier(value: number | null, beat: Beat | null, cause?: 'blast' | 'start'): Promise<void>;
    bonusIntro(kind: 'standard' | 'super', spins: number, beat: Beat): Promise<void>;
    bonusOutro(total: number, beat: Beat): Promise<void>;
    celebrate(amount: number, bet: number, beat: Beat, maxWin: boolean): Promise<void>;
    scatterCount(n: number): void;
  };
  sound: { play(name: string, opts?: { pitch?: number; volume?: number }): void; tension(on: boolean): void; ambience(a: 'base' | 'bonus' | 'super'): void };
  reducedMotion: boolean;
  turbo: number;
}

export class GamePresenter implements Presenter {
  bet = 1_000_000;
  /** vrai quand le spin a été lancé par le clic (le reveal arrive pendant le défilement) */
  spinStarted = false;
  quickStop = false;
  private scatterSeen = 0;

  constructor(private s: Stage) {}

  private money(bookAmount: number): string {
    return formatMoney(bookToMoney(bookAmount, this.bet));
  }

  private tntMap(m: RoundModel): Map<string, 'stick' | 'bundle' | 'keg'> {
    return m.tnt as Map<string, 'stick' | 'bundle' | 'keg'>;
  }

  restore(model: RoundModel): void {
    this.s.grid.setBoard(model.board, this.tntMap(model));
    if (model.fs.active) {
      this.s.decor.setAmbience(model.fs.bonus === 'super' ? 'super' : 'bonus', 0).progress(1);
      this.s.ui.setFs(model.fs.total - model.fs.current, model.fs.total);
      void this.s.ui.setMultiplier(model.globalMult > 1 ? model.globalMult : null, null);
    }
    this.s.ui.setSpinWin(model.roundWin ? bookToMoney(model.roundWin, this.bet) : null);
  }

  async present(e: GameEvent, prev: RoundModel, next: RoundModel, beat: Beat): Promise<void> {
    switch (e.type) {
      case 'reveal':
        return this.reveal(e, next, beat);
      case 'blast':
        return this.blast(e, beat);
      case 'winInfo':
        return this.winInfo(e, beat);
      case 'updateTumbleWin':
        this.s.ui.setSpinWin(bookToMoney(e.amount, this.bet));
        return;
      case 'tumbleBoard':
        this.s.sound.play('tumble');
        await this.s.grid.tumble(e.removed as Array<[number, number]>, e.newSymbols as SymbolName[][], next.board, this.tntMap(next), beat);
        return;
      case 'updateGlobalMult':
        this.s.sound.play('multUp', { pitch: 1 + Math.min(1, (e.globalMult - 2) * 0.05) });
        await this.s.ui.setMultiplier(e.globalMult, beat, e.cause);
        if (next.fs.active) {
          // la sculpture du Mount Buckmore avance avec le multiplicateur (cosmétique, valeur lue dans le book)
          const stageOf = (m: number) => Math.min(3, Math.floor((m - 1) / 3));
          if (stageOf(e.globalMult) > stageOf(prev.globalMult)) beat.fire(this.s.decor.setMonument(stageOf(e.globalMult)));
        }
        return;
      case 'setWin':
        return this.setWin(e, next, beat);
      case 'setTotalWin':
        if (next.fs.active) this.s.ui.setSpinWin(bookToMoney(e.amount, this.bet), 'total');
        return;
      case 'freeSpinTrigger':
        return this.fsTrigger(e, beat);
      case 'freeSpinRetrigger':
        this.s.sound.play('retrigger');
        await this.s.mascot.perform('cheer', beat);
        await this.s.ui.plusFs(e.extra, beat);
        this.s.ui.setFs(next.fs.total - next.fs.current, next.fs.total);
        return;
      case 'updateFreeSpin':
        this.s.ui.setFs(e.total - e.amount, e.total);
        await beat.wait(T.fs.between);
        return;
      case 'freeSpinEnd':
        return this.fsEnd(e, beat);
      case 'wincap':
        this.s.grid.endWinPresentation(beat);
        await this.s.ui.celebrate(bookToMoney(e.amount, this.bet), this.bet, beat, true);
        return;
      case 'finalWin':
        return;
    }
  }

  private async reveal(e: EventOf<'reveal'>, next: RoundModel, beat: Beat): Promise<void> {
    const g = this.s.grid;
    this.scatterSeen = 0;
    this.s.ui.scatterCount(0);
    if (!g.anySpinning) {
      g.spin(T.spin.speedCells, T.spin.stagger);
      this.s.sound.play('spinStart');
    }
    await beat.wait(this.spinStarted ? T.spin.minSpin * 0.4 : T.spin.minSpin);
    this.spinStarted = false;
    const board = next.board;
    let zoomed = false;
    g.onColumnStop = (col) => {
      this.s.sound.play('reelStop', { pitch: 0.96 + col * 0.02 });
      for (let r = 0; r < board[col]!.length; r++) {
        if (board[col]![r] === 'S') {
          this.scatterSeen++;
          this.s.ui.scatterCount(this.scatterSeen);
          this.s.sound.play('scatter', { pitch: 1 + (this.scatterSeen - 1) * 0.12 });
          g.viewAt(col, r)?.react();
          this.s.mascot.react(this.scatterSeen >= 2 ? 'scatterExcited' : 'scatter');
        }
      }
    };
    await g.land(board, this.tntMap(next), e.anticipation, beat, {
      gap: T.spin.gap,
      antiMs: T.spin.antiMs,
      quick: () => this.quickStop,
      onAnticipate: (col) => {
        if (!zoomed) {
          zoomed = true;
          this.s.sound.tension(true);
          this.s.mascot.react('anticipation');
          const c = g.cellCenter(col, 2);
          if (!this.s.reducedMotion) beat.fire(this.s.camera.zoomTo(T.spin.antiZoom, c.x, c.y, 1.4));
          // les Scatters présents réagissent
          for (let cc = 0; cc < col; cc++) for (let r = 0; r < 5; r++) if (board[cc]![r] === 'S') beat.fire(g.viewAt(cc, r)!.react());
        }
      },
    });
    g.onColumnStop = null;
    if (zoomed) {
      this.s.sound.tension(false);
      const success = next.scatterCount() >= 3;
      this.s.mascot.react(success ? 'anticipationWin' : 'anticipationLose');
      beat.fire(this.s.camera.reset(0.7));
    }
    this.quickStop = false;
  }

  private async blast(e: EventOf<'blast'>, beat: Beat): Promise<void> {
    // la mascotte déclenche la charge (performance articulée), puis la zone saute et se sculpte
    await this.s.mascot.perform('detonate', beat, { pos: e.tnt.pos, kind: e.tnt.kind });
    this.s.sound.play(e.tnt.kind === 'keg' ? 'blastBig' : 'blast');
    await this.s.blast.fuse(e.tnt.pos as [number, number], beat, 260);
    this.s.decor.setDim(0);
    await this.s.blast.explode(e.area, e.giant, beat, { reduced: this.s.reducedMotion });
    this.s.sound.play('carve');
    this.s.mascot.react('proud');
  }

  private async winInfo(e: EventOf<'winInfo'>, beat: Beat): Promise<void> {
    this.s.decor.setDim(1);
    this.s.sound.play('win', { pitch: 1 });
    const many = e.wins.length > 3;
    for (const w of e.wins) {
      const amount = w.mult && w.mult > 1 && w.baseWin !== undefined ? `${this.money(w.baseWin)} ${formatMult(w.mult)} = ${this.money(w.win)}` : this.money(w.win);
      this.s.sound.play(w.symbol.startsWith('H') || w.symbol === 'W' ? 'winHigh' : 'winLow');
      await this.s.grid.presentWin(w, amount, beat);
      if (many) break;
    }
    this.s.grid.endWinPresentation(beat);
    this.s.decor.setDim(0);
  }

  private async setWin(e: EventOf<'setWin'>, next: RoundModel, beat: Beat): Promise<void> {
    this.s.grid.crackAll();
    const x = bookToX(e.amount);
    const tier = math().celebrationTiersX[0] ?? 10;
    if (e.amount > 0) {
      if (x >= tier) await this.s.ui.celebrate(bookToMoney(e.amount, this.bet), this.bet, beat, false);
      else {
        this.s.mascot.react(x >= 2 ? 'goodWin' : 'smallWin');
        await beat.wait(next.fs.active ? 180 : 120);
      }
    }
    if (!next.fs.active) this.s.ui.setSpinWin(e.amount ? bookToMoney(e.amount, this.bet) : null);
  }

  private async fsTrigger(e: EventOf<'freeSpinTrigger'>, beat: Beat): Promise<void> {
    // reconnaissance du bonus : les Scatters réels réagissent ensemble, puis l'introduction
    this.s.sound.play('trigger');
    for (const [c, r] of e.positions) beat.fire(this.s.grid.viewAt(c, r)!.react());
    await this.s.mascot.perform('triggerCheer', beat);
    await beat.wait(500);
    await this.s.ui.bonusIntro(e.bonus, e.totalFs, beat);
    this.s.sound.ambience(e.bonus === 'super' ? 'super' : 'bonus');
    await beat.play(this.s.decor.setAmbience(e.bonus === 'super' ? 'super' : 'bonus', 1.4));
    this.s.ui.setFs(e.totalFs, e.totalFs);
    await this.s.ui.setMultiplier(1, beat, 'start');
  }

  private async fsEnd(e: EventOf<'freeSpinEnd'>, beat: Beat): Promise<void> {
    this.s.grid.crackAll();
    await this.s.ui.bonusOutro(bookToMoney(e.amount, this.bet), beat);
    // retour propre au jeu de base : ambiance, multiplicateur, compteur, sculpture
    this.s.ui.setFs(null);
    await this.s.ui.setMultiplier(null, beat);
    this.s.sound.ambience('base');
    beat.fire(this.s.decor.setMonument(0));
    await beat.play(this.s.decor.setAmbience('base', 1.2));
    this.s.ui.setSpinWin(bookToMoney(e.amount, this.bet));
  }
}

export const GRID_COLS = COLS;
