/**
 * Mise en page en source unique : la scène (canvas) et le HUD (HTML) lisent les mêmes rectangles.
 * Une composition par classe d'écran : grand desktop, ≈960-1279, tablette, mobile portrait,
 * mobile paysage court, petite fenêtre (Popout S).
 * Unités : pixels CSS de la fenêtre.
 */
export type LayoutClass = 'desktop' | 'laptop' | 'tablet' | 'portrait' | 'landscapeShort' | 'mini';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneLayout {
  cls: LayoutClass;
  vw: number;
  vh: number;
  /** zone réservée au HUD (bas ou colonnes latérales) */
  hud: Rect;
  /** zone de scène disponible (hors HUD, safe areas) */
  stage: Rect;
  /** grille (ouverture visible) */
  grid: Rect;
  cell: number;
  /** point d'ancrage des pieds de la mascotte et sa hauteur cible */
  mascot: { x: number; y: number; h: number; side: 'left' | 'right'; visible: boolean };
  logo: Rect;
  /** encart Ante (sous le logo, à gauche) */
  ante: Rect;
  /** barre au-dessus de la grille (compteur de free spins, progression) */
  topBar: Rect;
}

export interface GridSpec {
  cols: number;
  rows: number;
  /** épaisseur du cadre en fraction de cellule */
  frame: number;
}

export function classify(vw: number, vh: number): LayoutClass {
  const aspect = vw / vh;
  if (vw < 560 && vh < 560) return 'mini';
  if (aspect < 0.8) return vw >= 700 ? 'tablet' : 'portrait';
  if (vh < 520) return 'landscapeShort';
  if (vw >= 1280) return 'desktop';
  return 'laptop';
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function computeLayout(vw: number, vh: number, g: GridSpec, safe = { top: 0, right: 0, bottom: 0, left: 0 }): SceneLayout {
  const cls = classify(vw, vh);
  const W = vw - safe.left - safe.right;
  const H = vh - safe.top - safe.bottom;
  const ox = safe.left;
  const oy = safe.top;
  const framePad = (cell: number) => cell * g.frame;

  if (cls === 'desktop' || cls === 'laptop') {
    const hudH = clamp(H * 0.12, 88, 118);
    const hud = { x: ox, y: oy + H - hudH, w: W, h: hudH };
    const stage = { x: ox, y: oy, w: W, h: H - hudH };
    const topBarH = clamp(stage.h * 0.075, 34, 60);
    // grille dominante au centre : hauteur disponible et largeur ~46 % (place pour mascotte et logo)
    const availH = stage.h - topBarH - stage.h * 0.06;
    const availW = W * (cls === 'desktop' ? 0.5 : 0.54);
    const cell = Math.floor(Math.min(availH / (g.rows + 2 * g.frame), availW / (g.cols + 2 * g.frame)));
    const gw = cell * g.cols;
    const gh = cell * g.rows;
    const gx = ox + (W - gw) / 2;
    const gy = oy + topBarH + (stage.h - topBarH - gh) / 2 + stage.h * 0.01;
    const sideW = (W - gw) / 2 - framePad(cell);
    const logoW = clamp(sideW * 0.82, 160, 420);
    const logo = { x: ox + (sideW - logoW) / 2, y: gy - framePad(cell) * 0.2, w: logoW, h: logoW * 0.5 };
    const ante = { x: logo.x + logoW * 0.08, y: logo.y + logo.h + 12, w: logoW * 0.84, h: clamp(logoW * 0.36, 70, 130) };
    const mascotH = clamp(gh * 1.02, 240, 900);
    return {
      cls, vw, vh, hud, stage,
      grid: { x: gx, y: gy, w: gw, h: gh }, cell,
      mascot: { x: gx + gw + framePad(cell) + sideW * 0.5, y: gy + gh + framePad(cell) * 0.9, h: mascotH, side: 'right', visible: true },
      logo, ante,
      topBar: { x: gx, y: gy - framePad(cell) - topBarH, w: gw, h: topBarH },
    };
  }

  if (cls === 'landscapeShort') {
    // téléphone paysage : colonnes de commandes à droite (SPIN) et à gauche (BUY, menu)
    const colW = clamp(W * 0.15, 96, 150);
    const hud = { x: ox + W - colW, y: oy, w: colW, h: H };
    const leftW = clamp(W * 0.17, 110, 170);
    const stage = { x: ox + leftW, y: oy, w: W - colW - leftW, h: H };
    const topBarH = clamp(H * 0.09, 24, 40);
    const valuesH = clamp(H * 0.13, 38, 56);
    const availH = H - topBarH - valuesH - 8;
    const availW = stage.w * 0.66;
    const cell = Math.floor(Math.min(availH / (g.rows + 2 * g.frame), availW / (g.cols + 2 * g.frame)));
    const gw = cell * g.cols;
    const gh = cell * g.rows;
    const gx = stage.x + (stage.w * 0.66 - gw) / 2 + stage.w * 0.02;
    const gy = oy + topBarH + framePad(cell) + (availH - gh - 2 * framePad(cell)) / 2;
    const rightFree = stage.x + stage.w - (gx + gw + framePad(cell));
    const logoW = leftW * 0.92;
    return {
      cls, vw, vh, hud, stage,
      grid: { x: gx, y: gy, w: gw, h: gh }, cell,
      mascot: { x: gx + gw + framePad(cell) + rightFree * 0.5, y: gy + gh + framePad(cell), h: gh * 0.95, side: 'right', visible: rightFree > gh * 0.35 },
      logo: { x: ox + (leftW - logoW) / 2, y: oy + 6, w: logoW, h: logoW * 0.5 },
      ante: { x: ox + 6, y: oy + 8 + logoW * 0.5, w: leftW - 12, h: 64 },
      topBar: { x: gx, y: gy - framePad(cell) - topBarH, w: gw, h: topBarH },
    };
  }

  // portrait (mobile, tablette) et mini : grille pleine largeur, mascotte au-dessus, HUD en bas
  const hudH = cls === 'tablet' ? clamp(H * 0.2, 170, 230) : cls === 'mini' ? clamp(H * 0.26, 110, 150) : clamp(H * 0.24, 170, 220);
  const hud = { x: ox, y: oy + H - hudH, w: W, h: hudH };
  const stage = { x: ox, y: oy, w: W, h: H - hudH };
  const topBarH = clamp(stage.h * 0.06, 26, 48);
  const headerH = cls === 'mini' ? stage.h * 0.1 : stage.h * 0.26;
  const availH = stage.h - headerH - topBarH - 10;
  const availW = W * 0.96;
  const cell = Math.floor(Math.min(availH / (g.rows + 2 * g.frame), availW / (g.cols + 2 * g.frame)));
  const gw = cell * g.cols;
  const gh = cell * g.rows;
  const gx = ox + (W - gw) / 2;
  const gy = oy + headerH + topBarH + framePad(cell) + Math.max(0, (availH - gh - 2 * framePad(cell)) / 2);
  const logoW = clamp(W * 0.46, 150, 380);
  const mascotH = headerH * 1.25;
  return {
    cls, vw, vh, hud, stage,
    grid: { x: gx, y: gy, w: gw, h: gh }, cell,
    mascot: { x: ox + W * 0.76, y: gy - framePad(cell) * 0.2, h: mascotH, side: 'right', visible: cls !== 'mini' },
    logo: { x: ox + W * 0.04, y: oy + headerH * 0.12, w: logoW, h: logoW * 0.5 },
    ante: { x: ox + W * 0.04, y: oy + headerH * 0.12 + logoW * 0.5 + 4, w: logoW, h: 56 },
    topBar: { x: gx, y: gy - framePad(cell) - topBarH, w: gw, h: topBarH },
  };
}
