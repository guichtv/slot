/**
 * Bras de Buck pilotés par la main (cinématique inverse à deux os, px de la texture du torse).
 * - Le poignet suit une trajectoire (courbe de Bézier quadratique) : les bras décrivent des arcs, jamais un
 *   balayage d'angles (plus de « bras en croix » entre deux poses).
 * - Côté du coude continu : s = +1 coude bas / extérieur quand la main est basse, s = -1 coude extérieur quand
 *   la main monte (bras levés, main sur le casque). Entre les deux, le bras passe par l'extension.
 * - Bras arrière = miroir du bras avant (même convention de s).
 */
export interface IkArm {
  upper: string;
  fore: string;
  hand: string;
  shoulder: [number, number];
  upperAxis: number;
  upperLen: number;
  foreAxis: number;
  foreLen: number;
  /** ouverture du poignet de manche (px de la texture du bras) : centre, demi-axes, angle du grand axe (deg) */
  opening?: { c: [number, number]; r: [number, number]; deg: number };
}

export type Vec = [number, number];
export type Side = 'F' | 'B';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** direction naturelle du coude (bras avant) : la main qui passe de part et d'autre de cet axe change le coude de côté */
export const POLE_F = 125;

/** angles de nœud (deg, absolus : repos compris) -> coude et poignet */
export function fk(a: IkArm, upperNode: number, foreNode: number): { elbow: Vec; wrist: Vec } {
  const uw = (upperNode + a.upperAxis) * RAD;
  const elbow: Vec = [a.shoulder[0] + Math.cos(uw) * a.upperLen, a.shoulder[1] + Math.sin(uw) * a.upperLen];
  const fw = (upperNode + foreNode + a.foreAxis) * RAD;
  return { elbow, wrist: [elbow[0] + Math.cos(fw) * a.foreLen, elbow[1] + Math.sin(fw) * a.foreLen] };
}

/**
 * Angles de nœud (deg, absolus) pour poser le poignet sur la cible.
 * s ∈ [-1, 1] : côté du coude (convention ci-dessus) ; |s| < 1 = coude à demi replié (passage par l'extension).
 */
export function solve(a: IkArm, side: Side, target: Vec, s: number): { upper: number; fore: number; elbow: Vec } {
  const [sx, sy] = a.shoulder;
  let dx = target[0] - sx;
  let dy = target[1] - sy;
  let d = Math.hypot(dx, dy) || 1e-6;
  const max = a.upperLen + a.foreLen - 1;
  const min = Math.abs(a.upperLen - a.foreLen) + 4;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  } else if (d < min) {
    dx *= min / d;
    dy *= min / d;
    d = min;
  }
  const theta = Math.atan2(dy, dx);
  const cosA = (a.upperLen ** 2 + d ** 2 - a.foreLen ** 2) / (2 * a.upperLen * d);
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const raw = side === 'F' ? s : -s;
  const upperWorld = theta + raw * alpha;
  const elbow: Vec = [sx + Math.cos(upperWorld) * a.upperLen, sy + Math.sin(upperWorld) * a.upperLen];
  const foreWorld = Math.atan2(sy + dy - elbow[1], sx + dx - elbow[0]);
  const upper = upperWorld * DEG - a.upperAxis;
  const fore = foreWorld * DEG - a.foreAxis - upper;
  return { upper: wrap(upper), fore: wrap(fore), elbow };
}

/**
 * Comme solve, mais pour poser un point de la main (jointure, anneau du poing, bout de l'allumette) sur la cible :
 * `off` = ce point dans le repère de la main (px du torse, main non tournée), `hr` = rotation de la main.
 * Renvoie aussi le poignet retenu.
 */
export function solveTip(a: IkArm, side: Side, target: Vec, s: number, off: Vec, hr: number): { upper: number; fore: number; elbow: Vec; wrist: Vec } {
  const tip = (upper: number, fore: number): Vec => {
    const w = (upper + fore + hr) * RAD;
    return [Math.cos(w) * off[0] - Math.sin(w) * off[1], Math.sin(w) * off[0] + Math.cos(w) * off[1]];
  };
  // première estimation : main dans l'axe du bras qui vise la cible
  const th = Math.atan2(target[1] - a.shoulder[1], target[0] - a.shoulder[0]) * DEG;
  let o = tip(th - a.foreAxis, 0);
  let wrist: Vec = [target[0] - o[0], target[1] - o[1]];
  let r = solve(a, side, wrist, s);
  // point fixe sous-relaxé : bras replié + main longue = itération qui oscille si on la laisse faire des pas entiers
  const minD = (a.upperLen + a.foreLen) * 0.28;
  for (let i = 0; i < 14; i++) {
    o = tip(r.upper, r.fore);
    wrist = [wrist[0] + (target[0] - o[0] - wrist[0]) * 0.5, wrist[1] + (target[1] - o[1] - wrist[1]) * 0.5];
    // jamais replié à bloc contre l'épaule (branche instable : le coude saute d'un côté à l'autre)
    const dx = wrist[0] - a.shoulder[0];
    const dy = wrist[1] - a.shoulder[1];
    const d = Math.hypot(dx, dy) || 1;
    if (d < minD) wrist = [a.shoulder[0] + (dx / d) * minD, a.shoulder[1] + (dy / d) * minD];
    r = solve(a, side, wrist, s);
  }
  return { ...r, wrist };
}

/** côté naturel du coude pour une main posée en `target` (coude jamais vers la tête ni dans le torse) */
export function naturalSide(a: IkArm, side: Side, target: Vec): 1 | -1 {
  let th = Math.atan2(target[1] - a.shoulder[1], target[0] - a.shoulder[0]) * DEG;
  if (side === 'B') th = 180 - th;
  return Math.sin((POLE_F - th) * RAD) >= 0 ? 1 : -1;
}

/**
 * Point de bascule du coude : bras presque tendu dans la direction naturelle du coude (le long du corps, un peu
 * dehors). Les deux solutions de coude s'y confondent, le changement de côté y est invisible.
 */
export function polePoint(a: IkArm, side: Side, ext = 0.96): Vec {
  const deg = side === 'F' ? POLE_F : 180 - POLE_F;
  const r = (a.upperLen + a.foreLen) * ext;
  return [a.shoulder[0] + Math.cos(deg * RAD) * r, a.shoulder[1] + Math.sin(deg * RAD) * r];
}

/** allonge relative (0 = replié, 1 = tendu) */
export function extension(a: IkArm, p: Vec): number {
  return Math.min(1, Math.hypot(p[0] - a.shoulder[0], p[1] - a.shoulder[1]) / (a.upperLen + a.foreLen));
}

export function bezier(p0: Vec, c: Vec, p1: Vec, u: number): Vec {
  const v = 1 - u;
  return [v * v * p0[0] + 2 * v * u * c[0] + u * u * p1[0], v * v * p0[1] + 2 * v * u * c[1] + u * u * p1[1]];
}

/**
 * Point de contrôle automatique : l'arc bombe vers l'extérieur du corps (gauche pour le bras avant, droite pour
 * l'arrière, un peu vers le bas), et reste loin de l'épaule pour que le bras ne se replie pas en passant.
 */
export function autoVia(a: IkArm, side: Side, p0: Vec, p1: Vec, bulge = 0.22, toWrist: (q: Vec) => Vec = (q) => q): Vec {
  const mx = (p0[0] + p1[0]) / 2;
  const my = (p0[1] + p1[1]) / 2;
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const len = Math.hypot(dx, dy);
  if (len < 90) return [mx, my];
  const out: Vec = side === 'F' ? [-1, 0.35] : [1, 0.35];
  let nx = -dy / len;
  let ny = dx / len;
  if (nx * out[0] + ny * out[1] < 0) {
    nx = -nx;
    ny = -ny;
  }
  const at = (b: number): Vec => {
    let c: Vec = [mx + nx * len * b, my + ny * len * b];
    // garde le point de contrôle hors de la zone où le bras se replie contre l'épaule
    const reach = a.upperLen + a.foreLen;
    const ex = c[0] - a.shoulder[0];
    const ey = c[1] - a.shoulder[1];
    const d = Math.hypot(ex, ey) || 1;
    const minD = reach * 0.5;
    if (d < minD) c = [a.shoulder[0] + (ex / d) * minD, a.shoulder[1] + (ey / d) * minD];
    return c;
  };
  // la main ne doit jamais frôler l'épaule en chemin (bras replié à bloc = coude qui se retourne) : on garde
  // l'arc vers l'extérieur s'il reste assez tendu, sinon on l'élargit, sinon on le fait passer de l'autre côté
  // (devant le ventre) ; à défaut, l'arc le moins replié
  const e0 = extension(a, toWrist(p0));
  const e1 = extension(a, toWrist(p1));
  let best = at(bulge);
  let bestScore = -Infinity;
  for (const b of [bulge, 0.35, 0.5, 0.7, 0, -0.15, -0.3, -0.45, -0.6]) {
    const c = at(b);
    const sc = margin(a, p0, c, p1, e0, e1, toWrist);
    if (sc >= 0) return c;
    if (sc > bestScore) {
      bestScore = sc;
      best = c;
    }
  }
  return best;
}

/** marge minimale d'allonge le long de l'arc par rapport à un plancher (interpolé entre les deux extrémités) */
function margin(a: IkArm, p0: Vec, c: Vec, p1: Vec, e0: number, e1: number, toWrist: (q: Vec) => Vec): number {
  let m = Infinity;
  for (let i = 1; i < 12; i++) {
    const u = i / 12;
    const floor = Math.min(0.5, e0 + (e1 - e0) * u) - 0.05;
    m = Math.min(m, extension(a, toWrist(bezier(p0, c, p1, u))) - floor);
  }
  return m;
}

export function wrap(a: number): number {
  let x = a % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}
