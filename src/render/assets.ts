import { Assets, Texture } from 'pixi.js';

/**
 * Magasin d'assets : manifeste généré par `npm run assets` (public/assets/manifest.json).
 * La progression suit le chargement réel (images décodées). Jamais de faux 100 %.
 * Un asset absent est une erreur visible en DEV et bloque la build publique (check-release).
 */
export interface ManifestEntry {
  url: string;
  w: number;
  h: number;
  pivot?: [number, number] | null;
  nineSlice?: [number, number, number, number] | null;
  family: string;
  visibleFill?: number;
}

export interface Manifest {
  version: number;
  assets: Record<string, ManifestEntry>;
}

let manifest: Manifest = { version: 1, assets: {} };
const textures = new Map<string, Texture>();
const missing = new Set<string>();

export async function loadManifest(): Promise<Manifest> {
  const res = await fetch('assets/manifest.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  manifest = (await res.json()) as Manifest;
  return manifest;
}

export function entry(key: string): ManifestEntry | undefined {
  return manifest.assets[key];
}

export function keys(prefix = ''): string[] {
  return Object.keys(manifest.assets).filter((k) => k.startsWith(prefix));
}

/** Images de la scène (textures Pixi) : exclut celles affichées seulement en HTML (panneaux, cartes d'accueil,
 *  vignettes d'interface) et les visuels promotionnels (couverture, vignette de lobby), chargés à la demande. */
export function sceneKeys(): string[] {
  return keys().filter((k) => {
    const e = manifest.assets[k] as ManifestEntry & { ui?: boolean };
    if (e?.ui) return false;
    return !/^(scr\.|id\.card\.|id\.cover|id\.tile|id\.crownforge|decor\.portrait)/.test(k);
  });
}

/** Charge (et décode) un ensemble de clés ; onProgress reçoit la fraction réellement chargée. */
export async function loadTextures(list: string[], onProgress?: (f: number) => void): Promise<void> {
  const todo = list.filter((k) => manifest.assets[k] && !textures.has(k));
  for (const k of list) if (!manifest.assets[k]) missing.add(k);
  let done = 0;
  const total = todo.length || 1;
  const conc = 6;
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const k = todo[i++] as string;
      const e = manifest.assets[k] as ManifestEntry;
      const tex = (await Assets.load<Texture>({ alias: k, src: e.url })) as Texture;
      tex.source.scaleMode = 'linear';
      tex.source.autoGenerateMipmaps = false;
      textures.set(k, tex);
      done++;
      onProgress?.(done / total);
    }
  };
  await Promise.all(Array.from({ length: conc }, worker));
  if (!todo.length) onProgress?.(1);
}

export function tex(key: string): Texture {
  const t = textures.get(key);
  if (t) return t;
  if (!missing.has(key)) {
    missing.add(key);
    if (__DEV_TOOLS__) console.warn(`asset manquant: ${key}`);
  }
  return Texture.EMPTY;
}

export function hasTex(key: string): boolean {
  return textures.has(key);
}

export function missingAssets(): string[] {
  return [...missing];
}

export function registerTexture(key: string, t: Texture): void {
  textures.set(key, t);
}
