// Shared imports + small arrangement helpers for the cue definitions.
// Musical key of the whole game: D natural minor / F major (D E F G A Bb C).
export * from '../lib/dsp.mjs';
export * from '../lib/synth.mjs';

import { hz, len, SR, crossfadeLoop } from '../lib/dsp.mjs';
import { brass, superSaw, pluck, modal, BELL, kick, snare, crash, thump } from '../lib/synth.mjs';

/** D minor pentatonic high notes for sparkles (never clash with the music). */
export const PENT_HI = ['D6', 'F6', 'G6', 'A6', 'C7', 'D7', 'F7', 'A7'].map((n) => hz(n));
export const PENT_TOP = ['D7', 'F7', 'G7', 'A7', 'C8'].map((n) => hz(n));

/** Brass chord stab, notes spread across the stereo field. */
export function stab(m, notes, at, gate, { rng, gain = 0.2, bright = 1, spread = 0.6, rel = 0.3 } = {}) {
  notes.forEach((nn, k) => {
    const pan = notes.length > 1 ? (k / (notes.length - 1)) * 2 * spread - spread : 0;
    m.add(brass(hz(nn), gate, { rng, bright, rel }), at, gain, pan);
  });
}

/** Supersaw pad chord (stereo). */
export function padChord(m, notes, at, gate, { rng, gain = 0.1, cut = 1800, att = 0.12, rel = 0.8, lfo = null } = {}) {
  for (const nn of notes) m.add(superSaw(hz(nn), gate, { rng, cut, att, rel, lfo }), at, gain);
}

/** Bell chord (modal minor-third bell), optionally staggered. */
export function bells(m, notes, at, { rng, gain = 0.25, tau = 0.5, stagger = 0, spread = 0.5, set = BELL, dur = null } = {}) {
  notes.forEach((nn, k) => {
    const pan = notes.length > 1 ? (k / (notes.length - 1)) * 2 * spread - spread : 0;
    m.add(modal(hz(nn), dur ?? tau * 5, { set, tau, rng }), at + k * stagger, gain, pan);
  });
}

/** Pluck arpeggio: `seq` note names, one every `step` s. */
export function arpeggio(m, seq, at, step, { rng, gain = 0.12, cut = 900, env = 4000, tau = 0.25, panFn = null, gate = null } = {}) {
  seq.forEach((nn, k) => {
    const p = panFn ? panFn(k) : k % 2 ? 0.35 : -0.35;
    m.add(pluck(hz(nn), gate ?? step * 0.9, { rng, cut, env, tau }), at + k * step, gain, p);
  });
}

/** Kick + snare + optional crash hit. */
export function drumHit(m, at, { rng, k = 0.8, s = 0, c = 0 } = {}) {
  if (k) m.add(kick({ rng, vel: 1, f1: 52, click: 0.5 }), at, k * 0.7);
  if (s) m.add(snare({ rng, vel: 1 }), at, s);
  if (c) m.add(crash({ rng, vel: 1 }), at, c);
}

/** Deep cinematic sub boom on D1. */
export function subBoom(m, at, gain = 0.8, { f0 = 95, f1 = hz('D1'), tau = 0.35, dur = 1.1 } = {}) {
  m.add(thump(dur, { f0, f1, pTau: 0.05, tau, drive: 1.6 }), at, gain * 0.55);
}

/** Evaluate an exactly periodic signal f(t) over [0, T). */
export function periodic(T, channels, fn) {
  const n = len(T);
  const chs = Array.from({ length: channels }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    for (let c = 0; c < channels; c++) chs[c][i] = fn(t, c);
  }
  return chs;
}

/** Stationary (noise) layer made seamless: render T + X, equal-power crossfade the overlap. */
export function noiseLoop(T, X, render) {
  const chs = render(T + X);
  return crossfadeLoop(chs, len(T), len(X), true);
}

/** Sum equal-length channel arrays. */
export function addChs(dst, src, g = 1) {
  for (let c = 0; c < dst.length; c++) {
    const s = src[Math.min(c, src.length - 1)];
    const d = dst[c];
    for (let i = 0; i < d.length; i++) d[i] += s[i] * g;
  }
  return dst;
}

