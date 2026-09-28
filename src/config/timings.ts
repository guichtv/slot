/**
 * Réglages centralisés de la mise en scène : timings (ms), amplitudes, budgets de particules.
 * Repères du cahier des charges (§20), ajustés à l'œil. Le turbo divise les attentes via Beat.speed.
 */
export const T = {
  button: { feedback: 80 },
  spin: {
    speedCells: 26, // cases / s en défilement
    stagger: 0.06, // s entre départs de colonnes
    minSpin: 520, // ms minimum de défilement avant le premier arrêt
    gap: 110, // ms entre arrêts de colonnes
    antiMs: 1850, // ms de ralenti par colonne en anticipation (1,6-2,2 s)
    antiZoom: 1.07,
  },
  win: {
    present: 620, // présentation d'une connexion
    amountHold: 420, // lecture du montant de connexion (0,35-0,5 s)
    between: 90,
  },
  tumble: {
    crumbleBeforeFall: 170, // la chute démarre dès que les cases sont libres
  },
  blast: {
    fuse: 520,
    flash: 90,
    carve: 520,
    shake: 12,
  },
  celebration: {
    tiers: ['boom', 'big', 'rockslide', 'avalanche', 'mountain'] as const,
    countBase: 2600, // ms de comptage du premier palier
    perTier: 1600,
  },
  fs: {
    plusBanner: 1100,
    between: 260,
  },
  particles: { high: 1400, low: 500 },
};
