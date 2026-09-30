// Type declarations for the parts of dsp.mjs used from TypeScript (tests).
export type Channels = Float32Array[];

export interface Rng {
  next(): number;
  range(lo: number, hi: number): number;
  bi(): number;
  int(n: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
  fork(salt: string | number): Rng;
}

export const SR: number;
export const TAU: number;
export function seedFrom(str: string): number;
export function makeRng(seed: number): Rng;
export function db(d: number): number;
export function toDb(g: number): number;
export function mtof(m: number): number;
export function nm(name: string): number;
export function hz(name: string): number;
export function qf(f: number, period: number): number;
export function len(seconds: number): number;
export function envAD(t: number, a: number, tau: number): number;
export function envADSR(t: number, a: number, d: number, s: number, r: number, gate: number): number;
export function envBell(t: number, peak: number, end: number): number;
export function fadeIn(ch: Float32Array, n: number): Float32Array;
export function fadeOut(ch: Float32Array, n: number): Float32Array;

export class Osc {
  constructor(phase?: number);
  p: number;
  sin(f: number): number;
  saw(f: number): number;
  pulse(f: number, w?: number): number;
  tri(f: number): number;
}
export class SVF {
  lp: number;
  bp: number;
  hp: number;
  process(x: number, fc: number, q?: number): number;
  run(x: number, fc: number, q: number, mode: 'lp' | 'bp' | 'hp'): number;
}
export class Biquad {
  constructor(type: string, f: number, q?: number, gainDb?: number);
  process(x: number): number;
}
export function filt(ch: Float32Array, type: string, f: number, q?: number, gainDb?: number): Float32Array;
export function filtPeriodic(ch: Float32Array, type: string, f: number, q?: number, gainDb?: number, cycles?: number): Float32Array;
export function fft(re: Float64Array, im: Float64Array, inverse?: boolean): void;
export function convolve(x: Float32Array, h: Float32Array): Float32Array;
export function convolve2(xL: Float32Array, xR: Float32Array, hL: Float32Array, hR: Float32Array): [Float32Array, Float32Array];
export function makeIR(opts?: Record<string, number>): [Float32Array, Float32Array];
export function limit(chs: Channels, opts?: { ceiling?: number; lookahead?: number; release?: number }): Channels;
export function samplePeak(chs: Channels): number;
export function truePeak(chs: Channels, wrap?: boolean): number;
export function rms(chs: Channels): number;
export function kWeight(chs: Channels): Channels;
export function momentaryMax(chs: Channels, win?: number): number;
export function normalizeTruePeak(chs: Channels, targetDb?: number, wrap?: boolean): number;
export function removeDcWindowed(ch: Float32Array): Float32Array;
export function mean(ch: Float32Array): number;
export function foldTail(chs: Channels, N: number): Channels;
export function crossfadeLoop(chs: Channels, N: number, X: number, power?: boolean): Channels;
export function seamStats(ch: Float32Array): { jump: number; ratio: number; curv: number; curvRatio: number };
export function hasBadSamples(chs: Channels): boolean;
export function analyze(
  chs: Channels,
  opts?: { loop?: boolean },
): {
  samples: number;
  channels: number;
  duration: number;
  peakDb: number;
  truePeakDb: number;
  rmsDb: number;
  momentaryMaxDb: number;
  dc: number;
  firstDb: number;
  lastDb: number;
  first: number;
  last: number;
  seam: { jump: number; ratio: number; curv: number; curvRatio: number } | null;
  finite: boolean;
};
