import { Container, Sprite, type Texture } from 'pixi.js';
import { gsap } from 'gsap';

/**
 * Rig cut-out : pièces hiérarchiques avec pivots anatomiques.
 * - Chaque pièce est un Container placé au point d'attache (coordonnées du parent, relatives à son pivot),
 *   contenant un Sprite ancré sur son propre pivot : la rotation se fait autour de l'articulation.
 * - Toutes les expressions d'une tête partagent la même ancre de cou (pivot identique).
 * - Fondus et teintes s'appliquent au conteneur racine, jamais pièce par pièce.
 */
export interface RigPartDef {
  id: string;
  texture: string;
  /** pivot dans la texture source (px) */
  pivot: [number, number];
  parent?: string;
  /** point d'attache dans l'espace du parent (px, relatif au pivot du parent) */
  attach?: [number, number];
  z: number;
  /** échelle propre de la pièce (compense la résolution de la planche) */
  scale?: number;
}

export interface RigDef {
  parts: RigPartDef[];
  /** textures alternatives par pièce (expressions, mains) : clé -> texture */
  alternates?: Record<string, Record<string, string>>;
}

export interface PartPose {
  r?: number; // degrés
  x?: number; // décalage px (espace parent)
  y?: number;
  sx?: number;
  sy?: number;
  alt?: string; // texture alternative
}
export type Pose = Record<string, PartPose>;

interface PartState {
  def: RigPartDef;
  node: Container;
  sprite: Sprite;
  baseX: number;
  baseY: number;
}

export class Rig {
  readonly root = new Container();
  /** conteneur des pièces (le root porte position, échelle globale, fondus) */
  readonly body = new Container();
  private parts = new Map<string, PartState>();
  private currentAlt = new Map<string, string>();

  constructor(
    readonly def: RigDef,
    private readonly tex: (key: string) => Texture,
  ) {
    this.root.addChild(this.body);
    this.body.sortableChildren = false;
    // création dans l'ordre de dépendance
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
      const sprite = new Sprite(this.tex(d.texture));
      const tw = sprite.texture.width || 1;
      const th = sprite.texture.height || 1;
      sprite.anchor.set(d.pivot[0] / tw, d.pivot[1] / th);
      if (d.scale) sprite.scale.set(d.scale);
      node.addChild(sprite);
      const parent = d.parent ? (this.parts.get(d.parent) as PartState) : null;
      const [ax, ay] = d.attach ?? [0, 0];
      const ps = parent?.def.scale ?? 1;
      node.position.set(ax * ps, ay * ps);
      (parent ? parent.node : this.body).addChild(node);
      this.parts.set(d.id, { def: d, node, sprite, baseX: node.x, baseY: node.y });
    }
    this.applyZ();
  }

  /** Ordre de dessin : les pièces sœurs sont triées par z (le z global sert d'ordre relatif). */
  applyZ(overrides?: Record<string, number>): void {
    for (const s of this.parts.values()) {
      s.node.zIndex = overrides?.[s.def.id] ?? s.def.z;
      if (s.node.parent) s.node.parent.sortableChildren = true;
    }
  }

  part(id: string): Container {
    const p = this.parts.get(id);
    if (!p) throw new Error(`rig: pièce inconnue ${id}`);
    return p.node;
  }

  has(id: string): boolean {
    return this.parts.has(id);
  }

  /** Change la texture d'une pièce (expression, main) sans toucher au pivot d'ancrage. */
  setAlt(partId: string, alt: string | null): void {
    const p = this.parts.get(partId);
    if (!p) return;
    const key = alt ? this.def.alternates?.[partId]?.[alt] : p.def.texture;
    if (!key) return;
    if (this.currentAlt.get(partId) === (alt ?? '')) return;
    this.currentAlt.set(partId, alt ?? '');
    p.sprite.texture = this.tex(key);
  }

  /** Pose immédiate. */
  set(pose: Pose): void {
    for (const [id, pp] of Object.entries(pose)) {
      const s = this.parts.get(id);
      if (!s) continue;
      if (pp.r !== undefined) s.node.angle = pp.r;
      if (pp.x !== undefined) s.node.x = s.baseX + pp.x;
      if (pp.y !== undefined) s.node.y = s.baseY + pp.y;
      if (pp.sx !== undefined) s.node.scale.x = pp.sx;
      if (pp.sy !== undefined) s.node.scale.y = pp.sy;
      if (pp.alt !== undefined) this.setAlt(id, pp.alt || null);
    }
  }

  /** Interpolation vers une pose : renvoie une timeline (à jouer via Beat). */
  to(pose: Pose, duration: number, ease = 'power2.inOut', at: gsap.core.Timeline = gsap.timeline(), position: number | string = 0): gsap.core.Timeline {
    for (const [id, pp] of Object.entries(pose)) {
      const s = this.parts.get(id);
      if (!s) continue;
      const vars: gsap.TweenVars = { duration, ease };
      if (pp.r !== undefined) vars.angle = pp.r;
      if (pp.x !== undefined) vars.x = s.baseX + pp.x;
      if (pp.y !== undefined) vars.y = s.baseY + pp.y;
      if (pp.r !== undefined || pp.x !== undefined || pp.y !== undefined) at.to(s.node, vars, position);
      if (pp.sx !== undefined || pp.sy !== undefined) {
        at.to(s.node.scale, { duration, ease, ...(pp.sx !== undefined ? { x: pp.sx } : {}), ...(pp.sy !== undefined ? { y: pp.sy } : {}) }, position);
      }
      if (pp.alt !== undefined) {
        const alt = pp.alt;
        at.call(() => this.setAlt(id, alt || null), [], typeof position === 'number' ? position + duration * 0.35 : position);
      }
    }
    return at;
  }

  /** Pose actuelle (pour revenir exactement au repos après une action). */
  snapshot(): Pose {
    const out: Pose = {};
    for (const [id, s] of this.parts) {
      out[id] = { r: s.node.angle, x: s.node.x - s.baseX, y: s.node.y - s.baseY, sx: s.node.scale.x, sy: s.node.scale.y };
    }
    return out;
  }

  /** Position monde d'un point local d'une pièce (ex. main -> cible de lancer). */
  worldOf(partId: string, lx = 0, ly = 0): { x: number; y: number } {
    const p = this.part(partId).toGlobal({ x: lx, y: ly });
    return { x: p.x, y: p.y };
  }

  partIds(): string[] {
    return [...this.parts.keys()];
  }
}
