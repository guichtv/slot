// Cosmetic randomness only (idle offsets, particles, decorative reel strips). Never a result.
// ?seed=123 makes every cosmetic choice reproducible for captures.
export type Rand = () => number;

export function mulberry32(seed: number): Rand {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromUrl(search = typeof location !== 'undefined' ? location.search : ''): number {
  const s = new URLSearchParams(search).get('seed');
  if (s && /^\d+$/.test(s)) return Number(s);
  return Math.floor(Math.random() * 2 ** 31);
}

export const pick = <T>(r: Rand, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)]!;
export const range = (r: Rand, a: number, b: number): number => a + (b - a) * r();
