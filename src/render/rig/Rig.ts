import { Container, Sprite, type Texture } from 'pixi.js';
import { gsap } from 'gsap';

/**
 * Rig cut-out piloté par des timelines, pivots anatomiques.
 * - Chaque pièce = un Container placé à son point d'attache (px de la texture du parent, rapportés au pivot du parent),
 *   contenant le Sprite ancré sur son pivot : la rotation se fait autour de l'articulation.
 * - Les variantes (expressions, mains) ont leur propre pivot : l'ancre de cou / de poignet ne bouge jamais.
 * - Les poses sont des écarts par rapport au repos (rest). Fondus et teintes : sur le conteneur racine uniquement.
 * - z : ordre relatif au sprite du parent (négatif = derrière), modifiable par pose.
 */
export interface RigPartDef {
  id: string;
  key: string;
  pivot: [number, number];
  parent?: string;
  attach?: [number, number];
  z: number;
  rest?: number;
  scale?: number;
  /** miroir horizontal du dessin autour de son pivot (ex. main avant = main arrière retournée) */
  flip?: boolean;
}

export interface RigAlt {
  key: string;
  pivot: [number, number];
  r?: number;
  /** remplace le miroir de la pièce pour cette variante */
  flip?: boolean;
}

export interface RigDef {
  parts: RigPartDef[];
  alternates?: Record<string, Record<string, RigAlt>>;
}

export interface PartPose {
  r?: number; // écart de rotation (deg) par rapport au repos
  x?: number; // décalage (px de texture du parent)
  y?: number;
  sx?: number;
  sy?: number;
  alt?: string;
}
export type Pose = Record<string, PartPose>;

interface PartState {
  def: RigPartDef;
  node: Container;
  sprite: Sprite;
  baseX: number;
  baseY: number;
  scale: number;
  alt: string;
}

export class Rig {
  readonly root = new Container();
  readonly body = new Container();
  private parts = new Map<string, PartState>();

  constructor(
    readonly def: RigDef,
    private readonly tex: (key: string) => Texture,
  ) {
    this.root.addChild(this.body);
    const pending = [...def.parts];
    let guard = 0;
    while (pending.length && guard++ < 1000) {
      const d = pending.shift() as RigPartDef;
      if (d.parent && !this.parts.has(d.parent)) {
        pending.push(d);
        continue;
      }
      const node = new Container();
      node.label = d.id;
      const sprite = new Sprite(this.tex(d.key));
      const scale = d.scale ?? 1;
      this.anchorSprite(sprite, d.pivot);
      sprite.scale.set(d.flip ? -scale : scale, scale);
      node.addChild(sprite);
      node.sortableChildren = true;
      sprite.zIndex = 0;
      const parent = d.parent ? (this.parts.get(d.parent) as PartState) : null;
      let bx = 0;
      let by = 0;
      if (parent && d.attach) {
        bx = (d.attach[0] - parent.def.pivot[0]) * parent.scale;
        by = (d.attach[1] - parent.def.pivot[1]) * parent.scale;
      }
      node.position.set(bx, by);
      node.angle = d.rest ?? 0;
      node.zIndex = d.z;
      (parent ? parent.node : this.body).addChild(node);
      this.parts.set(d.id, { def: d, node, sprite, baseX: bx, baseY: by, scale, alt: '' });
    }
  }

  private anchorSprite(s: Sprite, pivot: [number, number]): void {
    const tw = s.texture.width || 1;
    const th = s.texture.height || 1;
    s.anchor.set(pivot[0] / tw, pivot[1] / th);
  }

  /** ordre de dessin : z relatif au parent ; overrides par pose (ex. main devant le visage) */
  setZ(overrides: Record<string, number>): void {
    for (const [id, z] of Object.entries(overrides)) {
      const p = this.parts.get(id);
      if (p) p.node.zIndex = z;
    }
  }

  resetZ(): void {
    for (const p of this.parts.values()) p.node.zIndex = p.def.z;
  }

  part(id: string): Container {
    const p = this.parts.get(id);
    if (!p) throw new Error(`rig: pièce inconnue ${id}`);
    return p.node;
  }

  has(id: string): boolean {
    return this.parts.has(id);
  }

  /** change la texture d'une pièce (expression, main) en gardant l'articulation au même endroit */
  setAlt(partId: string, alt: string | null): void {
    const p = this.parts.get(partId);
    if (!p) return;
    const name = alt ?? '';
    if (p.alt === name) return;
    const a = alt ? this.def.alternates?.[partId]?.[alt] : undefined;
    p.alt = name;
    if (!a) {
      p.sprite.texture = this.tex(p.def.key);
      this.anchorSprite(p.sprite, p.def.pivot);
      p.sprite.angle = 0;
      p.sprite.scale.x = p.def.flip ? -p.scale : p.scale;
      return;
    }
    p.sprite.texture = this.tex(a.key);
    this.anchorSprite(p.sprite, a.pivot);
    p.sprite.angle = a.r ?? 0;
    p.sprite.scale.x = (a.flip ?? p.def.flip) ? -p.scale : p.scale;
  }

  getAlt(partId: string): string {
    return this.parts.get(partId)?.alt ?? '';
  }

  /** pose immédiate (écarts par rapport au repos) */
  set(pose: Pose): void {
    for (const [id, pp] of Object.entries(pose)) {
      const s = this.parts.get(id);
      if (!s) continue;
      const rest = s.def.rest ?? 0;
      if (pp.r !== undefined) s.node.angle = rest + pp.r;
      if (pp.x !== undefined) s.node.x = s.baseX + pp.x;
      if (pp.y !== undefined) s.node.y = s.baseY + pp.y;
      if (pp.sx !== undefined) s.node.scale.x = pp.sx;
      if (pp.sy !== undefined) s.node.scale.y = pp.sy;
      if (pp.alt !== undefined) this.setAlt(id, pp.alt || null);
    }
  }

  /** interpolation vers une pose : ajoute les tweens à la timeline donnée */
  to(pose: Pose, duration: number, ease = 'power2.inOut', at: gsap.core.Timeline = gsap.timeline(), position: number | string = 0): gsap.core.Timeline {
    for (const [id, pp] of Object.entries(pose)) {
      const s = this.parts.get(id);
      if (!s) continue;
      const rest = s.def.rest ?? 0;
      const vars: gsap.TweenVars = { duration, ease };
      if (pp.r !== undefined) vars.angle = rest + pp.r;
      if (pp.x !== undefined) vars.x = s.baseX + pp.x;
      if (pp.y !== undefined) vars.y = s.baseY + pp.y;
      if (pp.r !== undefined || pp.x !== undefined || pp.y !== undefined) at.to(s.node, vars, position);
      if (pp.sx !== undefined || pp.sy !== undefined) {
        at.to(s.node.scale, { duration, ease, ...(pp.sx !== undefined ? { x: pp.sx } : {}), ...(pp.sy !== undefined ? { y: pp.sy } : {}) }, position);
      }
      if (pp.alt !== undefined) {
        const alt = pp.alt;
        at.call(() => this.setAlt(id, alt || null), [], typeof position === 'number' ? position + duration * 0.3 : position);
      }
    }
    return at;
  }

  /** retour exact au repos */
  restPose(): Pose {
    const out: Pose = {};
    for (const [id] of this.parts) out[id] = { r: 0, x: 0, y: 0, sx: 1, sy: 1 };
    return out;
  }

  /** point d'une pièce (px de sa texture) en coordonnées globales */
  worldOf(partId: string, tx: number, ty: number): { x: number; y: number } {
    const p = this.parts.get(partId);
    if (!p) return { x: 0, y: 0 };
    const alt = p.alt ? this.def.alternates?.[partId]?.[p.alt] : undefined;
    const pivot = alt?.pivot ?? p.def.pivot;
    const g = p.sprite.toGlobal({ x: (tx - pivot[0]) + (p.sprite.anchor.x * p.sprite.texture.width - pivot[0]) * 0, y: ty - pivot[1] });
    return { x: g.x, y: g.y };
  }

  kill(): void {
    for (const p of this.parts.values()) {
      gsap.killTweensOf(p.node);
      gsap.killTweensOf(p.node.scale);
    }
  }
}
