/**
 * Validateur de fixtures : contrôle, jamais calcul ni réparation.
 * - schéma zod + cohérences déclarées (src/contract/schema.ts : parseBook) ;
 * - positions existantes, symboles gagnants identiques (ou WILD), rouleaux consécutifs depuis la gauche ;
 * - ways déclaré = produit des cases par rouleau ; toutes les cases du symbole sur ces rouleaux sont incluses ;
 * - AUCUNE connexion visible non déclarée (BARNSTORM : 9 grilles montraient des groupes non payés) ;
 * - chutes : cases retirées = cases gagnantes, gravité et nouveaux symboles cohérents avec la grille déclarée ;
 * - explosions : TNT présente, zone de la bonne taille, dans la grille ;
 * - totaux : updateTumbleWin cumulés, setWin, setTotalWin, finalWin = payoutMultiplier ;
 * - free spins : déclencheur = Scatters visibles (3 standard, 4+ super), compteurs exacts ;
 * - multiplicateur global en bonus : +1 par explosion ; win = baseWin × mult.
 */
import { COLS, ROWS, parseBook, type Book, type GameEvent, type SymbolName } from '../../src/contract/schema';

type Sym = SymbolName;
const PAYING: Sym[] = ['L1', 'L2', 'L3', 'L4', 'H1', 'H2', 'H3', 'H4'];
const SIZE = { stick: 2, bundle: 3, keg: 4 } as const;

function contiguousReels(board: Sym[][], sym: Sym): number {
  let n = 0;
  for (let c = 0; c < COLS; c++) {
    const col = board[c] as Sym[];
    if (col.some((s) => s === sym || (sym !== 'W' && s === 'W'))) n++;
    else break;
  }
  return n;
}

export function validateBook(raw: unknown, opts: { maxWinX?: number } = {}): { book: Book | null; issues: string[] } {
  let book: Book;
  try {
    book = parseBook(raw);
  } catch (e) {
    const err = e as { message: string; issues?: string[] };
    return { book: null, issues: [err.message, ...(err.issues ?? [])] };
  }
  const issues: string[] = [];
  let board: Sym[][] = [];
  let tnt = new Map<string, string>();
  let lastWin: Extract<GameEvent, { type: 'winInfo' }> | null = null;
  let spinWin = 0;
  let roundWin = 0;
  let bonusWin = 0;
  let inFs = false;
  let mult = 1;
  let pendingWinCheck = false;
  let fsTriggered = false;
  let fsBonus: 'standard' | 'super' | null = null;
  let chains = new Map<number, Array<{ pos: [number, number]; area: { col: number; row: number; w: number; h: number } }>>();
  const pendingLinks = new Set<string>();
  let lastCarveCells = 0;
  let lastCarveChain = -1;
  const inArea = (a: { col: number; row: number; w: number; h: number }, p: [number, number]) => p[0] >= a.col && p[0] < a.col + a.w && p[1] >= a.row && p[1] < a.row + a.h;
  const at = (c: number, r: number) => (board[c] as Sym[] | undefined)?.[r];

  const checkNoUndeclared = (idx: number, declared: Extract<GameEvent, { type: 'winInfo' }> | null) => {
    for (const s of [...PAYING, 'W' as Sym]) {
      const n = contiguousReels(board, s);
      if (n >= 3) {
        const d = declared?.wins.find((w) => w.symbol === s);
        if (!d) issues.push(`#${idx}: connexion visible non déclarée ${s} sur ${n} rouleaux`);
        else if (d.reels !== n) issues.push(`#${idx}: ${s} déclaré sur ${d.reels} rouleaux, visible sur ${n}`);
      }
    }
  };

  for (const e of book.events) {
    switch (e.type) {
      case 'reveal': {
        if (pendingWinCheck) checkNoUndeclared(e.index, null);
        board = e.board.map((c) => c.map((s) => s.name));
        tnt = new Map(e.tnt.map((t) => [`${t.pos[0]},${t.pos[1]}`, t.kind]));
        for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
          const isT = at(c, r) === 'T';
          if (isT !== tnt.has(`${c},${r}`)) issues.push(`reveal#${e.index}: TNT ${c},${r} incohérente (case ${at(c, r)})`);
        }
        const perReel = board.map((col) => col.filter((s) => s === 'S').length);
        if (perReel.some((n) => n > 1)) issues.push(`reveal#${e.index}: plus d'un Scatter sur un rouleau`);
        // anticipation : seulement si les symboles révélés la justifient (au moins 2 Scatters avant le rouleau ralenti)
        e.anticipation.forEach((a, c) => {
          if (a > 0) {
            const before = perReel.slice(0, c).reduce((x, y) => x + y, 0);
            if (before < 2) issues.push(`reveal#${e.index}: anticipation au rouleau ${c} sans 2 Scatters avant`);
          }
        });
        spinWin = 0;
        lastWin = null;
        pendingWinCheck = true;
        chains = new Map();
        break;
      }
      case 'blast': {
        const k = `${e.tnt.pos[0]},${e.tnt.pos[1]}`;
        if (!tnt.has(k)) issues.push(`blast#${e.index}: aucune TNT en ${k}`);
        else if (tnt.get(k) !== e.tnt.kind) issues.push(`blast#${e.index}: type ${e.tnt.kind} ≠ ${tnt.get(k)}`);
        const n = SIZE[e.tnt.kind];
        if (e.area.w !== n || e.area.h !== n) issues.push(`blast#${e.index}: zone ${e.area.w}x${e.area.h} pour ${e.tnt.kind}`);
        const zones = chains.get(e.chain) ?? [];
        if (e.link !== zones.length) issues.push(`blast#${e.index}: lien ${e.link} attendu ${zones.length}`);
        if (e.link > 0) {
          if (e.wired) {
            if (fsBonus !== 'super') issues.push(`blast#${e.index}: charges reliées hors super bonus`);
          } else {
            const src = zones.find((z) => e.from && z.pos[0] === e.from[0] && z.pos[1] === e.from[1]);
            if (!src) issues.push(`blast#${e.index}: origine ${e.from} absente de la chaîne`);
            else if (!inArea(src.area, e.tnt.pos)) issues.push(`blast#${e.index}: la charge n'est pas dans la zone de ${e.from}`);
          }
        }
        for (let c = e.area.col; c < e.area.col + e.area.w; c++) for (let r = e.area.row; r < e.area.row + e.area.h; r++) {
          if (at(c, r) === 'S') issues.push(`blast#${e.index}: la zone détruit un Scatter en ${c},${r}`);
          const other = tnt.has(`${c},${r}`) && `${c},${r}` !== k;
          if (other && !pendingLinks.has(`${c},${r}`)) pendingLinks.add(`${c},${r}`);
        }
        tnt.delete(k);
        pendingLinks.delete(k);
        zones.push({ pos: e.tnt.pos, area: e.area });
        chains.set(e.chain, zones);
        break;
      }
      case 'carve': {
        const zones = chains.get(e.chain) ?? [];
        if (!zones.length) issues.push(`carve#${e.index}: chaîne ${e.chain} sans explosion`);
        else {
          const minC = Math.min(...zones.map((z) => z.area.col));
          const minR = Math.min(...zones.map((z) => z.area.row));
          const maxC = Math.max(...zones.map((z) => z.area.col + z.area.w));
          const maxR = Math.max(...zones.map((z) => z.area.row + z.area.h));
          if (e.area.col !== minC || e.area.row !== minR || e.area.w !== maxC - minC || e.area.h !== maxR - minR) issues.push(`carve#${e.index}: zone ≠ rectangle englobant de la chaîne`);
        }
        if (pendingLinks.size) issues.push(`carve#${e.index}: charges prises dans une zone mais non enchaînées : ${[...pendingLinks].join(' ')}`);
        for (let c = e.area.col; c < e.area.col + e.area.w; c++) for (let r = e.area.row; r < e.area.row + e.area.h; r++) {
          if (at(c, r) === 'S') issues.push(`carve#${e.index}: le géant recouvre un Scatter en ${c},${r}`);
          if (tnt.has(`${c},${r}`)) issues.push(`carve#${e.index}: une charge reste sous le géant en ${c},${r}`);
          (board[c] as Sym[])[r] = e.giant;
        }
        lastCarveCells = e.cells;
        lastCarveChain = e.chain;
        break;
      }
      case 'updateGlobalMult': {
        if (!inFs) issues.push(`mult#${e.index}: multiplicateur hors bonus`);
        if (e.cause === 'carve') {
          if (e.added !== lastCarveCells) issues.push(`mult#${e.index}: +${e.added} ≠ ${lastCarveCells} cases sculptées`);
          if (e.chain !== undefined && e.chain !== lastCarveChain) issues.push(`mult#${e.index}: chaîne ${e.chain} ≠ ${lastCarveChain}`);
          if (e.globalMult !== Math.min(9999, mult + lastCarveCells)) issues.push(`mult#${e.index}: ${mult} -> ${e.globalMult} (attendu +${lastCarveCells})`);
          lastCarveCells = 0;
        }
        mult = e.globalMult;
        break;
      }
      case 'winInfo': {
        pendingWinCheck = false;
        if (tnt.size) issues.push(`winInfo#${e.index}: des TNT n'ont pas explosé avant l'évaluation`);
        for (const w of e.wins) {
          const expected: string[] = [];
          const counts: number[] = [];
          for (let c = 0; c < w.reels; c++) {
            let n = 0;
            for (let r = 0; r < ROWS; r++) {
              const s = at(c, r);
              if (s === w.symbol || s === 'W') {
                expected.push(`${c},${r}`);
                n++;
              }
            }
            counts.push(n);
          }
          const got = new Set(w.positions.map((p) => `${p[0]},${p[1]}`));
          for (const p of got) {
            const [c, r] = p.split(',').map(Number) as [number, number];
            const s = at(c, r);
            if (s !== w.symbol && s !== 'W') issues.push(`winInfo#${e.index}: ${w.symbol} en ${p} mais la case contient ${s}`);
            if (c >= w.reels) issues.push(`winInfo#${e.index}: position ${p} hors des ${w.reels} rouleaux`);
          }
          for (const p of expected) if (!got.has(p)) issues.push(`winInfo#${e.index}: ${w.symbol} ${p} manquant dans positions`);
          if (counts.some((n) => n === 0)) issues.push(`winInfo#${e.index}: ${w.symbol} rouleaux non consécutifs`);
          const ways = counts.reduce((a, b) => a * b, 1);
          if (ways !== w.ways) issues.push(`winInfo#${e.index}: ${w.symbol} ways ${w.ways} ≠ ${ways}`);
          if (inFs && mult > 1 && w.mult !== mult) issues.push(`winInfo#${e.index}: ${w.symbol} mult ${w.mult ?? 1} ≠ multiplicateur ${mult}`);
          if (w.mult && w.mult > 1 && w.baseWin !== undefined && w.baseWin * w.mult !== w.win) issues.push(`winInfo#${e.index}: ${w.baseWin}×${w.mult} ≠ ${w.win}`);
          if (!inFs && w.mult && w.mult > 1) issues.push(`winInfo#${e.index}: multiplicateur hors bonus`);
        }
        checkNoUndeclared(e.index, e);
        lastWin = e;
        spinWin += e.totalWin;
        break;
      }
      case 'updateTumbleWin':
        if (e.amount !== spinWin) issues.push(`tumbleWin#${e.index}: ${e.amount} ≠ cumul ${spinWin}`);
        break;
      case 'tumbleBoard': {
        if (!lastWin) {
          issues.push(`tumble#${e.index}: chute sans gain`);
          break;
        }
        const winSet = new Set(lastWin.wins.flatMap((w) => w.positions.map((p) => `${p[0]},${p[1]}`)));
        const rm = new Set(e.removed.map((p) => `${p[0]},${p[1]}`));
        if (winSet.size !== rm.size || [...winSet].some((p) => !rm.has(p))) issues.push(`tumble#${e.index}: cases retirées ≠ cases gagnantes`);
        for (let c = 0; c < COLS; c++) {
          const survivors: Sym[] = [];
          for (let r = 0; r < ROWS; r++) if (!rm.has(`${c},${r}`)) survivors.push(at(c, r) as Sym);
          const add = e.newSymbols[c] as Sym[];
          const exp = [...add, ...survivors];
          const got = (e.board[c] ?? []).map((s) => s.name);
          if (exp.join() !== got.join()) issues.push(`tumble#${e.index}: colonne ${c} attendue ${exp.join(' ')} déclarée ${got.join(' ')}`);
        }
        board = e.board.map((c) => c.map((s) => s.name));
        tnt = new Map(e.tnt.map((t) => [`${t.pos[0]},${t.pos[1]}`, t.kind]));
        for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
          if ((at(c, r) === 'T') !== tnt.has(`${c},${r}`)) issues.push(`tumble#${e.index}: TNT ${c},${r} incohérente`);
        }
        lastWin = null;
        pendingWinCheck = true;
        chains = new Map();
        break;
      }
      case 'setWin':
        if (pendingWinCheck) checkNoUndeclared(e.index, null);
        pendingWinCheck = false;
        if (tnt.size) issues.push(`setWin#${e.index}: TNT non explosée en fin de spin`);
        if (e.amount !== spinWin) issues.push(`setWin#${e.index}: ${e.amount} ≠ gain du spin ${spinWin}`);
        roundWin += spinWin;
        if (inFs) bonusWin += spinWin;
        break;
      case 'setTotalWin':
        if (e.amount !== (inFs ? bonusWin : roundWin)) issues.push(`setTotalWin#${e.index}: ${e.amount} ≠ ${inFs ? bonusWin : roundWin}`);
        break;
      case 'freeSpinTrigger': {
        const sc: string[] = [];
        for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) if (at(c, r) === 'S') sc.push(`${c},${r}`);
        const got = e.positions.map((p) => `${p[0]},${p[1]}`);
        if (sc.join('|') !== got.join('|')) issues.push(`fsTrigger#${e.index}: positions ${got.join(' ')} ≠ Scatters visibles ${sc.join(' ')}`);
        if (e.bonus === 'standard' && sc.length !== 3 && !book.mode.startsWith('BONUS')) issues.push(`fsTrigger#${e.index}: standard avec ${sc.length} Scatters`);
        if (e.bonus === 'super' && sc.length < 4) issues.push(`fsTrigger#${e.index}: super avec ${sc.length} Scatters`);
        inFs = true;
        fsTriggered = true;
        fsBonus = e.bonus;
        mult = 1;
        bonusWin = roundWin;
        break;
      }
      case 'freeSpinRetrigger': {
        let n = 0;
        for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) if (at(c, r) === 'S') n++;
        if (n < 2) issues.push(`retrigger#${e.index}: ${n} Scatters visibles`);
        break;
      }
      case 'freeSpinEnd':
        if (e.amount !== bonusWin) issues.push(`fsEnd#${e.index}: ${e.amount} ≠ total bonus ${bonusWin}`);
        inFs = false;
        roundWin = bonusWin;
        break;
      case 'wincap':
        if (opts.maxWinX && e.amount !== opts.maxWinX * 100) issues.push(`wincap#${e.index}: ${e.amount} ≠ plafond ${opts.maxWinX * 100}`);
        roundWin = e.amount;
        bonusWin = e.amount;
        break;
      case 'finalWin':
        if (e.amount !== roundWin) issues.push(`finalWin#${e.index}: ${e.amount} ≠ total ${roundWin}`);
        break;
      default:
        break;
    }
  }
  const scattersAtStart = (book.events[0] as Extract<GameEvent, { type: 'reveal' }>).board.flat().filter((s) => s.name === 'S').length;
  if (scattersAtStart >= 3 && !fsTriggered) issues.push(`${scattersAtStart} Scatters sans déclenchement de bonus`);
  if (opts.maxWinX && book.payoutMultiplier > opts.maxWinX * 100) issues.push(`payout ${book.payoutMultiplier} > plafond`);
  return { book, issues };
}
