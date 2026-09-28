import { describe, expect, it } from 'vitest';
import { birdSong, cricketPulses, fillNoiseSteps, gap, gooseCalls, woodpeckerHits } from '../src/audio/ambience';
import { mulberry32 } from '../src/audio/music';

/** calcule tout le bruit (toutes les tranches) */
function fillNoise(out: Float32Array, color: 'white' | 'pink' | 'brown', rng: () => number, chunk?: number): number {
  let slices = 0;
  for (const _ of fillNoiseSteps(out, color, rng, chunk)) slices++;
  return slices;
}

describe('ambience generators', () => {
  it('bird songs stay in a natural whistle range, in order, bounded volume', () => {
    const rng = mulberry32(4);
    for (let s = 0; s < 4; s++) {
      for (let k = 0; k < 20; k++) {
        const song = birdSong(rng, s);
        expect(song.length).toBeGreaterThanOrEqual(2);
        let prev = -1;
        for (const c of song) {
          expect(c.t).toBeGreaterThanOrEqual(prev);
          prev = c.t;
          for (const f of [c.f0, c.f1]) {
            expect(f).toBeGreaterThan(1500);
            expect(f).toBeLessThan(8000);
          }
          expect(c.dur).toBeGreaterThan(0.02);
          expect(c.vol).toBeGreaterThan(0);
          expect(c.vol).toBeLessThanOrEqual(1);
        }
        expect(song[song.length - 1]!.t).toBeLessThan(2);
      }
    }
  });

  it('geese calls: several voices, honk-length calls in order, a few seconds long', () => {
    const rng = mulberry32(12);
    for (let k = 0; k < 40; k++) {
      const calls = gooseCalls(rng);
      expect(calls.length).toBeGreaterThanOrEqual(7);
      expect(calls.length).toBeLessThanOrEqual(12);
      let prev = -1;
      for (const c of calls) {
        expect(c.t).toBeGreaterThan(prev);
        prev = c.t;
        expect(c.f).toBeGreaterThan(280);
        expect(c.f).toBeLessThan(460);
        expect(c.dur).toBeGreaterThanOrEqual(0.13);
        expect(c.dur).toBeLessThanOrEqual(0.21);
        expect(c.vol).toBeGreaterThan(0);
        expect(c.vol).toBeLessThanOrEqual(1);
      }
      expect(calls[calls.length - 1]!.t).toBeLessThan(7);
      // plusieurs individus : au moins deux hauteurs nettement distinctes
      const fs = calls.map((c) => c.f);
      expect(Math.max(...fs) / Math.min(...fs)).toBeGreaterThan(1.02);
    }
  });

  it('woodpecker drums 14-24 hits around 13-18 Hz and fades at the end', () => {
    const rng = mulberry32(9);
    for (let k = 0; k < 30; k++) {
      const hits = woodpeckerHits(rng);
      expect(hits.length).toBeGreaterThanOrEqual(14);
      expect(hits.length).toBeLessThanOrEqual(24);
      const span = hits[hits.length - 1]!.t - hits[0]!.t;
      const rate = (hits.length - 1) / span;
      expect(rate).toBeGreaterThan(12);
      expect(rate).toBeLessThan(18.5);
      expect(hits[hits.length - 1]!.vol).toBeLessThan(hits[0]!.vol);
      for (const h of hits) expect(h.vol).toBeGreaterThanOrEqual(0);
    }
  });

  it('cricket pulses are evenly spaced and non-overlapping', () => {
    const p = cricketPulses(1, 4);
    expect(p).toHaveLength(4);
    for (let i = 0; i < p.length; i++) {
      expect(p[i]![1]).toBeGreaterThan(p[i]![0]);
      if (i) expect(p[i]![0]).toBeGreaterThanOrEqual(p[i - 1]![1]);
    }
  });

  it('noise colours are normalized and brown noise is low-frequency heavy', () => {
    const lag1 = (a: Float32Array) => {
      let n = 0;
      let d = 0;
      for (let i = 1; i < a.length; i++) {
        n += a[i]! * a[i - 1]!;
        d += a[i]! * a[i]!;
      }
      return n / d;
    };
    const w = new Float32Array(48000);
    const b = new Float32Array(48000);
    const p = new Float32Array(48000);
    fillNoise(w, 'white', mulberry32(1));
    fillNoise(b, 'brown', mulberry32(1));
    fillNoise(p, 'pink', mulberry32(1));
    for (const a of [w, b, p]) {
      const peak = a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
      expect(peak).toBeCloseTo(1, 5);
    }
    expect(Math.abs(lag1(w))).toBeLessThan(0.05);
    expect(lag1(b)).toBeGreaterThan(0.9);
    expect(lag1(p)).toBeGreaterThan(lag1(w));
    // bouclage : fin raccordée au début
    expect(Math.abs(b[b.length - 1]! - b[959]!)).toBeLessThan(0.05);
  });

  it('noise computed in small slices is identical to one pass', () => {
    for (const color of ['pink', 'brown'] as const) {
      const whole = new Float32Array(100_000);
      const sliced = new Float32Array(100_000);
      expect(fillNoise(whole, color, mulberry32(5), 1e9)).toBe(2);
      // 4 tranches de calcul + 2 de normalisation : jamais plus de 32 768 échantillons d'un coup
      expect(fillNoise(sliced, color, mulberry32(5), 32768)).toBe(6);
      expect(Array.from(sliced)).toEqual(Array.from(whole));
    }
  });

  it('gap stays within bounds', () => {
    const rng = mulberry32(2);
    for (let i = 0; i < 200; i++) {
      const g = gap(rng, 3, 8);
      expect(g).toBeGreaterThanOrEqual(3);
      expect(g).toBeLessThanOrEqual(8);
    }
  });
});
