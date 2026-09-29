import { Container, Graphics, Sprite } from 'pixi.js';
import { gsap } from 'gsap';
import { Rig, type RigDef } from '../rig/Rig';
import { hasTex, tex } from '../assets';
import { rand } from '../fx/particles';
import type { Beat } from '../../core/beat';
import type { SceneLayout } from '../layout';
import RIG_JSON from './buckRig.json';
import { autoVia, bezier, extension, naturalSide, solve, solveTip, wrap, type IkArm, type Side, type Vec } from './armIk';

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
 *   seulement quand la main touche le visage ou le casque. Avant-bras sous la manche, main sur l'avant-bras.
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
const REST_F: Vec = [-24, 462];
const REST: Record<Side, Vec> = { F: REST_F, B: mirror(REST_F) };
/** poings levés au-dessus de la tête, coudes dehors */
const UP_F: Vec = [-62, -255];
/** poings redescendus à hauteur d'oreille (pompe) */
const PUMP_F: Vec = [-112, -140];
/** queue posée au sol derrière la botte : dessin aligné sur son axe (variante « ground ») et raccourci en profondeur */
const TAIL_SY = 0.62;

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
  tooth: [156, 292] as Vec, // dent en or
  helmetF: [-12, 212] as Vec, // bord gauche du casque (main avant posée dessus)
  helmetB: [420, 250] as Vec,
};

type Target = Vec | (() => Vec);
interface ArmKey {
  /** cible (px du torse) ; une fonction est réévaluée à chaque image (main collée au casque, à la poignée) */
  p: Target;
  /** point de la main posé sur la cible (sinon le poignet) */
  tip?: keyof typeof HAND_PT;
  /** côté du coude (voir armIk) ; par défaut : côté naturel pour la cible */
  s?: 1 | -1;
  /** rotation de la main (deg, écart à l'avant-bras) */
  hr?: number;
  /** point de passage (courbe) ; null = ligne droite ; absent = arc automatique vers l'extérieur */
  via?: Vec | null;
  bulge?: number;
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
  /** repères du détonateur (px du rig) : trou de la caisse, course de la poignée */
  private det = { x: -40, boxH: 330, holeY: -310, upY: 190, downY: 30 };
  private handle = { up: 1 };
  /** timeline des accessoires : indépendante des actions (une action qui en interrompt une autre ne laisse rien traîner) */
  private propTl: gsap.core.Timeline | null = null;
  /** état réel des mains, point de départ de tout mouvement de bras */
  private hands: Record<Side, ArmState> = { F: this.armAt('F', REST.F), B: this.armAt('B', REST.B) };
  /** dernier mouvement de bras démarré (par bras) : un mouvement plus récent a toujours la main */
  private armOwner: Record<Side, number> = { F: 0, B: 0 };
  private armSeq = 0;

  constructor() {
    this.rig = new Rig(RIG, tex);
    this.view.addChild(this.shadow, this.rig.root, this.detonator);
    this.rig.part('head').addChild(this.lamp);
    this.buildDetonator();
    this.rig.setAlt('handF', 'open');
    this.rig.setAlt('handB', 'open');
    this.rig.setAlt('tail', 'ground');
    this.rig.set({ tail: { sy: TAIL_SY } });
    // pieds : semelles des bottes (pas la boîte englobante des textures tournées) -> sur le centre de l'ombre
    this.rig.body.y = -this.soleY() + 3;
    this.drawShadow(1);
    this.applyArm('F');
    this.applyArm('B');
    this.startIdle();
  }

  /** bas des semelles dans le repère du corps (px), calculé par la chaîne cuisse -> tibia au repos */
  private soleY(): number {
    const sole = (thigh: string, shin: string, xy: Vec): number => {
      const t = PART[thigh]!;
      const s = PART[shin]!;
      const tp = TORSO_PIVOT;
      const at = REST_ANGLE(thigh) * (Math.PI / 180);
      const as = at + REST_ANGLE(shin) * (Math.PI / 180);
      const k = t.scale ?? 1;
      const rot = (v: Vec, a: number): Vec => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
      const thighPos: Vec = [(t.attach![0] - tp[0]), (t.attach![1] - tp[1])];
      const knee = rot([(s.attach![0] - t.pivot[0]) * k, (s.attach![1] - t.pivot[1]) * k], at);
      const foot = rot([(xy[0] - s.pivot[0]) * (s.scale ?? 1), (xy[1] - s.pivot[1]) * (s.scale ?? 1)], as);
      return thighPos[1] + knee[1] + foot[1];
    };
    return Math.max(sole('thighF', 'shinF', [150, 384]), sole('thighB', 'shinB', [150, 398]));
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

  /** pose le bras d'après l'état de sa main */
  private applyArm(side: Side): void {
    const a = IK[side];
    const st = this.hands[side];
    const r = solve(a, side, st.p, st.s);
    st.upper = r.upper;
    st.fore = r.fore;
    this.rig.set({
      [a.upper]: { r: wrap(r.upper - REST_ANGLE(a.upper)) },
      [a.fore]: { r: wrap(r.fore - REST_ANGLE(a.fore)) },
      [a.hand]: { r: st.hr },
    });
  }

  /** place un point de la main (ou le poignet) sur `q` */
  private placeArm(side: Side, q: Vec, s: number, hr: number, off: Vec | null): void {
    const st = this.hands[side];
    st.s = s;
    st.hr = hr;
    st.p = off ? solveTip(IK[side], side, q, s, off, hr).wrist : q;
    this.applyArm(side);
  }

  private resolve(t: Target): Vec {
    return typeof t === 'function' ? t() : t;
  }

  /**
   * Mouvement de main : le point visé part de sa position réelle et suit un arc jusqu'à la cible.
   * Le coude ne change de côté que là où le bras est le plus tendu (bascule invisible).
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
    let s0 = 1;
    let s1 = 1;
    let h0 = 0;
    let h1 = 0;
    let lo = 0;
    let hi = 1;
    tl.to(
      prog,
      {
        u: 1,
        duration: dur,
        ease,
        onStart: () => {
          id = ++this.armSeq;
          this.armOwner[side] = id;
          off = key.tip ? this.handOff(side, key.tip) : null;
          p0 = off ? this.tipNow(side, off) : [st.p[0], st.p[1]];
          p1 = this.resolve(key.p);
          s0 = st.s;
          h0 = st.hr;
          h1 = key.hr ?? 0;
          const w1 = off ? solveTip(a, side, p1, key.s ?? 1, off, h1).wrist : p1;
          s1 = key.s ?? naturalSide(a, side, w1);
          c = key.via === null ? [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2] : (key.via ?? autoVia(a, side, p0, p1, key.bulge));
          if (s0 !== s1) {
            // bascule du coude : à l'extrémité tendue (repos, bras levé) sinon là où la trajectoire est la plus tendue
            let bu = 1;
            if (extension(a, w1) >= 0.93) bu = 1;
            else if (extension(a, st.p) >= 0.93) bu = 0;
            else {
              let best = -1;
              for (let i = 0; i <= 24; i++) {
                const e = extension(a, bezier(p0, c, p1, i / 24));
                if (e > best + 1e-3) {
                  best = e;
                  bu = i / 24;
                }
              }
            }
            lo = Math.max(0, Math.min(0.84, bu - 0.08));
            hi = lo + 0.16;
          }
        },
        onUpdate: () => {
          if (this.armOwner[side] !== id) return;
          const u = prog.u;
          const end = typeof key.p === 'function' ? key.p() : p1;
          const q = bezier(p0, c, end, u);
          const w = s0 === s1 ? 1 : smooth((u - lo) / (hi - lo));
          this.placeArm(side, q, s0 + (s1 - s0) * w, h0 + (h1 - h0) * Math.min(1.15, Math.max(0, u)), off);
        },
      },
      at,
    );
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
    const torso = this.rig.part('torso').children[0] as Container;
    torso.scale.y = 1 + k * 0.022;
    // la tête et les épaules suivent le soulèvement de la poitrine
    const lift = -k * 10;
    const head = this.rig.part('head');
    head.pivot.y = -lift;
    this.rig.part('armF').pivot.y = -lift * 0.85;
    this.rig.part('armB').pivot.y = -lift * 0.85;
    // au repos, les mains accompagnent la respiration (les coudes s'écartent un peu à l'inspiration)
    if (this.pri === 0 && !this.current) {
      for (const side of ['F', 'B'] as const) {
        const st = this.hands[side];
        if (st.s !== 1 || Math.abs(st.p[0] - REST[side][0]) > 14 || Math.abs(st.p[1] - REST[side][1]) > 14) continue;
        const out = side === 'F' ? -1 : 1;
        this.placeArm(side, [REST[side][0] + out * k * 5, REST[side][1] - k * 7], 1, 0, null);
      }
    }
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
      case 0: // mâchonne l'allumette : la mâchoire travaille (la tête reste la même, l'allumette ne saute pas)
        for (let i = 0; i < 3; i++) {
          R.to({ head: { sy: 0.982, r: 1.2 } }, 0.13, 'sine.inOut', tl, i * 0.28);
          R.to({ head: { sy: 1, r: -0.6 } }, 0.15, 'sine.inOut', tl, i * 0.28 + 0.13);
        }
        R.to({ head: { r: 0 } }, 0.2, 'sine.inOut', tl, 0.9);
        break;
      case 1: // tape de la queue : élan (la pointe se lève), coup au sol (écrasement), rebond, second petit coup
        R.to({ tail: { r: -24, sy: TAIL_SY * 1.05 }, torso: { r: -1 } }, 0.16, 'power2.out', tl, 0);
        R.to({ tail: { r: 2, sy: TAIL_SY * 0.86 }, torso: { r: 1 } }, 0.07, 'power3.in', tl, 0.16);
        R.to({ tail: { r: -9, sy: TAIL_SY } }, 0.1, 'power2.out', tl, 0.23);
        R.to({ tail: { r: 1, sy: TAIL_SY * 0.92 } }, 0.07, 'power3.in', tl, 0.33);
        R.to({ tail: { r: 0, sy: TAIL_SY }, torso: { r: 0 } }, 0.35, 'elastic.out(1,0.5)', tl, 0.4);
        break;
      case 2: {
        // lustre sa dent en or : le poing monte par-dessous (coude bas, dehors), les jointures frottent la dent,
        // le visage reste visible au-dessus du poing
        const tooth = () => this.headPt(HEAD_PT.tooth[0] + 6, HEAD_PT.tooth[1] + 26);
        this.front(tl, 0.12, ['B']);
        R.to({ handB: { alt: 'fist' }, head: { r: 5 } }, 0.3, 'power2.out', tl, 0);
        this.arm(tl, 'B', { p: tooth, tip: 'fist', s: 1, hr: -18 }, 0.38, 'power2.out', 0);
        for (let i = 0; i < 4; i++) {
          const dx = i % 2 === 0 ? -16 : 16;
          this.arm(tl, 'B', { p: () => { const t = tooth(); return [t[0] + dx, t[1] + 2]; }, tip: 'fist', s: 1, hr: -18, via: null }, 0.08, 'sine.inOut', 0.42 + i * 0.09);
          R.to({ head: { r: 5 + (i % 2 === 0 ? 1.5 : -1.5) } }, 0.08, 'sine.inOut', tl, 0.42 + i * 0.09);
        }
        this.pin(tl, 'B', tooth, 0.12, 0.78, 'fist');
        tl.call(() => R.setAlt('head', 'grin'), [], 0.8);
        this.back(tl, 0.95, 0.45);
        break;
      }
      default: // lève les yeux vers son monument (tempo 1), puis clin d'œil vaniteux bref (tempo 2)
        R.to({ head: { r: 11 }, torso: { r: -1.5 }, thighF: { r: 1.5 }, thighB: { r: 1.5 } }, 0.35, 'sine.inOut', tl, 0);
        tl.call(() => R.setAlt('head', 'wink'), [], 0.9);
        R.to({ head: { r: 8 } }, 0.1, 'power2.out', tl, 0.9);
        tl.call(() => R.setAlt('head', 'rest'), [], 1.08);
        R.to({ head: { r: 10.5 } }, 0.14, 'back.out(2)', tl, 1.08);
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
  private back(tl: gsap.core.Timeline, at: number | string, d = 0.35): void {
    tl.addLabel('back', at);
    this.rig.to({ torso: { r: 0 }, head: { r: 0, y: 0, sy: 1, alt: 'rest' }, thighF: { r: 0 }, thighB: { r: 0 }, tail: { r: 0, sy: TAIL_SY } }, d, 'power2.inOut', tl, 'back');
    this.arm(tl, 'F', { p: REST.F, s: 1 }, d * 1.25, 'power2.inOut', 'back');
    this.arm(tl, 'B', { p: REST.B, s: 1 }, d * 1.25, 'power2.inOut', 'back');
    // mains ouvertes quand elles sont presque en bas
    tl.call(() => this.rig.setAlt('handF', 'open'), [], `back+=${d * 0.9}`);
    tl.call(() => this.rig.setAlt('handB', 'open'), [], `back+=${d * 0.9}`);
    tl.call(() => this.rig.resetZ(), [], `back+=${d * 1.25}`);
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

  /** point de l'allumette (coordonnées globales) : départ de l'étincelle */
  matchPoint(): { x: number; y: number } {
    const p = RIG.points.matchTip as { part: string; xy: [number, number] };
    return this.rig.worldOf(p.part, p.xy[0], p.xy[1]);
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
        // 2. frotte sa tête sur la dent en or (contact, étincelle, flamme) ; 3. fouet : le bras se tend vers la charge
        //    et lâche l'allumette enflammée (c'est l'étincelle qui part vers la charge)
        const stick = () => this.headPt(HEAD_PT.matchStick[0], HEAD_PT.matchStick[1]);
        const tooth = () => this.headPt(HEAD_PT.tooth[0], HEAD_PT.tooth[1]);
        R.to({ head: { r: 2 }, torso: { r: 1 } }, 0.06, 'sine.inOut', tl, 0);
        tl.call(() => R.setAlt('handF', 'grip'), [], 0.02);
        this.front(tl, 0.1, ['F']);
        this.arm(tl, 'F', { p: stick, tip: 'grip', s: -1, hr: 38 }, 0.2, 'power2.out', 0.04);
        R.to({ head: { r: -3 }, torso: { r: -2 }, thighF: { r: 2 }, thighB: { r: 2 } }, 0.2, 'power2.out', tl, 0.06);
        // pincée : l'allumette quitte la bouche
        tl.call(() => R.setAlt('head', 'grin'), [], 0.25);
        // frottement sec sur la dent en or, contact tenu deux images
        const t0 = () => { const t = tooth(); return [t[0] - 34, t[1] - 16] as Vec; };
        const t1 = () => { const t = tooth(); return [t[0] + 30, t[1] + 16] as Vec; };
        this.arm(tl, 'F', { p: t0, tip: 'grip', s: -1, hr: 30, via: null }, 0.08, 'power2.out', 0.26);
        this.arm(tl, 'F', { p: t1, tip: 'grip', s: -1, hr: 26, via: null }, 0.08, 'power3.in', 0.35);
        tl.call(() => R.setAlt('handF', 'match'), [], 0.43);
        R.to({ head: { r: 1 } }, 0.06, 'power2.out', tl, 0.43);
        const t = arg?.target ? this.toTorso(arg.target) : ([-500, -200] as Vec);
        // prototype blast-throw : pichenette vers le haut (le bras ne vise plus la charge)
        const aim = arg?.throw ? this.reachPt('F', [t[0] * 0.3, -420], 0.7) : this.reachPt('F', t, 0.72);
        // le fouet passe par le bras tendu (le coude reste dehors), puis se pose pointé vers la charge
        const [sx, sy] = IK.F.shoulder;
        const da = Math.hypot(aim[0] - sx, aim[1] - sy) || 1;
        const reach = IK.F.upperLen + IK.F.foreLen;
        const mid: Vec = [sx + ((aim[0] - sx) / da) * reach * 1.02, sy + ((aim[1] - sy) / da) * reach * 1.02];
        const from = [140, -40];
        const whip: Vec = [2 * mid[0] - (from[0]! + aim[0]) / 2, 2 * mid[1] - (from[1]! + aim[1]) / 2];
        this.front(tl, 0.52, ['F'], 2);
        this.arm(tl, 'F', { p: aim, s: -1, via: whip }, 0.2, 'power2.out', 0.5);
        R.to({ head: { r: -6 }, torso: { r: -3 }, thighF: { r: 3 }, thighB: { r: 3 } }, 0.2, 'back.out(1.6)', tl, 0.5);
        tl.addLabel('flick', 0.72);
        this.run(tl, 3);
        await beat.play(gsap.timeline().to({}, { duration: 0.72 }));
        // la performance est finie : le retour (priorité plus basse) ne doit pas être refusé par elle
        this.release(tl);
        // lâcher : l'allumette part avec l'étincelle ; puis il en reprend une au coin de la bouche (non bloquant)
        R.setAlt('handF', 'open');
        const out = gsap.timeline({ delay: 0.2 });
        out.call(() => R.setAlt('handF', 'grip'), [], 0.1);
        this.arm(out, 'F', { p: stick, tip: 'grip', s: -1, hr: 38 }, 0.32, 'power2.inOut', 0);
        this.front(out, 0.2, ['F']);
        out.call(() => R.setAlt('head', 'rest'), [], 0.32);
        this.arm(out, 'F', { p: () => { const q = stick(); return [q[0] - 40, q[1] + 30] as Vec; }, tip: 'grip', s: -1, hr: 30, via: null }, 0.1, 'power2.out', 0.34);
        this.back(out, 0.46, 0.45);
        this.run(out, 2);
        return;
      }
      case 'cheer':
      case 'triggerCheer': {
        R.to({ handF: { alt: 'fist' }, handB: { alt: 'fist' }, head: { alt: 'shout', r: -4 }, tail: { r: -14 } }, 0.22, 'back.out(2)', tl, 0);
        this.arm(tl, 'F', { p: UP_F }, 0.24, 'back.out(1.4)', 0);
        this.arm(tl, 'B', { p: mirror(UP_F) }, 0.24, 'back.out(1.4)', 0.03);
        // deux petites pompes, le corps se balance
        for (let i = 0; i < 2; i++) {
          const at = 0.3 + i * 0.26;
          const low: Vec = [UP_F[0] - 16, UP_F[1] + 64];
          this.arm(tl, 'F', { p: low, via: null }, 0.12, 'sine.inOut', at);
          this.arm(tl, 'B', { p: mirror(low), via: null }, 0.12, 'sine.inOut', at);
          this.arm(tl, 'F', { p: UP_F, via: null }, 0.13, 'sine.inOut', at + 0.12);
          this.arm(tl, 'B', { p: mirror(UP_F), via: null }, 0.13, 'sine.inOut', at + 0.12);
        }
        R.to({ torso: { r: 2 }, thighF: { r: -2 }, thighB: { r: -2 } }, 0.16, 'sine.inOut', tl, 0.25);
        R.to({ torso: { r: -2 }, thighF: { r: 2 }, thighB: { r: 2 }, tail: { r: 8 } }, 0.16, 'sine.inOut', tl, 0.41);
        R.to({ torso: { r: 0 }, thighF: { r: 0 }, thighB: { r: 0 }, tail: { r: 0 } }, 0.16, 'sine.inOut', tl, 0.57);
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
        R.to({ handF: { alt: 'fist' }, handB: { alt: 'fist' }, head: { alt: 'focus', r: -4 }, torso: { r: -2 }, thighF: { r: 2 }, thighB: { r: 2 } }, 0.2, 'power2.out', tl, 0.24);
        this.arm(tl, 'F', { p: () => this.grip('F'), tip: 'fist', s: 1, hr: -30 }, 0.22, 'power2.out', 0.24);
        this.arm(tl, 'B', { p: () => this.grip('B'), tip: 'fist', s: 1, hr: 30 }, 0.22, 'power2.out', 0.24);
        this.pin(tl, 'F', () => this.grip('F'), 0.9, 0.46, 'fist');
        this.pin(tl, 'B', () => this.grip('B'), 0.9, 0.46, 'fist');
        tl.call(() => R.setAlt('head', 'shout'), [], 0.7);
        // coup sec : le torse plonge, genoux fléchis
        R.to({ torso: { r: 3 }, thighF: { r: -1 }, thighB: { r: -1 } }, 0.11, 'power4.in', tl, 0.74);
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
        // balayage : élan (main devant la poitrine), coup de bras en arc vers la gauche, bras tendu, puis accompagnement
        const wind: Vec = [215, 150];
        const sweep = this.reachPt('F', [-520, -60], 0.97);
        const follow = this.reachPt('F', [-500, 60], 0.95);
        R.to({ handF: { alt: 'open' }, head: { alt: 'rest', r: 3 }, torso: { r: 2 }, thighF: { r: -2 }, thighB: { r: -2 } }, 0.16, 'sine.inOut', tl, 0);
        this.arm(tl, 'F', { p: wind, s: 1 }, 0.16, 'sine.inOut', 0);
        this.arm(tl, 'F', { p: sweep, via: [-140, 40] }, 0.13, 'power3.out', 0.16);
        R.to({ head: { r: -5 }, torso: { r: -3 }, thighF: { r: 3 }, thighB: { r: 3 }, tail: { r: -22 } }, 0.13, 'power3.out', tl, 0.16);
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
    this.propTl?.kill();
    this.propTl = null;
    this.detonator.visible = false;
    this.detonator.alpha = 1;
    this.detonator.y = 0;
  }

  /** réaction non bloquante (sons et scène continuent) */
  react(name: string): void {
    const R = this.rig;
    const tl = gsap.timeline();
    let pri = 2;
    switch (name) {
      case 'scatter':
        R.to({ head: { alt: 'surprise', r: -3 } }, 0.08, 'power2.out', tl, 0);
        tl.call(() => R.setAlt('handF', 'point'), [], 0.1);
        this.arm(tl, 'F', { p: this.reachPt('F', [-300, -60], 0.74) }, 0.2, 'back.out(1.8)', 0.05);
        tl.call(() => R.setAlt('head', 'grin'), [], 0.4);
        this.back(tl, 0.8);
        break;
      case 'scatterExcited':
        R.to({ head: { alt: 'shout', r: -4 }, handF: { alt: 'fist' }, handB: { alt: 'fist' } }, 0.16, 'back.out(2)', tl, 0);
        this.arm(tl, 'F', { p: [-160, -225] }, 0.18, 'back.out(1.6)', 0);
        this.arm(tl, 'B', { p: mirror([-160, -225]) }, 0.18, 'back.out(1.6)', 0.02);
        this.back(tl, 0.9);
        break;
      case 'anticipation':
        // penché en avant, poings serrés à la ceinture (coudes bas), regard fixe sur les rouleaux (maintenu jusqu'au résultat)
        R.to({ head: { alt: 'focus', r: -6 }, torso: { r: -3 }, thighF: { r: 3 }, thighB: { r: 3 }, handF: { alt: 'fist' }, handB: { alt: 'fist' } }, 0.3, 'power2.out', tl, 0);
        this.arm(tl, 'F', { p: [96, 330], s: 1 }, 0.32, 'power2.out', 0);
        this.arm(tl, 'B', { p: mirror([96, 330]), s: 1 }, 0.32, 'power2.out', 0.02);
        tl.to({}, { duration: 3 });
        pri = 3;
        break;
      case 'anticipationWin':
        R.to({ head: { alt: 'shout', r: -3 }, handF: { alt: 'fist' }, handB: { alt: 'fist' }, torso: { r: 0 }, thighF: { r: 0 }, thighB: { r: 0 } }, 0.2, 'back.out(2)', tl, 0);
        this.arm(tl, 'F', { p: UP_F }, 0.22, 'back.out(1.5)', 0);
        this.arm(tl, 'B', { p: mirror(UP_F) }, 0.22, 'back.out(1.5)', 0.02);
        this.back(tl, 0.9, 0.45);
        pri = 3;
        break;
      case 'anticipationLose':
        R.to({ head: { alt: 'rest', r: 4 }, torso: { r: 0 }, thighF: { r: 0 }, thighB: { r: 0 }, handF: { alt: 'open' }, handB: { alt: 'open' } }, 0.25, 'sine.out', tl, 0);
        this.arm(tl, 'F', { p: [-70, 330], s: 1 }, 0.3, 'sine.out', 0);
        this.arm(tl, 'B', { p: mirror([-70, 330]), s: 1 }, 0.3, 'sine.out', 0);
        this.back(tl, 0.7);
        pri = 3;
        break;
      case 'duck': {
        // se couvre à l'impact : mains plaquées sur les bords du casque (elles suivent la tête), coudes dehors,
        // tête rentrée dans les épaules, pieds ancrés
        const onHelmetF = () => this.headPt(HEAD_PT.helmetF[0], HEAD_PT.helmetF[1]);
        const onHelmetB = () => this.headPt(HEAD_PT.helmetB[0], HEAD_PT.helmetB[1]);
        this.front(tl, 0.04, ['F', 'B']);
        R.to({ head: { alt: 'surprise', r: 5, y: 26 }, handF: { alt: 'open' }, handB: { alt: 'open' }, torso: { r: 2 }, thighF: { r: -2 }, thighB: { r: -2 } }, 0.1, 'power3.out', tl, 0);
        this.arm(tl, 'F', { p: onHelmetF, s: -1 }, 0.13, 'power3.out', 0);
        this.arm(tl, 'B', { p: onHelmetB, s: -1 }, 0.13, 'power3.out', 0.01);
        this.pin(tl, 'F', onHelmetF, 0.4, 0.13);
        this.pin(tl, 'B', onHelmetB, 0.4, 0.14);
        R.to({ head: { r: 2 } }, 0.2, 'sine.inOut', tl, 0.14);
        this.back(tl, 0.55, 0.35);
        break;
      }
      case 'chainWince':
        R.to({ head: { alt: 'focus', r: -7 }, torso: { r: -2 }, thighF: { r: 2 }, thighB: { r: 2 } }, 0.12, 'power2.out', tl, 0);
        this.back(tl, 0.45, 0.25);
        break;
      case 'carve':
        R.to({ head: { alt: 'grin', r: -4 } }, 0.2, 'back.out(1.8)', tl, 0);
        tl.call(() => R.setAlt('handF', 'point'), [], 0.06);
        this.arm(tl, 'F', { p: this.reachPt('F', [-420, -80], 0.76) }, 0.22, 'back.out(1.6)', 0);
        this.back(tl, 0.9);
        break;
      case 'proud':
        R.to({ handB: { alt: 'thumb' }, head: { alt: 'grin', r: 3 } }, 0.2, 'back.out(2)', tl, 0);
        this.arm(tl, 'B', { p: [610, 60] }, 0.22, 'back.out(1.6)', 0);
        this.back(tl, 0.9);
        break;
      case 'thump':
        // coup de queue sur le Cornerstone : la queue se lève et frappe le sol
        R.to({ tail: { r: -30, sy: TAIL_SY * 1.05 }, torso: { r: -1 } }, 0.09, 'power2.out', tl, 0);
        R.to({ tail: { r: 3, sy: TAIL_SY * 0.84 }, torso: { r: 1 }, head: { alt: 'grin' } }, 0.06, 'power3.in', tl, 0.09);
        R.to({ tail: { r: -5, sy: TAIL_SY } }, 0.14, 'back.out(3)', tl, 0.15);
        this.back(tl, 0.45, 0.25);
        break;
      case 'smallWin':
        R.to({ handB: { alt: 'thumb' }, head: { alt: 'rest', r: 2 } }, 0.2, 'back.out(2)', tl, 0);
        this.arm(tl, 'B', { p: [615, 110] }, 0.22, 'back.out(1.6)', 0);
        this.back(tl, 0.7);
        pri = 1.5;
        break;
      case 'goodWin': {
        // poing levé à côté de la tête, deux petites pompes
        const hi: Vec = [-40, -230];
        const lo: Vec = [-62, -140];
        R.to({ handF: { alt: 'fist' }, head: { alt: 'grin', r: -3 } }, 0.16, 'back.out(2)', tl, 0);
        this.arm(tl, 'F', { p: hi }, 0.18, 'back.out(1.6)', 0);
        this.arm(tl, 'F', { p: lo, via: null }, 0.12, 'sine.inOut', 0.22);
        this.arm(tl, 'F', { p: hi, via: null }, 0.12, 'sine.inOut', 0.34);
        this.back(tl, 0.7);
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
    R.to({ handF: { alt: 'fist' }, handB: { alt: 'fist' }, head: { alt: 'shout', r: -3 }, tail: { r: -12 } }, 0.2, 'back.out(2)', tl, 0);
    this.arm(tl, 'F', { p: UP_F }, 0.22, 'back.out(1.5)', 0);
    this.arm(tl, 'B', { p: mirror(UP_F) }, 0.22, 'back.out(1.5)', 0.02);
    const pump = (at: number) => {
      this.arm(tl, 'F', { p: PUMP_F, via: null }, 0.12, 'sine.inOut', at);
      this.arm(tl, 'B', { p: mirror(PUMP_F), via: null }, 0.12, 'sine.inOut', at);
      this.arm(tl, 'F', { p: UP_F, via: null }, 0.13, 'sine.inOut', at + 0.12);
      this.arm(tl, 'B', { p: mirror(UP_F), via: null }, 0.13, 'sine.inOut', at + 0.12);
    };
    const n = 2 + Math.min(4, tier);
    for (let i = 0; i < n; i++) pump(0.26 + i * 0.26);
    if (tier >= 2) {
      // danse : bascule du poids, queue qui bat
      for (let i = 0; i < 3; i++) {
        R.to({ torso: { r: 3 }, thighF: { r: -3 }, thighB: { r: -3 }, tail: { r: 10 } }, 0.14, 'sine.inOut', tl, 0.3 + i * 0.3);
        R.to({ torso: { r: -3 }, thighF: { r: 3 }, thighB: { r: 3 }, tail: { r: -10 } }, 0.14, 'sine.inOut', tl, 0.44 + i * 0.3);
      }
      R.to({ torso: { r: 0 }, thighF: { r: 0 }, thighB: { r: 0 }, tail: { r: 0 } }, 0.14, 'sine.inOut', tl, 1.2);
    }
    let end = 0.26 + n * 0.26;
    if (tier >= 4) {
      // pose de vanité : désigne son monument, pouce levé, clin d'œil bref
      const at = end + 0.04;
      R.to({ handF: { alt: 'point' }, handB: { alt: 'thumb' }, head: { alt: 'grin', r: 6 }, torso: { r: 0 }, thighF: { r: 0 }, thighB: { r: 0 }, tail: { r: 0 } }, 0.25, 'back.out(1.6)', tl, at);
      this.arm(tl, 'F', { p: this.reachPt('F', [-380, -300], 0.8) }, 0.28, 'back.out(1.4)', at);
      this.arm(tl, 'B', { p: [610, 60] }, 0.3, 'power2.inOut', at);
      tl.call(() => R.setAlt('head', 'wink'), [], at + 0.5);
      tl.call(() => R.setAlt('head', 'grin'), [], at + 0.7);
      end = at + 1.2;
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
    this.current?.kill();
    this.current = null;
    this.pri = 0;
    this.hideProps();
    this.rig.set({ torso: { r: 0 }, head: { r: 0, y: 0, sy: 1, alt: 'rest' }, handF: { alt: 'open' }, handB: { alt: 'open' }, thighF: { r: 0 }, thighB: { r: 0 }, shinF: { r: 0 }, shinB: { r: 0 }, tail: { r: 0, sy: TAIL_SY, alt: 'ground' } });
    for (const side of ['F', 'B'] as const) {
      this.armOwner[side] = ++this.armSeq;
      this.hands[side] = this.armAt(side, REST[side]);
      this.applyArm(side);
    }
    this.rig.resetZ();
  }
}

function smooth(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}
