import { Graphics, RenderTexture, Rectangle, Texture, type Renderer } from 'pixi.js';

/**
 * Atlas unique des primitives d'effets (halos, étincelles, anneaux, éclats), dessiné une fois au chargement.
 * ParticleContainer exige une seule source de texture : toutes les primitives partagent cet atlas.
 * Les débris illustrés (granit, copeaux, pépites) viennent de la planche ImageGen fx.* quand elle existe.
 */
export interface FxTextures {
  dot: Texture;
  soft: Texture;
  spark: Texture;
  ring: Texture;
  chunk: Texture[];
  star: Texture;
}

let cached: FxTextures | null = null;

export function buildFxTextures(renderer: Renderer): FxTextures {
  if (cached) return cached;
  const size = 256;
  const rt = RenderTexture.create({ width: size, height: size, resolution: 1 });
  const g = new Graphics();
  // dot net (64x64 en 0,0)
  g.circle(32, 32, 26).fill({ color: 0xffffff });
  // halo doux en paliers (64x64 en 64,0) : anneaux concentriques d'alpha décroissant (pas de dégradé par défaut)
  for (let i = 0; i < 8; i++) g.circle(96, 32, 30 - i * 3.5).fill({ color: 0xffffff, alpha: 0.1 + i * 0.03 });
  // étincelle allongée (64x16 en 128,0)
  g.roundRect(130, 26, 60, 12, 6).fill({ color: 0xffffff });
  // anneau (64x64 en 192,0)
  g.circle(224, 32, 26).stroke({ color: 0xffffff, width: 6 });
  // éclats polygonaux (en 0,64 / 64,64 / 128,64) contour encre
  const chunks: Array<Array<[number, number]>> = [
    [[8, 20], [30, 6], [54, 18], [48, 50], [18, 56]],
    [[10, 12], [50, 10], [56, 40], [26, 54], [6, 38]],
    [[16, 8], [44, 14], [56, 46], [12, 50]],
  ];
  chunks.forEach((pts, i) => {
    const ox = i * 64;
    const oy = 64;
    g.poly(pts.flatMap(([x, y]) => [ox + x, oy + y])).fill({ color: 0xffffff }).stroke({ color: 0x1b1410, width: 5 });
  });
  // étoile d'impact (64x64 en 192,64)
  const star: number[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 12 : 30;
    star.push(224 + Math.cos(a) * r, 96 + Math.sin(a) * r);
  }
  g.poly(star).fill({ color: 0xffffff });
  renderer.render({ container: g, target: rt, clear: true });
  g.destroy();
  const sub = (x: number, y: number, w: number, h: number) => new Texture({ source: rt.source, frame: new Rectangle(x, y, w, h) });
  cached = {
    dot: sub(0, 0, 64, 64),
    soft: sub(64, 0, 64, 64),
    spark: sub(128, 16, 64, 32),
    ring: sub(192, 0, 64, 64),
    chunk: [sub(0, 64, 64, 64), sub(64, 64, 64, 64), sub(128, 64, 64, 64)],
    star: sub(192, 64, 64, 64),
  };
  return cached;
}

export function fxTextures(): FxTextures {
  if (!cached) throw new Error('fx textures non construites');
  return cached;
}
