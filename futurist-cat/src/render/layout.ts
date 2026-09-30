// One layout per width class. World coordinates = design units; the world is scaled to fit the
// area left by the HUD, so the HUD never covers the grid. HTML (logo, Ante) is placed with the
// same transform so it never overlaps the grid either.
export type WidthClass = 'xl' | 'md' | 'tablet' | 'portrait' | 'short';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Design {
  w: number; h: number;
  box: Rect; // everything that must stay visible (grid, cat, logo)
  logo: Rect; ante: Rect;
  grid: { x: number; y: number; cell: number; gap: number; pad: number }; // x,y = frame top-left
  counter: { x: number; y: number };
  cat: { x: number; y: number; height: number };
  focus: { x: number; y: number };
}
export interface Layout {
  cls: WidthClass; vw: number; vh: number;
  design: Design;
  scale: number; offX: number; offY: number;
  hud: { bottom: number; right: number };
  /** grid inner origin (cell 0,0 top-left) */
  cellOrigin: { x: number; y: number };
  gridW: number; gridH: number;
  toScreen(x: number, y: number): { x: number; y: number };
}

const LANDSCAPE: Design = {
  w: 1920, h: 1080,
  box: { x: 30, y: 20, w: 1790, h: 885 },
  logo: { x: 34, y: 30, w: 300, h: 138 },
  ante: { x: 58, y: 184, w: 252, h: 92 },
  grid: { x: 360, y: 74, cell: 170, gap: 8, pad: 34 },
  counter: { x: 835, y: 42 },
  cat: { x: 1560, y: 862, height: 640 },
  focus: { x: 835, y: 460 },
};
const SHORT: Design = {
  w: 1920, h: 1080,
  box: { x: 20, y: 16, w: 1690, h: 800 },
  logo: { x: 20, y: 18, w: 222, h: 102 },
  ante: { x: 20, y: 128, w: 226, h: 104 },
  grid: { x: 252, y: 26, cell: 170, gap: 8, pad: 34 },
  counter: { x: 727, y: 10 },
  cat: { x: 1450, y: 800, height: 600 },
  focus: { x: 727, y: 412 },
};
const PORTRAIT: Design = {
  w: 1080, h: 1920,
  box: { x: 24, y: 20, w: 1032, h: 1580 },
  logo: { x: 34, y: 22, w: 236, h: 104 },
  ante: { x: 34, y: 134, w: 310, h: 118 },
  grid: { x: 40, y: 262, cell: 180, gap: 8, pad: 34 },
  counter: { x: 540, y: 228 },
  cat: { x: 800, y: 1590, height: 440 },
  focus: { x: 540, y: 668 },
};

export function widthClass(vw: number, vh: number, coarse: boolean): WidthClass {
  if (vh > vw * 1.08) return 'portrait';
  if (vh < 520) return 'short';
  if (coarse && vw < 1366) return 'tablet';
  if (vw >= 1280) return 'xl';
  return 'md';
}

/** HUD footprint in CSS px for each class (mirrors ui/hud.css) */
export function hudSize(cls: WidthClass, vw: number, vh: number): { bottom: number; right: number } {
  switch (cls) {
    case 'xl': return { bottom: 112, right: 0 };
    case 'md': return { bottom: 100, right: 0 };
    case 'tablet': return { bottom: 118, right: 0 };
    case 'portrait': return { bottom: Math.round(Math.min(250, Math.max(176, vh * 0.23))), right: 0 };
    case 'short': return { bottom: 0, right: Math.round(Math.min(196, Math.max(156, vw * 0.2))) };
  }
}

export function computeLayout(vw: number, vh: number, coarse = false): Layout {
  const cls = widthClass(vw, vh, coarse);
  const d = cls === 'portrait' ? PORTRAIT : cls === 'short' ? SHORT : LANDSCAPE;
  const hud = hudSize(cls, vw, vh);
  const availW = vw - hud.right, availH = vh - hud.bottom;
  const scale = Math.min((availW * 0.985) / d.box.w, (availH * 0.985) / d.box.h);
  const offX = (availW - d.box.w * scale) / 2 - d.box.x * scale;
  const offY = (availH - d.box.h * scale) / 2 - d.box.y * scale;
  const g = d.grid;
  const gridW = 5 * g.cell + 4 * g.gap, gridH = 4 * g.cell + 3 * g.gap;
  return {
    cls, vw, vh, design: d, scale, offX, offY, hud,
    cellOrigin: { x: g.x + g.pad, y: g.y + g.pad }, gridW, gridH,
    toScreen: (x, y) => ({ x: offX + x * scale, y: offY + y * scale }),
  };
}

export function cellCenter(l: Layout, c: number, r: number): { x: number; y: number } {
  const g = l.design.grid;
  return { x: l.cellOrigin.x + c * (g.cell + g.gap) + g.cell / 2, y: l.cellOrigin.y + r * (g.cell + g.gap) + g.cell / 2 };
}
