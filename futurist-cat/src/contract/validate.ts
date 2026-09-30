// Semantic checks of a book (shared by the front and tools/fixtures). It CHECKS, never repairs and
// never produces a value used for display: positions, ladder steps, chips, totals, order,
// counters, and "no undeclared winning way". An invalid scenario is reported, never fixed.
import { Book, type BookEvent } from './events';
import { COLS, isSpecial, stepUp, posKey, type SymbolId, type Pos } from './symbols';

export interface Issue { index: number; message: string }
export interface ValidateOptions { maxWinX?: number }

export function validateBook(raw: unknown, opts: ValidateOptions = {}): { ok: boolean; issues: Issue[]; book: Book | null } {
  const parsed = Book.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, book: null, issues: parsed.error.issues.slice(0, 12).map((i) => ({ index: typeof i.path[1] === 'number' ? (i.path[1] as number) : -1, message: `${i.path.join('.')}: ${i.message}` })) };
  }
  const book = parsed.data;
  const issues: Issue[] = [];
  const bad = (e: BookEvent | { index: number }, m: string) => issues.push({ index: e.index, message: m });
  let board: SymbolId[][] | null = null;
  const chips = new Map<string, number>();
  const mults = new Map<string, number>();
  let spinWin = 0, roundTotal = 0, bonusTotal = 0;
  let inBonus = false, fsTotal = 0, fsPlayed = 0, capped = false, finalSeen = false;
  let winInfoThisSpin = false;
  const at = (p: Pos): SymbolId | undefined => board?.[p[0]]?.[p[1]];

  book.events.forEach((e, i) => {
    if (e.index !== i) bad(e, `index ${e.index} attendu ${i}`);
    if (finalSeen) bad(e, 'evenement apres finalWin');
    if (capped && !['freeSpinEnd', 'finalWin', 'setTotalWin', 'setWin'].includes(e.type)) bad(e, `${e.type} apres wincap`);
    switch (e.type) {
      case 'featureStart':
        if (!['SCAN', 'DOUBLE_SCAN'].includes(book.mode)) bad(e, `featureStart en mode ${book.mode}`);
        if ((book.mode === 'SCAN' ? 1 : 2) !== e.dots) bad(e, 'nombre de points incoherent avec le mode');
        break;
      case 'reveal': {
        board = e.board.map((c) => [...c]);
        mults.clear();
        spinWin = 0; winInfoThisSpin = false;
        if (e.gameType === 'freegame' && !inBonus) bad(e, 'reveal freegame hors bonus');
        if (e.gameType === 'basegame' && inBonus) bad(e, 'reveal basegame pendant le bonus');
        if (e.padding) for (const s of [...e.padding.top, ...e.padding.bottom]) if (s === 'W') bad(e, 'Wild dans le padding (faux Wild au defilement)');
        break;
      }
      case 'chipUpgrade': {
        if (!inBonus || !board) { bad(e, 'chipUpgrade hors bonus'); break; }
        // every non-special symbol below H4 that landed on a chip must arrive upgraded (and be listed)
        const required = new Set<string>();
        for (const [k, lvl] of chips) {
          const [c, r] = k.split(',').map(Number) as [number, number];
          const s0 = board[c]![r]!;
          if (lvl > 0 && !isSpecial(s0) && s0 !== 'H4') required.add(k);
        }
        for (const u of e.upgrades) {
          const k = posKey(u.pos);
          required.delete(k);
          if ((chips.get(k) ?? 0) !== u.level) bad(e, `puce ${k} niveau ${u.level} != ${chips.get(k) ?? 0}`);
          if (at(u.pos) !== u.from) bad(e, `chipUpgrade ${k} from ${u.from} != ${at(u.pos)}`);
          if (isSpecial(u.from)) bad(e, `chipUpgrade sur ${u.from}`);
          if (stepUp(u.from, u.level) !== u.to) bad(e, `chipUpgrade ${k} ${u.from}+${u.level} != ${u.to}`);
          board[u.pos[0]]![u.pos[1]] = u.to;
        }
        for (const k of required) bad(e, `symbole sur la puce ${k} non monte`);
        break;
      }
      case 'overclock':
        if (!inBonus) bad(e, 'overclock hors bonus');
        for (const c of e.chips) chips.set(posKey(c.pos), c.level);
        break;
      case 'laserDot': {
        if (!board) { bad(e, 'laserDot avant reveal'); break; }
        const seen = new Set<string>();
        if (e.upgrades.length !== e.path.length) bad(e, `upgrades (${e.upgrades.length}) != chemin (${e.path.length})`);
        e.path.forEach((p, k) => {
          const key = posKey(p);
          if (seen.has(key)) bad(e, `case ${key} visitee deux fois`);
          seen.add(key);
          const s = at(p);
          if (s === 'W' || s === 'S') bad(e, `le point touche ${s} en ${key}`);
          const u = e.upgrades[k];
          if (!u) return;
          if (posKey(u.pos) !== key) bad(e, `upgrade ${k} en ${posKey(u.pos)} au lieu de ${key}`);
          if (u.from !== s) bad(e, `upgrade ${key} from ${u.from} != ${s}`);
          if (stepUp(u.from) !== u.to) bad(e, `upgrade ${key} ${u.from} -> ${u.to} (un cran attendu)`);
          if (u.to === 'W' || u.to === 'S') bad(e, 'le point cree un special');
          board![p[0]]![p[1]] = u.to;
        });
        if (e.mult) {
          const last = e.path[e.path.length - 1]!;
          if (posKey(e.mult.pos) !== posKey(last)) bad(e, 'multiplicateur hors case d arrivee');
          mults.set(posKey(e.mult.pos), e.mult.value);
        }
        if (e.chips) {
          if (!inBonus) bad(e, 'puces hors bonus');
          for (const c of e.chips) {
            const k = posKey(c.pos), prev = chips.get(k) ?? 0;
            if (!seen.has(k)) bad(e, `puce ${k} hors chemin`);
            if (c.level !== Math.min(3, prev + 1)) bad(e, `puce ${k} niveau ${c.level} (avant ${prev})`);
            chips.set(k, c.level);
          }
        }
        break;
      }
      case 'winInfo': {
        if (!board) { bad(e, 'winInfo avant reveal'); break; }
        winInfoThisSpin = true;
        let sum = 0;
        for (const w of e.wins) {
          sum += w.win;
          if (w.meta.baseWin * w.meta.mult !== w.win) bad(e, `${w.symbol}: ${w.meta.baseWin} x${w.meta.mult} != ${w.win}`);
          const cols = new Set(w.positions.map((p) => p[0]));
          if (cols.size !== w.kind) bad(e, `${w.symbol}: kind ${w.kind} != colonnes ${cols.size}`);
          for (let c = 0; c < w.kind; c++) if (!cols.has(c)) bad(e, `${w.symbol}: colonne ${c} manquante`);
          for (const p of w.positions) { const s = at(p); if (s !== w.symbol && s !== 'W') bad(e, `${w.symbol}: ${posKey(p)} porte ${s}`); }
          for (const p of w.meta.multPositions ?? []) {
            if (!mults.has(posKey(p))) bad(e, `${w.symbol}: ${posKey(p)} sans multiplicateur`);
            if (!w.positions.some((q) => posKey(q) === posKey(p))) bad(e, `${w.symbol}: multiplicateur ${posKey(p)} hors des positions`);
          }
          if (w.meta.mult > 1 && !(w.meta.multPositions?.length)) bad(e, `${w.symbol}: mult ${w.meta.mult} sans multPositions`);
        }
        if (sum !== e.totalWin) bad(e, `totalWin ${e.totalWin} != somme ${sum}`);
        spinWin = e.totalWin;
        // undeclared winning ways (presence only)
        const declared = new Set(e.wins.map((w) => w.symbol));
        for (const s of undeclared(board)) if (!declared.has(s)) bad(e, `way gagnante non declaree : ${s}`);
        break;
      }
      case 'setWin':
        {
          const want = winInfoThisSpin ? spinWin : 0;
          const capNext = book.events.slice(i + 1, i + 4).some((x) => x.type === 'wincap');
          if (capNext ? e.amount > want : e.amount !== want) bad(e, `setWin ${e.amount} != gain du spin ${want}`);
        }
        if (board && !winInfoThisSpin) { for (const s of undeclared(board)) bad(e, `way gagnante non declaree : ${s}`); }
        roundTotal += e.amount;
        if (inBonus) bonusTotal += e.amount;
        break;
      case 'setTotalWin':
        if (e.amount !== roundTotal) bad(e, `setTotalWin ${e.amount} != cumul ${roundTotal}`);
        break;
      case 'freeSpinTrigger': {
        if (inBonus) bad(e, 'freeSpinTrigger pendant le bonus');
        for (const p of e.positions) if (at(p) !== 'S') bad(e, `Scatter attendu en ${posKey(p)}`);
        inBonus = true; fsTotal = e.totalFs; fsPlayed = 0; chips.clear();
        const want = e.bonus === 'doubleGaze' ? ['BASE', 'ANTE', 'SUPER'] : ['BASE', 'ANTE', 'BONUS'];
        if (!want.includes(book.mode)) bad(e, `bonus ${e.bonus} en mode ${book.mode}`);
        break;
      }
      case 'updateFreeSpin':
        if (!inBonus) bad(e, 'updateFreeSpin hors bonus');
        if (e.amount !== fsPlayed + 1) bad(e, `spin ${e.amount} attendu ${fsPlayed + 1}`);
        if (e.total !== fsTotal) bad(e, `total ${e.total} != ${fsTotal}`);
        fsPlayed = e.amount;
        break;
      case 'freeSpinRetrigger':
        if (e.totalFs !== fsTotal + e.added) bad(e, `retrigger ${e.totalFs} != ${fsTotal}+${e.added}`);
        for (const p of e.positions) if (at(p) !== 'S') bad(e, `Scatter attendu en ${posKey(p)}`);
        fsTotal = e.totalFs;
        break;
      case 'freeSpinEnd':
        if (!inBonus) bad(e, 'freeSpinEnd hors bonus');
        if (!capped && fsPlayed !== fsTotal) bad(e, `bonus termine a ${fsPlayed}/${fsTotal}`);
        if (e.amount !== bonusTotal) bad(e, `freeSpinEnd ${e.amount} != total bonus ${bonusTotal}`);
        inBonus = false; chips.clear();
        break;
      case 'updateGlobalMult':
        break;
      case 'wincap':
        if (opts.maxWinX && e.amount !== opts.maxWinX * 100) bad(e, `wincap ${e.amount} != ${opts.maxWinX * 100}`);
        capped = true;
        break;
      case 'finalWin':
        finalSeen = true;
        if (e.amount !== book.payoutMultiplier) bad(e, `finalWin ${e.amount} != payoutMultiplier ${book.payoutMultiplier}`);
        if (!capped && e.amount !== roundTotal) bad(e, `finalWin ${e.amount} != somme des spins ${roundTotal}`);
        if (inBonus) bad(e, 'finalWin avant freeSpinEnd');
        break;
    }
  });
  if (!finalSeen) issues.push({ index: book.events.length, message: 'finalWin manquant' });
  const last = book.events[book.events.length - 1];
  if (last && last.type !== 'finalWin') issues.push({ index: last.index, message: 'le dernier evenement doit etre finalWin' });
  return { ok: issues.length === 0, issues, book };
}

/** symbols forming at least one 3+ reel way from the left (W substitutes, S excluded) */
export function undeclared(board: SymbolId[][]): SymbolId[] {
  const out: SymbolId[] = [];
  const candidates = new Set(board[0]!.filter((s) => s !== 'S'));
  for (const s of candidates) {
    let k = 0;
    for (let c = 0; c < COLS; c++) {
      if (board[c]!.some((x) => x === s || (x === 'W' && s !== 'W'))) k++; else break;
    }
    if (k >= 3) out.push(s);
  }
  return out;
}
