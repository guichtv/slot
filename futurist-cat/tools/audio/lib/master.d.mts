// Type declarations for master.mjs.
export interface OneShotOptions {
  targetDb?: number;
  hp?: number;
  lp?: number | null;
  limitDb?: number | null;
  fadeInMs?: number;
  fadeOutMs?: number;
  trimDb?: number;
  minDur?: number;
  maxDur?: number | null;
}
export interface LoopOptions {
  targetDb?: number;
  rmsDb?: number | null;
  hp?: number;
  limitDb?: number | null;
  drive?: number;
}
export function finalizeOneShot(chs: Float32Array[], opts?: OneShotOptions): Float32Array[];
export function finalizeLoop(chs: Float32Array[], opts?: LoopOptions): Float32Array[];
export const SR: number;
