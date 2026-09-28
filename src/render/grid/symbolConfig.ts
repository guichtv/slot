import type { SymbolName, TntKind } from '../../contract/schema';

/**
 * Configuration visuelle des symboles (source unique) :
 * - texture du corps ; les pièces animées et accessoires sont décrits en coordonnées de planche
 *   dans partsLayout.json (assemblage vérifié par tools/assets/compose_parts.py) ;
 * - remplissage visé : 85-95 % de la case mesuré sur les pixels visibles (manifeste : textures rognées).
 * Les coordonnées sont réglées sur les assets réels (docs/ASSETS.md).
 */
export interface SymbolDef {
  body: string;
  fill: number;
  tier: 'low' | 'high' | 'wild' | 'scatter' | 'tnt';
  /** couleur de halo de connexion */
  glow: number;
}

export const SYMBOL_DEFS: Record<Exclude<SymbolName, 'T'>, SymbolDef> = {
  L1: { body: 'sym.L1', fill: 0.86, tier: 'low', glow: 0xf6c331 },
  L2: { body: 'sym.L2', fill: 0.88, tier: 'low', glow: 0x6fa8ff },
  L3: { body: 'sym.L3', fill: 0.86, tier: 'low', glow: 0x6fe08f },
  L4: { body: 'sym.L4', fill: 0.84, tier: 'low', glow: 0xb48cff },
  H1: { body: 'sym.H1.body', fill: 0.93, tier: 'high', glow: 0xff7a3c },
  H2: { body: 'sym.H2.body', fill: 0.94, tier: 'high', glow: 0xf2b233 },
  H3: { body: 'sym.H3.body', fill: 0.92, tier: 'high', glow: 0x5fd0ff },
  H4: { body: 'sym.H4.body', fill: 0.93, tier: 'high', glow: 0xff5b4d },
  W: { body: 'sym.W.body', fill: 0.94, tier: 'wild', glow: 0xffd54a },
  S: { body: 'sym.S.body', fill: 0.93, tier: 'scatter', glow: 0xff4a3a },
};

export const TNT_DEFS: Record<TntKind, { body: string; fill: number; fuse: [number, number]; size: number }> = {
  stick: { body: 'sym.T.stick', fill: 0.84, fuse: [0.66, 0.1], size: 2 },
  bundle: { body: 'sym.T.bundle', fill: 0.88, fuse: [0.55, 0.08], size: 3 },
  keg: { body: 'sym.T.log', fill: 0.92, fuse: [0.74, 0.08], size: 4 }, // bûche-charge (DECISIONS : le baril faisait pirate)
};

/** symboles de défilement : décoratifs uniquement, jamais de faux Scatter / Wild / TNT */
export const FILLER: SymbolName[] = ['L1', 'L2', 'L3', 'L4', 'H1', 'H2', 'H3', 'H4', 'L1', 'L2', 'L3', 'L4'];
