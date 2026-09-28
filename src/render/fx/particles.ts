import { Particle, ParticleContainer, type Texture } from 'pixi.js';

/**
 * Particules en pool, simulées sur l'horloge de présentation.
 * Aucune création de texture au moment d'un impact : les textures sont préparées au chargement.
 * Budget global plafonné selon la qualité graphique.
 */
export interface EmitSpec {
  texture: Texture | Texture[];
  count: number;
  x: number;
  y: number;
  /** dispersion de position (rayon) */
  spread?: number;
  /** vitesse (px/s) min-max et angle (rad) +- cone */
  speed?: [number, number];
  angle?: number;
  cone?: number;
  gravity?: number; // px/s²
  drag?: number; // 0..1 par seconde
  life?: [number, number]; // ms
  scale?: [number, number];
  scaleEnd?: number; // facteur à la fin de vie
  spin?: [number, number]; // rad/s
  tint?: number | number[];
  alphaIn?: number; // fraction de vie pour apparaître
  alphaOut?: number; // fraction de vie pour disparaître
  delay?: [number, number]; // ms
  /** point d'arrivée (collecte) : interpolation vers la cible au lieu de la physique */
  target?: { x: number; y: number; arc?: number };
  onArrive?: () => void;
}

interface Live {
  p: Particle;
  vx: number;
  vy: number;
  g: number;
  drag: number;
  life: number;
  age: number;
  delay: number;
  s0: number;
  s1: number;
  spin: number;
  aIn: number;
  aOut: number;
  sx: number;
  sy: number;
  tx?: number;
  ty?: number;
  arc?: number;
  onArrive?: (() => void) | undefined;
}

let rngState = 0x2f6b1a3d;
/** aléa cosmétique uniquement (graine ?seed=), jamais pour un résultat */
export function cosmeticSeed(seed: number): void {
  rngState = seed >>> 0 || 1;
}
export function rand(): number {
  rngState ^= rngState << 13;
  rngState ^= rngState >>> 17;
  rngState ^= rngState << 5;
  return ((rngState >>> 0) % 1_000_000) / 1_000_000;
}
const between = (r: [number, number] | undefined, d: number): number => (r ? r[0] + (r[1] - r[0]) * rand() : d);

export class ParticleField {
  readonly view: ParticleContainer;
  private live: Live[] = [];
  private pool: Particle[] = [];
  budget: number;

  constructor(budget = 900, blend: 'normal' | 'add' = 'normal') {
    this.budget = budget;
    this.view = new ParticleContainer({
      dynamicProperties: { position: true, rotation: true, vertex: true, color: true, uvs: true },
    });
    if (blend === 'add') this.view.blendMode = 'add';
  }

  get count(): number {
    return this.live.length;
  }

  emit(spec: EmitSpec): void {
    const n = Math.min(spec.count, Math.max(0, this.budget - this.live.length));
    const textures = Array.isArray(spec.texture) ? spec.texture : [spec.texture];
    const tints = spec.tint === undefined ? [0xffffff] : Array.isArray(spec.tint) ? spec.tint : [spec.tint];
    for (let i = 0; i < n; i++) {
      const tex = textures[(rand() * textures.length) | 0] as Texture;
      const p = this.pool.pop() ?? new Particle({ texture: tex });
      p.texture = tex;
      p.anchorX = 0.5;
      p.anchorY = 0.5;
      const r = (spec.spread ?? 0) * Math.sqrt(rand());
      const th = rand() * Math.PI * 2;
      p.x = spec.x + Math.cos(th) * r;
      p.y = spec.y + Math.sin(th) * r;
      const a = (spec.angle ?? -Math.PI / 2) + (rand() - 0.5) * 2 * (spec.cone ?? Math.PI);
      const sp = between(spec.speed, 200);
      const s0 = between(spec.scale, 1);
      p.scaleX = p.scaleY = s0;
      p.rotation = rand() * Math.PI * 2;
      p.tint = tints[(rand() * tints.length) | 0] as number;
      p.alpha = 0;
      this.view.addParticle(p);
      this.live.push({
        p,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        g: spec.gravity ?? 0,
        drag: spec.drag ?? 0,
        life: between(spec.life, 900),
        age: 0,
        delay: between(spec.delay, 0),
        s0,
        s1: s0 * (spec.scaleEnd ?? 1),
        spin: between(spec.spin, 0),
        aIn: spec.alphaIn ?? 0.08,
        aOut: spec.alphaOut ?? 0.35,
        sx: p.x,
        sy: p.y,
        ...(spec.target ? { tx: spec.target.x, ty: spec.target.y, arc: spec.target.arc ?? 120 } : {}),
        onArrive: i === 0 ? spec.onArrive : undefined,
      });
    }
    if (n === 0) spec.onArrive?.();
  }

  update(dtMs: number): void {
    if (!this.live.length) return;
    const dt = dtMs / 1000;
    const keep: Live[] = [];
    for (const l of this.live) {
      if (l.delay > 0) {
        l.delay -= dtMs;
        keep.push(l);
        continue;
      }
      l.age += dtMs;
      const k = Math.min(1, l.age / l.life);
      const p = l.p;
      if (l.tx !== undefined && l.ty !== undefined) {
        // trajectoire en arc vers la cible (collecte)
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        p.x = l.sx + (l.tx - l.sx) * e;
        p.y = l.sy + (l.ty - l.sy) * e - Math.sin(Math.PI * e) * (l.arc ?? 0);
      } else {
        l.vy += l.g * dt;
        const d = Math.max(0, 1 - l.drag * dt);
        l.vx *= d;
        l.vy *= d;
        p.x += l.vx * dt;
        p.y += l.vy * dt;
      }
      p.rotation += l.spin * dt;
      const s = l.s0 + (l.s1 - l.s0) * k;
      p.scaleX = p.scaleY = s;
      p.alpha = k < l.aIn ? k / l.aIn : k > 1 - l.aOut ? Math.max(0, (1 - k) / l.aOut) : 1;
      if (k >= 1) {
        this.view.removeParticle(p);
        this.pool.push(p);
        l.onArrive?.();
      } else keep.push(l);
    }
    this.live = keep;
  }

  /** fin immédiate (skip) : les particules disparaissent, les callbacks d'arrivée sont appelés */
  finish(): void {
    for (const l of this.live) {
      this.view.removeParticle(l.p);
      this.pool.push(l.p);
      l.onArrive?.();
    }
    this.live = [];
  }
}
