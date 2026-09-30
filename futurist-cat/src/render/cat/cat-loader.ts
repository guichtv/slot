// Lazy entry of the 3D cat: three.js and the cat modules are one deferred chunk, requested as
// soon as the welcome screen shows (never in the initial bundle).
export type CatModules = typeof import('./cat-stage') & typeof import('./cat-rig') & typeof import('./cat-director');
let p: Promise<CatModules> | null = null;
export function loadCatModules(): Promise<CatModules> {
  p ??= Promise.all([import('./cat-stage'), import('./cat-rig'), import('./cat-director')]).then(([s, r, d]) => ({ ...s, ...r, ...d }));
  return p;
}
