import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import { Rig, type Pose, type RigDef } from '../rig/Rig';
import { tex } from '../assets';
import { rand } from '../fx/particles';
import type { Beat } from '../../core/beat';
import type { SceneLayout } from '../layout';
import RIG_JSON from './buckRig.json';

/**
 * Buck Boomtooth : mascotte articulée (rig cut-out), pieds ancrés, ombre de contact.
 * - Repos : respiration articulée (torse, tête et épaules synchrones), regards, clignements,
 *   petits gestes espacés (mâcher l'allumette, taper de la queue, lustrer la dent en or, regarder son monument).
 * - Performances : allumette frottée sur la dent en or puis étincelle vers la charge, se couvrir à l'impact,
 *   grimace pendant une chaîne, désigner le géant sculpté, coup de queue sur le Cornerstone, pouce levé,
 *   poing levé, acclamation, célébrations graduées.
 * - Priorités : repos 0 < geste 1 < réaction 2 < performance 3 < célébration 4 ; une demande ≥ interrompt.
 * - Les gestes sont décrits par des cibles de main (cinématique inverse à deux os), jamais par des angles devinés.
 */
interface IkArm {
  upper: string;
  fore: string;
  hand: string;
  shoulder: [number, number];
  upperAxis: number;
  upperLen: number;
  foreAxis: number;
  foreLen: number;
}

type BuckJson = RigDef & {
  ik: Record<'armF' | 'armB', IkArm>;
  points: Record<string, { part: string; alt?: string; xy: [number, number] }>;
};

const RIG = RIG_JSON as unknown as BuckJson;
const DEG = 180 / Math.PI;

export class Buck {
  readonly view = new Container();
  readonly rig: Rig;
  private shadow = new Graphics();
  private pri = 0;
  private current: gsap.core.Timeline | null = null;
  private idleTl: gsap.core.Timeline | null = null;
  private blinkTimer: gsap.core.Tween | null = null;
  private gestureTimer: gsap.core.Tween | null = null;
  private breath = { k: 0 };
  private breathTl: gsap.core.Tween | null = null;
  private feetY = 0;
  private scaleK = 0.35;
  facing: 1 | -1 = 1;
  reducedMotion = false;
  /** lampe frontale rouge quand l'Ante est actif */
  private lamp = new Graphics();
  anteOn = false;

  constructor() {
    this.rig = new Rig(RIG, tex);
    this.view.addChild(this.shadow, this.rig.root);
    this.rig.part('head').addChild(this.lamp);
    // pieds : bas des bottes au repos -> origine de la mascotte
    const b = this.rig.root.getLocalBounds();
    this.feetY = b.y + b.height;
    this.rig.body.y = -this.feetY + 16;
    this.drawShadow(1);
    this.startIdle();
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

  // ------------------------------------------------------------------ cinématique inverse

  /** angles (deg, écarts au repos) pour poser le poignet d'un bras sur une cible (px du torse) */
  ik(arm: 'armF' | 'armB', target: [number, number], elbowOut = true): Pose {
    const a = RIG.ik[arm];
    const [sx, sy] = a.shoulder;
    let dx = target[0] - sx;
    let dy = target[1] - sy;
    let d = Math.hypot(dx, dy);
    const max = a.upperLen + a.foreLen - 2;
    const min = Math.abs(a.upperLen - a.foreLen) + 2;
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
    // coude vers l'extérieur du corps : bras avant (gauche de l'image) coude à gauche, bras arrière à droite
    const sign = (arm === 'armF') === elbowOut ? 1 : -1;
    const upperWorld = theta + sign * alpha;
    const ex = sx + Math.cos(upperWorld) * a.upperLen;
    const ey = sy + Math.sin(upperWorld) * a.upperLen;
    const foreWorld = Math.atan2(target[1] - ey, target[0] - ex);
    const upperNode = upperWorld * DEG - a.upperAxis;
    const foreNode = foreWorld * DEG - a.foreAxis - upperNode;
    const restU = RIG.parts.find((p) => p.id === a.upper)?.rest ?? 0;
    const restF = RIG.parts.find((p) => p.id === a.fore)?.rest ?? 0;
    return { [a.upper]: { r: norm(upperNode - restU) }, [a.fore]: { r: norm(foreNode - restF) } };
  }

  // ------------------------------------------------------------------ repos

  private startIdle(): void {
    // respiration articulée : torse, tête et épaules bougent ensemble (aucun raccord ne s'ouvre)
    this.breathTl?.kill();
    this.breathTl = gsap.to(this.breath, {
      k: 1,
      duration: 1.5,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      onUpdate: () => this.applyBreath(),
    });
    this.scheduleBlink();
    this.scheduleGesture();
  }

  private applyBreath(): void {
    const k = this.breath.k;
    const torso = this.rig.part('torso').children[0] as Container;
    torso.scale.y = 1 + k * 0.012;
    // la tête et les épaules suivent le soulèvement de la poitrine
    const lift = -k * 6;
    const head = this.rig.part('head');
    head.pivot.y = -lift;
    this.rig.part('armF').pivot.y = -lift * 0.8;
    this.rig.part('armB').pivot.y = -lift * 0.8;
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
      if (this.pri === 0) this.gesture(Math.floor(rand() * 4));
      this.scheduleGesture();
    });
  }

  private gesture(kind: number): void {
    const tl = gsap.timeline();
    const R = this.rig;
    switch (kind) {
      case 0: // mâche l'allumette
        tl.call(() => R.setAlt('head', 'focus')).to({}, { duration: 0.18 }).call(() => R.setAlt('head', 'rest')).to({}, { duration: 0.18 }).call(() => R.setAlt('head', 'focus')).to({}, { duration: 0.18 }).call(() => R.setAlt('head', 'rest'));
        break;
      case 1: // tape de la queue
        R.to({ tail: { r: -10 } }, 0.12, 'power2.out', tl, 0);
        R.to({ tail: { r: 4 } }, 0.12, 'power2.in', tl, 0.12);
        R.to({ tail: { r: -8 } }, 0.12, 'power2.out', tl, 0.24);
        R.to({ tail: { r: 0 } }, 0.3, 'sine.inOut', tl, 0.36);
        break;
      case 2: // lustre sa dent en or avec la manche
        this.front(tl, 0, ['B']);
        R.to({ ...this.ik('armB', [300, -40]), handB: { alt: 'fist' }, head: { r: 4, alt: 'grin' } }, 0.35, 'power2.out', tl, 0);
        R.to({ foreB: { r: this.ik('armB', [300, -40]).foreB!.r! + 10 } }, 0.1, 'sine.inOut', tl, 0.4);
        R.to({ foreB: { r: this.ik('armB', [300, -40]).foreB!.r! - 6 } }, 0.1, 'sine.inOut', tl, 0.5);
        R.to({ ...this.ik('armB', [300, -40]) }, 0.1, 'sine.inOut', tl, 0.6);
        R.to({ armB: { r: 0 }, foreB: { r: 0 }, handB: { alt: 'open' }, head: { r: 0, alt: 'rest' } }, 0.4, 'power2.inOut', tl, 0.8);
        break;
      default: // lève les yeux vers son monument, clin d'œil vaniteux
        R.to({ head: { r: 6, alt: 'wink' } }, 0.4, 'sine.inOut', tl, 0);
        R.to({ head: { r: 0, alt: 'rest' } }, 0.4, 'sine.inOut', tl, 1.3);
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
    tl.eventCallback('onComplete', () => {
      if (this.current === tl) {
        this.pri = 0;
        this.current = null;
      }
    });
    return tl;
  }

  private back(tl: gsap.core.Timeline, at: number | string, d = 0.35): void {
    const rest: Pose = {
      torso: { r: 0 },
      head: { r: 0, alt: 'rest' },
      armF: { r: 0 },
      foreF: { r: 0 },
      handF: { r: 0, alt: 'open' },
      armB: { r: 0 },
      foreB: { r: 0 },
      handB: { r: 0, alt: 'open' },
      thighF: { r: 0 },
      thighB: { r: 0 },
      tail: { r: 0 },
    };
    this.rig.to(rest, d, 'power2.inOut', tl, at);
    tl.call(() => this.rig.resetZ(), [], `>`);
  }

  /** passe un ou deux bras devant le torse et la tête (main devant le corps ou le visage) */
  private front(tl: gsap.core.Timeline, at: number, arms: Array<'F' | 'B'>): void {
    tl.call(() => {
      const z: Record<string, number> = {};
      for (const a of arms) z[`arm${a}`] = 6;
      this.rig.setZ(z);
    }, [], at);
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
  async perform(name: string, beat: Beat, arg?: { target?: { x: number; y: number }; tier?: number }): Promise<void> {
    const R = this.rig;
    const tl = gsap.timeline();
    switch (name) {
      case 'strikeMatch': {
        // 1. main à la bouche : prend l'allumette ; 2. la frotte sur la dent en or ; 3. bras tendu vers la charge
        const toMouth = this.ik('armF', [215, -20]);
        this.front(tl, 0, ['F']);
        R.to({ ...toMouth, handF: { alt: 'grip' }, head: { alt: 'focus', r: -3 }, torso: { r: -2 }, thighF: { r: 2 }, thighB: { r: 2 } }, 0.22, 'power2.out', tl, 0);
        tl.call(() => R.setAlt('head', 'grin'), [], 0.24);
        tl.call(() => R.setAlt('handF', 'match'), [], 0.26);
        // frottement sec sur la dent (petit aller-retour de l'avant-bras)
        R.to({ foreF: { r: (toMouth.foreF?.r ?? 0) - 16 } }, 0.07, 'power3.in', tl, 0.3);
        R.to({ foreF: { r: (toMouth.foreF?.r ?? 0) + 4 } }, 0.09, 'power2.out', tl, 0.37);
        const t = arg?.target ? this.toTorso(arg.target) : [-500, -200];
        const aim = this.ik('armF', [t[0], t[1]] as [number, number]);
        R.to({ ...aim, head: { r: -6, alt: 'wink' }, torso: { r: -3 } }, 0.2, 'back.out(1.6)', tl, 0.5);
        tl.addLabel('flick', 0.72);
        this.run(tl, 3);
        await beat.play(gsap.timeline().to({}, { duration: 0.72 }));
        // retour au repos après l'étincelle (non bloquant)
        const out = gsap.timeline({ delay: 0.25 });
        this.back(out, 0, 0.45);
        this.run(out, 2);
        return;
      }
      case 'cheer':
      case 'triggerCheer': {
        const up = { ...this.ik('armF', [-60, -420]), ...this.ik('armB', [600, -420]) };
        R.to({ ...up, handF: { alt: 'fist' }, handB: { alt: 'fist' }, head: { alt: 'shout', r: -4 }, tail: { r: -14 } }, 0.22, 'back.out(2)', tl, 0);
        R.to({ torso: { r: 2 }, thighF: { r: -2 }, thighB: { r: -2 } }, 0.16, 'sine.inOut', tl, 0.25);
        R.to({ torso: { r: -2 }, thighF: { r: 2 }, thighB: { r: 2 }, tail: { r: 8 } }, 0.16, 'sine.inOut', tl, 0.41);
        R.to({ torso: { r: 0 }, thighF: { r: 0 }, thighB: { r: 0 }, tail: { r: 0 } }, 0.16, 'sine.inOut', tl, 0.57);
        this.back(tl, 0.9, 0.4);
        this.run(tl, 3);
        await beat.play(gsap.timeline().to({}, { duration: name === 'triggerCheer' ? 0.8 : 0.5 }));
        return;
      }
      case 'celebrate': {
        this.celebrate(arg?.tier ?? 0);
        await beat.wait(300);
        return;
      }
      case 'introSwipe': {
        // geste de la mascotte qui balaie l'introduction : coup de queue et bras qui balaie
        const sweepA = this.ik('armF', [-520, -120]);
        this.front(tl, 0, ['F']);
        const sweepB = this.ik('armF', [-380, 160]);
        R.to({ ...sweepA, handF: { alt: 'open' }, head: { alt: 'focus', r: -5 }, torso: { r: -3 } }, 0.16, 'power2.out', tl, 0);
        R.to({ ...sweepB, head: { alt: 'grin' } }, 0.18, 'power3.in', tl, 0.18);
        R.to({ tail: { r: -22 } }, 0.1, 'power3.in', tl, 0.18);
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

  /** réaction non bloquante (sons et scène continuent) */
  react(name: string): void {
    const R = this.rig;
    const tl = gsap.timeline();
    let pri = 2;
    switch (name) {
      case 'scatter':
        R.to({ head: { alt: 'surprise', r: -3 } }, 0.08, 'power2.out', tl, 0);
        R.to({ ...this.ik('armF', [-300, -60]), handF: { alt: 'point' } }, 0.18, 'back.out(2)', tl, 0.05);
        tl.call(() => R.setAlt('head', 'grin'), [], 0.4);
        this.back(tl, 0.8);
        break;
      case 'scatterExcited':
        R.to({ head: { alt: 'shout', r: -4 }, ...this.ik('armF', [-200, -300]), handF: { alt: 'fist' }, ...this.ik('armB', [560, -300]), handB: { alt: 'fist' } }, 0.16, 'back.out(2)', tl, 0);
        this.back(tl, 0.9);
        break;
      case 'anticipation':
        // penché en avant, poings serrés, regard fixe sur les rouleaux (maintenu jusqu'au résultat)
        this.front(tl, 0, ['F', 'B']);
        R.to({ head: { alt: 'focus', r: -6 }, torso: { r: -3 }, thighF: { r: 3 }, thighB: { r: 3 }, ...this.ik('armF', [120, 120]), handF: { alt: 'fist' }, ...this.ik('armB', [420, 120]), handB: { alt: 'fist' } }, 0.3, 'power2.out', tl, 0);
        tl.to({}, { duration: 3 });
        pri = 3;
        break;
      case 'anticipationWin':
        R.to({ head: { alt: 'shout', r: -3 }, ...this.ik('armF', [-60, -420]), ...this.ik('armB', [600, -420]), handF: { alt: 'fist' }, handB: { alt: 'fist' }, torso: { r: 0 }, thighF: { r: 0 }, thighB: { r: 0 } }, 0.2, 'back.out(2)', tl, 0);
        this.back(tl, 0.9);
        pri = 3;
        break;
      case 'anticipationLose':
        R.to({ head: { alt: 'rest', r: 4 }, torso: { r: 0 }, thighF: { r: 0 }, thighB: { r: 0 }, ...this.ik('armF', [-60, 330]), ...this.ik('armB', [600, 330]), handF: { alt: 'open' }, handB: { alt: 'open' } }, 0.25, 'sine.out', tl, 0);
        this.back(tl, 0.7);
        pri = 3;
        break;
      case 'duck':
        // se couvre à l'impact : mains plaquées sur le casque, épaules rentrées, pieds ancrés
        this.front(tl, 0, ['F', 'B']);
        R.to({ head: { alt: 'surprise', r: 5 }, ...this.ik('armF', [110, -250]), handF: { alt: 'open' }, ...this.ik('armB', [440, -250]), handB: { alt: 'open' }, torso: { r: 2 }, thighF: { r: -2 }, thighB: { r: -2 } }, 0.1, 'power3.out', tl, 0);
        R.to({ head: { r: 2 } }, 0.2, 'sine.inOut', tl, 0.12);
        this.back(tl, 0.5, 0.3);
        break;
      case 'chainWince':
        R.to({ head: { alt: 'focus', r: -7 }, torso: { r: -2 }, thighF: { r: 2 }, thighB: { r: 2 } }, 0.12, 'power2.out', tl, 0);
        this.back(tl, 0.45, 0.25);
        break;
      case 'carve':
        R.to({ ...this.ik('armF', [-420, -80]), handF: { alt: 'point' }, head: { alt: 'wink', r: -4 } }, 0.2, 'back.out(1.8)', tl, 0);
        this.back(tl, 0.9);
        break;
      case 'proud':
        this.front(tl, 0, ['B']);
        R.to({ ...this.ik('armB', [360, 40]), handB: { alt: 'thumb' }, head: { alt: 'grin', r: 3 } }, 0.2, 'back.out(2)', tl, 0);
        this.back(tl, 0.9);
        break;
      case 'thump':
        // coup de queue sur le Cornerstone
        R.to({ tail: { r: 26 }, torso: { r: 1 } }, 0.08, 'power3.in', tl, 0);
        R.to({ tail: { r: -6 }, head: { alt: 'grin' } }, 0.14, 'back.out(3)', tl, 0.08);
        this.back(tl, 0.45, 0.25);
        break;
      case 'smallWin':
        this.front(tl, 0, ['B']);
        R.to({ ...this.ik('armB', [380, 60]), handB: { alt: 'thumb' }, head: { alt: 'rest', r: 2 } }, 0.2, 'back.out(2)', tl, 0);
        this.back(tl, 0.7);
        pri = 1.5;
        break;
      case 'goodWin':
        this.front(tl, 0, ['F']);
        R.to({ ...this.ik('armF', [60, -300]), handF: { alt: 'fist' }, head: { alt: 'grin', r: -3 } }, 0.16, 'back.out(2)', tl, 0);
        R.to({ ...this.ik('armF', [60, -200]) }, 0.12, 'sine.inOut', tl, 0.22);
        R.to({ ...this.ik('armF', [60, -320]) }, 0.12, 'sine.inOut', tl, 0.34);
        this.back(tl, 0.7);
        break;
      default:
        return;
    }
    this.run(tl, pri);
  }

  /** célébrations graduées selon le palier (0 : ×10 … 4 : ×1000, 5 : MAX WIN) */
  celebrate(tier: number): void {
    const R = this.rig;
    const tl = gsap.timeline();
    const up = { ...this.ik('armF', [-60, -430]), ...this.ik('armB', [600, -430]) };
    const pump = (at: number) => {
      R.to({ ...this.ik('armF', [-60, -300]), ...this.ik('armB', [600, -300]) }, 0.12, 'sine.inOut', tl, at);
      R.to(up, 0.12, 'sine.inOut', tl, at + 0.12);
    };
    R.to({ ...up, handF: { alt: 'fist' }, handB: { alt: 'fist' }, head: { alt: 'shout', r: -3 }, tail: { r: -12 } }, 0.2, 'back.out(2)', tl, 0);
    const n = 2 + Math.min(4, tier);
    for (let i = 0; i < n; i++) pump(0.25 + i * 0.26);
    if (tier >= 2) {
      // danse : bascule du poids, queue qui bat
      for (let i = 0; i < 3; i++) {
        R.to({ torso: { r: 3 }, thighF: { r: -3 }, thighB: { r: -3 }, tail: { r: 10 } }, 0.14, 'sine.inOut', tl, 0.3 + i * 0.3);
        R.to({ torso: { r: -3 }, thighF: { r: 3 }, thighB: { r: 3 }, tail: { r: -10 } }, 0.14, 'sine.inOut', tl, 0.44 + i * 0.3);
      }
    }
    if (tier >= 4) {
      // pose de vanité : désigne son monument, clin d'œil, pouce levé
      const at = 0.3 + n * 0.26;
      this.front(tl, at, ['B']);
      R.to({ ...this.ik('armF', [-380, -300]), handF: { alt: 'point' }, ...this.ik('armB', [380, 40]), handB: { alt: 'thumb' }, head: { alt: 'wink', r: 6 }, torso: { r: 0 }, thighF: { r: 0 }, thighB: { r: 0 }, tail: { r: 0 } }, 0.25, 'back.out(1.6)', tl, at);
      tl.to({}, { duration: 0.9 });
    }
    this.back(tl, '>', 0.5);
    this.run(tl, 4);
  }

  /** convertit un point global en coordonnées du torse (px de texture) */
  private toTorso(p: { x: number; y: number }): [number, number] {
    const torso = this.rig.part('torso');
    const l = torso.toLocal(p);
    const pivot = RIG.parts[0]?.pivot ?? [272, 560];
    return [l.x + pivot[0], l.y + pivot[1]];
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
    this.rig.set({ torso: { r: 0 }, head: { r: 0, alt: 'rest' }, armF: { r: 0 }, foreF: { r: 0 }, handF: { r: 0, alt: 'open' }, armB: { r: 0 }, foreB: { r: 0 }, handB: { r: 0, alt: 'open' }, thighF: { r: 0 }, thighB: { r: 0 }, shinF: { r: 0 }, shinB: { r: 0 }, tail: { r: 0 } });
    this.rig.resetZ();
  }
}

function norm(a: number): number {
  let x = a % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}
