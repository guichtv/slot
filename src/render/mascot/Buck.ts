import { Container, Graphics, Sprite } from 'pixi.js';
import { gsap } from 'gsap';
import { Rig, type Pose, type RigDef } from '../rig/Rig';
import { hasTex, tex } from '../assets';
import { rand } from '../fx/particles';
import type { Beat } from '../../core/beat';
import type { SceneLayout } from '../layout';
import RIG_JSON from './buckRig.json';
import { autoVia, bezier, extension, fk, naturalSide, polePoint, solve, solveTip, wrap, type IkArm, type Side, type Vec } from './armIk';

/**
 * Buck Boomtooth : mascotte articulée (rig cut-out), pieds ancrés, ombre de contact.
 * - Repos : respiration articulée (torse, tête, épaules et bras), clignements, petits gestes espacés
 *   (mâchonner l'allumette, taper de la queue, lustrer la dent en or, lever les yeux vers son monument).
 * - Performances : allumette prise au coin de la bouche, frottée sur la dent en or puis lancée vers la charge,
 *   se couvrir le casque à l'impact, grimace pendant une chaîne, désigner le géant sculpté, coup de queue sur le
 *   Cornerstone, pouce levé, poing levé, acclamation, détonateur à piston, célébrations graduées.
 * - Priorités : repos 0 < geste 1 < réaction 2 < performance 3 < célébration 4 ; une demande ≥ interrompt.
 * - Bras pilotés par la main (armIk.ts) : chaque geste pose un point de la main (poignet, jointures, anneau du
 *   poing, allumette) sur une cible en px du torse ; la main y va en arc, le coude reste à l'extérieur et ne
 *   change de côté que bras tendu. Une action interrompue repart de la position réelle de la main.
 * - Ordre de dessin : bras devant le torse (les manches couvrent les épaules), derrière la tête ; devant la tête
 *   seulement quand la main touche le visage ou le casque. Au coude : l'avant-bras sort de l'ouverture de la manche
 *   (manches redessinées, intérieur sombre visible), dessiné devant elle et masqué en amont de l'ouverture (voir
 *   clipForearm) ; coude très plié : entier devant la manche. Main sur l'avant-bras.
 * - Accessoires (détonateur) : timeline à part, jamais tuée par une action suivante ; reset() les range.
 */
type BuckJson = RigDef & {
  ik: Record<'armF' | 'armB', IkArm>;
  points: Record<string, { part: string; alt?: string; xy: [number, number] }>;
};

const RIG = RIG_JSON as unknown as BuckJson;
const IK: Record<Side, IkArm> = { F: RIG.ik.armF, B: RIG.ik.armB };
const PART = Object.fromEntries(RIG.parts.map((p) => [p.id, p])) as Record<string, RigDef['parts'][number]>;
const REST_ANGLE = (id: string): number => PART[id]?.rest ?? 0;
const TORSO_PIVOT = PART.torso?.pivot ?? [272, 560];
const HEAD = PART.head as RigDef['parts'][number];

// repères de poses (px du torse). Le bras arrière est le miroir du bras avant autour du milieu des épaules.
const MID_X = (IK.F.shoulder[0] + IK.B.shoulder[0]) / 2;
const mirror = (p: Vec, dy = 5): Vec => [2 * MID_X - p[0], p[1] + dy];
/** repos : bras légèrement fléchis, coudes dehors, mains à hauteur des poches (comme l'illustration de référence) */
const REST_F: Vec = [-42, 455];
const REST: Record<Side, Vec> = { F: REST_F, B: mirror(REST_F) };
/** poings levés au-dessus de la tête, coudes dehors */
const UP_F: Vec = [-70, -235];
/** poings redescendus à hauteur d'oreille (pompe) */
const PUMP_F: Vec = [-112, -140];
/** bras tendu le long du corps, un peu dehors (point de bascule du coude) et arc latéral pour monter/descendre les poings */
const POLE_VIA: Record<Side, Vec> = { F: [-400, 170], B: mirror([-400, 170]) };
/** queue posée au sol derrière la botte : dessin aligné sur son axe (variante « ground ») et raccourci en profondeur */
const TAIL_SY = 0.62;
/** racine de la queue (repère du torse au repos, origine aux hanches) */
const TAIL_ROOT: Vec = [(PART.tail?.attach?.[0] ?? 420) - TORSO_PIVOT[0], (PART.tail?.attach?.[1] ?? 880) - TORSO_PIVOT[1]];

/**
 * Jambes : cuisse -> tibia, la semelle est l'effecteur. Chaque image, les semelles sont reposées à leur place
 * de repos (repère du corps) quel que soit le torse (rotation, flexion) : pieds ancrés, genoux vers l'extérieur.
 */
function legDef(thigh: string, shin: string, sole: Vec): IkArm {
  const t = PART[thigh]!;
  const s = PART[shin]!;
  const kt = t.scale ?? 1;
  const ks = s.scale ?? 1;
  const v1: Vec = [(s.attach![0] - t.pivot[0]) * kt, (s.attach![1] - t.pivot[1]) * kt];
  const v2: Vec = [(sole[0] - s.pivot[0]) * ks, (sole[1] - s.pivot[1]) * ks];
  return {
    upper: thigh,
    fore: shin,
    hand: '',
    shoulder: [t.attach![0] - TORSO_PIVOT[0], t.attach![1] - TORSO_PIVOT[1]],
    upperAxis: (Math.atan2(v1[1], v1[0]) * 180) / Math.PI,
    upperLen: Math.hypot(v1[0], v1[1]),
    foreAxis: (Math.atan2(v2[1], v2[0]) * 180) / Math.PI,
    foreLen: Math.hypot(v2[0], v2[1]),
  };
}
const LEG: Record<Side, IkArm> = { F: legDef('thighF', 'shinF', [150, 384]), B: legDef('thighB', 'shinB', [150, 398]) };
/** semelles au repos (repère du torse au repos = repère du corps, origine aux hanches) */
const SOLE: Record<Side, Vec> = {
  F: fk(LEG.F, REST_ANGLE('thighF'), REST_ANGLE('shinF')).wrist,
  B: fk(LEG.B, REST_ANGLE('thighB'), REST_ANGLE('shinB')).wrist,
};

/** points utiles des mains (px de la texture de chaque variante) */
const HAND_PT: Record<string, Vec> = {
  grip: [95, 180], // anneau du poing
  fist: [115, 215], // jointures
  open: [160, 190], // paume
  match: [197, 80], // tête de l'allumette
  point: [300, 50], // bout de l'index
};
/** repères sur la tête (px de la texture de la tête « repos ») */
const HEAD_PT = {
  matchStick: [72, 296] as Vec, // allumette au coin gauche de la bouche
  matchTip: [40, 300] as Vec, // son bout rouge
  tooth: [156, 292] as Vec, // dent en or
  domeF: [70, 110] as Vec, // dôme du casque, côté gauche (paume de la main avant)
  domeB: [360, 120] as Vec,
};

type Target = Vec | (() => Vec);
interface ArmKey {
  /** cible (px du torse) ; une fonction est réévaluée à chaque image (main collée au casque, à la poignée) */
  p: Target;
  /** point de la main posé sur la cible (nom d'un repère de main, ou décalage dans le repère de la main), sinon le poignet */
  tip?: keyof typeof HAND_PT | Vec;
  /** côté du coude (voir armIk) ; par défaut : côté naturel pour la cible */
  s?: 1 | -1;
  /** rotation de la main (deg, écart à l'avant-bras) */
  hr?: number;
  /** point de passage (courbe) ; null = ligne droite ; absent = arc automatique vers l'extérieur */
  via?: Vec | null;
  bulge?: number;
  /** main levée au départ : redescendre par le côté, bras tendu (point de bascule), puis vers la cible */
  pole?: boolean;
}
interface ArmState {
  /** poignet (px du torse) */
  p: Vec;
  s: number;
  hr: number;
  /** angles de nœuds résolus (absolus) */
  upper: number;
  fore: number;
}

export class Buck {
  readonly view = new Container();
  readonly rig: Rig;
  private shadow = new Graphics();
  private pri = 0;
  private current: gsap.core.Timeline | null = null;
  /** numéro de l'action en cours (incrémenté à chaque action acceptée et à chaque reset) */
  private actGen = 0;
  private blinkTimer: gsap.core.Tween | null = null;
  private gestureTimer: gsap.core.Tween | null = null;
  private breath = { k: 0 };
  private breathTl: gsap.core.Tween | null = null;
  private scaleK = 0.35;
  facing: 1 | -1 = 1;
  reducedMotion = false;
  /** vitesse de jeu (turbo) : réactions, performances et célébrations suivent le rythme des événements */
  speed = 1;
  /** lampe frontale rouge quand l'Ante est actif */
  private lamp = new Graphics();
  anteOn = false;
  /** détonateur à piston (accessoires ImageGen) : caisse + poignée en T, devant ses jambes */
  private detonator = new Container();
  private detBox: Sprite | null = null;
  private detHandle: Sprite | null = null;
  /** allumette non allumée (accessoire ImageGen) tenue dans le poing entre la bouche et la dent en or */
  private matchProp: Sprite | null = null;
  /** tête de l'allumette tenue (repère de la main) */
  private matchHead: Vec = [0, 0];
  /** point de départ de l'étincelle mémorisé au lâcher (lu par le présentateur juste après) */
  private releasedMatch: { p: { x: number; y: number }; t: number } | null = null;
  /** repères du détonateur (px du rig) : trou de la caisse, course de la poignée */
  private det = { x: -40, boxH: 400, holeY: -372, upY: 250, downY: 170 };
  private handle = { up: 1 };
  /** timeline des accessoires : indépendante des actions (une action qui en interrompt une autre ne laisse rien traîner) */
  private propTl: gsap.core.Timeline | null = null;
  /** état réel des mains, point de départ de tout mouvement de bras */
  private hands: Record<Side, ArmState> = { F: this.armAt('F', REST.F), B: this.armAt('B', REST.B) };
  /** dernier mouvement de bras démarré (par bras) : un mouvement plus récent a toujours la main */
  private armOwner: Record<Side, number> = { F: 0, B: 0 };
  private armSeq = 0;
  /** traîne des mains (action secondaire) : la main suit l'avant-bras avec un léger retard */
  /** pose de la queue (rotation dans le plan du sol : le torse qui pivote ne l'enfonce pas) */
  private tailPose = { r: 0, sy: TAIL_SY };
  /** avant-bras passés devant la manche (coude très plié, voir clipForearm) */
  private folded: Record<Side, boolean> = { F: false, B: false };
  /** masques des avant-bras (voir clipForearm) */
  private elbowMask: Record<Side, Graphics> = { F: new Graphics(), B: new Graphics() };
  private drag: Record<Side, { a: number; last: number; t: number }> = { F: { a: 0, last: NaN, t: 0 }, B: { a: 0, last: NaN, t: 0 } };

  constructor() {
    this.rig = new Rig(RIG, tex);
    this.view.addChild(this.shadow, this.rig.root, this.detonator);
    this.rig.part('head').addChild(this.lamp);
    this.buildDetonator();
    this.buildMatch();
    this.rig.setAlt('handF', 'open');
    this.rig.setAlt('handB', 'open');
    this.rig.setAlt('tail', 'ground');
    for (const side of ['F', 'B'] as const) {
      this.rig.part(IK[side].upper).addChild(this.elbowMask[side]);
      this.rig.sprite(IK[side].fore).mask = this.elbowMask[side];
    }
    // pieds : semelles des bottes (pas la boîte englobante des textures tournées) -> sur le centre de l'ombre
    this.rig.body.y = -this.soleY() + 3;
    // fin d'image, après toutes les animations : jambes (pieds ancrés), puis bras (respiration, traîne des mains)
    this.view.onRender = () => {
      this.applyLegs();
      this.updateDrag();
      this.applyArm('F');
      this.applyArm('B');
      this.clipForearm('F');
      this.clipForearm('B');
    };
    this.drawShadow(1);
    this.applyArm('F');
    this.applyArm('B');
    this.startIdle();
  }

  /**
   * Coude. La manche (dessin ImageGen) montre son ouverture et l'intérieur sombre du tube ; l'avant-bras en sort vers
   * nous : il est dessiné DEVANT la manche mais n'apparaît qu'en aval du plan de l'ouverture (côté main du grand axe de
   * l'ellipse) et dans l'ellipse elle-même. En amont, il est dans la manche : caché (jamais de fourrure à côté de la
   * manche). Coude très plié (> 103°, retour sous 85°) : l'avant-bras passe entier devant la manche.
   * Masque dans le repère du bras (suit la pliure).
   */
  private clipForearm(side: Side): void {
    const a = IK[side];
    const m = this.elbowMask[side];
    const fore = this.rig.part(a.fore);
    const bend = Math.abs(wrap(fore.angle + a.foreAxis - a.upperAxis));
    const folded = this.folded[side] ? bend > 85 : bend > 103;
    this.folded[side] = folded;
    m.clear();
    const op = a.opening;
    if (folded || !op) {
      m.rect(-5000, -5000, 10000, 10000).fill(0xffffff);
      return;
    }
    const ap = PART[a.upper]!;
    const ka = ap.scale ?? 1;
    const cx = (op.c[0] - ap.pivot[0]) * ka;
    const cy = (op.c[1] - ap.pivot[1]) * ka;
    const t = (op.deg * Math.PI) / 180;
    // plan de l'ouverture : grand axe de l'ellipse ; normale orientée à l'opposé de l'épaule (origine du repère)
    let nx = -Math.sin(t);
    let ny = Math.cos(t);
    if (nx * cx + ny * cy < 0) {
      nx = -nx;
      ny = -ny;
    }
    const tx = -ny;
    const ty = nx;
    const L = 3000;
    m.poly([cx + tx * L, cy + ty * L, cx + tx * L + nx * L, cy + ty * L + ny * L, cx - tx * L + nx * L, cy - ty * L + ny * L, cx - tx * L, cy - ty * L]).fill(0xffffff);
    const pts: number[] = [];
    for (let i = 0; i < 28; i++) {
      const w = (i / 28) * Math.PI * 2;
      const px = Math.cos(w) * op.r[0] * ka;
      const py = Math.sin(w) * op.r[1] * ka;
      pts.push(cx + px * Math.cos(t) - py * Math.sin(t), cy + px * Math.sin(t) + py * Math.cos(t));
    }
    m.poly(pts).fill(0xffffff);
  }

  /** bas des semelles dans le repère du corps (px), calculé par la chaîne cuisse -> tibia au repos */
  private soleY(): number {
    return Math.max(SOLE.F[1], SOLE.B[1]);
  }

  /**
   * Action secondaire : quand l'avant-bras tourne vite, la main traîne un peu derrière puis se replace
   * (quelques degrés, amortis). Horloge = temps global de GSAP (déterministe sous l'horloge virtuelle).
   */
  private updateDrag(): void {
    const now = gsap.globalTimeline.time();
    for (const side of ['F', 'B'] as const) {
      const st = this.hands[side];
      const d = this.drag[side];
      const fw = st.upper + st.fore;
      const dt = now - d.t;
      if (!Number.isNaN(d.last) && dt > 0 && dt < 0.1) {
        const w = wrap(fw - d.last) / dt;
        const target = Math.max(-16, Math.min(16, -w * 0.018));
        d.a += (target - d.a) * Math.min(1, dt * 14);
      } else if (dt >= 0.1) d.a = 0;
      d.last = fw;
      d.t = now;
    }
  }

  /**
   * Respiration des bras : décalage ajouté au poignet, plein au repos et qui s'efface dès que la main s'en éloigne
   * (aucun saut au début ni à la fin d'un geste).
   */
  private breathOff(side: Side): Vec {
    if (this.reducedMotion) return [0, 0];
    const st = this.hands[side];
    const d = Math.hypot(st.p[0] - REST[side][0], st.p[1] - REST[side][1]);
    const w = Math.max(0, Math.min(1, 1 - d / 70)) * Math.max(0, Math.min(1, (st.s - 0.5) * 2));
    const k = this.breath.k * w;
    return [(side === 'F' ? -5 : 5) * k, -7 * k];
  }

  /** pieds ancrés : les jambes sont résolues juste avant chaque rendu, après toutes les animations de l'image */
  private applyLegs(): void {
    const t = this.rig.part('torso');
    const c = Math.cos(-t.rotation);
    const s = Math.sin(-t.rotation);
    const pose: Pose = {};
    for (const side of ['F', 'B'] as const) {
      const x = SOLE[side][0] - t.x;
      const y = SOLE[side][1] - t.y;
      const r = solve(LEG[side], side, [x * c - y * s, x * s + y * c], 1);
      pose[LEG[side].upper] = { r: wrap(r.upper - REST_ANGLE(LEG[side].upper)) };
      pose[LEG[side].fore] = { r: wrap(r.fore - REST_ANGLE(LEG[side].fore)) };
    }
    // la queue reste posée au sol : sa racine ne suit pas le torse quand il se baisse ou pivote
    const tx = TAIL_ROOT[0] - t.x;
    const ty = TAIL_ROOT[1] - t.y;
    const lx = tx * c - ty * s;
    const ly = tx * s + ty * c;
    pose.tail = { x: lx - TAIL_ROOT[0], y: ly - TAIL_ROOT[1], r: this.tailPose.r - t.angle, sy: this.tailPose.sy };
    this.rig.set(pose);
  }

  private buildMatch(): void {
    if (!hasTex('buck.props.match')) return;
    const m = new Sprite(tex('buck.props.match'));
    // tige du bas (25,218) vers la tête rouge (73,34) ; posée dans l'anneau du poing, dans l'axe de la main
    m.anchor.set(25 / m.texture.width, 218 / m.texture.height);
    m.scale.set(0.5);
    m.angle = 180.7;
    const ring = this.handOff('F', 'grip');
    m.position.set(ring[0], ring[1]);
    m.zIndex = 1;
    m.visible = false;
    this.rig.part('handF').addChild(m);
    this.matchProp = m;
    this.matchHead = [ring[0] - 25, ring[1] + 92];
  }

  private buildDetonator(): void {
    if (!hasTex('buck.props.box') || !hasTex('buck.props.handle')) return;
    const box = new Sprite(tex('buck.props.box'));
    const handle = new Sprite(tex('buck.props.handle'));
    const k = this.det.boxH / box.texture.height;
    box.scale.set(k);
    handle.scale.set(k);
    box.anchor.set(0.5, 1);
    handle.anchor.set(0.5, 1);
    // trou de laiton : 53 % de la largeur, 7 % de la hauteur de la caisse
    box.position.set(this.det.x, 0);
    const holeX = this.det.x + box.texture.width * k * 0.03;
    this.det.holeY = -this.det.boxH * 0.93;
    handle.x = holeX;
    // la tige plonge dans la caisse : poignée dessinée derrière la caisse
    this.detonator.addChild(handle, box);
    this.detonator.visible = false;
    this.detBox = box;
    this.detHandle = handle;
    this.setHandle(1);
  }

  /** position de la poignée : 1 = tirée, 0 = enfoncée */
  private setHandle(up: number): void {
    const h = this.detHandle;
    if (!h) return;
    const hh = h.texture.height * h.scale.y;
    const visible = this.det.downY + (this.det.upY - this.det.downY) * up; // longueur de tige visible au-dessus du trou
    h.y = this.det.holeY - visible + hh * 0.97;
  }

  /** prises sur la barre en T (px du torse) : les jointures des poings s'y posent */
  private grip(side: Side): Vec {
    const h = this.detHandle;
    if (!h) return REST[side];
    const w = h.texture.width * h.scale.x;
    const hh = h.texture.height * h.scale.y;
    const bar = h.y - hh + hh * 0.07 + this.detonator.y;
    const x = h.x + this.detonator.x + (side === 'F' ? -w * 0.28 : w * 0.28);
    return this.viewToTorso([x, bar]);
  }

  /** hauteur de référence du rig (px de texture) */
  get rigHeight(): number {
    return this.rig.root.getLocalBounds().height;
  }

  layout(l: SceneLayout): void {
    this.view.visible = l.mascot.visible;
    this.scaleK = l.mascot.h / 1400;
    this.view.scale.set(this.scaleK * this.facing, this.scaleK);
    this.view.position.set(l.mascot.x, l.mascot.y);
  }

  private drawShadow(k: number): void {
    const g = this.shadow;
    g.clear();
    for (let i = 0; i < 3; i++) g.ellipse(0, 0, (260 - i * 50) * k, (46 - i * 9) * k).fill({ color: 0x1b1410, alpha: 0.12 + i * 0.06 });
  }

  // ------------------------------------------------------------------ bras (main pilotée)

  private armAt(side: Side, p: Vec, s = 1): ArmState {
    const r = solve(IK[side], side, p, s);
    return { p: [p[0], p[1]], s, hr: 0, upper: r.upper, fore: r.fore };
  }

  /** point de la main (px de texture de la variante) dans le repère de la main, px du torse */
  private handOff(side: Side, tip: keyof typeof HAND_PT): Vec {
    const id = side === 'F' ? 'handF' : 'handB';
    const part = PART[id]!;
    const alt = RIG.alternates?.[id]?.[tip];
    const pv = alt?.pivot ?? part.pivot;
    const k = part.scale ?? 1;
    const flip = (alt?.flip ?? part.flip) ? -1 : 1;
    const t = HAND_PT[tip]!;
    const x = (t[0] - pv[0]) * k * flip;
    const y = (t[1] - pv[1]) * k;
    const a = ((alt?.r ?? 0) * Math.PI) / 180;
    return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  }

  /** position actuelle d'un point de la main (px du torse) */
  private tipNow(side: Side, off: Vec): Vec {
    const st = this.hands[side];
    const w = ((st.upper + st.fore + st.hr) * Math.PI) / 180;
    return [st.p[0] + Math.cos(w) * off[0] - Math.sin(w) * off[1], st.p[1] + Math.sin(w) * off[0] + Math.cos(w) * off[1]];
  }

  /** comme Rig.to, mais la queue (posée au sol) s'anime à part : applyLegs la repose chaque image */
  private to(pose: Pose, d: number, ease: string, tl: gsap.core.Timeline, at: number | string): void {
    const { tail, ...rest } = pose;
    if (Object.keys(rest).length) this.rig.to(rest, d, ease, tl, at);
    if (tail && (tail.r !== undefined || tail.sy !== undefined)) {
      const v: gsap.TweenVars = { duration: d, ease };
      if (tail.r !== undefined) v.r = tail.r;
      if (tail.sy !== undefined) v.sy = tail.sy;
      tl.to(this.tailPose, v, at);
    }
  }

  /**
   * Poing levé : le bras s'écarte d'abord, tendu, le long du corps (le coude y change de côté sans se voir),
   * puis monte en arc latéral jusqu'au-dessus de la tête, coude dehors.
   */
  private raise(tl: gsap.core.Timeline, side: Side, target: Vec, at: number, d = 0.27): void {
    this.arm(tl, side, { p: polePoint(IK[side], side, 0.99), s: 1, via: null }, 0.07, 'power1.in', at);
    this.arm(tl, side, { p: target, s: -1, via: POLE_VIA[side] }, d - 0.07, 'back.out(1.2)', at + 0.07);
  }

  /** une pompe des deux poings levés (évite la pose figée), le corps et la queue suivent */
  private pumpOnce(tl: gsap.core.Timeline, up: Vec, at: number): void {
    const low: Vec = [up[0] - 30, up[1] + 105];
    this.arm(tl, 'F', { p: low, via: null }, 0.12, 'sine.inOut', at);
    this.arm(tl, 'B', { p: mirror(low), via: null }, 0.12, 'sine.inOut', at);
    this.arm(tl, 'F', { p: up, via: null }, 0.13, 'sine.inOut', at + 0.12);
    this.arm(tl, 'B', { p: mirror(up), via: null }, 0.13, 'sine.inOut', at + 0.12);
    this.to({ torso: { r: 2, y: 12 }, tail: { r: -12 } }, 0.12, 'sine.inOut', tl, at);
    this.to({ torso: { r: 0, y: 0 }, tail: { r: 0 } }, 0.13, 'sine.inOut', tl, at + 0.12);
  }

  /** pose le bras d'après l'état de sa main (+ respiration près du repos, + traîne de la main) */
  private applyArm(side: Side): void {
    const a = IK[side];
    const st = this.hands[side];
    const b = this.breathOff(side);
    const r = solve(a, side, [st.p[0] + b[0], st.p[1] + b[1]], st.s);
    st.upper = r.upper;
    st.fore = r.fore;
    this.rig.set({
      [a.upper]: { r: wrap(r.upper - REST_ANGLE(a.upper)) },
      [a.fore]: { r: wrap(r.fore - REST_ANGLE(a.fore)) },
      [a.hand]: { r: st.hr + (this.reducedMotion ? 0 : this.drag[side].a) },
    });
  }

  /** place un point de la main (ou le poignet) sur `q` ; garde le poignet réellement atteint (jamais une cible hors d'allonge) */
  private placeArm(side: Side, q: Vec, s: number, hr: number, off: Vec | null): void {
    const st = this.hands[side];
    st.s = s;
    st.hr = hr;
    const r = off ? solveTip(IK[side], side, q, s, off, hr) : solve(IK[side], side, q, s);
    st.p = fk(IK[side], r.upper, r.fore).wrist;
    this.applyArm(side);
  }

  private tipOff(side: Side, tip: keyof typeof HAND_PT | Vec): Vec {
    return typeof tip === 'string' ? this.handOff(side, tip) : tip;
  }

  private resolve(t: Target): Vec {
    return typeof t === 'function' ? t() : t;
  }

  /**
   * Mouvement de main : le point visé part de sa position réelle et suit un arc jusqu'à la cible.
   * Changement de côté du coude : là où le poignet passe la direction naturelle du coude (le long du corps) ;
   * à défaut à une extrémité bras tendu ; à défaut la main fait un détour par le point de bascule (bras tendu
   * le long du corps), où les deux coudes se confondent. Jamais de coude qui passe par-dessus l'épaule.
   */
  private arm(tl: gsap.core.Timeline, side: Side, key: ArmKey, dur: number, ease: string, at: number | string): void {
    const a = IK[side];
    const st = this.hands[side];
    const prog = { u: 0 };
    let id = 0;
    let off: Vec | null = null;
    let p0: Vec = st.p;
    let p1: Vec = st.p;
    let c: Vec = st.p;
    let two: { P: Vec; c1: Vec; c2: Vec; k: number } | null = null;
    let s0 = 1;
    let s1 = 1;
    let h0 = 0;
    let h1 = 0;
    let lo = 0;
    let hi = 1;
    let flipAt = -1;
    const tw = gsap.to(
      prog,
      {
        u: 1,
        duration: dur,
        ease,
        onStart: () => {
          id = ++this.armSeq;
          this.armOwner[side] = id;
          off = key.tip ? this.tipOff(side, key.tip) : null;
          const o = off;
          p0 = o ? this.tipNow(side, o) : [st.p[0], st.p[1]];
          p1 = this.resolve(key.p);
          s0 = st.s;
          h0 = st.hr;
          h1 = key.hr ?? 0;
          const toWrist = (q: Vec, s: number): Vec => (o ? solveTip(a, side, q, s, o, h1).wrist : q);
          const w0: Vec = [st.p[0], st.p[1]];
          const w1 = toWrist(p1, key.s ?? s0);
          s1 = key.s ?? naturalSide(a, side, w1);
          const via = (q0: Vec, q1: Vec, s: number): Vec =>
            key.via === null ? [(q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2] : (key.via ?? autoVia(a, side, q0, q1, key.bulge, (q) => toWrist(q, s)));
          c = via(p0, p1, s0);
          two = null;
          lo = 0;
          hi = 1;
          flipAt = -1;
          if (key.pole && !o && s0 !== s1 && st.p[1] < a.shoulder[1] + 60) {
            // poing levé -> bas : grand arc latéral jusqu'au bras tendu le long du corps, puis le coude se replie
            const P = polePoint(a, side, 0.99);
            two = { P, c1: POLE_VIA[side], c2: [(P[0] + p1[0]) / 2, (P[1] + p1[1]) / 2], k: 0.62 };
            lo = 0.56;
            hi = 0.68;
          } else if (s0 !== s1) {
            let bu = -1;
            for (let i = 1; i <= 24 && bu < 0; i++) {
              const u = i / 24;
              if (naturalSide(a, side, toWrist(bezier(p0, c, p1, u), s0)) === s1) bu = u;
            }
            if (bu < 0 && extension(a, w1) >= 0.93) bu = 1;
            else if (bu < 0 && extension(a, w0) >= 0.93) bu = 0;
            else if (bu < 0) {
              // détour par le point de bascule (bras tendu le long du corps)
              const P = polePoint(a, side);
              const rP = solve(a, side, P, s0);
              const wr = ((rP.upper + rP.fore + h1) * Math.PI) / 180;
              const Pt: Vec = o ? [P[0] + Math.cos(wr) * o[0] - Math.sin(wr) * o[1], P[1] + Math.sin(wr) * o[0] + Math.cos(wr) * o[1]] : P;
              two = { P: Pt, c1: via(p0, Pt, s0), c2: via(Pt, p1, s1), k: 0.5 };
              bu = 0.5;
            }
            lo = Math.max(0, Math.min(0.84, bu - 0.08));
            hi = lo + 0.16;
          }
        },
        onUpdate: () => {
          if (this.armOwner[side] !== id) return;
          const u = prog.u;
          const end = typeof key.p === 'function' ? key.p() : p1;
          const q = two ? (u < two.k ? bezier(p0, two.c1, two.P, u / two.k) : bezier(two.P, two.c2, end, (u - two.k) / (1 - two.k))) : bezier(p0, c, end, u);
          // bascule du coude : démarre quand la trajectoire atteint la fenêtre, dure au moins ~3 images (temps réel)
          const lin = tw.progress();
          if (flipAt < 0 && u >= lo) flipAt = lin;
          const span = Math.max(hi - lo, 0.05 / Math.max(dur, 0.01));
          const w = s0 === s1 || lin >= 1 ? 1 : flipAt < 0 ? 0 : smooth((lin - flipAt) / span);
          this.placeArm(side, q, s0 + (s1 - s0) * w, h0 + (h1 - h0) * Math.min(1.15, Math.max(0, u)), off);
        },
      },
    );
    tl.add(tw, at);
  }

  /** main maintenue sur une cible mobile (poignée, casque) pendant `dur` */
  private pin(tl: gsap.core.Timeline, side: Side, p: () => Vec, dur: number, at: number | string, tip?: keyof typeof HAND_PT): void {
    const prog = { u: 0 };
    let id = 0;
    tl.to(
      prog,
      {
        u: 1,
        duration: dur,
        ease: 'none',
        onStart: () => {
          id = ++this.armSeq;
          this.armOwner[side] = id;
        },
        onUpdate: () => {
          if (this.armOwner[side] !== id) return;
          const st = this.hands[side];
          this.placeArm(side, p(), st.s, st.hr, tip ? this.handOff(side, tip) : null);
        },
      },
      at,
    );
  }

  /** cible à une fraction de l'allonge : la main désigne sans entrer dans la grille */
  private reachPt(side: Side, target: Vec, frac = 0.75): Vec {
    const [sx, sy] = IK[side].shoulder;
    const dx = target[0] - sx;
    const dy = target[1] - sy;
    const d = Math.hypot(dx, dy) || 1;
    const lim = (IK[side].upperLen + IK[side].foreLen) * frac;
    const k = d > lim ? lim / d : 1;
    return [sx + dx * k, sy + dy * k];
  }

  /** point de la tête (px de sa texture) en px du torse, en suivant l'inclinaison et la respiration de la tête */
  private headPt(hx: number, hy: number): Vec {
    const h = this.rig.part('head');
    const k = HEAD.scale ?? 1;
    const lx = (hx - HEAD.pivot[0]) * k - h.pivot.x;
    const ly = (hy - HEAD.pivot[1]) * k - h.pivot.y;
    const c = Math.cos(h.rotation);
    const s = Math.sin(h.rotation);
    return [h.x + lx * c - ly * s + TORSO_PIVOT[0], h.y + lx * s + ly * c + TORSO_PIVOT[1]];
  }

  /** point de la vue de Buck (px du rig, pieds à l'origine) -> px du torse */
  private viewToTorso(v: Vec): Vec {
    const t = this.rig.part('torso');
    const x = v[0] - this.rig.body.x - t.x;
    const y = v[1] - this.rig.body.y - t.y;
    const c = Math.cos(-t.rotation);
    const s = Math.sin(-t.rotation);
    return [x * c - y * s + TORSO_PIVOT[0], x * s + y * c + TORSO_PIVOT[1]];
  }

  // ------------------------------------------------------------------ repos

  private startIdle(): void {
    // respiration articulée : torse, tête, épaules et bras bougent ensemble (aucun raccord ne s'ouvre)
    this.breathTl?.kill();
    this.breathTl = gsap.to(this.breath, {
      k: 1,
      duration: 1.6,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      onUpdate: () => this.applyBreath(),
    });
    this.scheduleBlink();
    this.scheduleGesture();
  }

  private applyBreath(): void {
    // mouvement réduit : pas de respiration visible
    const k = this.reducedMotion ? 0 : this.breath.k;
    this.rig.sprite('torso').scale.y = 1 + k * 0.022;
    // la tête et les épaules suivent le soulèvement de la poitrine (les bras : breathOff, appliqué en fin d'image)
    const lift = -k * 10;
    const head = this.rig.part('head');
    head.pivot.y = -lift;
    this.rig.part('armF').pivot.y = -lift * 0.85;
    this.rig.part('armB').pivot.y = -lift * 0.85;
    this.drawShadow(1 - k * 0.02);
  }

  private scheduleBlink(): void {
    this.blinkTimer?.kill();
    this.blinkTimer = gsap.delayedCall(2.6 + rand() * 3.4, () => {
      const head = this.rig.getAlt('head');
      if (this.pri <= 1 && (head === '' || head === 'rest')) {
        this.rig.setAlt('head', 'blink');
        gsap.delayedCall(0.11, () => {
          if (this.rig.getAlt('head') === 'blink') this.rig.setAlt('head', 'rest');
        });
      }
      this.scheduleBlink();
    });
  }

  private scheduleGesture(): void {
    this.gestureTimer?.kill();
    this.gestureTimer = gsap.delayedCall(8 + rand() * 8, () => {
      // mouvement réduit : aucun geste d'attente (seules les réactions utiles au jeu restent)
      if (this.pri === 0 && !this.reducedMotion) this.gesture(Math.floor(rand() * 4));
      this.scheduleGesture();
    });
  }

  private gesture(kind: number): void {
    const tl = gsap.timeline();
    const R = this.rig;
    switch (kind) {
      case 0: // mâchonne l'allumette : la mâchoire travaille (même dessin de tête, l'allumette suit la tête)
        for (let i = 0; i < 3; i++) {
          this.to({ head: { sy: 0.955, sx: 1.025, y: 4, r: 3 } }, 0.09, 'power2.out', tl, i * 0.22);
          this.to({ head: { sy: 1.01, sx: 0.995, y: 0, r: -2 } }, 0.11, 'sine.inOut', tl, i * 0.22 + 0.09);
        }
        this.to({ head: { sy: 1, sx: 1, r: 0 } }, 0.2, 'sine.inOut', tl, 0.66);
        break;
      case 1: // tape de la queue : élan (la pointe se lève), coup au sol (écrasement), rebond, second petit coup
        this.to({ tail: { r: -24, sy: TAIL_SY * 1.05 }, torso: { r: -1 } }, 0.16, 'power2.out', tl, 0);
        this.to({ tail: { r: 0, sy: TAIL_SY * 0.86 }, torso: { r: 1 } }, 0.07, 'power3.in', tl, 0.16);
        this.to({ tail: { r: -9, sy: TAIL_SY } }, 0.1, 'power2.out', tl, 0.23);
        this.to({ tail: { r: 0, sy: TAIL_SY * 0.92 } }, 0.07, 'power3.in', tl, 0.33);
        this.to({ tail: { r: 0, sy: TAIL_SY }, torso: { r: 0 } }, 0.35, 'elastic.out(1,0.5)', tl, 0.4);
        break;
      case 2: {
        // lustre sa dent en or : il penche la tête vers son poing, qui monte par-dessous (coude bas),
        // les jointures frottent le dessous de la dent ; replié, l'avant-bras passe devant la manche
        const tooth = () => this.headPt(HEAD_PT.tooth[0], HEAD_PT.tooth[1] + 40);
        this.front(tl, 0.12, ['B']);
        this.to({ handB: { alt: 'fist' }, head: { r: 8, x: 14 } }, 0.4, 'sine.inOut', tl, 0.02);
        this.arm(tl, 'B', { p: tooth, tip: 'fist', s: 1, hr: -18 }, 0.45, 'sine.inOut', 0);
        for (let i = 0; i < 4; i++) {
          const dx = i % 2 === 0 ? -16 : 16;
          this.arm(tl, 'B', { p: () => { const t = tooth(); return [t[0] + dx, t[1] + 2]; }, tip: 'fist', s: 1, hr: -18, via: null }, 0.08, 'sine.inOut', 0.5 + i * 0.09);
          this.to({ head: { r: 8 + (i % 2 === 0 ? 1.5 : -1.5) } }, 0.08, 'sine.inOut', tl, 0.5 + i * 0.09);
        }
        this.pin(tl, 'B', tooth, 0.12, 0.86, 'fist');
        tl.call(() => R.setAlt('head', 'grin'), [], 0.88);
        // retour : le poing redescend par le côté droit du torse (jamais en travers du ventre)
        this.back(tl, 1.02, 0.45, { B: [470, 330] });
        break;
      }
      default: // lève les yeux vers son monument (menton levé, lente dérive), puis clin d'œil vaniteux bref
        this.to({ head: { r: 9, y: -10, sy: 0.97 }, torso: { r: -1.5 } }, 0.35, 'sine.inOut', tl, 0);
        this.to({ head: { r: 12 } }, 0.55, 'sine.inOut', tl, 0.35);
        tl.call(() => R.setAlt('head', 'wink'), [], 0.9);
        this.to({ head: { r: 9.5 } }, 0.1, 'power2.out', tl, 0.9);
        tl.call(() => R.setAlt('head', 'rest'), [], 1.08);
        this.to({ head: { r: 11.5 } }, 0.14, 'back.out(2)', tl, 1.08);
        this.back(tl, 1.35, 0.4);
    }
    this.run(tl, 1);
  }

  // ------------------------------------------------------------------ orchestration

  /** lance une timeline avec une priorité ; interrompt une action de priorité ≤ */
  private run(tl: gsap.core.Timeline, pri: number): gsap.core.Timeline | null {
    if (pri < this.pri && this.current?.isActive()) {
      tl.kill();
      return null;
    }
    this.current?.kill();
    this.pri = pri;
    this.current = tl;
    this.actGen++;
    // turbo : les gestes utiles au jeu (réactions et au-delà) accélèrent comme les attentes du Beat
    if (pri >= 2) tl.timeScale(this.speed);
    tl.eventCallback('onComplete', () => {
      if (this.current === tl) {
        this.pri = 0;
        this.current = null;
      }
    });
    return tl;
  }

  /** termine une action (si c'est toujours la courante) : sa priorité ne bloque plus la suite */
  private release(tl: gsap.core.Timeline): void {
    if (this.current !== tl) return;
    tl.kill();
    this.current = null;
    this.pri = 0;
  }

  /** retour au repos : les mains redescendent en arc, puis les bras reprennent leur ordre de dessin */
  private back(tl: gsap.core.Timeline, at: number | string, d = 0.35, via: Partial<Record<Side, Vec>> = {}): void {
    tl.addLabel('back', at);
    // pouce / index : le poing se referme avant que le bras ne tourne (jamais de pouce vers le bas)
    tl.call(() => {
      for (const h of ['handF', 'handB']) if (['thumb', 'point'].includes(this.rig.getAlt(h))) this.rig.setAlt(h, 'fist');
    }, [], 'back');
    this.to({ torso: { r: 0, y: 0 }, head: { r: 0, x: 0, y: 0, sx: 1, sy: 1 }, tail: { r: 0, sy: TAIL_SY } }, d, 'power2.inOut', tl, 'back');
    tl.call(() => this.rig.setAlt('head', 'rest'), [], `back+=${d * 0.5}`);
    this.arm(tl, 'F', { p: REST.F, s: 1, via: via.F, pole: true }, d * 1.25, 'power2.inOut', 'back');
    this.arm(tl, 'B', { p: REST.B, s: 1, via: via.B, pole: true }, d * 1.25, 'power2.inOut', 'back');
    // mains ouvertes quand elles sont presque en bas
    tl.call(() => this.rig.setAlt('handF', 'open'), [], `back+=${d * 0.9}`);
    tl.call(() => this.rig.setAlt('handB', 'open'), [], `back+=${d * 0.9}`);
    tl.call(() => this.resetZ(), [], `back+=${d * 1.25}`);
  }

  private resetZ(): void {
    this.rig.resetZ();
  }

  /** passe un ou deux bras devant la tête (z 6 : main sur le visage ou le casque) */
  private front(tl: gsap.core.Timeline, at: number, arms: Array<'F' | 'B'>, z = 6): void {
    tl.call(
      () => {
        const o: Record<string, number> = {};
        for (const a of arms) o[`arm${a}`] = z;
        this.rig.setZ(o);
      },
      [],
      at,
    );
  }

  /**
   * Départ de l'étincelle (coordonnées globales) : la flamme de l'allumette tenue, ou le point mémorisé au lâcher
   * (valable 0,5 s), sinon l'allumette de la bouche.
   */
  matchPoint(): { x: number; y: number } {
    const now = gsap.globalTimeline.time();
    if (this.releasedMatch && now - this.releasedMatch.t < 0.5) return this.releasedMatch.p;
    if (this.rig.getAlt('handF') === 'match') {
      const p = RIG.points.matchTip as { part: string; xy: [number, number] };
      return this.rig.worldOf(p.part, p.xy[0], p.xy[1]);
    }
    return this.rig.worldOf('head', HEAD_PT.matchTip[0], HEAD_PT.matchTip[1]);
  }

  /**
   * Performance bloquante (promesse résolue au moment utile pour l'enchaînement).
   * strikeMatch : l'étincelle part quand la promesse se résout (bras tendu vers la cible).
   */
  async perform(name: string, beat: Beat, arg?: { target?: { x: number; y: number }; tier?: number; throw?: boolean }): Promise<void> {
    const R = this.rig;
    const tl = gsap.timeline();
    switch (name) {
      case 'strikeMatch': {
        // 1. la main arrive par le côté (coude dehors, poignet cassé) et pince l'allumette au coin de la bouche ;
        // 2. tête de l'allumette frottée sur la dent en or : elle s'enflamme en fin de frottement ;
        // 3. il arme le bras puis le lance vers la charge et lâche l'allumette (l'étincelle part de la flamme)
        const stick = () => this.headPt(HEAD_PT.matchStick[0], HEAD_PT.matchStick[1]);
        const tooth = () => this.headPt(HEAD_PT.tooth[0], HEAD_PT.tooth[1]);
        const onTooth = (dx: number, dy: number) => () => { const q = tooth(); return [q[0] + dx, q[1] + dy] as Vec; };
        const prop = this.matchProp;
        this.to({ head: { r: 2 }, torso: { r: 1 } }, 0.06, 'sine.inOut', tl, 0);
        tl.call(() => R.setAlt('handF', 'grip'), [], 0.02);
        this.front(tl, 0.14, ['F']);
        this.arm(tl, 'F', { p: stick, tip: 'grip', s: -1, hr: 38 }, 0.22, 'power2.out', 0.04);
        this.to({ head: { r: -3 }, torso: { r: -2 } }, 0.2, 'power2.out', tl, 0.06);
        // pincée : l'allumette passe de la bouche au poing
        tl.call(() => {
          R.setAlt('head', 'grin');
          if (prop) prop.visible = true;
        }, [], 0.26);
        // frottement : la tête de l'allumette traverse la dent en or
        const head = this.matchHead;
        this.arm(tl, 'F', { p: onTooth(-50, -8), tip: head, s: -1, hr: 30, via: null }, 0.06, 'power2.out', 0.27);
        this.arm(tl, 'F', { p: onTooth(45, 12), tip: head, s: -1, hr: 24, via: null }, 0.1, 'power2.inOut', 0.33);
        // flamme
        tl.call(() => {
          if (prop) prop.visible = false;
          R.setAlt('handF', 'match');
        }, [], 0.43);
        this.to({ head: { r: 1 } }, 0.06, 'power2.out', tl, 0.43);
        const t = arg?.target ? this.toTorso(arg.target) : ([-500, -200] as Vec);
        // prototype blast-throw : pichenette vers le haut (le bras ne vise plus la charge)
        const aim = arg?.throw ? this.reachPt('F', [t[0] * 0.3, -420], 0.7) : this.reachPt('F', t, 0.6);
        // armer (allumette levée, coude bas) puis lancer, sans jamais tendre le bras jusque dans la grille
        this.front(tl, 0.46, ['F'], 2);
        this.arm(tl, 'F', { p: [-60, -170], s: -1 }, 0.08, 'power2.inOut', 0.44);
        this.arm(tl, 'F', { p: aim, s: -1, via: [-400, -40] }, 0.18, 'power3.out', 0.52);
        this.to({ head: { r: -6 }, torso: { r: -3 } }, 0.18, 'back.out(1.6)', tl, 0.52);
        tl.addLabel('flick', 0.72);
        this.run(tl, 3);
        const gen = this.actGen;
        await beat.play(gsap.timeline().to({}, { duration: 0.72 }));
        // interrompu par une autre action ou un reset : rien à lâcher ni à reprendre
        if (this.actGen !== gen) return;
        // lâcher : le présentateur lit le départ de l'étincelle juste après (flamme mémorisée)
        this.releasedMatch = { p: this.matchPoint(), t: gsap.globalTimeline.time() };
        this.release(tl);
        R.setAlt('handF', 'open');
        // accompagnement du lancer, puis il reprend une allumette au coin de la bouche (non bloquant)
        const out = gsap.timeline({ delay: 0.02 });
        const [sx, sy] = IK.F.shoulder;
        const da = Math.hypot(aim[0] - sx, aim[1] - sy) || 1;
        this.arm(out, 'F', { p: [aim[0] + ((aim[0] - sx) / da) * 30, aim[1] + ((aim[1] - sy) / da) * 30], s: -1, hr: 15, via: null }, 0.1, 'power2.out', 0);
        out.call(() => R.setAlt('handF', 'grip'), [], 0.2);
        this.arm(out, 'F', { p: stick, tip: 'grip', s: -1, hr: 38 }, 0.3, 'power2.inOut', 0.12);
        this.front(out, 0.3, ['F']);
        out.call(() => R.setAlt('head', 'rest'), [], 0.42);
        this.arm(out, 'F', { p: () => { const q = stick(); return [q[0] - 70, q[1] - 10] as Vec; }, tip: 'grip', s: -1, hr: 30, via: null }, 0.1, 'power2.out', 0.44);
        this.back(out, 0.56, 0.45);
        this.run(out, 2);
        return;
      }
      case 'cheer':
      case 'triggerCheer': {
        tl.call(() => {
          R.setAlt('handF', 'fist');
          R.setAlt('handB', 'fist');
        }, [], 0);
        this.to({ head: { alt: 'shout', r: -4 }, tail: { r: -14 } }, 0.22, 'back.out(2)', tl, 0);
        // petit saut : les pieds quittent le sol puis il se réceptionne genoux fléchis
        this.to({ torso: { y: -30 } }, 0.14, 'power2.out', tl, 0.02);
        this.to({ torso: { y: 14 } }, 0.12, 'power2.in', tl, 0.16);
        this.to({ torso: { y: 0 } }, 0.16, 'sine.out', tl, 0.28);
        this.raise(tl, 'F', UP_F, 0);
        this.raise(tl, 'B', mirror(UP_F), 0.02);
        // deux pompes (poings redescendus à hauteur d'oreille), le corps se balance en rythme, la queue bat
        for (let i = 0; i < 2; i++) {
          const at = 0.32 + i * 0.26;
          this.arm(tl, 'F', { p: PUMP_F, via: null }, 0.12, 'sine.inOut', at);
          this.arm(tl, 'B', { p: mirror(PUMP_F), via: null }, 0.12, 'sine.inOut', at);
          this.arm(tl, 'F', { p: UP_F, via: null }, 0.13, 'sine.inOut', at + 0.12);
          this.arm(tl, 'B', { p: mirror(UP_F), via: null }, 0.13, 'sine.inOut', at + 0.12);
          this.to({ torso: { r: i % 2 === 0 ? 2 : -2 }, tail: { r: i % 2 === 0 ? -4 : -12 } }, 0.13, 'sine.inOut', tl, at);
        }
        this.to({ torso: { r: 0 }, tail: { r: 0 } }, 0.16, 'sine.inOut', tl, 0.84);
        this.back(tl, 0.86, 0.45);
        this.run(tl, 3);
        await beat.play(gsap.timeline().to({}, { duration: name === 'triggerCheer' ? 0.8 : 0.5 }));
        return;
      }
      case 'plunger': {
        // le détonateur tombe devant lui, il empoigne la barre en T, prend son élan et enfonce le piston
        if (!this.detBox || !this.detHandle) {
          await this.perform('triggerCheer', beat);
          return;
        }
        this.startDetonator();
        this.to({ handF: { alt: 'fist' }, handB: { alt: 'fist' }, head: { alt: 'focus', r: -4 }, torso: { r: -2, y: 52 } }, 0.22, 'power2.out', tl, 0.24);
        // élan : il se redresse un peu avec la poignée
        this.to({ torso: { r: -1, y: 34 } }, 0.22, 'sine.out', tl, 0.5);
        this.arm(tl, 'F', { p: () => this.grip('F'), tip: 'fist', s: 1, hr: -30 }, 0.22, 'power2.out', 0.24);
        this.arm(tl, 'B', { p: () => this.grip('B'), tip: 'fist', s: 1, hr: 30 }, 0.22, 'power2.out', 0.24);
        this.pin(tl, 'F', () => this.grip('F'), 0.9, 0.46, 'fist');
        this.pin(tl, 'B', () => this.grip('B'), 0.9, 0.46, 'fist');
        tl.call(() => R.setAlt('head', 'shout'), [], 0.7);
        // coup sec : il plonge sur le piston, genoux fléchis (pieds ancrés)
        this.to({ torso: { r: 3, y: 96 } }, 0.11, 'power4.in', tl, 0.74);
        this.to({ torso: { r: 1, y: 84 } }, 0.3, 'sine.out', tl, 0.86);
        tl.addLabel('boom', 0.85);
        this.back(tl, 1.36, 0.4);
        this.run(tl, 3);
        await beat.play(gsap.timeline().to({}, { duration: 0.85 }));
        return;
      }
      case 'celebrate': {
        this.celebrate(arg?.tier ?? 0);
        await beat.wait(300);
        return;
      }
      case 'introSwipe': {
        // balayage : élan (main devant le ventre, doigts vers la gauche), coup de bras en arc vers la gauche,
        // bras tendu, accompagnement ; le bras arrière contre-balance, la queue claque le sol
        const wind: Vec = [180, 330];
        const sweep = this.reachPt('F', [-520, -60], 0.97);
        const follow = this.reachPt('F', [-500, 60], 0.95);
        this.to({ handF: { alt: 'open' }, head: { alt: 'rest', r: 3 }, torso: { r: 2 } }, 0.16, 'sine.inOut', tl, 0);
        this.arm(tl, 'F', { p: wind, s: 1, hr: -35 }, 0.16, 'sine.inOut', 0);
        this.arm(tl, 'F', { p: sweep, via: [-140, 40] }, 0.13, 'power3.out', 0.16);
        this.arm(tl, 'B', { p: [REST.B[0] + 40, REST.B[1] - 30], s: 1 }, 0.16, 'sine.inOut', 0.16);
        this.to({ head: { r: -5 }, torso: { r: -3 } }, 0.13, 'power3.out', tl, 0.16);
        this.to({ tail: { r: -14 } }, 0.08, 'power2.out', tl, 0.16);
        this.to({ tail: { r: 0, sy: TAIL_SY * 0.86 } }, 0.07, 'power3.in', tl, 0.24);
        this.to({ tail: { sy: TAIL_SY } }, 0.12, 'sine.out', tl, 0.31);
        tl.call(() => R.setAlt('head', 'wink'), [], 0.22);
        this.arm(tl, 'F', { p: follow, via: null }, 0.14, 'sine.out', 0.29);
        this.back(tl, 0.5, 0.4);
        this.run(tl, 3);
        await beat.play(gsap.timeline().to({}, { duration: 0.36 }));
        return;
      }
      default:
        this.react(name);
        await beat.wait(180);
    }
  }

  /** détonateur : chute, élan de la poignée, piston enfoncé, puis la caisse s'enfonce et disparaît (toujours) */
  private startDetonator(): void {
    this.propTl?.kill();
    const d = this.detonator;
    d.visible = true;
    d.alpha = 1;
    this.handle.up = 1;
    this.setHandle(1);
    const pt = gsap.timeline({ onComplete: () => void (d.visible = false) });
    pt.fromTo(d, { y: -900 }, { y: 0, duration: 0.28, ease: 'bounce.out' }, 0);
    const follow = () => this.setHandle(this.handle.up);
    pt.to(this.handle, { up: 1.12, duration: 0.22, ease: 'sine.out', onUpdate: follow }, 0.5);
    pt.to(this.handle, { up: 0, duration: 0.11, ease: 'power4.in', onUpdate: follow }, 0.74);
    pt.to(d, { alpha: 0, y: 60, duration: 0.3, ease: 'power2.in' }, 1.5);
    pt.timeScale(this.speed);
    this.propTl = pt;
  }

  private hideProps(): void {
    if (this.matchProp) this.matchProp.visible = false;
    this.propTl?.kill();
    this.propTl = null;
    this.detonator.visible = false;
    this.detonator.alpha = 1;
    this.detonator.y = 0;
  }

  /** réaction non bloquante (sons et scène continuent) */
  react(name: string, arg?: { target?: { x: number; y: number } }): void {
    const R = this.rig;
    const tl = gsap.timeline();
    let pri = 2;
    switch (name) {
      case 'scatter': {
        // « là, un Scatter ! » : l'index désigne la case (dans l'axe du bras, sans entrer dans la grille), deux petits coups
        const t = arg?.target ? this.toTorso(arg.target) : ([-300, -60] as Vec);
        const aimS = this.reachPt('F', t, 0.72);
        const jab = this.reachPt('F', t, 0.8);
        this.to({ head: { alt: 'surprise', r: -3 } }, 0.08, 'power2.out', tl, 0);
        tl.call(() => R.setAlt('handF', 'point'), [], 0.08);
        this.arm(tl, 'F', { p: aimS, hr: -28 }, 0.2, 'back.out(1.4)', 0.05);
        for (let i = 0; i < 2; i++) {
          this.arm(tl, 'F', { p: jab, hr: -28, via: null }, 0.08, 'sine.inOut', 0.35 + i * 0.16);
          this.arm(tl, 'F', { p: aimS, hr: -28, via: null }, 0.08, 'sine.inOut', 0.43 + i * 0.16);
        }
        tl.call(() => R.setAlt('head', 'grin'), [], 0.4);
        this.back(tl, 0.8);
        break;
      }
      case 'scatterExcited':
        tl.call(() => {
          R.setAlt('handF', 'fist');
          R.setAlt('handB', 'fist');
        }, [], 0);
        this.to({ head: { alt: 'shout', r: -4 }, tail: { r: -14 } }, 0.16, 'back.out(2)', tl, 0);
        this.raise(tl, 'F', [-160, -215], 0, 0.22);
        this.raise(tl, 'B', mirror([-160, -215]), 0.02, 0.22);
        this.pumpOnce(tl, [-160, -215], 0.45);
        this.back(tl, 0.9);
        break;
      case 'anticipation': {
        // penché vers les rouleaux, poings sur les hanches, regard fixe ; tension tenue jusqu'au résultat
        // (anticipationWin / anticipationLose l'interrompent ; les réactions plus faibles sont ignorées)
        this.to({ head: { alt: 'focus', r: -6 }, torso: { r: -3, y: 18 }, handF: { alt: 'fist' }, handB: { alt: 'fist' } }, 0.3, 'power2.out', tl, 0);
        this.arm(tl, 'F', { p: [-5, 395], s: 1, hr: 20 }, 0.32, 'power2.out', 0);
        this.arm(tl, 'B', { p: mirror([-5, 395]), s: 1, hr: -20 }, 0.32, 'power2.out', 0.02);
        for (let i = 0; i < 24; i++) {
          const at = 0.34 + i * 0.5;
          this.to({ torso: { r: i % 2 === 0 ? -3.6 : -3 }, head: { r: i % 2 === 0 ? -7 : -6 } }, 0.5, 'sine.inOut', tl, at);
        }
        pri = 3;
        break;
      }
      case 'anticipationWin':
        tl.call(() => {
          R.setAlt('handF', 'fist');
          R.setAlt('handB', 'fist');
        }, [], 0);
        this.to({ head: { alt: 'shout', r: -3 }, torso: { r: 0, y: -22 } }, 0.16, 'power2.out', tl, 0);
        this.to({ torso: { y: 0 } }, 0.2, 'bounce.out', tl, 0.16);
        this.raise(tl, 'F', UP_F, 0, 0.24);
        this.raise(tl, 'B', mirror(UP_F), 0.02, 0.24);
        this.pumpOnce(tl, UP_F, 0.46);
        this.back(tl, 0.9, 0.45);
        pri = 3;
        break;
      case 'anticipationLose':
        // raté : il s'affaisse (tête basse, épaules tombantes, mains qui pendent), soupir, puis se reprend
        this.to({ head: { alt: 'rest', r: 9, y: 14 }, torso: { r: 2, y: 10 }, handF: { alt: 'open' }, handB: { alt: 'open' } }, 0.35, 'power2.out', tl, 0);
        this.arm(tl, 'F', { p: [-10, 478], s: 1 }, 0.35, 'power2.out', 0);
        this.arm(tl, 'B', { p: mirror([-10, 478]), s: 1 }, 0.35, 'power2.out', 0);
        this.to({ torso: { y: 14 } }, 0.3, 'sine.inOut', tl, 0.45);
        this.to({ torso: { y: 8 } }, 0.3, 'sine.inOut', tl, 0.75);
        this.back(tl, 0.95, 0.4);
        pri = 3;
        break;
      case 'duck': {
        // se couvre à l'impact : paumes plaquées sur le dôme du casque (elles suivent la tête), coudes dehors et
        // hauts, tête rentrée, genoux fléchis, pieds ancrés ; puis les mains glissent vers l'extérieur et redescendent
        const onHelmetF = () => this.headPt(HEAD_PT.domeF[0], HEAD_PT.domeF[1]);
        const onHelmetB = () => this.headPt(HEAD_PT.domeB[0], HEAD_PT.domeB[1]);
        this.front(tl, 0.04, ['F', 'B']);
        this.to({ head: { alt: 'surprise', r: 5, y: 26 }, handF: { alt: 'open' }, handB: { alt: 'open' }, torso: { r: 2, y: 42 } }, 0.1, 'power3.out', tl, 0);
        this.arm(tl, 'F', { p: onHelmetF, tip: 'open', s: -1, hr: -40, via: [-120, -20] }, 0.13, 'power3.out', 0);
        this.arm(tl, 'B', { p: onHelmetB, tip: 'open', s: -1, hr: 40, via: [640, -10] }, 0.13, 'power3.out', 0.01);
        this.pin(tl, 'F', onHelmetF, 0.4, 0.13, 'open');
        this.pin(tl, 'B', onHelmetB, 0.4, 0.14, 'open');
        this.to({ head: { r: 2 } }, 0.2, 'sine.inOut', tl, 0.14);
        this.arm(tl, 'F', { p: [-150, -40], s: -1, via: null }, 0.14, 'power2.in', 0.55);
        this.arm(tl, 'B', { p: [700, -30], s: -1, via: null }, 0.14, 'power2.in', 0.55);
        this.back(tl, 0.66, 0.3);
        break;
      }
      case 'chainWince':
        // grimace : épaules rentrées, poings serrés, tête dans les épaules
        tl.call(() => {
          R.setAlt('handF', 'fist');
          R.setAlt('handB', 'fist');
        }, [], 0.02);
        this.to({ head: { alt: 'focus', r: -7, y: 12 }, torso: { r: -2 } }, 0.1, 'power3.out', tl, 0);
        this.arm(tl, 'F', { p: [REST.F[0] + 18, REST.F[1] - 40], s: 1, via: null }, 0.08, 'power3.out', 0);
        this.arm(tl, 'B', { p: [REST.B[0] - 18, REST.B[1] - 40], s: 1, via: null }, 0.08, 'power3.out', 0);
        this.back(tl, 0.32, 0.3);
        break;
      case 'carve': {
        // désigne le géant sculpté (index dans l'axe de la cible), petit coup d'index pour appuyer
        const aimC = this.reachPt('F', [-420, -80], 0.76);
        this.to({ head: { alt: 'grin', r: -4 } }, 0.2, 'back.out(1.8)', tl, 0);
        tl.call(() => R.setAlt('handF', 'point'), [], 0.06);
        this.arm(tl, 'F', { p: aimC, hr: -28 }, 0.22, 'back.out(1.4)', 0);
        this.arm(tl, 'F', { p: this.reachPt('F', [-420, -80], 0.82), hr: -28, via: null }, 0.08, 'power2.out', 0.5);
        this.arm(tl, 'F', { p: aimC, hr: -28, via: null }, 0.14, 'sine.inOut', 0.58);
        this.to({ head: { r: -6 } }, 0.08, 'power2.out', tl, 0.5);
        this.to({ head: { r: -3 } }, 0.14, 'sine.inOut', tl, 0.58);
        this.back(tl, 0.9);
        break;
      }
      case 'proud':
        // pouce levé à côté de la tête, torse bombé
        this.to({ handB: { alt: 'thumb' }, head: { alt: 'grin', r: 6 }, torso: { r: -2 } }, 0.2, 'back.out(2)', tl, 0);
        this.arm(tl, 'B', { p: [725, 20], s: -1 }, 0.22, 'back.out(1.3)', 0);
        this.back(tl, 0.9);
        break;
      case 'thump':
        // coup de queue sur le Cornerstone : la queue se lève, frappe le sol, le corps encaisse l'impact
        this.to({ tail: { r: -34, sy: TAIL_SY * 1.05 }, torso: { r: -1 } }, 0.14, 'power2.out', tl, 0);
        this.to({ tail: { r: 0, sy: TAIL_SY * 0.82 }, torso: { r: 1, y: 8 }, head: { alt: 'grin', r: 3, y: 8 } }, 0.05, 'power3.in', tl, 0.14);
        this.to({ tail: { r: -5, sy: TAIL_SY }, torso: { y: 0 }, head: { y: 0 } }, 0.2, 'back.out(3)', tl, 0.19);
        this.back(tl, 0.5, 0.25);
        break;
      case 'smallWin':
        this.to({ handB: { alt: 'thumb' }, head: { alt: 'rest', r: 2 } }, 0.2, 'back.out(2)', tl, 0);
        this.arm(tl, 'B', { p: [720, 190], s: -1 }, 0.22, 'back.out(1.3)', 0);
        this.back(tl, 0.7);
        pri = 1.5;
        break;
      case 'goodWin': {
        // poing levé à côté de la tête, deux pompes (le poing reste dégagé du bord du casque)
        const hi: Vec = [-40, -230];
        const lo: Vec = [-100, -120];
        this.to({ handF: { alt: 'fist' }, head: { alt: 'grin', r: -3 } }, 0.16, 'back.out(2)', tl, 0);
        this.arm(tl, 'F', { p: hi }, 0.18, 'back.out(1.3)', 0);
        for (let i = 0; i < 2; i++) {
          this.arm(tl, 'F', { p: lo, via: null }, 0.12, 'sine.inOut', 0.22 + i * 0.25);
          this.arm(tl, 'F', { p: hi, via: null }, 0.13, 'sine.inOut', 0.34 + i * 0.25);
          this.to({ torso: { y: 10 } }, 0.12, 'sine.inOut', tl, 0.22 + i * 0.25);
          this.to({ torso: { y: 0 } }, 0.13, 'sine.inOut', tl, 0.34 + i * 0.25);
        }
        this.back(tl, 0.8);
        break;
      }
      default:
        return;
    }
    this.run(tl, pri);
  }

  /** célébrations graduées selon le palier (0 : ×10 … 4 : ×1000, 5 : MAX WIN) */
  celebrate(tier: number): void {
    const R = this.rig;
    const tl = gsap.timeline();
    tl.call(() => {
      R.setAlt('handF', 'fist');
      R.setAlt('handB', 'fist');
    }, [], 0);
    this.to({ head: { alt: 'shout', r: -3 }, tail: { r: -12 } }, 0.2, 'back.out(2)', tl, 0);
    this.raise(tl, 'F', UP_F, 0);
    this.raise(tl, 'B', mirror(UP_F), 0.02);
    const n = 2 + Math.min(4, tier);
    for (let i = 0; i < n; i++) {
      const at = 0.3 + i * 0.26;
      this.arm(tl, 'F', { p: PUMP_F, via: null }, 0.12, 'sine.inOut', at);
      this.arm(tl, 'B', { p: mirror(PUMP_F), via: null }, 0.12, 'sine.inOut', at);
      this.arm(tl, 'F', { p: UP_F, via: null }, 0.13, 'sine.inOut', at + 0.12);
      this.arm(tl, 'B', { p: mirror(UP_F), via: null }, 0.13, 'sine.inOut', at + 0.12);
      // genoux qui plient à chaque pompe ; dès ×25, le poids bascule en rythme et la queue bat (sans entrer dans le sol)
      this.to({ torso: { y: 16 } }, 0.12, 'sine.inOut', tl, at);
      this.to({ torso: { y: 0 } }, 0.13, 'sine.inOut', tl, at + 0.12);
      if (tier >= 2) this.to({ torso: { r: i % 2 === 0 ? 3 : -3 }, tail: { r: i % 2 === 0 ? -3 : -12 } }, 0.13, 'sine.inOut', tl, at);
    }
    // ×25 : un coup de queue au sol et un hochement de tête en plus
    if (tier === 1) {
      this.to({ tail: { r: -22, sy: TAIL_SY * 1.05 } }, 0.1, 'power2.out', tl, 0.56);
      this.to({ tail: { r: 0, sy: TAIL_SY * 0.84 } }, 0.06, 'power3.in', tl, 0.66);
      this.to({ tail: { sy: TAIL_SY }, head: { r: 4 } }, 0.12, 'sine.out', tl, 0.72);
      this.to({ head: { r: -3 } }, 0.12, 'sine.inOut', tl, 0.84);
    }
    let end = 0.3 + n * 0.26;
    this.to({ torso: { r: 0 }, tail: { r: 0 } }, 0.14, 'sine.inOut', tl, end - 0.12);
    if (tier >= 4) {
      // pose de vanité : désigne son monument, pouce levé (avant-bras bien visible), clin d'œil bref avec un petit coup d'index
      const at = end + 0.04;
      const point = this.reachPt('F', [-380, -300], 0.8);
      tl.call(() => {
        R.setAlt('handF', 'point');
        R.setAlt('handB', 'thumb');
      }, [], at + 0.06);
      this.to({ head: { alt: 'grin', r: 6 } }, 0.25, 'back.out(1.6)', tl, at);
      this.arm(tl, 'F', { p: point }, 0.28, 'back.out(1.2)', at);
      this.arm(tl, 'B', { p: [700, -40], s: -1 }, 0.3, 'power2.inOut', at);
      tl.call(() => R.setAlt('head', 'wink'), [], at + 0.5);
      this.arm(tl, 'F', { p: [point[0] - 14, point[1] - 10], via: null }, 0.12, 'power2.out', at + 0.5);
      this.arm(tl, 'F', { p: point, via: null }, 0.2, 'sine.inOut', at + 0.62);
      this.arm(tl, 'B', { p: [700, -55], via: null }, 0.1, 'power2.out', at + 0.55);
      this.arm(tl, 'B', { p: [700, -40], via: null }, 0.18, 'sine.inOut', at + 0.65);
      tl.call(() => R.setAlt('head', 'grin'), [], at + 0.7);
      end = at + 1.2;
    }
    if (tier >= 5) {
      // MAX WIN : les deux poings au ciel, grand saut, la queue claque le sol à la réception
      const at = end;
      tl.call(() => {
        R.setAlt('handF', 'fist');
        R.setAlt('handB', 'fist');
        R.setAlt('head', 'shout');
      }, [], at);
      this.arm(tl, 'F', { p: [-40, -250] }, 0.22, 'back.out(1.2)', at);
      this.arm(tl, 'B', { p: mirror([-40, -250]) }, 0.22, 'back.out(1.2)', at);
      this.to({ torso: { y: 22 } }, 0.12, 'power2.in', tl, at);
      this.to({ torso: { y: -46 } }, 0.16, 'power2.out', tl, at + 0.12);
      this.to({ torso: { y: 20 }, tail: { r: -18 } }, 0.14, 'power2.in', tl, at + 0.28);
      this.to({ torso: { y: 0 }, tail: { r: 0, sy: TAIL_SY * 0.84 } }, 0.16, 'back.out(2)', tl, at + 0.42);
      this.to({ tail: { sy: TAIL_SY } }, 0.14, 'sine.out', tl, at + 0.58);
      end = at + 0.9;
    }
    this.back(tl, end, 0.5);
    this.run(tl, 4);
  }

  /** convertit un point global en coordonnées du torse (px de texture) */
  private toTorso(p: { x: number; y: number }): Vec {
    const torso = this.rig.part('torso');
    const l = torso.toLocal(p);
    return [l.x + TORSO_PIVOT[0], l.y + TORSO_PIVOT[1]];
  }

  setAnte(on: boolean): void {
    this.anteOn = on;
    const g = this.lamp;
    g.clear();
    if (on) {
      // lampe frontale rouge (halo primitif) sur le casque
      const lampX = 105 - 200;
      const lampY = 55 - 400;
      for (let i = 0; i < 4; i++) g.circle(lampX, lampY, 40 - i * 8).fill({ color: 0xff3b2b, alpha: 0.12 + i * 0.1 });
    }
  }

  reset(): void {
    this.actGen++;
    this.tailPose = { r: 0, sy: TAIL_SY };
    this.releasedMatch = null;
    this.current?.kill();
    this.current = null;
    this.pri = 0;
    this.hideProps();
    this.rig.set({ torso: { r: 0, y: 0 }, head: { r: 0, x: 0, y: 0, sx: 1, sy: 1, alt: 'rest' }, handF: { alt: 'open' }, handB: { alt: 'open' }, shinF: { r: 0 }, shinB: { r: 0 }, tail: { alt: 'ground' } });
    for (const side of ['F', 'B'] as const) {
      this.armOwner[side] = ++this.armSeq;
      this.hands[side] = this.armAt(side, REST[side]);
      this.applyArm(side);
    }
    this.resetZ();
  }
}

function smooth(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}
