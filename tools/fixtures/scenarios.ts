/**
 * Scénarios de fixtures (montants illustratifs, centièmes de mise : 100 = ×1).
 * Symboles : L1 casque, L2 pioche, L3 lanterne, L4 gourde, H1 raton artificier, H2 élan, H3 loutre, H4 pic-vert,
 *            W caisse WILD, S charge SCATTER, T bâton de TNT.
 * Grilles écrites ligne par ligne (5 lignes × 5 colonnes).
 */
import { BookBuilder } from './kit';

type Make = () => BookBuilder;

const F01: Make = () =>
  new BookBuilder('F01', 'BASE', { weight: 8, tags: ['loss'], note: 'perte sèche' }).reveal(`
    L1 L2 H3 L4 H1
    H2 L3 L1 H4 L2
    L4 H1 L2 L1 S
    L3 H4 H2 L2 L3
    H3 L4 H1 H2 L4
  `).endSpin();

const F02: Make = () =>
  new BookBuilder('F02', 'BASE', { weight: 6, tags: ['small'], note: 'petit gain H4 sur 3 rouleaux' })
    .reveal(`
    H4 L2 H3 L4 H1
    H2 L3 H4 L1 L2
    L4 H4 L2 H2 S
    L3 H1 L1 L2 L3
    H3 L4 H1 H2 L4
  `)
    .wins([{ symbol: 'H4', reels: 3, win: 25 }])
    .tumble(['L2', 'L1', 'H3', '', ''])
    .endSpin();

const F09: Make = () =>
  new BookBuilder('F09', 'BASE', { weight: 3, tags: ['tnt', 'giant'], note: 'bâton de TNT -> géant H2 2x2' })
    .reveal(
      `
    H2 L2 H3 L4 H1
    L1 T  L1 H4 L2
    L4 H1 L2 L1 S
    L3 H4 H2 L2 L3
    H3 L4 H1 H2 L4
  `,
      { tnt: [[1, 1, 'stick']] },
    )
    .blast([1, 1], 'H2', [0, 0])
    .wins([{ symbol: 'H2', reels: 3, win: 160 }])
    .tumble(['L3 L2', 'L4 L1', 'H4 L3', '', ''])
    .endSpin();

export const ALL: Make[] = [F01, F02, F09];
