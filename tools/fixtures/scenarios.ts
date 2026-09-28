/**
 * Scénarios de fixtures (montants illustratifs, centièmes de mise : 100 = ×1).
 * Symboles : L1 casque, L2 pioche, L3 lanterne, L4 gourde, H1 raton artificier, H2 élan, H3 loutre, H4 pic-vert,
 *            W caisse WILD, S charge SCATTER, T bâton de TNT.
 * Grilles écrites ligne par ligne (5 lignes × 5 colonnes).
 *
 * Montants : chaque connexion vaut paytable[symbole][rouleaux] × ways (public/game-math-config.json),
 * × multiplicateur global courant en free spins (helper pay). Les ways passés à pay sont ceux de la grille ;
 * tests/fixtures.test.ts recontrôle win = table × ways (× mult) sur les books construits.
 * Chaque grille révélée est propre à un seul tour d'une seule fixture (aucune grille recopiée d'un book à l'autre).
 */
import cfg from '../../public/game-math-config.json';
import { BookBuilder, type WinDecl } from './kit';

type Make = () => BookBuilder;
/** un free spin complet : fsSpin -> reveal -> ... -> endSpin */
type Spin = (b: BookBuilder) => BookBuilder;
type PaySym = WinDecl['symbol'];
type Meta = { weight: number; tags: string[]; note: string; cost?: number };

const PAYTABLE = cfg.paytable as unknown as Record<PaySym, Record<string, number>>;
const MAX_WIN = cfg.maxWinX * 100;
const STD_FS = cfg.freeSpins.standard.spins;
const SUPER_FS = cfg.freeSpins.super.spins;
const RETRIGGER_FS = cfg.freeSpins.standard.retrigger.spins;

/** Relance : table freeSpins.<bonus>.retriggers ({ "2": 2, "3": 5, "4": 8 }, le dernier palier vaut « N ou plus »). */
function retriggerSpins(bonus: 'standard' | 'super', scatters: number): number {
  const table = cfg.freeSpins[bonus].retriggers as Record<string, number>;
  const top = Math.max(...Object.keys(table).map(Number));
  const spins = table[String(Math.min(scatters, top))];
  if (spins === undefined) throw new Error(`relance : ${bonus} avec ${scatters} Scatters`);
  return spins;
}

/** Connexion : table × ways, puis × multiplicateur global courant (bonus) avec baseWin. */
function pay(b: BookBuilder, symbol: PaySym, reels: 3 | 4 | 5, ways: number): WinDecl {
  const unit = PAYTABLE[symbol]?.[String(reels)];
  if (unit === undefined) throw new Error(`paytable : ${symbol} ${reels}`);
  const baseWin = unit * ways;
  const mult = b.multiplier;
  return mult > 1 ? { symbol, reels, win: baseWin * mult, mult, baseWin } : { symbol, reels, win: baseWin };
}

function fixture(id: string, mode: string, meta: Meta, script: (b: BookBuilder) => BookBuilder): Make {
  const make = () => script(new BookBuilder(id, mode, meta));
  Object.defineProperty(make, 'name', { value: id });
  return make;
}

/** Joue la liste de free spins puis clôt le bonus. */
function freeSpins(b: BookBuilder, spins: Spin[]): BookBuilder {
  for (const s of spins) s(b);
  return b.fsEnd();
}

/** free spin sans gain (anticipation seulement si 2 Scatters sont tombés sur les rouleaux précédents) */
const lose =
  (board: string, opts: { anticipation?: number[] } = {}): Spin =>
  (b) =>
    b.fsSpin().reveal(board, opts).endSpin();

// ---------------------------------------------------------------------------------------------
// BASE
// ---------------------------------------------------------------------------------------------

const F01 = fixture('F01', 'BASE', { weight: 8, tags: ['loss'], note: 'perte sèche' }, (b) =>
  b
    .reveal(`
    L1 L2 H3 L4 H1
    H2 L3 L1 H4 L2
    L4 H1 L2 L1 S
    L3 H4 H2 L2 L3
    H3 L4 H1 H2 L4
  `)
    .endSpin(),
);

const F02 = fixture('F02', 'BASE', { weight: 5, tags: ['small'], note: 'petit gain L1 sur 4 rouleaux, 2 ways (x0,50)' }, (b) =>
  b
    .reveal(`
    H2 S  L1 L1 L4
    L1 H1 H2 L3 H3
    H2 L2 H1 H4 L3
    H4 H1 L2 L1 H3
    H2 L1 L3 L4 L2
  `)
    .wins([pay(b, 'L1', 4, 2)])
    .tumble(['L3', 'L2', 'L2', 'L2 L2', ''])
    .endSpin(),
);

const F03 = fixture('F03', 'BASE', { weight: 4, tags: ['small', 'multi-win'], note: 'trois connexions à la fois : H2, L1, L4' }, (b) =>
  b
    .reveal(`
    H2 L4 H2 H3 H1
    L1 H1 L1 L1 L3
    H3 H2 H2 L2 H2
    L4 L1 L4 H4 L2
    S  L2 H4 L3 H4
  `)
    .wins([pay(b, 'H2', 3, 2), pay(b, 'L1', 4, 1), pay(b, 'L4', 3, 1)])
    .tumble(['L3 L1 H4', 'L4 H2 L4', 'L2 H1 L3 H3', 'H1', ''])
    .endSpin(),
);

const F04 = fixture('F04', 'BASE', { weight: 2, tags: ['premium', 'H1', '5-reels'], note: 'raton H1 sur 5 rouleaux (x5)' }, (b) =>
  b
    .reveal(`
    L3 L2 H4 L1 H1
    H1 L4 H1 L3 L1
    H2 H3 L2 H1 H4
    L1 H1 L3 H2 L3
    H4 L4 S  L4 H3
  `)
    .wins([pay(b, 'H1', 5, 1)])
    .tumble(['L1', 'H3', 'H2', 'H1', 'L1'])
    .endSpin(),
);

const F05 = fixture('F05', 'BASE', { weight: 3, tags: ['premium', 'H2'], note: 'élan H2 sur 4 rouleaux, 2 ways (x2)' }, (b) =>
  b
    .reveal(`
    L1 L4 H2 L3 L4
    H2 L2 L4 H4 H1
    L3 H2 S  L2 H3
    H2 H3 L1 H2 L2
    H4 H1 H3 L1 L3
  `)
    .wins([pay(b, 'H2', 4, 2)])
    .tumble(['H2 L1', 'L2', 'H4', 'H1', ''])
    .endSpin(),
);

const F06 = fixture('F06', 'BASE', { weight: 4, tags: ['premium', 'H3', 'small'], note: 'loutre H3 sur 3 rouleaux, 3 ways (x0,90)' }, (b) =>
  b
    .reveal(`
    L2 H3 L3 H1 L3
    H3 L1 H3 L4 H2
    L4 H3 H4 L2 L1
    H1 H2 L1 H4 L4
    L2 H3 S  L1 H4
  `)
    .wins([pay(b, 'H3', 3, 3)])
    .tumble(['L4', 'L3 H4 L1', 'H2', '', ''])
    .endSpin(),
);

const F07 = fixture('F07', 'BASE', { weight: 3, tags: ['premium', 'H4'], note: 'pic-vert H4 sur 4 rouleaux, 2 ways (x1,20)' }, (b) =>
  b
    .reveal(`
    L1 H4 L2 H4 L3
    H3 L3 H4 L1 H2
    H4 H1 L3 H2 L1
    L2 H4 S  L4 H1
    L1 L4 H2 H3 L4
  `)
    .wins([pay(b, 'H4', 4, 2)])
    .tumble(['H2', 'L4 H1', 'L1', 'H1', ''])
    .endSpin(),
);

const F08 = fixture('F08', 'BASE', { weight: 3, tags: ['cascade', 'chain'], note: 'réaction en chaîne : L2, H4, H1 (3 chutes)' }, (b) =>
  b
    .reveal(`
    H2 L4 L2 H2 L3
    L2 H3 H1 L3 H1
    L3 L2 L4 H4 L4
    H4 H1 L1 L4 H3
    L1 S  H3 L1 H2
  `)
    .wins([pay(b, 'L2', 3, 1)])
    .tumble(['H4', 'H4', 'H4', '', ''])
    .wins([pay(b, 'H4', 4, 2)])
    .tumble(['H1 H1', 'L2', 'H2', 'L2', ''])
    .wins([pay(b, 'H1', 3, 2)])
    .tumble(['H4 L1', 'H1', 'L3', '', ''])
    .endSpin(),
);

const F09 = fixture('F09', 'BASE', { weight: 3, tags: ['tnt', 'stick', 'giant'], note: 'bâton de TNT -> géant H2 2x2 sur les rouleaux 1-2' }, (b) =>
  b
    .reveal(
      `
    H4 H4 L2 L4 L1
    L4 H4 L1 L4 H2
    H2 H3 H1 H4 H3
    T  L4 H2 L1 H4
    L1 H1 L3 L1 H4
  `,
      { tnt: [[0, 3, 'stick']] },
    )
    .blast([0, 3], 'H2', [0, 2])
    .wins([pay(b, 'H2', 3, 4)])
    .tumble(['L3 H3', 'H3 L2', 'L1', '', ''])
    .endSpin(),
);

const F10 = fixture('F10', 'BASE', { weight: 2, tags: ['tnt', 'bundle', 'giant', 'big-win'], note: 'fagot de TNT -> géant H1 3x3, 27 ways (x13,50)' }, (b) =>
  b
    .reveal(
      `
    L2 H3 L3 H2 L1
    L1 L4 H2 L3 H3
    H2 T  L1 L4 H1
    L3 H4 L4 L1 L4
    H4 L2 S  H4 L3
  `,
      { tnt: [[1, 2, 'bundle']] },
    )
    .blast([1, 2], 'H1', [0, 1])
    .wins([pay(b, 'H1', 3, 27)])
    .tumble(['L1 H3 L4', 'H2 L3 H2', 'H2 L1 H4', '', ''])
    .endSpin(),
);

const F11 = fixture(
  'F11',
  'BASE',
  { weight: 2, tags: ['tnt', 'multi-tnt', 'tnt-drop', 'cascade'], note: 'deux bâtons dans la même étape, puis un bâton tombe pendant la chute' },
  (b) =>
    b
      .reveal(
        `
    L2 T  H4 L4 H1
    H4 L1 L3 H2 L3
    L4 H1 L1 L3 H2
    T  H2 S  L2 L2
    L3 L1 H2 L1 L4
  `,
        {
          tnt: [
            [0, 3, 'stick'],
            [1, 0, 'stick'],
          ],
        },
      )
      .blast([1, 0], 'H3', [1, 0])
      .blast([0, 3], 'H3', [0, 3])
      .wins([pay(b, 'H3', 3, 16)])
      .tumble(['L3 H2', 'L1 H4 H1 L1', 'T L4', '', ''], { tnt: [[2, 0, 'stick']] })
      .blast([2, 0], 'H4', [2, 0])
      .wins([pay(b, 'H4', 4, 4)])
      .tumble(['H4', 'H3', 'L3 H3', 'H1 L4', ''])
      .endSpin(),
);

const F12 = fixture('F12', 'BASE', { weight: 2, tags: ['tnt', 'stick', 'giant', 'wild'], note: 'bâton -> géant WILD 2x2 qui relie H2 et L4' }, (b) =>
  b
    .reveal(
      `
    L4 L3 H1 L2 H3
    H2 H2 L1 L3 L1
    H2 T  L3 H4 L3
    S  L1 H3 L1 H2
    L4 H4 L2 H1 H4
  `,
      { tnt: [[1, 2, 'stick']] },
    )
    .blast([1, 2], 'W', [1, 2])
    .wins([pay(b, 'H2', 3, 12), pay(b, 'L4', 3, 8)])
    .tumble(['H1 L2 L1 H3', 'L4 H2 L4', 'H3 L3', '', ''])
    .endSpin(),
);

const F13 = fixture('F13', 'BASE', { weight: 3, tags: ['anticipation', 'near-miss', 'loss'], note: 'anticipation ratée : 2 Scatters, rouleaux 4-5 ralentis, pas de 3e' }, (b) =>
  b
    .reveal(
      `
    H3 L2 L4 H1 L3
    S  H1 H2 L4 H2
    L1 L3 L2 H4 L1
    H2 H4 S  L3 H4
    L4 H1 H3 L1 L2
  `,
      { anticipation: [0, 0, 0, 1, 2] },
    )
    .endSpin(),
);

/** F14 : 10 free spins + relance au 6e tour (15), bâtons et fagot, Cornerstone ×1 -> ×26 (+1 par case sculptée), dernier tour sans gain */
const F14_FS: Spin[] = [
  // 1 : sans gain
  lose(`
      H4 L2 L4 L1 L1
      L3 L3 L4 H3 L1
      L4 L3 L1 H1 H1
      L4 L1 H2 S  H4
      H4 H3 L4 L4 L4
    `),
  // 2 : bâton -> géant H3 2x2 (Cornerstone ×5)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      H4 H1 L2 H4 L4
      L1 H3 L3 H4 H3
      H3 L4 H1 L3 H4
      L3 L3 T  L1 H2
      L1 L1 L4 H2 L1
      `, { tnt: [[2, 3, 'stick']] })
      .blast([2, 3], 'H3', [1, 2])
      .wins([pay(b, 'H3', 3, 6)])
      .tumble(['L1', 'H4 L2 L4', 'L4 L3', '', ''])
      .endSpin(),
  // 3 : sans gain
  lose(`
      L1 H4 H4 L3 L2
      L1 L4 H4 L3 L2
      L1 L4 L2 H2 L1
      H1 H4 L3 L2 H4
      L2 L3 L2 H2 H3
    `),
  // 4 : petit gain L2
  (b) =>
    b
      .fsSpin()
      .reveal(`
      H1 H1 L4 H2 H4
      L1 H2 L2 H2 L2
      L3 H4 L2 L3 L4
      S  L2 L2 H3 H2
      L2 L4 H4 H2 L1
      `)
      .wins([pay(b, 'L2', 3, 3)])
      .tumble(['H2', 'H1', 'L1 H3 L2', '', ''])
      .endSpin(),
  // 5 : fagot -> géant H4 3x3 (×14)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      H4 H2 L2 H1 H3
      L3 L4 L3 L3 H2
      L3 H4 H3 L4 L2
      L2 L3 H4 L3 S
      H3 H4 T  L2 H3
      `, { tnt: [[2, 4, 'bundle']] })
      .blast([2, 4], 'H4', [0, 2])
      .wins([pay(b, 'H4', 3, 36)])
      .tumble(['L3 L3 L2 H3', 'H4 L4 H4', 'L1 L2 L4', '', ''])
      .endSpin(),
  // 6 : 2 Scatters, rouleaux 4-5 ralentis, le 3e Scatter tombe au rouleau 5 -> +5 free spins (10 -> 15)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L2 S  L3 L4 L1
      H2 L2 H4 H3 H1
      L3 L1 S  L1 L3
      L3 H1 L3 H2 S
      L4 L1 H2 L2 L4
      `, { anticipation: [0, 0, 0, 1, 2] })
      .endSpin()
      .fsRetrigger(RETRIGGER_FS),
  // 7 : sans gain
  lose(`
      L3 H1 H1 H2 L2
      L4 L2 L1 L2 H4
      S  L2 L2 L2 H4
      L4 L2 L3 L2 H4
      L3 H4 H2 L3 L3
    `),
  // 8 : bâton -> géant H1 2x2 sans connexion, le Cornerstone monte (×18)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      H4 H3 L2 H3 L2
      L2 H4 H2 T  H1
      L1 H2 H3 L2 L4
      H1 H2 L2 L4 H4
      L1 L3 H2 H3 L2
      `, { tnt: [[3, 1, 'stick']] })
      .blast([3, 1], 'H1', [3, 1])
      .endSpin(),
  // 9 : H1 puis cascade L4
  (b) =>
    b
      .fsSpin()
      .reveal(`
      H3 H1 S  L3 H4
      H1 H1 H4 H2 H2
      H3 H1 L3 L3 L2
      L4 L2 H1 L3 H1
      H2 L1 L1 L2 L1
      `)
      .wins([pay(b, 'H1', 3, 3)])
      .tumble(['H3', 'L4 L3 L2', 'L4', '', ''])
      .wins([pay(b, 'L4', 3, 1)])
      .tumble(['H1', 'L2', 'L3', '', ''])
      .endSpin(),
  // 10 : deux bâtons -> deux géants H2 (×22 puis ×26)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L4 H1 L4 L3 L3
      T  L4 L3 H1 H2
      L1 H2 L1 H3 L1
      L2 H1 H2 L1 L1
      L1 T  H1 L2 H2
      `, { tnt: [[0, 1, 'stick'], [1, 4, 'stick']] })
      .blast([0, 1], 'H2', [0, 0])
      .blast([1, 4], 'H2', [1, 3])
      .wins([pay(b, 'H2', 3, 20)])
      .tumble(['L2 H4', 'L4 H4 H2 L3 H1', 'L3 L4', '', ''])
      .endSpin(),
  // 11 : sans gain
  lose(`
      H3 L2 L2 L2 H4
      H4 H2 L1 L4 L1
      L1 H4 L3 H3 S
      H2 H1 L4 H4 L1
      H2 L3 L1 L3 H3
    `),
  // 12 : H4 sur 4 rouleaux
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L2 L4 L1 L3 L1
      L4 L2 L3 L1 L2
      H1 L1 L3 L3 L2
      H4 H4 H2 H4 L4
      H2 L4 H4 L1 H3
      `)
      .wins([pay(b, 'H4', 4, 1)])
      .tumble(['L2', 'L1', 'L1', 'L2', ''])
      .endSpin(),
  // 13 : sans gain
  lose(`
      H1 L4 L3 L2 L2
      L2 L1 L1 H2 H2
      L4 L4 L3 L4 L3
      H2 L1 H2 L2 H2
      L2 H4 L1 L3 H4
    `),
  // 14 : petit gain L3
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L3 H2 H2 L2 H1
      L4 H1 L3 L1 L3
      L1 H1 L1 H2 H1
      L4 L2 H4 H3 L2
      H4 L3 H2 S  L4
      `)
      .wins([pay(b, 'L3', 3, 1)])
      .tumble(['L3', 'L3', 'H3', '', ''])
      .endSpin(),
  // 15 : dernier tour, sans gain
  lose(`
      H2 H4 L2 L1 L2
      L3 H3 H4 L2 L2
      L2 H3 H1 H1 H2
      H2 S  L3 L1 L1
      L4 L4 L2 L1 L1
    `),
];

const F14 = fixture(
  'F14',
  'BASE',
  {
    weight: 1,
    tags: ['anticipation', 'bonus', 'standard', 'tnt', 'multiplier', 'retrigger'],
    note: 'anticipation réussie -> bonus standard : explosions, Cornerstone ×26, relance +5 (15 FS)',
  },
  (b) =>
    freeSpins(
      b
        .reveal(
          `
    L2 H3 S  L4 H2
    H4 L1 L3 H3 L4
    S  H2 H1 L1 L3
    L3 L4 L2 H4 S
    H1 L1 H4 L2 H3
  `,
          { anticipation: [0, 0, 0, 1, 2] },
        )
        .endSpin()
        .fsTrigger('standard', STD_FS),
      F14_FS,
    ),
);

/** F15 : 12 free spins du super bonus (fagots et caisse uniquement), Cornerstone ×1 -> ×44 */
const F15_FS: Spin[] = [
  // 1 : sans gain
  lose(`
      L1 H2 S  L4 L2
      L4 L1 H4 L1 L1
      H1 L4 H4 H3 L4
      H4 L1 L3 H3 L1
      H2 H3 L2 L2 H2
    `),
  // 2 : fagot -> géant H2 3x3 (Cornerstone ×10)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L2 L4 L2 L1 L3
      L4 L1 H4 L3 L1
      H3 H2 H2 L3 H3
      H3 T  L3 L4 L3
      H4 H1 L2 L4 H4
      `, { tnt: [[1, 3, 'bundle']] })
      .blast([1, 3], 'H2', [0, 1])
      .wins([pay(b, 'H2', 3, 27)])
      .tumble(['L3 L3 H1', 'L4 L1 H3', 'H3 L3 L1', '', ''])
      .endSpin(),
  // 3 : sans gain
  lose(`
      L4 L2 L1 L2 H3
      L1 L4 L2 L4 L2
      H4 L4 L3 L1 H2
      L4 H2 H4 L2 L2
      L4 L2 L2 H3 L1
    `),
  // 4 : petit gain L1
  (b) =>
    b
      .fsSpin()
      .reveal(`
      H2 L1 L3 H3 L3
      H4 L1 L3 L3 H3
      L1 H4 L1 H2 L1
      L3 L2 H3 H3 S
      H1 L2 L3 L2 L4
      `)
      .wins([pay(b, 'L1', 3, 2)])
      .tumble(['L2', 'H3 H3', 'H1', '', ''])
      .endSpin(),
  // 5 : sans gain
  lose(`
      L1 H1 L4 S  H2
      H4 L1 L2 L4 H1
      L3 H3 H1 L3 L1
      H2 L1 H4 L2 L4
      L4 L2 L2 L2 L2
    `),
  // 6 : caisse -> géant L3 4x4, 256 ways (×26)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      H3 L2 H1 L1 L1
      L1 L1 L1 L4 H1
      L4 L3 T  L4 H3
      L1 H1 H4 L3 L4
      H2 L3 L3 L3 L1
      `, { tnt: [[2, 2, 'keg']] })
      .blast([2, 2], 'L3', [0, 1])
      .wins([pay(b, 'L3', 4, 256)])
      .tumble(['H3 L3 H2 H2', 'L4 L4 L2 L1', 'L4 L2 L2 L1', 'L4 L1 H4 L2', ''])
      .endSpin(),
  // 7 : sans gain
  lose(`
      S  L4 L4 L3 L4
      L3 L4 H3 L4 L2
      H2 H2 H4 L3 H2
      H1 L1 L1 L3 H1
      L2 L1 L4 H1 L4
    `),
  // 8 : fagot -> géant H1 3x3 sans connexion (×35)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L4 L2 H4 L3 L3
      L2 S  L4 L4 H3
      L3 H2 T  L3 L1
      L3 L3 H1 L4 H1
      H2 H4 L4 H3 L2
      `, { tnt: [[2, 2, 'bundle']] })
      .blast([2, 2], 'H1', [2, 0])
      .endSpin(),
  // 9 : H3 puis cascade L2
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L3 L1 L4 H4 L1
      H1 L3 H1 L1 L2
      H3 L1 L2 H4 L1
      L2 H3 H3 L4 H1
      H3 L4 L4 H1 L2
      `)
      .wins([pay(b, 'H3', 3, 2)])
      .tumble(['H2 L2', 'L2', 'H2', '', ''])
      .wins([pay(b, 'L2', 3, 2)])
      .tumble(['L2 L1', 'L1', 'L2', '', ''])
      .endSpin(),
  // 10 : 2 Scatters, anticipation sans 3e Scatter
  lose(`
      L4 S  H2 H3 L1
      L4 H4 L4 H1 H1
      H3 H3 L3 H4 L4
      L3 L2 L1 L2 H3
      S  L1 L2 L1 L3
    `, { anticipation: [0, 0, 1, 2, 3] }),
  // 11 : fagot -> géant H3 3x3 sur 4 rouleaux (×44)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      H4 L1 H3 H3 L4
      H3 L1 L1 H4 H4
      L4 H2 H1 H1 H1
      H4 L3 L1 H1 H1
      H1 L1 T  L3 L2
      `, { tnt: [[2, 4, 'bundle']] })
      .blast([2, 4], 'H3', [1, 2])
      .wins([pay(b, 'H3', 4, 48)])
      .tumble(['L4', 'L2 L3 L3', 'L4 L1 H4 L1', 'H1 L1 L2 H3', ''])
      .endSpin(),
  // 12 : dernier tour, sans gain
  lose(`
      L2 H1 L3 L4 L3
      H2 H1 L2 H2 L3
      L4 L3 L1 H1 L4
      L4 L3 H4 H4 H4
      L4 H2 H3 L2 L1
    `),
];

const F15 = fixture(
  'F15',
  'BASE',
  {
    weight: 1,
    tags: ['anticipation', 'bonus', 'super', 'tnt', 'multiplier', 'keg', 'near-miss'],
    note: 'déclenchement du super bonus (4 Scatters), 12 FS : fagots et caisse, Cornerstone ×44, anticipation ratée au 10e tour',
  },
  (b) =>
    freeSpins(
      b
        .reveal(
          `
    L2 H4 L1 S  H3
    S  L1 H2 L3 L4
    H3 L3 L4 H1 S
    L4 S  H3 L2 L1
    H1 H2 L2 H4 L3
  `,
          { anticipation: [0, 0, 1, 2, 3] },
        )
        .endSpin()
        .fsTrigger('super', SUPER_FS),
      F15_FS,
    ),
);

const F20 = fixture('F20', 'BASE', { weight: 1, tags: ['tier-edge', 'cascade', '5-reels'], note: 'juste sous x10 : H2 5 rouleaux puis H3 + H4 (990)' }, (b) =>
  b
    .reveal(`
    L3 H1 H2 L1 H3
    H2 L2 L4 H2 L3
    L1 H2 H2 L3 H2
    H4 H3 S  H1 L2
    L4 L2 H2 H4 L1
  `)
    .wins([pay(b, 'H2', 5, 3)])
    .tumble(['H3', 'H4', 'H3 H4 L1', 'L2', 'L4'])
    .wins([pay(b, 'H3', 3, 1), pay(b, 'H4', 4, 1)])
    .tumble(['H2 H4', 'H3 L2', 'H1 H2', 'H4', ''])
    .endSpin(),
);

const F21 = fixture('F21', 'BASE', { weight: 1, tags: ['tier', 'x10', 'cascade'], note: 'exactement x10 : H1 4 rouleaux puis H2 4 rouleaux (1000)' }, (b) =>
  b
    .reveal(`
    H1 L4 H1 L3 L2
    L3 H3 L2 L4 H4
    H1 L1 S  H1 L1
    L2 H1 H1 H3 L4
    H2 L4 H2 L2 L3
  `)
    .wins([pay(b, 'H1', 4, 4)])
    .tumble(['H2 L1', 'H2', 'H2 L4', 'H2', ''])
    .wins([pay(b, 'H2', 4, 4)])
    .tumble(['H4 H1', 'H2', 'H3 H1', 'H4', ''])
    .endSpin(),
);

const F22 = fixture('F22', 'BASE', { weight: 1, tags: ['tier', 'x25', 'cascade'], note: 'palier x25 : H1 4 rouleaux 16 ways puis H3' }, (b) =>
  b
    .reveal(`
    H1 L1 H1 L4 H3
    L2 H1 S  H1 L2
    H1 L3 L2 H2 L4
    L4 H1 L3 H1 H4
    H3 H4 H1 L1 L3
  `)
    .wins([pay(b, 'H1', 4, 16)])
    .tumble(['H3 L1', 'H3 L3', 'H3 H3', 'L2 H1', ''])
    .wins([pay(b, 'H3', 3, 4)])
    .tumble(['H2 H4', 'H1', 'H1 H2', '', ''])
    .endSpin(),
);

const F23 = fixture('F23', 'BASE', { weight: 1, tags: ['tier', 'x100', 'tnt', 'bundle', 'giant', 'cascade'], note: 'palier x100 : fagot H1 3x3 sur 4 rouleaux puis H2 5 rouleaux' }, (b) =>
  b
    .reveal(
      `
    L4 H2 L1 H1 L4
    H3 T  H4 L4 H3
    L2 L3 L4 H1 L2
    L3 L1 S  L3 H2
    H2 H4 L2 H3 L1
  `,
      { tnt: [[1, 1, 'bundle']] },
    )
    .blast([1, 1], 'H1', [0, 0])
    .wins([pay(b, 'H1', 4, 54)])
    .tumble(['H2 L4 L1', 'L2 H2 H2', 'H2 L3 H2', 'L2 H2', ''])
    .wins([pay(b, 'H2', 5, 8)])
    .tumble(['H3 H1', 'H2 L2', 'H4 H1', 'H1', 'H2'])
    .endSpin(),
);

const F24 = fixture('F24', 'BASE', { weight: 1, tags: ['tier', 'x500', 'tnt', 'keg', 'giant', '5-reels'], note: 'palier x500 : baril 4x4 -> géant H3, 5 rouleaux' }, (b) =>
  b
    .reveal(
      `
    H4 L4 L3 H1 L1
    L1 H2 H1 L2 H4
    H2 T  L1 H2 H3
    L3 H4 L2 L1 L3
    L2 H1 L4 S  H2
  `,
      { tnt: [[1, 2, 'keg']] },
    )
    .blast([1, 2], 'H3', [0, 0])
    .wins([pay(b, 'H3', 5, 256)])
    .tumble(['L3 H4 L1 H2', 'L4 H3 L2 L4', 'H1 L3 H2 L1', 'H4 L2 H1 L3', 'H1'])
    .endSpin(),
);

const F27 = fixture('F27', 'BASE', { weight: 4, tags: ['small', 'sub-cent'], note: 'gain minuscule x0,05 (0,005 € à 0,10 € de mise)' }, (b) =>
  b
    .reveal(`
    L4 H2 H1 H3 L2
    H1 L3 L4 L2 H4
    L2 L4 H3 L1 L3
    H3 L1 H2 H4 L1
    L1 H4 L2 L3 H2
  `)
    .wins([pay(b, 'L4', 3, 1)])
    .tumble(['L4', 'L1', 'L3', '', ''])
    .endSpin(),
);

// Chaînes de charges (docs/CONTRAT-EVENTS.md § 7) : la zone d'une charge contient la suivante (from),
// les zones se recouvrent, UN seul géant remplit le rectangle englobant de toute la chaîne.

const F31 = fixture(
  'F31',
  'BASE',
  { weight: 2, tags: ['tnt', 'tnt-chain', 'stick', 'bundle', 'giant', 'cascade'], note: 'chaîne de 2 : le bâton prend le fagot dans sa zone -> UN géant H4 3x4 (rectangle englobant), 64 ways (x16)' },
  (b) =>
    b
      .reveal(
        `
    T  H2 L4 L1 H3
    L2 T  H1 L3 L4
    H1 L4 L2 H2 L1
    L3 H3 L1 L4 S
    L1 L3 L2 H1 H2
  `,
        {
          tnt: [
            [0, 0, 'stick'],
            [1, 1, 'bundle'],
          ],
        },
      )
      // bâton : zone 2x2 (0,0)-(1,1) qui contient le fagot ; fagot : zone 3x3 (0,1)-(2,3) ;
      // rectangle englobant (0,0)-(2,3) : la case (2,0), hors des deux zones, est sculptée aussi
      .chain(
        [
          { at: [0, 0], anchor: [0, 0] },
          { at: [1, 1], anchor: [0, 1], from: [0, 0] },
        ],
        'H4',
      )
      .wins([pay(b, 'H4', 3, 64)])
      .tumble(['H2 L4 H1 L3', 'L2 H3 L4 H2', 'H3 L1 H1 L2', '', ''])
      .endSpin(),
);

const F32 = fixture(
  'F32',
  'BASE',
  {
    weight: 1,
    tags: ['tnt', 'tnt-chain', 'stick', 'bundle', 'keg', 'giant', 'big-win', '5-reels'],
    note: 'chaîne de 3 : bâton -> fagot -> baril, géant L4 5x5 sur toute la grille, 3125 ways (x937,50)',
  },
  (b) =>
    b
      .reveal(
        `
    H3 T  L2 H1 L3
    T  L1 H4 L2 H2
    L2 H2 L3 T  L1
    H1 L4 H2 L1 H4
    L3 H4 L1 H3 L2
  `,
        {
          tnt: [
            [0, 1, 'stick'],
            [1, 0, 'bundle'],
            [3, 2, 'keg'],
          ],
        },
      )
      // bâton (0,0)-(1,1) -> fagot (1,0)-(3,2) -> baril (1,1)-(4,4) : rectangle englobant 5x5
      .chain(
        [
          { at: [0, 1], anchor: [0, 0] },
          { at: [1, 0], anchor: [1, 0], from: [0, 1] },
          { at: [3, 2], anchor: [1, 1], from: [1, 0] },
        ],
        'L4',
      )
      .wins([pay(b, 'L4', 5, 3125)])
      .tumble(['H1 L2 H3 L1 H2', 'L3 H4 L4 H1 L3', 'L2 H2 L3 H3 L1', 'H1 L4 H2 L3 H4', 'L1 H3 L2 H4 L4'])
      .endSpin(),
);

// ---------------------------------------------------------------------------------------------
// ANTE (mêmes spins que la base, mise ×1,5)
// ---------------------------------------------------------------------------------------------

const F28 = fixture('F28', 'ANTE', { weight: 8, cost: cfg.modes.ANTE.cost, tags: ['ante', 'loss'], note: 'ANTE : perte sèche' }, (b) =>
  b
    .reveal(`
    H4 L2 L1 H2 L3
    L1 H3 H1 L4 H2
    H2 L4 L3 H3 L1
    L3 S  H4 L1 H3
    H1 L2 L2 L2 L4
  `)
    .endSpin(),
);

const F29 = fixture('F29', 'ANTE', { weight: 5, cost: cfg.modes.ANTE.cost, tags: ['ante', 'small'], note: 'ANTE : petit gain L2, 2 ways' }, (b) =>
  b
    .reveal(`
    L2 H2 L3 H4 L1
    H3 L2 H1 L1 L2
    L4 L1 L2 H3 H2
    L2 H4 S  L4 L3
    H1 L3 H4 H2 H3
  `)
    .wins([pay(b, 'L2', 3, 2)])
    .tumble(['L2 H2', 'L1', 'L2', '', ''])
    .endSpin(),
);

const F30 = fixture('F30', 'ANTE', { weight: 3, cost: cfg.modes.ANTE.cost, tags: ['ante', 'anticipation', 'near-miss', 'loss'], note: 'ANTE : anticipation ratée (2 Scatters)' }, (b) =>
  b
    .reveal(
      `
    L3 H2 L1 H4 L2
    H1 S  H3 L2 H1
    L2 L4 H2 L1 L3
    H4 L1 L4 H3 H2
    L3 H3 S  L4 H4
  `,
      { anticipation: [0, 0, 0, 1, 2] },
    )
    .endSpin(),
);

// ---------------------------------------------------------------------------------------------
// BONUS acheté (bonus standard) et SUPER acheté
// ---------------------------------------------------------------------------------------------

/** F16 : 10 free spins du bonus acheté, Cornerstone ×1 -> ×22 */
const F16_FS: Spin[] = [
  // 1 : sans gain
  lose(`
      H3 L1 L4 H1 L2
      L2 L1 L1 L4 L1
      H4 L1 L1 L4 H3
      H2 S  L4 H2 L4
      L4 H1 H3 L2 L1
    `),
  // 2 : H2 sur 4 rouleaux
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L4 H1 L1 H1 L2
      L2 H2 H3 H2 L1
      H4 L3 H4 H2 L1
      H1 H1 H2 L1 L4
      H2 L3 L2 L4 H3
      `)
      .wins([pay(b, 'H2', 4, 2)])
      .tumble(['H2', 'H2', 'H3', 'L3 H2', ''])
      .endSpin(),
  // 3 : bâton -> géant H4 2x2 (Cornerstone ×5)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      S  L3 T  L3 H3
      H4 L2 H1 L1 L3
      L3 H2 H2 H2 L4
      H1 L1 L2 L1 L2
      L2 H4 L3 L3 L1
      `, { tnt: [[2, 0, 'stick']] })
      .blast([2, 0], 'H4', [1, 0])
      .wins([pay(b, 'H4', 3, 6)])
      .tumble(['H1', 'H4 L4 L1', 'H4 L2', '', ''])
      .endSpin(),
  // 4 : sans gain
  lose(`
      H1 L4 H4 L3 L2
      L1 L2 L2 L2 H3
      H4 L3 L3 H1 L4
      H1 H2 L4 L2 L2
      L1 L3 H3 H3 H2
    `),
  // 5 : sans gain
  lose(`
      H3 L4 L1 L4 L2
      H3 H1 H3 H2 L1
      L1 H4 L1 L3 L4
      H1 H4 H2 H1 L1
      H1 L4 S  L4 H3
    `),
  // 6 : fagot -> géant H1 3x3 (×14)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      T  L4 H1 H2 H3
      L3 H1 L4 L1 L3
      L2 H3 L3 H3 L1
      L4 H2 L1 H2 H2
      H2 H2 L4 H4 L4
      `, { tnt: [[0, 0, 'bundle']] })
      .blast([0, 0], 'H1', [0, 0])
      .wins([pay(b, 'H1', 3, 27)])
      .tumble(['L1 L4 L2', 'H2 H3 H1', 'H3 H1 L2', '', ''])
      .endSpin(),
  // 7 : sans gain
  lose(`
      L1 L2 H1 L2 S
      H1 L3 L4 L2 L4
      H3 L2 L4 L3 L2
      H3 L3 L1 L3 L4
      H2 L4 L1 L1 H4
    `),
  // 8 : L4 puis cascade H3
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L3 L2 H3 H1 L3
      H3 H2 H1 L1 L3
      L4 L4 L1 L2 L1
      H2 L2 L4 L3 H1
      L2 L3 L1 L2 L3
      `)
      .wins([pay(b, 'L4', 3, 1)])
      .tumble(['H3', 'H3', 'H4', '', ''])
      .wins([pay(b, 'H3', 3, 2)])
      .tumble(['L4 L1', 'L4', 'H1', '', ''])
      .endSpin(),
  // 9 : deux bâtons -> deux géants L2 (×18 puis ×22)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L2 L2 H4 H2 L4
      H2 T  L4 L3 L1
      H1 H3 L3 H2 L3
      T  H2 L1 L1 H4
      L1 H2 H2 H4 L3
      `, { tnt: [[0, 3, 'stick'], [1, 1, 'stick']] })
      .blast([0, 3], 'L2', [0, 3])
      .blast([1, 1], 'L2', [1, 0])
      .wins([pay(b, 'L2', 3, 24)])
      .tumble(['H2 L2 H1', 'L4 L1 L3 H4', 'H4 L4', '', ''])
      .endSpin(),
  // 10 : dernier tour, petit gain H1 sous ×22
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L3 L2 L3 L3 H3
      H1 L2 L1 L3 L1
      H1 L2 H2 H3 H4
      L2 H1 H1 L3 L2
      L4 L1 H4 S  L3
      `)
      .wins([pay(b, 'H1', 3, 2)])
      .tumble(['L2 H1', 'H4', 'L4', '', ''])
      .endSpin(),
];

const F16 = fixture(
  'F16',
  'BONUS',
  { weight: 1, cost: cfg.modes.BONUS.cost, tags: ['buy', 'bonus', 'standard', 'tnt', 'multiplier'], note: 'achat bonus : 3 Scatters, 10 FS complets, Cornerstone ×22' },
  (b) =>
    freeSpins(
      b
        .reveal(`
    H2 L3 S  L4 H1
    L4 H1 L1 H3 L2
    S  L2 H4 L1 H2
    L1 H4 L2 H1 L3
    H3 L3 H2 S  L4
  `)
        .endSpin()
        .fsTrigger('standard', STD_FS),
      F16_FS,
    ),
);

/** F25 : 10 free spins, baril H1 4x4 sous Cornerstone ×21 au 5e tour (palier x1000) */
const F25_FS: Spin[] = [
  // 1 : sans gain
  lose(`
      L1 L4 H2 L4 H3
      L3 L4 H3 H3 L3
      L4 L4 H3 L1 L4
      L3 L3 H4 L2 L3
      H1 L3 L1 L3 H2
    `),
  // 2 : bâton -> géant L1 2x2 (Cornerstone ×5)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L1 L2 L3 L3 L2
      L4 L4 T  H4 S
      L4 H1 H1 L4 L3
      H4 L2 H1 H4 L4
      L2 L1 H2 L4 H4
      `, { tnt: [[2, 1, 'stick']] })
      .blast([2, 1], 'L1', [1, 1])
      .wins([pay(b, 'L1', 3, 6)])
      .tumble(['H3', 'L1 L3 L2', 'L4 H2', '', ''])
      .endSpin(),
  // 3 : petit gain L4
  (b) =>
    b
      .fsSpin()
      .reveal(`
      H4 L3 L4 L2 L4
      L1 L4 L4 H3 H2
      H4 H2 H2 L1 L4
      H3 H3 L2 H3 L1
      L4 L2 H1 L3 L4
      `)
      .wins([pay(b, 'L4', 3, 2)])
      .tumble(['H4', 'L4', 'L1 L3', '', ''])
      .endSpin(),
  // 4 : sans gain
  lose(`
      H1 H4 L3 L4 L1
      S  L3 H1 H4 H2
      L4 H2 H3 L1 L2
      L2 H2 H4 L2 L4
      L2 H4 H4 H1 L4
    `),
  // 5 : caisse -> géant H1 4x4, 256 ways sous ×21 (+16 cases, palier x1000)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L3 L4 L2 L2 L4
      L3 L4 L4 L3 H2
      L2 H3 L4 L4 H4
      L3 H1 L2 H2 H2
      H3 T  L4 L2 L1
      `, { tnt: [[1, 4, 'keg']] })
      .blast([1, 4], 'H1', [0, 1])
      .wins([pay(b, 'H1', 4, 256)])
      .tumble(['L1 L1 L4 L4', 'H2 H4 H3 L2', 'H4 H1 H1 L3', 'L3 H4 H3 H2', ''])
      .endSpin(),
  // 6 : sans gain
  lose(`
      L2 L2 S  L3 L1
      L2 H4 L3 L4 H2
      H1 H2 L4 L1 L4
      H2 L2 L4 L2 L4
      L2 H1 H4 H2 H4
    `),
  // 7 : H2 sur 3 rouleaux
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L1 L3 H2 H4 L3
      L4 S  L3 H4 H2
      H2 L3 H4 H3 L3
      H1 H2 L2 L1 L1
      L1 H4 H2 L2 L4
      `)
      .wins([pay(b, 'H2', 3, 2)])
      .tumble(['H3', 'L2', 'L4 L3', '', ''])
      .endSpin(),
  // 8 : sans gain
  lose(`
      L1 L1 H3 L4 H4
      L4 L2 H2 H2 L1
      H4 L1 L3 L4 H3
      L3 H2 L3 H4 L1
      L3 H1 H2 L3 L4
    `),
  // 9 : petit gain L2
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L4 L2 L3 L1 L3
      L1 H3 L2 H4 L2
      L3 L1 H4 H1 H1
      L2 L1 H2 H1 L4
      L1 L1 L4 H4 L1
      `)
      .wins([pay(b, 'L2', 3, 1)])
      .tumble(['L2', 'H4', 'L4', '', ''])
      .endSpin(),
  // 10 : dernier tour, sans gain
  lose(`
      H3 H2 L2 L1 L3
      H4 L1 H2 L3 L4
      L4 L2 L2 H3 L4
      H3 L1 L4 H2 S
      H1 L2 L3 H2 L4
    `),
];

const F25 = fixture(
  'F25',
  'BONUS',
  { weight: 1, cost: cfg.modes.BONUS.cost, tags: ['buy', 'bonus', 'standard', 'tier', 'x1000', 'keg', 'multiplier'], note: 'achat bonus : baril 4x4 H1 sous Cornerstone ×21, palier x1000' },
  (b) =>
    freeSpins(
      b
        .reveal(`
    L1 S  H3 L2 H4
    H4 H2 L2 L4 H1
    L3 L4 S  H2 L1
    S  H1 L1 H3 L3
    L2 H3 H4 L1 H2
  `)
        .endSpin()
        .fsTrigger('standard', STD_FS),
      F25_FS,
    ),
);

/** F17 : 12 free spins du super bonus acheté (fagots et caisse), Cornerstone ×1 -> ×44 */
const F17_FS: Spin[] = [
  // 1 : petit gain L2
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L1 L4 L2 L4 H3
      L2 L2 L3 H3 L2
      H2 L1 L3 L3 H4
      L2 L4 L3 L4 L1
      L1 L1 S  L4 L2
      `)
      .wins([pay(b, 'L2', 3, 2)])
      .tumble(['L2 H4', 'H4', 'H2', '', ''])
      .endSpin(),
  // 2 : fagot -> géant H4 3x3 (Cornerstone ×10)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      H2 H4 L2 L4 L3
      L1 H3 L2 L3 L2
      H2 L4 H1 L4 L3
      H4 H3 L4 H1 L4
      T  L3 L1 H1 H1
      `, { tnt: [[0, 4, 'bundle']] })
      .blast([0, 4], 'H4', [0, 2])
      .wins([pay(b, 'H4', 3, 36)])
      .tumble(['L3 L3 L3', 'L3 L2 H4 L2', 'L2 H3 L1', '', ''])
      .endSpin(),
  // 3 : sans gain
  lose(`
      H1 H3 L2 S  H4
      H1 L4 L1 L2 H3
      L2 L4 H3 H1 L4
      H4 H3 L4 H1 H3
      L1 H3 L1 H2 L2
    `),
  // 4 : fagot -> géant H2 3x3 sans connexion (×19)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L3 L1 L2 L2 H1
      L3 L2 H2 H3 L4
      L4 L2 H3 H2 H1
      H4 L2 L1 H1 H4
      H3 L4 H2 T  L2
      `, { tnt: [[3, 4, 'bundle']] })
      .blast([3, 4], 'H2', [2, 2])
      .endSpin(),
  // 5 : H3 sur 4 rouleaux
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L3 H3 L3 L3 S
      L3 H3 L4 L1 L3
      H2 H4 H3 L3 L2
      L2 H2 L1 L4 L4
      H3 L1 L4 H3 L2
      `)
      .wins([pay(b, 'H3', 4, 2)])
      .tumble(['L4', 'H1 L2', 'H4', 'H1', ''])
      .endSpin(),
  // 6 : sans gain
  lose(`
      H4 H4 H3 H4 H1
      L4 L4 L3 L1 L2
      L4 H2 H1 L2 H2
      H4 L2 L2 H3 L4
      L1 H4 L3 H4 H3
    `),
  // 7 : caisse -> géant L2 4x4, 256 ways (×35)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L3 L3 L2 H4 L4
      T  H4 L4 L4 H3
      H4 H2 L2 L2 L1
      L3 L4 L2 L3 L1
      L4 H1 L4 L1 L1
      `, { tnt: [[0, 1, 'keg']] })
      .blast([0, 1], 'L2', [0, 0])
      .wins([pay(b, 'L2', 4, 256)])
      .tumble(['L3 H1 H2 H3', 'H4 L3 L1 H4', 'L2 L4 H3 L4', 'L2 L3 L4 H4', ''])
      .endSpin(),
  // 8 : sans gain
  lose(`
      L2 H2 H3 L4 L2
      S  H2 L3 L4 H1
      L2 H4 H2 L3 H4
      L1 H4 H4 L1 L3
      L1 L3 H3 H2 L3
    `),
  // 9 : fagot -> géant H1 3x3 (×44)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L1 L1 H4 H3 L2
      L2 H1 H1 L1 L3
      L1 L1 H1 L4 H2
      T  L2 H3 L2 L4
      L1 L3 L2 H2 L3
      `, { tnt: [[0, 3, 'bundle']] })
      .blast([0, 3], 'H1', [0, 1])
      .wins([pay(b, 'H1', 3, 27)])
      .tumble(['H2 H2 H4', 'L4 L1 L3', 'H1 H2 L3', '', ''])
      .endSpin(),
  // 10 : H2 puis cascade L3
  (b) =>
    b
      .fsSpin()
      .reveal(`
      H2 L4 L4 L4 L3
      H4 L4 L1 H4 L2
      L3 S  L3 L4 L1
      L1 H4 L3 H1 L1
      H4 H2 H2 H1 L4
      `)
      .wins([pay(b, 'H2', 3, 1)])
      .tumble(['H2', 'L3', 'H2', '', ''])
      .wins([pay(b, 'L3', 3, 2)])
      .tumble(['L2', 'L2', 'H1 L4', '', ''])
      .endSpin(),
  // 11 : sans gain
  lose(`
      H3 H2 H4 L4 L1
      L3 H1 S  H1 H1
      L4 L3 L1 L2 L2
      L2 H4 H3 L4 H3
      L4 L3 H2 L2 L1
    `),
  // 12 : dernier tour, sans gain
  lose(`
      H4 L1 H4 L4 H4
      H2 H3 L2 L4 L2
      H2 L2 L2 L4 H2
      H4 L1 L2 L2 H3
      L4 L2 L3 H2 H2
    `),
];

const F17 = fixture(
  'F17',
  'SUPER',
  { weight: 1, cost: cfg.modes.SUPER.cost, tags: ['buy', 'bonus', 'super', 'tnt', 'keg', 'multiplier'], note: 'achat super bonus : 4 Scatters, 12 FS, fagots et caisse, Cornerstone ×44' },
  (b) =>
    freeSpins(
      b
        .reveal(`
    H1 L1 L4 S  L3
    L3 S  H2 H1 H4
    L2 H3 L1 L3 H2
    S  L4 H4 L2 L1
    H4 H2 S  L1 L4
  `)
        .endSpin()
        .fsTrigger('super', SUPER_FS),
      F17_FS,
    ),
);

/** F26 : 6 premiers free spins du super bonus (Cornerstone ×28 avant la caisse du 7e tour) */
const F26_FS: Spin[] = [
  // 1 : fagot -> géant L2 3x3 (Cornerstone ×10)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L1 L3 H2 H1 L4
      H4 L2 L3 L4 H2
      L2 T  L4 L3 L4
      L1 L1 H2 L3 L1
      H1 H3 L4 H2 L1
      `, { tnt: [[1, 2, 'bundle']] })
      .blast([1, 2], 'L2', [0, 2])
      .wins([pay(b, 'L2', 3, 36)])
      .tumble(['L2 H4 L4', 'L4 L3 L4 L4', 'L2 H3 H2', '', ''])
      .endSpin(),
  // 2 : sans gain
  lose(`
      H1 S  L2 L3 L4
      L4 L3 H2 L3 L3
      L2 L3 L4 L3 H2
      L2 L1 L2 L1 L3
      L3 H3 H3 L1 L2
    `),
  // 3 : fagot -> géant H3 3x3 sans connexion (×19)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      H4 L2 L3 H1 L3
      L3 H4 L3 T  L4
      L3 H3 L3 L2 L4
      L1 H1 L4 L4 L3
      L1 H1 H3 L3 H2
      `, { tnt: [[3, 1, 'bundle']] })
      .blast([3, 1], 'H3', [2, 1])
      .endSpin(),
  // 4 : petit gain L3
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L3 H1 H2 L2 L3
      L3 L3 L2 S  H3
      H1 L4 H3 L4 L3
      L4 H3 L3 L2 L4
      L2 H2 L2 H4 H1
      `)
      .wins([pay(b, 'L3', 3, 2)])
      .tumble(['L2 L2', 'H3', 'L2', '', ''])
      .endSpin(),
  // 5 : fagot -> géant H4 3x3 sur 4 rouleaux (×28)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L3 L1 T  L2 L2
      L4 H2 H1 H2 L3
      L4 H2 L1 L4 L4
      H4 H3 H2 L2 L4
      H2 L1 H1 L1 L1
      `, { tnt: [[2, 0, 'bundle']] })
      .blast([2, 0], 'H4', [1, 0])
      .wins([pay(b, 'H4', 4, 27)])
      .tumble(['H1', 'L4 L2 L4', 'L1 L3 H2', 'L1 H3 L2', ''])
      .endSpin(),
  // 6 : sans gain
  lose(`
      S  H3 L3 H4 H3
      L3 H4 L4 H2 L1
      H4 L2 H2 L4 H3
      H1 L2 L2 L3 L1
      L1 L2 H3 H3 H1
    `),
];

const F26 = fixture(
  'F26',
  'SUPER',
  { weight: 1, cost: cfg.modes.SUPER.cost, tags: ['buy', 'bonus', 'super', 'max-win', 'wincap', 'keg', 'multiplier'], note: 'MAX WIN : baril H1 4x4 + 4 H1 au rouleau 5 (1024 ways) sous Cornerstone ×44 -> plafond x25000' },
  (b) => {
    b.reveal(`
    L4 H1 S  H2 L1
    H2 L3 L2 S  H3
    L1 S  H4 L4 L2
    H3 H4 L3 H1 S
    L2 L3 H1 L3 H4
  `)
      .endSpin()
      .fsTrigger('super', SUPER_FS);
    for (const s of F26_FS) s(b);
    // 7e tour : caisse -> géant H1 4x4 (rouleaux 1-4, +16 cases : ×28 -> ×44) + 4 H1 au rouleau 5 : 4^5 = 1024 ways × 500 × 44
    return b
      .fsSpin()
      .reveal(
        `
    L2 H3 L4 H2 S
    H4 L4 L1 L3 H1
    L1 T  H2 L1 H1
    L3 L2 L3 H4 H1
    H2 H4 H3 L4 H1
  `,
        { tnt: [[1, 2, 'keg']] },
      )
      .blast([1, 2], 'H1', [0, 1])
      .wins([pay(b, 'H1', 5, 1024)])
      .wincap(MAX_WIN);
  },
);

/**
 * F33 : FLOODLIGHT SHIFT acheté, 12 FS + relance (2 Scatters : +2 d'après la table) = 14 FS.
 * Toutes les charges d'une étape sont reliées (wired) en UNE chaîne, même hors de portée l'une de l'autre.
 * Cornerstone +1 par case sculptée : ×1 -> ×10 (fagot) -> ×25 (2 fagots reliés, 5x3) -> ×45 (fagot + baril reliés, 4x5).
 */
const F33_FS: Spin[] = [
  // 1 : sans gain
  lose(`
      H2 L1 L3 H4 L2
      L4 H3 H1 L2 H1
      H1 L2 L4 L3 S
      L3 H4 H2 H1 L4
      L2 L1 H3 L4 H3
    `),
  // 2 : fagot seul -> géant H2 3x3, 27 ways (Cornerstone ×10)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L1 L3 H4 L2 H1
      L4 H3 L2 H1 L3
      H1 T  L3 L4 L2
      L2 L1 H1 L3 H4
      H3 L4 L1 H4 S
      `, { tnt: [[1, 2, 'bundle']] })
      .blast([1, 2], 'H2', [0, 1])
      .wins([pay(b, 'H2', 3, 27)])
      .tumble(['H4 L2 H1', 'H2 H1 L2', 'L3 H3 L4', '', ''])
      .endSpin(),
  // 3 : sans gain
  lose(`
      L4 H1 H2 L3 H2
      H3 L2 H4 L1 L4
      L1 H2 L3 H3 L1
      H4 L4 H1 L2 H1
      L2 L3 L1 H1 S
    `),
  // 4 : deux fagots hors de portée, reliés par le fil -> UN géant L4 5x3, 243 ways (×25)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      H1 L2 H3 L1 H4
      T  H4 L2 H2 T
      L3 H1 L1 H3 L2
      H2 L3 H4 L1 H3
      L1 H2 S  H4 L2
      `, { tnt: [[0, 1, 'bundle'], [4, 1, 'bundle']] })
      .chain(
        [
          { at: [0, 1], anchor: [0, 0] },
          { at: [4, 1], anchor: [2, 0], wired: true },
        ],
        'L4',
      )
      .wins([pay(b, 'L4', 5, 243)])
      .tumble(['H3 L2 H1', 'L4 H1 L1', 'L3 H3 L2', 'H2 L4 H1', 'L1 H4 L3'])
      .endSpin(),
  // 5 : sans gain
  lose(`
      H3 L4 L4 S  L3
      L2 H1 H3 L4 H4
      H4 L3 L2 L1 H1
      L1 H2 H4 H3 L2
      L3 L1 H1 L2 H2
    `),
  // 6 : petit gain L2 sous ×25
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L2 H4 H1 L3 H3
      H3 L1 L2 H2 L4
      L4 L2 H4 L1 H1
      H1 H3 L3 L4 S
      L3 L4 H2 H1 L1
      `)
      .wins([pay(b, 'L2', 3, 1)])
      .tumble(['H2', 'L2', 'L1', '', ''])
      .endSpin(),
  // 7 : 2 Scatters, rouleaux 3-5 ralentis, pas de 3e : relance +2 (12 -> 14)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L1 S  L3 H2 L4
      H4 L2 H1 L4 H3
      S  H3 L4 L1 L2
      L3 H1 H2 H3 H1
      H2 L4 L2 H4 L3
      `, { anticipation: [0, 0, 1, 2, 3] })
      .endSpin()
      .fsRetrigger(retriggerSpins('super', 2)),
  // 8 : sans gain
  lose(`
      H1 L3 L2 H4 L1
      L2 H2 H4 L3 H2
      H3 L4 H1 H2 L3
      L4 L1 H3 L2 H4
      H2 H4 L1 S  L2
    `),
  // 9 : fagot et baril reliés -> UN géant H1 4x5 sur les rouleaux 2-5, sans connexion (×45)
  (b) =>
    b
      .fsSpin()
      .reveal(`
      L2 H3 L1 L4 T
      H2 L4 H4 L1 L3
      L3 L2 H2 H3 H4
      S  T  L3 L2 L1
      L4 H4 L2 H3 H2
      `, { tnt: [[4, 0, 'bundle'], [1, 3, 'keg']] })
      .chain(
        [
          { at: [4, 0], anchor: [2, 0] },
          { at: [1, 3], anchor: [1, 1], wired: true },
        ],
        'H1',
      )
      .endSpin(),
  // 10 : sans gain
  lose(`
      L3 H2 L4 H1 L2
      H1 L1 H4 L3 H4
      L4 H4 L2 H2 L1
      H3 L2 H2 L4 S
      L1 H3 L3 L2 H1
    `),
  // 11 : H4 sur 3 rouleaux, 2 ways sous ×45
  (b) =>
    b
      .fsSpin()
      .reveal(`
      H4 L1 H4 L2 L3
      L3 H4 L2 H1 H2
      L1 H2 L4 L3 L1
      H4 L3 H1 L4 H3
      H2 L4 H3 S  L2
      `)
      .wins([pay(b, 'H4', 3, 2)])
      .tumble(['H1 L2', 'H3', 'L4', '', ''])
      .endSpin(),
  // 12 : sans gain
  lose(`
      H2 L4 H3 L1 H1
      L1 H1 L3 H4 L4
      L3 L2 H2 L2 H3
      H4 L1 L4 H3 L2
      L2 H3 H1 L3 S
    `),
  // 13 : sans gain
  lose(`
      L4 H1 L1 H3 L3
      H3 L3 H2 L2 H1
      L2 H4 L4 H1 L4
      H1 L2 H4 L4 H2
      L3 H3 H2 H2 S
    `),
  // 14 : dernier tour (relance comprise), sans gain
  lose(`
      H4 L2 H1 L3 H2
      L3 H3 L4 H2 L1
      H1 L1 H3 L4 H4
      L2 H2 L1 H1 L3
      S  L4 H2 L2 H1
    `),
];

const F33 = fixture(
  'F33',
  'SUPER',
  {
    weight: 1,
    cost: cfg.modes.SUPER.cost,
    tags: ['buy', 'bonus', 'super', 'tnt', 'wired', 'tnt-chain', 'keg', 'multiplier', 'retrigger'],
    note: 'achat super bonus : charges reliées (wired) en une seule explosion, Cornerstone +1 par case (×10 -> ×25 -> ×45), relance 2 Scatters +2 (14 FS)',
  },
  (b) =>
    freeSpins(
      b
        .reveal(`
    L3 S  H1 L2 H4
    H2 L4 L1 S  L3
    S  H3 L2 H1 L1
    L1 H1 H4 L4 S
    H4 L2 L3 H3 L2
  `)
        .endSpin()
        .fsTrigger('super', SUPER_FS),
      F33_FS,
    ),
);

// ---------------------------------------------------------------------------------------------
// Features achetées : BLAST (un spin à 2+ charges) et MEGA (un spin à baril 4x4)
// ---------------------------------------------------------------------------------------------

const F18 = fixture(
  'F18',
  'BLAST',
  { weight: 1, cost: cfg.modes.BLAST.cost, tags: ['buy', 'feature', 'tnt', 'multi-tnt', 'giant', 'cascade'], note: 'feature BLAST : bâton -> H1 2x2 + fagot -> L3 3x3, puis cascade H4' },
  (b) =>
    b
      .reveal(
        `
    H1 T  H4 L4 H2
    L3 L4 L2 S  L1
    H1 L3 H2 H3 H4
    L2 H4 L1 T  L4
    H2 L3 H3 L2 H1
  `,
        {
          tnt: [
            [1, 0, 'stick'],
            [3, 3, 'bundle'],
          ],
        },
      )
      .blast([1, 0], 'H1', [1, 0])
      .blast([3, 3], 'L3', [2, 2])
      .wins([pay(b, 'H1', 3, 8), pay(b, 'L3', 5, 54)])
      .tumble(['H4 L1 H4', 'L2 H3 L4 H3', 'H1 H4 L4 H3 L1', 'H1 L2 H3', 'L4 H3 L2'])
      .wins([pay(b, 'H4', 3, 2)])
      .tumble(['H1 L1', 'L4', 'H2', '', ''])
      .endSpin(),
);

const F19 = fixture(
  'F19',
  'MEGA',
  { weight: 1, cost: cfg.modes.MEGA.cost, tags: ['buy', 'feature', 'tnt', 'keg', 'giant', 'cascade'], note: 'feature MEGA : baril 4x4 -> géant H4, 256 ways, puis H2' },
  (b) =>
    b
      .reveal(
        `
    L1 H3 S  L2 H2
    H2 L2 H1 H3 L3
    L4 H4 L3 L1 H1
    H1 L1 T  H4 L4
    L3 H4 H2 L4 L1
  `,
        { tnt: [[2, 3, 'keg']] },
      )
      .blast([2, 3], 'H4', [0, 1])
      .wins([pay(b, 'H4', 4, 256)])
      .tumble(['L3 H2 L4 H1', 'L2 H4 H2 L2', 'H2 L1 H3 L4', 'H1 L3 L4 H3', ''])
      .wins([pay(b, 'H2', 3, 1)])
      .tumble(['L1', 'L2', 'H4', '', ''])
      .endSpin(),
);

export const ALL: Make[] = [
  F01, F02, F03, F04, F05, F06, F07, F08, F09, F10,
  F11, F12, F13, F14, F15, F16, F17, F18, F19, F20,
  F21, F22, F23, F24, F25, F26, F27, F28, F29, F30,
  F31, F32, F33,
];
