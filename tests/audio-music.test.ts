import { describe, expect, it } from 'vitest';
import {
  barSec,
  CHORDS,
  chordTones,
  Composer,
  diatonic,
  inKey,
  karplusStrong,
  MOODS,
  renderBrass,
  renderDrum,
  type DrumKind,
  mulberry32,
  nextBoundary,
  STEPS,
  StepClock,
  stepOffset,
  superBrassNotes,
  type BarPlan,
  type Mood,
} from '../src/audio/music';

const PERCUSSION = new Set(['stomp', 'block', 'blockLo', 'shaker', 'brush', 'tick', 'taiko', 'taikoHi']);

function bars(mood: Mood, seed: number, n: number): BarPlan[] {
  const k = new Composer(mood, seed);
  return Array.from({ length: n }, () => k.nextBar());
}

describe('music timing helpers', () => {
  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('straight 16ths are evenly spaced, beats never move with swing', () => {
    for (const bpm of [92, 104, 112]) {
      for (let s = 0; s <= STEPS; s++) expect(stepOffset(s, bpm, 0.5)).toBeCloseTo((s * 15) / bpm, 10);
      for (let b = 0; b <= 4; b++) expect(stepOffset(b * 4, bpm, 0.6)).toBeCloseTo((b * 60) / bpm, 10);
      expect(stepOffset(16, bpm, 0.56)).toBeCloseTo(barSec(bpm), 10);
    }
  });

  it('swing delays the off-beat eighth and keeps steps monotonic', () => {
    const bpm = 104;
    expect(stepOffset(2, bpm, 0.56)).toBeCloseTo(0.56 * (60 / bpm), 10);
    let prev = -1;
    for (let s = 0; s < 64; s++) {
      const x = stepOffset(s, bpm, 0.56);
      expect(x).toBeGreaterThan(prev);
      prev = x;
    }
  });

  it('StepClock has no drift over thousands of bars', () => {
    const c = new StepClock(104, 0.56, 1.25);
    for (let i = 0; i < 5000 * STEPS; i++) c.advance();
    expect(c.bar).toBe(5000);
    expect(c.time).toBeCloseTo(1.25 + 5000 * barSec(104), 9);
  });

  it('StepClock rebase restarts on the next bar at the given instant', () => {
    const c = new StepClock(92, 0.54, 0);
    for (let i = 0; i < 21; i++) c.advance(); // mesure 1, pas 5
    c.rebase(100);
    expect(c.bar).toBe(2);
    expect(c.step).toBe(0);
    expect(c.time).toBe(100);
    for (let i = 0; i < STEPS; i++) c.advance();
    expect(c.time).toBeCloseTo(100 + barSec(92), 10);
  });

  it('nextBoundary / nextBeat quantize to the grid', () => {
    expect(nextBoundary(0, 0.5, 0)).toBe(0);
    expect(nextBoundary(0, 0.5, 0.01)).toBeCloseTo(0.5);
    expect(nextBoundary(0, 0.5, 1)).toBeCloseTo(1);
    expect(nextBoundary(2, 1, 1)).toBe(2);
    const c = new StepClock(120, 0.5, 10);
    expect(c.nextBeat(10.2)).toBeCloseTo(10.5);
  });
});

describe('harmony', () => {
  it('diatonic walks stay in G major', () => {
    for (let m = 36; m < 60; m++) {
      if (!inKey(m)) continue;
      for (const n of [-3, -1, 1, 3]) expect(inKey(diatonic(m, n))).toBe(true);
    }
    expect(diatonic(48, -1)).toBe(47); // do → si
    expect(diatonic(43, 1)).toBe(45); // sol → la
  });

  it('chord tones are the chord pitch classes', () => {
    expect(chordTones(CHORDS.G!, 55, 67)).toEqual([55, 59, 62, 67]);
    expect(chordTones(CHORDS.Em!, 52, 64)).toEqual([52, 55, 59, 64]);
  });
});

describe('composer', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = JSON.stringify(bars('base', 7, 64));
    expect(JSON.stringify(bars('base', 7, 64))).toBe(a);
    expect(JSON.stringify(bars('base', 8, 64))).not.toBe(a);
  });

  it('builds sections of 4 to 8 bars with a fill on the last bar', () => {
    for (const mood of ['base', 'bonus', 'super'] as Mood[]) {
      const list = bars(mood, 11, 400);
      const kinds = new Set(list.map((b) => b.section));
      expect(kinds.size).toBe(3);
      for (const b of list) {
        expect(b.sectionLength).toBeGreaterThanOrEqual(4);
        expect(b.sectionLength).toBeLessThanOrEqual(8);
        expect(b.fill).toBe(b.barInSection === b.sectionLength - 1);
      }
      // la forme change au plus tard toutes les 8 mesures
      let run = 1;
      for (let i = 1; i < list.length; i++) {
        run = list[i]!.sectionNo === list[i - 1]!.sectionNo ? run + 1 : 1;
        expect(run).toBeLessThanOrEqual(8);
      }
      // jamais trois sections identiques de suite
      const secs = list.filter((b) => b.barInSection === 0).map((b) => b.section);
      for (let i = 2; i < secs.length; i++) expect(secs[i] === secs[i - 1] && secs[i] === secs[i - 2]).toBe(false);
    }
  });

  it('never repeats the same 8 bars (so never loops identically for more than 16 bars)', () => {
    for (const mood of ['base', 'bonus', 'super'] as Mood[]) {
      for (const seed of [0xb00f, 0xb00f + 101, 0xb00f + 202, 3]) {
        const list = bars(mood, seed, 480).map((b) => JSON.stringify(b.events));
        const seen = new Set<string>();
        for (let i = 0; i + 8 <= list.length; i++) {
          const key = list.slice(i, i + 8).join('|');
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
    }
  });

  it('keeps every pitched note in the shared key (G major / E minor, B7 allowed in super)', () => {
    for (const mood of ['base', 'bonus', 'super'] as Mood[]) {
      for (const b of bars(mood, 5, 300)) {
        for (const e of b.events) {
          if (PERCUSSION.has(e.inst)) continue;
          if (b.chord === 'B7' && e.midi % 12 === 3) continue; // ré# : sensible de mi mineur
          expect(inKey(e.midi), `${mood} ${b.chord} ${e.inst} ${e.midi}`).toBe(true);
        }
      }
    }
  });

  it('events are well formed', () => {
    for (const mood of ['base', 'bonus', 'super'] as Mood[]) {
      for (const b of bars(mood, 9, 200)) {
        let prev = 0;
        for (const e of b.events) {
          expect(e.step).toBeGreaterThanOrEqual(prev);
          prev = e.step;
          expect(e.step).toBeLessThan(STEPS);
          expect(e.vel).toBeGreaterThan(0);
          expect(e.vel).toBeLessThanOrEqual(1);
          expect(e.len).toBeGreaterThan(0);
        }
      }
    }
  });

  it('gives each mood its own instrumentation', () => {
    const insts = (mood: Mood) => new Set(bars(mood, 21, 200).flatMap((b) => b.events.map((e) => e.inst)));
    const base = insts('base');
    for (const i of ['banjo', 'bass', 'stomp', 'block', 'shaker', 'strum', 'whistle']) expect(base.has(i as never), i).toBe(true);
    expect(base.has('pad')).toBe(false);
    const bonus = insts('bonus');
    for (const i of ['pad', 'mute', 'brush', 'bass']) expect(bonus.has(i as never), i).toBe(true);
    expect(bonus.has('banjo')).toBe(false);
    expect(bonus.has('stomp')).toBe(false);
    const sup = insts('super');
    for (const i of ['taiko', 'brass', 'bassDrive', 'banjo']) expect(sup.has(i as never), i).toBe(true);
  });

  it('pre-computes exactly the brass notes the super bonus can play', () => {
    const listed = new Set(superBrassNotes());
    const played = new Set<number>();
    for (const seed of [0xb00f + 202, 17, 99]) for (const b of bars('super', seed, 400)) for (const e of b.events) if (e.inst === 'brass') played.add(e.midi);
    for (const m of played) expect(listed.has(m), String(m)).toBe(true);
    expect(listed.size).toBeLessThanOrEqual(played.size + 2);
  });

  it('uses the specified tempi', () => {
    expect(MOODS.base.bpm).toBe(104);
    expect(MOODS.bonus.bpm).toBe(92);
    expect(MOODS.super.bpm).toBe(112);
  });

  it('bass walk-ups land on the next chord root', () => {
    const list = bars('base', 13, 200);
    for (let i = 0; i < list.length - 1; i++) {
      const b = list[i]!;
      const walk = b.events.filter((e) => e.inst === 'bass' && e.step >= 10);
      if (walk.length !== 3) continue;
      const next = CHORDS[list[i + 1]!.chord]!;
      const last = walk[2]!.midi;
      expect(Math.abs(last - next.root)).toBeLessThanOrEqual(2);
    }
  });
});

describe('karplus-strong', () => {
  it('produces a decaying, bounded string tone at the requested pitch', () => {
    const sr = 48000;
    for (const f of [98, 196, 392, 587]) {
      const { data, rate } = karplusStrong(sr, f, 1, 0.995, 0.8, 0.13, 3);
      expect(data.length).toBe(sr);
      let peak = 0;
      for (const x of data) {
        expect(Number.isFinite(x)).toBe(true);
        peak = Math.max(peak, Math.abs(x));
      }
      expect(peak).toBeLessThanOrEqual(0.9 + 1e-6);
      const rms = (a: number, b: number) => Math.sqrt(data.slice(a, b).reduce((s, x) => s + x * x, 0) / (b - a));
      expect(rms(sr * 0.8, sr * 0.9)).toBeLessThan(rms(0, sr * 0.1) * 0.5);
      // période mesurée par autocorrélation ≈ période attendue avant correction de vitesse
      const expected = (sr * rate) / f;
      let best = 0;
      let bestLag = 0;
      for (let lag = Math.floor(expected) - 3; lag <= Math.ceil(expected) + 3; lag++) {
        let s = 0;
        for (let i = 2000; i < 6000; i++) s += data[i]! * data[i + lag]!;
        if (s > best) {
          best = s;
          bestLag = lag;
        }
      }
      expect(Math.abs(bestLag - expected)).toBeLessThanOrEqual(1);
      expect(rate).toBeGreaterThan(0.97);
      expect(rate).toBeLessThan(1.03);
    }
  });
});

describe('pre-rendered voices', () => {
  const rms = (d: Float32Array, a: number, b: number) => Math.sqrt(d.slice(a, b).reduce((s, x) => s + x * x, 0) / Math.max(1, b - a));

  it('drums are finite, bounded, and die out cleanly', () => {
    const sr = 44100;
    const kinds: Array<[DrumKind, number]> = [['stomp', 36], ['block', 86], ['blockLo', 79], ['shaker', 0], ['tick', 0], ['brush', 0], ['taiko', 38], ['taikoHi', 45]];
    for (const [k, m] of kinds) {
      const d = renderDrum(k, m, sr, 11);
      let peak = 0;
      for (const x of d) {
        expect(Number.isFinite(x)).toBe(true);
        peak = Math.max(peak, Math.abs(x));
      }
      expect(peak, k).toBeGreaterThan(0.01);
      expect(peak, k).toBeLessThan(1.2);
      expect(Math.abs(d[d.length - 1]!), k).toBeLessThan(1e-3);
      expect(rms(d, Math.floor(d.length * 0.9), d.length), k).toBeLessThan(rms(d, 0, Math.floor(d.length * 0.2)) * 0.2);
    }
    // variantes : graines différentes → coups différents, même graine → identiques
    expect(Array.from(renderDrum('shaker', 0, sr, 1))).toEqual(Array.from(renderDrum('shaker', 0, sr, 1)));
    expect(Array.from(renderDrum('shaker', 0, sr, 1))).not.toEqual(Array.from(renderDrum('shaker', 0, sr, 2)));
  });

  it('brass notes attack then sustain at a steady, modest level', () => {
    const sr = 22050;
    for (const m of [55, 62, 67, 76]) {
      const d = renderBrass(m, sr, 1.5);
      expect(d.length).toBe(Math.floor(sr * 1.5));
      let peak = 0;
      for (const x of d) {
        expect(Number.isFinite(x)).toBe(true);
        peak = Math.max(peak, Math.abs(x));
      }
      expect(peak).toBeLessThan(0.6);
      expect(Math.abs(d[0]!)).toBe(0);
      const mid = rms(d, Math.floor(sr * 0.4), Math.floor(sr * 0.9));
      const late = rms(d, Math.floor(sr * 0.9), Math.floor(sr * 1.4));
      expect(mid).toBeGreaterThan(0.02);
      // le chœur de trois voix respire un peu, mais la note tient
      expect(Math.abs(20 * Math.log10(late / mid))).toBeLessThan(4);
    }
  });
});
