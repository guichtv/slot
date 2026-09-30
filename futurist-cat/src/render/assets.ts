// Illustrations come from public/assets/manifest.json (written by `npm run assets` from the
// ImageGen sources). Textures are decoded at load time, never at an impact. In dev/QA builds a
// missing image is replaced by a clearly labelled stand-in (src/dev/stand-ins.ts); the public
// build refuses to build while a required image is missing (tools/check-release.mjs).
import { Assets, Texture, Rectangle, type Renderer } from 'pixi.js';
import plan from '../../assets/plan.json';

export interface ManifestImage {
  file: string; w: number; h: number;
  /** visible (alpha) box inside the image, px */
  bbox?: [number, number, number, number];
  slice9?: [number, number, number, number];
  sheet?: [number, number];
}
export interface Manifest { version: number; images: Record<string, ManifestImage> }
export type AssetId = keyof typeof plan.images;

export const PLAN = plan as unknown as { images: Record<string, { lot: string; required: boolean; out: string | null; size: [number, number]; slice9?: number[]; sheet?: number[] }> };

export class AssetStore {
  manifest: Manifest = { version: 0, images: {} };
  private textures = new Map<string, Texture>();
  private frames = new Map<string, Texture[]>();
  private standIn: ((id: string, r: Renderer) => Texture) | null = null;
  readonly missing = new Set<string>();

  constructor(private readonly base = './assets/') {}

  async loadManifest(): Promise<void> {
    try {
      const res = await fetch(`${this.base}manifest.json`, { cache: 'no-cache' });
      if (res.ok) this.manifest = (await res.json()) as Manifest;
    } catch { /* no manifest yet: every image is missing */ }
  }

  /** ids to load before the welcome screen (all game images) */
  ids(): string[] { return Object.keys(PLAN.images).filter((id) => PLAN.images[id]!.out && !id.startsWith('media.') && id !== 'ref.screen'); }

  async preload(ids: string[], onProgress: (done: number, total: number) => void): Promise<void> {
    const list = ids.filter((id) => this.manifest.images[id]);
    for (const id of ids) if (!this.manifest.images[id]) this.missing.add(id);
    let done = 0;
    onProgress(0, list.length);
    await Promise.all(list.map(async (id) => {
      const m = this.manifest.images[id]!;
      const tex = await Assets.load<Texture>(`${this.base}${m.file}`);
      this.textures.set(id, tex);
      done++; onProgress(done, list.length);
    }));
  }

  async enableStandIns(): Promise<void> {
    if (!__DEV_TOOLS__) return;
    const m = await import('../dev/stand-ins');
    this.standIn = m.standInTexture;
  }

  has(id: string): boolean { return this.textures.has(id); }

  tex(id: string, renderer?: Renderer): Texture {
    const t = this.textures.get(id);
    if (t) return t;
    if (this.standIn && renderer) {
      const s = this.standIn(id, renderer);
      this.textures.set(id, s);
      return s;
    }
    return Texture.EMPTY;
  }

  /** frames of a sheet image (cols x rows), row-major */
  sheet(id: string, renderer?: Renderer): Texture[] {
    const cached = this.frames.get(id);
    if (cached) return cached;
    const base = this.tex(id, renderer);
    const def = this.manifest.images[id]?.sheet ?? (PLAN.images[id]?.sheet as [number, number] | undefined) ?? [1, 1];
    const [cols, rows] = def;
    const fw = base.width / cols, fh = base.height / rows;
    const out: Texture[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(new Texture({ source: base.source, frame: new Rectangle(base.frame.x + c * fw, base.frame.y + r * fh, fw, fh) }));
    this.frames.set(id, out);
    return out;
  }

  /** visible fraction of the image (alpha bbox), to size symbols at 85-95 % of the cell */
  visibleBox(id: string): { cx: number; cy: number; size: number } {
    const m = this.manifest.images[id];
    if (!m?.bbox) return { cx: 0.5, cy: 0.5, size: 1 };
    const [x, y, w, h] = m.bbox;
    return { cx: (x + w / 2) / m.w, cy: (y + h / 2) / m.h, size: Math.max(w / m.w, h / m.h) };
  }

  slice9(id: string): [number, number, number, number] | null {
    return (this.manifest.images[id]?.slice9 ?? (PLAN.images[id]?.slice9 as [number, number, number, number] | undefined)) ?? null;
  }
  url(id: string): string | null { const m = this.manifest.images[id]; return m ? `${this.base}${m.file}` : null; }
}
