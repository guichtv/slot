// Celebrations (big-win tiers, max win, city moments) and bonus flow. Stereo, bus "sfx".
// Harmony stays in D natural minor / F major; the grandest chord is Dsus2 (no third), so it never
// clashes with the music bed even when layered.
import {
  Mix, IR, SR, TAU, len, hz, semis, clamp, smoothstep, envAD, envADSR, envBell, hann, filt,
  tick, modal, fm2, thump, fnoise, tone, whoosh, sparkle, brass, pluck, bass, superSaw, kick, snare, clap, crash, tom,
  dopplerPass, stab, padChord, bells, arpeggio, drumHit, subBoom, Noise, SVF,
  GLASS, CHIME, BELL, PLATE, PENT_HI, PENT_TOP,
} from './common.mjs';

/* ------------------------------------------------------------ helpers */

/** Chord hits: [time, notes, bassNote, gate]. */
function hits(m, list, { rng, gain = 0.15, bright = 1, bassGain = 0.24, kickGain = 0.45, snareGain = 0 } = {}) {
  for (const [t, notes, bn, gate, opt = {}] of list) {
    stab(m, notes, t, gate, { rng, gain: opt.gain ?? gain, bright: opt.bright ?? bright });
    if (bn) m.add(bass(hz(bn), gate, { rng, cut: 260, env: 900, envTau: 0.08 }), t, bassGain);
    drumHit(m, t, { rng, k: opt.k ?? kickGain, s: opt.s ?? snareGain });
  }
}

/** Brass lead line: [note, time, gate]. */
function melody(m, list, { rng, gain = 0.22, bright = 1.25, pan = 0 } = {}) {
  for (const [nn, t, gate] of list) m.add(brass(hz(nn), gate, { rng, bright, vib: 1.2, voices: 5 }), t, gain, pan);
}

/** Snare roll with accelerating density and a velocity ramp. */
function snareRoll(m, t0, t1, { rng, step = 0.05, v0 = 0.15, v1 = 0.6, accel = 1 } = {}) {
  let t = t0;
  while (t < t1) {
    const x = (t - t0) / (t1 - t0);
    m.add(snare({ rng, vel: 1, tau: 0.08 }), t, v0 + (v1 - v0) * x, rng.bi() * 0.2);
    t += step * (1 - 0.5 * accel * x);
  }
}

/** Two interleaved pluck arps panned hard left/right ("double gaze"). */
function dualArp(m, left, right, t0, t1, step, { rng, gain = 0.07, cut = 1300 } = {}) {
  let k = 0;
  for (let t = t0; t < t1 - 0.01; t += step, k++) {
    const fade = 1 - 0.6 * ((t - t0) / (t1 - t0));
    m.add(pluck(hz(left[k % left.length]), step * 0.8, { rng, cut, env: 3500, tau: 0.16 }), t, gain * fade, -0.75);
    m.add(pluck(hz(right[k % right.length]), step * 0.8, { rng, cut, env: 3500, tau: 0.16 }), t + step / 2, gain * fade * 0.9, 0.75);
  }
}

/** Reverse-cymbal style swell ending at `t1`. */
function swell(m, t0, t1, { rng, gain = 0.2 } = {}) {
  const d = t1 - t0;
  for (const p of [-0.5, 0.5]) {
    m.add(fnoise(d, { rng, color: 'white', mode: 'hp', q: 0.6, f: (t) => 2500 + 5000 * (t / d), amp: (t) => Math.pow(t / d, 2.5) * (1 - smoothstep(d - 0.015, d, t)) }), t0, gain, p);
  }
}

/** Laser sweep across the stereo field. */
function laserSweep(m, t, { rng, f0 = 600, f1 = 4000, dur = 0.3, from = -0.9, to = 0.9, gain = 0.12 } = {}) {
  const z = fm2(1, dur, {
    ratio: 0.5, index: 0.8, indexTau: 1, rng,
    pitch: (x) => f0 * Math.pow(f1 / f0, x / dur),
    amp: (x) => envBell(x, dur * 0.3, dur),
  });
  filt(z, 'lp', 7000, 0.6);
  m.addPanned(z, t, gain, (x) => from + (to - from) * clamp(x / dur, 0, 1));
}

const DSUS2 = ['D3', 'A3', 'D4', 'E4', 'A4', 'D5', 'E5', 'A5'];

/* ------------------------------------------------------ celebrations */

/** Impact then a 1.1 s riser with an accelerating snare roll, handing off to the tier sting. */
function bigwinIntro(rng) {
  const m = new Mix(1.6, 2);
  subBoom(m, 0, 0.85, { f0: 110, tau: 0.35 });
  m.add(thump(0.3, { f0: 320, f1: 120, pTau: 0.015, tau: 0.06, drive: 1.5 }), 0, 0.5);
  m.add(fnoise(0.5, { rng, color: 'pink', mode: 'lp', q: 0.7, f: (t) => 6000 * Math.exp(-t / 0.05) + 200, amp: (t) => envAD(t, 0.001, 0.08) }), 0, 0.5);
  m.add(tom(hz('D2'), { rng }), 0, 0.35);
  const D = 1.1;
  const rel = (t) => 1 - smoothstep(D - 0.04, D, t);
  for (const [pan, det] of [[-0.6, [-12, -3, 6]], [0.6, [-6, 3, 12]]]) {
    m.add(tone(D, {
      wave: 'saw', unison: det, rng, q: 1.1,
      f: (t) => hz('D3') * Math.pow(4, Math.pow(t / D, 1.3)),
      cut: (t) => 300 * Math.pow(23, t / D),
      amp: (t) => Math.pow(t / D, 1.4) * rel(t),
    }), 0.15, 0.22, pan);
    m.add(fnoise(D, { rng, color: 'pink', mode: 'hp', q: 0.7, f: (t) => 400 * Math.pow(20, t / D), amp: (t) => Math.pow(t / D, 2) * rel(t) }), 0.15, 0.25, pan * 0.8);
  }
  snareRoll(m, 0.35, 1.22, { rng, step: 0.1, v0: 0.12, v1: 0.5, accel: 1.4 });
  return m.reverb(IR('hall'), 0.18);
}

function tierBig(rng) {
  const m = new Mix(2.8, 2);
  hits(m, [
    [0, ['Bb3', 'D4', 'F4'], 'Bb1', 0.13, { s: 0.2 }],
    [0.2, ['C4', 'E4', 'G4'], 'C2', 0.13, { s: 0.2 }],
    [0.4, ['D4', 'F4', 'A4', 'D5'], 'D2', 1.0, { s: 0.45 }],
  ], { rng, gain: 0.15 });
  padChord(m, ['D3', 'A3', 'F4', 'E5'], 0.4, 1.0, { rng, gain: 0.07, cut: 2400, att: 0.15, rel: 0.9 });
  arpeggio(m, ['D5', 'F5', 'A5', 'D6', 'A5', 'F5', 'A5', 'D6', 'F6', 'D6', 'A5', 'F5'], 0.4, 0.1, { rng, gain: 0.08, cut: 1200, env: 3500, tau: 0.18 });
  m.add(crash({ rng, dur: 2.0, vel: 1 }), 0.4, 0.2);
  sparkle(m, { rng, notes: PENT_TOP, t0: 0.45, t1: 1.3, count: 10, gain: 0.07 });
  return m.reverb(IR('hall'), 0.22);
}

function tierSuper(rng) {
  const m = new Mix(3.2, 2);
  hits(m, [
    [0, ['G3', 'Bb3', 'D4'], 'G1', 0.12, { s: 0.15 }],
    [0.18, ['Bb3', 'D4', 'F4'], 'Bb1', 0.12, { s: 0.15 }],
    [0.36, ['C4', 'E4', 'G4'], 'C2', 0.12, { s: 0.25 }],
    [0.54, ['D4', 'F4', 'A4', 'D5', 'E5'], 'D2', 1.2, { s: 0.5 }],
  ], { rng, gain: 0.14 });
  arpeggio(m, ['D5', 'F5', 'G5', 'A5', 'C6', 'D6'], 0.2, 0.055, { rng, gain: 0.09, cut: 1500, env: 4000, tau: 0.12, panFn: (k) => -0.6 + k * 0.24 });
  m.add(tom(hz('D3'), { rng }), 0.45, 0.3, -0.3);
  m.add(tom(hz('A2'), { rng }), 0.495, 0.3, 0.3);
  padChord(m, ['D3', 'A3', 'F4', 'C5', 'E5'], 0.54, 1.2, { rng, gain: 0.065, cut: 2600, att: 0.12, rel: 1.0 });
  arpeggio(m, ['D6', 'A5', 'F5', 'A5', 'E6', 'A5', 'F5', 'A5', 'D6', 'A5', 'C6', 'A5', 'F6', 'D6', 'A5', 'F5'], 0.6, 0.085, { rng, gain: 0.07, cut: 1400, env: 3800, tau: 0.16 });
  m.add(crash({ rng, dur: 2.2, vel: 1 }), 0.54, 0.22);
  subBoom(m, 0.54, 0.45);
  for (let k = 0; k < 18; k++) {
    const t = 0.6 + Math.pow(rng.next(), 1.3) * 1.2;
    m.add(fm2(rng.pick(PENT_HI), 0.3, { ratio: 2.41, index: 1.3, indexTau: 0.015, tau: rng.range(0.04, 0.09), rng }), t, rng.range(0.03, 0.07), rng.bi() * 0.9);
  }
  return m.reverb(IR('hall'), 0.24);
}

function tierMega(rng) {
  const m = new Mix(3.6, 2);
  hits(m, [
    [0, ['Bb3', 'D4', 'F4', 'Bb4'], 'Bb1', 0.13, { s: 0.2 }],
    [0.2, ['C4', 'E4', 'G4', 'C5'], 'C2', 0.13, { s: 0.2 }],
    [0.4, ['D4', 'F4', 'A4', 'D5'], 'D2', 0.3, { s: 0.3 }],
    [0.8, ['F4', 'A4', 'C5', 'F5', 'G5'], 'F1', 1.4, { s: 0.55, k: 0.75 }],
  ], { rng, gain: 0.13 });
  stab(m, ['Bb4', 'D5', 'F5'], 0, 0.13, { rng, gain: 0.06 });
  stab(m, ['C5', 'E5', 'G5'], 0.2, 0.13, { rng, gain: 0.06 });
  stab(m, ['D5', 'F5', 'A5'], 0.4, 0.3, { rng, gain: 0.06 });
  stab(m, ['A5', 'C6', 'F6'], 0.8, 1.4, { rng, gain: 0.05 });
  m.add(tom(hz('F3'), { rng }), 0.55, 0.28, -0.4);
  m.add(tom(hz('D3'), { rng }), 0.62, 0.28, 0);
  m.add(tom(hz('A2'), { rng }), 0.69, 0.3, 0.4);
  padChord(m, ['F3', 'C4', 'A4', 'C5', 'G5'], 0.8, 1.4, { rng, gain: 0.07, cut: 2000, att: 0.2, rel: 1.1 });
  arpeggio(m, ['F5', 'A5', 'C6', 'G6', 'A6', 'G6', 'C6', 'A5'].concat(['F5', 'A5', 'C6', 'G6', 'A6', 'C7', 'A6', 'G6']), 0.8, 0.085, { rng, gain: 0.07, cut: 1500, env: 4000, tau: 0.16 });
  m.add(crash({ rng, dur: 2.4, vel: 1 }), 0.8, 0.25);
  subBoom(m, 0.8, 0.55);
  sparkle(m, { rng, notes: ['F6', 'A6', 'C7', 'F7', 'A7'].map(hz), t0: 0.85, t1: 2.0, count: 16, gain: 0.07 });
  return m.reverb(IR('hall'), 0.25);
}

function tierEpic(rng) {
  const m = new Mix(4.0, 2);
  melody(m, [['A4', 0, 0.13], ['D5', 0.15, 0.13], ['E5', 0.3, 0.13], ['F5', 0.45, 0.4], ['E5', 0.9, 0.13], ['D5', 1.05, 0.13], ['A5', 1.2, 1.5]], { rng, gain: 0.2 });
  hits(m, [
    [0, ['D4', 'F4', 'A4'], 'D2', 0.4, { k: 0.5 }],
    [0.45, ['Bb3', 'D4', 'F4'], 'Bb1', 0.4, { k: 0.5 }],
    [0.9, ['C4', 'E4', 'G4'], 'C2', 0.28, { k: 0.5 }],
    [1.2, ['D4', 'F4', 'A4', 'E5'], 'D2', 1.5, { k: 0.75, s: 0.55 }],
  ], { rng, gain: 0.12 });
  stab(m, ['D3', 'A3'], 1.2, 1.5, { rng, gain: 0.1 });
  for (const [t, nn, g] of [[0, 'D2', 0.45], [0.15, 'D2', 0.35], [0.3, 'D2', 0.4], [0.9, 'A2', 0.4], [1.05, 'A2', 0.4]]) m.add(tom(hz(nn), { rng, tau: 0.3 }), t, g, rng.bi() * 0.3);
  swell(m, 0.55, 1.2, { rng, gain: 0.12 });
  m.add(crash({ rng, dur: 2.6, vel: 1 }), 1.2, 0.26);
  subBoom(m, 1.2, 0.6);
  padChord(m, ['D3', 'A3', 'F4', 'A4', 'E5'], 1.2, 1.5, { rng, gain: 0.07, cut: 2200, att: 0.15, rel: 1.2 });
  dualArp(m, ['D5', 'A5', 'E6', 'A5'], ['F5', 'D6', 'A6', 'D6'], 1.25, 2.75, 0.1, { rng, gain: 0.07 });
  sparkle(m, { rng, notes: PENT_TOP, t0: 1.25, t1: 2.4, count: 18, gain: 0.07 });
  return m.reverb(IR('hall'), 0.26);
}

function tierCyber(rng) {
  const m = new Mix(4.5, 2);
  laserSweep(m, 0, { rng, from: -0.9, to: 0.9 });
  laserSweep(m, 0.1, { rng, f0: 800, f1: 5000, from: 0.9, to: -0.9, gain: 0.1 });
  snareRoll(m, 0.3, 0.9, { rng, step: 0.05, v0: 0.12, v1: 0.45, accel: 0.4 });
  hits(m, [
    [0.3, ['G3', 'Bb3', 'D4'], 'G1', 0.16],
    [0.5, ['Bb3', 'D4', 'F4'], 'Bb1', 0.16],
    [0.7, ['C4', 'E4', 'G4'], 'C2', 0.16],
    [0.9, DSUS2, 'D2', 2.0, { k: 0.8, s: 0.6, gain: 0.085 }],
  ], { rng, gain: 0.14 });
  m.add(bass(hz('D1'), 2.0, { rng, cut: 160, env: 400 }), 0.9, 0.3);
  melody(m, [['A5', 0.3, 0.16], ['Bb5', 0.5, 0.16], ['C6', 0.7, 0.16], ['D6', 0.9, 2.0]], { rng, gain: 0.17, bright: 1.4 });
  padChord(m, ['D3', 'A3', 'E4', 'A4', 'D5'], 0.9, 2.0, { rng, gain: 0.07, cut: 2800, att: 0.1, rel: 1.2 });
  m.add(crash({ rng, dur: 3.0, vel: 1, tau: 1.1 }), 0.9, 0.28);
  subBoom(m, 0.9, 0.7, { tau: 0.45, dur: 1.5 });
  dualArp(m, ['D5', 'A5', 'E6', 'A5'], ['A5', 'D6', 'E6', 'D6'], 1.0, 3.0, 0.0625 * 2, { rng, gain: 0.075, cut: 1600 });
  for (const t of [1.3, 1.9, 2.5]) laserSweep(m, t, { rng, f0: 2000, f1: 4000, dur: 0.45, gain: 0.05, from: -0.8, to: 0.8 });
  sparkle(m, { rng, notes: PENT_TOP, t0: 0.9, t1: 2.9, count: 26, gain: 0.07 });
  return m.reverb(IR('hall'), 0.28);
}

function maxWin(rng) {
  const m = new Mix(6.2, 2);
  subBoom(m, 0, 0.7);
  m.add(crash({ rng, dur: 2.2, vel: 1 }), 0, 0.2);
  melody(m, [['D4', 0, 0.1], ['A4', 0.12, 0.1], ['D5', 0.24, 0.3]], { rng, gain: 0.2 });
  // phrase 1
  hits(m, [
    [0.6, ['Bb3', 'D4', 'F4'], 'Bb1', 0.25],
    [0.9, ['C4', 'E4', 'G4'], 'C2', 0.25, { s: 0.35 }],
    [1.2, ['D4', 'F4', 'A4', 'D5'], 'D2', 0.5],
  ], { rng, gain: 0.13, kickGain: 0.55 });
  drumHit(m, 1.5, { rng, k: 0.55, s: 0.35 });
  melody(m, [['F5', 0.6, 0.25], ['G5', 0.9, 0.25], ['A5', 1.2, 0.5]], { rng, gain: 0.2 });
  // phrase 2
  hits(m, [
    [1.8, ['G3', 'Bb3', 'D4'], 'G1', 0.25],
    [2.1, ['Bb3', 'D4', 'F4'], 'Bb1', 0.25, { s: 0.35 }],
    [2.4, ['C4', 'E4', 'G4', 'C5'], 'C2', 0.55],
  ], { rng, gain: 0.13, kickGain: 0.55 });
  melody(m, [['Bb5', 1.8, 0.25], ['C6', 2.1, 0.25], ['E6', 2.4, 0.55]], { rng, gain: 0.2 });
  snareRoll(m, 2.4, 3.0, { rng, step: 0.06, v0: 0.12, v1: 0.55, accel: 0.8 });
  swell(m, 2.3, 3.0, { rng, gain: 0.14 });
  // final
  hits(m, [[3.0, DSUS2, 'D2', 1.8, { k: 0.85, s: 0.6, gain: 0.085 }]], { rng });
  m.add(bass(hz('D1'), 1.8, { rng, cut: 160, env: 400 }), 3.0, 0.3);
  melody(m, [['D6', 3.0, 1.8]], { rng, gain: 0.18, bright: 1.4 });
  bells(m, ['D6', 'A6', 'D7'], 3.0, { rng, gain: 0.12, tau: 0.8, spread: 0.6 });
  padChord(m, ['D3', 'A3', 'E4', 'A4', 'D5', 'E5'], 3.0, 1.8, { rng, gain: 0.065, cut: 2800, att: 0.1, rel: 1.4 });
  m.add(crash({ rng, dur: 3.0, vel: 1, tau: 1.2 }), 3.0, 0.3);
  subBoom(m, 3.0, 0.8, { tau: 0.5, dur: 1.6 });
  dualArp(m, ['D5', 'A5', 'E6', 'A5'], ['A5', 'D6', 'E6', 'D6'], 3.05, 4.8, 0.125, { rng, gain: 0.075, cut: 1600 });
  sparkle(m, { rng, notes: PENT_TOP, t0: 3.0, t1: 4.8, count: 30, gain: 0.07 });
  sparkle(m, { rng, notes: PENT_HI, t0: 0.6, t1: 2.9, count: 14, gain: 0.05 });
  return m.reverb(IR('hall'), 0.26);
}

/** Holographic chips raining: FM metallic tings on the pentatonic, dense then thinning. */
function coinRain(rng) {
  const m = new Mix(2.0, 2);
  for (let k = 0; k < 60; k++) {
    const u = rng.next();
    const t = 1.3 * (u < 0.15 ? u / 0.15 * 0.15 : 0.15 + (1.15 * Math.pow((u - 0.15) / 0.85, 1.4)));
    const f = rng.pick(PENT_HI);
    const g = modal(f * 1.5, 0.12, { set: CHIME, tau: 0.02, rng });
    const z = fm2(f, 0.3, { ratio: 2.41, index: 1.3, indexTau: 0.015, tau: rng.range(0.05, 0.1), rng });
    for (let i = 0; i < g.length; i++) z[i] += g[i] * 0.3;
    m.add(z, t, rng.range(0.1, 0.25), rng.bi() * 0.9);
  }
  for (const p of [-0.6, 0.6]) m.add(fnoise(1.5, { rng, mode: 'hp', f: 7500, q: 0.7, amp: (t) => envBell(t, 0.2, 1.5) * (0.7 + 0.3 * Math.sin(TAU * 23 * t)) }), 0, 0.04, p);
  return m.reverb(IR('glass'), 0.25);
}

/** A swarm of small drones crossing the sky. */
function droneSwarm(rng) {
  const m = new Mix(2.4, 2);
  for (let k = 0; k < 6; k++) {
    const dur = rng.range(1.2, 1.8);
    const t0 = rng.range(0, 2.0 - dur);
    const fr = rng.range(150, 260);
    const p0 = rng.bi() * 0.9;
    const p1 = -Math.sign(p0 || 1) * rng.range(0.3, 0.9);
    const bend = (t) => 1.04 - 0.08 * smoothstep(0, dur, t);
    const env = (t) => envBell(t, dur * rng.range(0.4, 0.6), dur);
    const z = tone(dur, { wave: 'pulse', pw: 0.3, rng, f: (t) => fr * bend(t) * (1 + 0.004 * Math.sin(TAU * 7 * t)), cut: 2200, q: 1.4, mode: 'bp', amp: (t) => env(t) * (0.8 + 0.2 * Math.sin((TAU * fr * t) / 5)) });
    const h = tone(dur, { wave: 'saw', rng, f: (t) => fr * 2 * bend(t), cut: 3000, q: 0.7, amp: (t) => env(t) * 0.25 });
    for (let i = 0; i < z.length; i++) z[i] += h[i];
    m.addPanned(z, t0, 0.28, (t) => p0 + (p1 - p0) * smoothstep(0, dur, t));
  }
  m.add(tone(2.0, { wave: 'saw', unison: [-10, -3, 4, 11], rng, f: hz('D3'), cut: 600, q: 0.8, amp: (t) => envBell(t, 1.0, 2.0) }), 0, 0.12);
  m.filter('lp', 5500, 0.6);
  return m.reverb(IR('glass'), 0.15);
}

/** Elevated maglev train: electric whine + air, true doppler (propagation delay), distance filtering. */
function trainPass(rng) {
  const D = 2.5;
  const t0 = -0.8;
  const srcDur = D + 1.6;
  const n = len(srcDur);
  const src = new Float32Array(n);
  const f0 = hz('D3');
  const nz = new Noise(rng);
  const air = new SVF(), rumble = new SVF();
  const ph = [0, 0, 0, 0, 0, 0].map(() => rng.next());
  const amps = [0.5, 0.35, 0.25, 0.3, 0.12, 0.08];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    const wob = 1 + 0.003 * Math.sin(TAU * 6 * t);
    for (let k = 0; k < amps.length; k++) {
      ph[k] += (f0 * (k + 1) * wob) / SR;
      s += amps[k] * Math.sin(TAU * ph[k]);
    }
    const w = nz.pink();
    s = s * 0.35 + air.run(w, 1800, 0.5, 'lp') * 1.1 + rumble.run(w, 180, 0.8, 'lp') * 0.8;
    src[i] = s;
  }
  const [L, R] = dopplerPass(src, t0, D, { speed: 55, dist: 14, tClose: 1.25 });
  // distant approach fades in, receding train fades out: the pass never ends on a step
  for (let i = 0; i < L.length; i++) {
    const t = i / SR;
    const e = smoothstep(0, 0.35, t) * (1 - smoothstep(D - 0.6, D, t));
    L[i] *= e;
    R[i] *= e;
  }
  const m = new Mix(D + 0.2, 2);
  m.add([L, R], 0, 0.8);
  m.add(fnoise(D, { rng, color: 'pink', mode: 'lp', f: 320, q: 0.7, amp: (t) => envBell(t, 1.3, 2.3) }), 0, 0.22);
  m.add(whoosh(0.9, { rng, f0: 300, f1: 2500, q: 0.8, peak: 0.5 }), 0.85, 0.25, -0.2);
  m.add(whoosh(0.9, { rng, f0: 2500, f1: 300, q: 0.8, peak: 0.5 }), 0.95, 0.25, 0.3);
  return m.reverb(IR('city'), 0.2);
}

/** City districts powering up left to right: relay clunks, rising electric blooms, final Dm(add9) glow. */
function cityLightsOn(rng) {
  const m = new Mix(2.0, 2);
  const notes = ['D3', 'F3', 'A3', 'D4', 'F4', 'A4', 'D5', 'F5'];
  const ts = [0, 0.12, 0.23, 0.33, 0.42, 0.5, 0.57, 0.63];
  notes.forEach((nn, k) => {
    const pan = -0.9 + (1.8 * k) / 7;
    const t = ts[k];
    m.add(tick({ rng, f: 1400, q: 1, dur: 0.003 }), t, 0.35, pan);
    m.add(thump(0.1, { f0: 220, f1: 110, pTau: 0.01, tau: 0.015 }), t, 0.3, pan);
    m.add(tone(0.55, { wave: 'saw', unison: [-6, 6], rng, f: hz(nn), cut: (x) => 400 + 3000 * envAD(x, 0.03, 0.12), q: 2, amp: (x) => envAD(x, 0.01, 0.2) }), t, 0.2, pan);
    m.add(tone(0.16, { wave: 'pulse', pw: 0.3, rng, f: 100, cut: 2500, q: 1.5, mode: 'bp', amp: (x) => envAD(x, 0.005, 0.05) * (0.6 + 0.4 * Math.sin(TAU * 25 * x)) }), t + 0.01, 0.05, pan);
  });
  padChord(m, ['D4', 'F4', 'A4', 'E5'], 0.6, 0.5, { rng, gain: 0.1, cut: 2400, att: 0.3, rel: 0.7 });
  sparkle(m, { rng, notes: PENT_TOP, t0: 0.65, t1: 1.3, count: 10, gain: 0.08 });
  return m.reverb(IR('hall'), 0.25);
}

/* ------------------------------------------------------------ bonus */

/** Portal opens: swirling resonant bands, rising sub, chord pad opening, bright bloom at 0.9 s. */
function bonusTrigger(rng) {
  const m = new Mix(2.2, 2);
  for (let k = 0; k < 3; k++) {
    const z = fnoise(1.0, { rng, color: 'pink', mode: 'bp', q: 7, f: (t) => 300 * (1 + k * 0.5) * Math.pow(10, t / 0.95), amp: (t) => envBell(t, 0.8, 1.0) });
    m.addPanned(z, 0, 0.3, (t) => 0.8 * Math.sin(TAU * (1.5 + k * 0.7) * t + k));
  }
  m.add(tone(1.0, { wave: 'sine', f: (t) => hz('D2') * Math.pow(2, t / 0.9), amp: (t) => Math.pow(Math.min(1, t / 0.9), 1.5) * (1 - smoothstep(0.88, 0.98, t)) }), 0, 0.3);
  for (const nn of ['D3', 'F3', 'A3']) m.add(superSaw(hz(nn), 0.8, { rng, cut: 300, att: 0.6, rel: 0.15, lfo: (t) => Math.pow(15, Math.min(1, t / 0.9)) }), 0, 0.09);
  bells(m, ['D5', 'A5', 'D6', 'F6', 'A6'], 0.9, { rng, gain: 0.2, tau: 0.6, spread: 0.7, stagger: 0.012 });
  stab(m, ['D4', 'A4', 'D5', 'F5'], 0.9, 0.3, { rng, gain: 0.12, bright: 1.3 });
  m.add(crash({ rng, dur: 1.8, vel: 1 }), 0.9, 0.18);
  subBoom(m, 0.9, 0.7);
  sparkle(m, { rng, notes: PENT_TOP, t0: 0.9, t1: 1.6, count: 16, gain: 0.08 });
  return m.reverb(IR('hall'), 0.28);
}

/** "9 VIES" title sting: rising arp, C -> Dm(add9) stab, drums, laser sweep. */
function bonusIntro(rng) {
  const m = new Mix(2.6, 2);
  arpeggio(m, ['D4', 'F4', 'A4', 'D5', 'F5', 'A5', 'D6', 'F6', 'A6'], 0, 0.06, { rng, gain: 0.1, cut: 1300, env: 4000, tau: 0.12, panFn: (k) => (k % 2 ? 0.45 : -0.45) });
  hits(m, [
    [0.54, ['C4', 'E4', 'G4'], 'C2', 0.14, { s: 0.25 }],
    [0.72, ['D4', 'F4', 'A4', 'D5', 'E5'], 'D2', 1.0, { s: 0.5, k: 0.75 }],
  ], { rng, gain: 0.14 });
  m.add(crash({ rng, dur: 2.0, vel: 1 }), 0.72, 0.22);
  laserSweep(m, 0.72, { rng, f0: 800, f1: 3000, dur: 0.35, gain: 0.12 });
  padChord(m, ['D3', 'A3', 'F4', 'E5'], 0.72, 1.0, { rng, gain: 0.07, cut: 2400, att: 0.1, rel: 0.9 });
  subBoom(m, 0.72, 0.45);
  sparkle(m, { rng, notes: PENT_TOP, t0: 0.75, t1: 1.5, count: 10, gain: 0.07 });
  return m.reverb(IR('hall'), 0.24);
}

/** Fast whoosh + digital tear (sample-and-hold noise bursts), panned across. */
function punchTear(rng) {
  const m = new Mix(0.6, 2);
  m.add(whoosh(0.18, { rng, f0: 500, f1: 6000, q: 1.2, peak: 0.8 }), 0, 0.55, -0.3);
  m.add(whoosh(0.18, { rng, f0: 550, f1: 6500, q: 1.2, peak: 0.8 }), 0, 0.55, 0.3);
  let t = 0.1;
  while (t < 0.34) {
    const d = rng.range(0.008, 0.022);
    const n = len(d);
    const z = new Float32Array(n);
    const hold = 3 + rng.int(10);
    const f = rng.range(1500, 5000);
    const s = new SVF();
    let v = 0;
    for (let i = 0; i < n; i++) {
      if (i % hold === 0) v = rng.bi();
      z[i] = s.run(v, f, 1.5, 'bp') * hann(i / n);
    }
    const x = (t - 0.1) / 0.24;
    m.add(z, t, 0.35 * (1 - 0.5 * x), -0.7 + 1.4 * x + rng.bi() * 0.15);
    t += d * rng.range(0.9, 1.6);
  }
  m.add(thump(0.2, { f0: 240, f1: 90, pTau: 0.015, tau: 0.05, drive: 1.4 }), 0.12, 0.5);
  m.filter('lp', 9000, 0.6);
  return m.reverb(IR('lab'), 0.12);
}

function runWhoosh(rng) {
  const m = new Mix(1.0, 2);
  const a = whoosh(0.8, { rng, f0: 350, f1: 1800, q: 1.1, peak: 0.55 });
  const b = whoosh(0.8, { rng, f0: 300, f1: 2200, q: 1.1, peak: 0.55 });
  m.addPanned(a, 0, 0.5, (t) => -0.7 + 1.4 * smoothstep(0, 0.8, t));
  m.addPanned(b, 0.015, 0.45, (t) => -0.6 + 1.3 * smoothstep(0, 0.8, t));
  m.add(fnoise(0.8, { rng, color: 'pink', mode: 'lp', f: 420, q: 0.7, amp: (t) => envBell(t, 0.45, 0.8) }), 0, 0.25);
  return m.reverb(IR('lab'), 0.1);
}

/** +N free spins: rising D minor arpeggio into an F major (add9) bell chord. */
function fsAdd(rng) {
  const m = new Mix(1.3, 2);
  ['D5', 'F5', 'A5', 'D6'].forEach((nn, k) => {
    const p = -0.5 + k / 3;
    m.add(pluck(hz(nn), 0.08, { rng, cut: 1500, env: 4000, tau: 0.15 }), k * 0.06, 0.2, p);
    m.add(modal(hz(nn), 0.4, { set: GLASS, tau: 0.1, rng }), k * 0.06, 0.18, p);
  });
  bells(m, ['F5', 'A5', 'C6', 'G6'], 0.24, { rng, gain: 0.2, tau: 0.4, spread: 0.6 });
  m.add(fm2(hz('F4'), 0.8, { ratio: 1, index: 1, indexTau: 0.2, tau: 0.35, attack: 0.02, rng }), 0.24, 0.15);
  m.add(thump(0.3, { f0: 180, f1: hz('F2'), pTau: 0.02, tau: 0.08 }), 0.24, 0.4);
  sparkle(m, { rng, notes: ['F6', 'A6', 'C7', 'F7', 'A7'].map(hz), t0: 0.24, t1: 0.6, count: 10, gain: 0.09 });
  return m.reverb(IR('hall'), 0.2);
}

/** Total-win sting: Gm9 -> A7sus4 -> Dm(add9) with a bell line. */
function bonusEnd(rng) {
  const m = new Mix(3.0, 2);
  const chords = [
    [0, ['G3', 'Bb3', 'D4', 'F4', 'A4'], 'G1', 0.4],
    [0.45, ['A3', 'D4', 'E4', 'G4'], 'A1', 0.4],
    [0.9, ['D4', 'F4', 'A4', 'E5'], 'D2', 1.2],
  ];
  for (const [t, notes, bn, gate] of chords) {
    padChord(m, notes, t, gate, { rng, gain: 0.07, cut: 2000, att: 0.06, rel: 0.7 });
    stab(m, notes, t, gate, { rng, gain: 0.08, bright: 0.7 });
    m.add(bass(hz(bn), gate, { rng, cut: 240, env: 700 }), t, 0.3);
  }
  bells(m, ['D6'], 0, { rng, gain: 0.22, tau: 0.5 });
  bells(m, ['E6'], 0.45, { rng, gain: 0.22, tau: 0.5 });
  bells(m, ['F6', 'A6'], 0.9, { rng, gain: 0.2, tau: 0.7, stagger: 0.12 });
  drumHit(m, 0, { rng, k: 0.4 });
  drumHit(m, 0.9, { rng, k: 0.55, s: 0.3 });
  m.add(crash({ rng, dur: 2.0, vel: 1 }), 0.9, 0.18);
  arpeggio(m, ['D5', 'A5', 'E6', 'A5', 'F5', 'A5', 'D6', 'A5', 'E5', 'A5', 'D6', 'A5'], 0.95, 0.1, { rng, gain: 0.06, cut: 1200, env: 3000, tau: 0.18 });
  return m.reverb(IR('hall'), 0.26);
}

/** Landing thud + cyan shockwave ring. */
function diveImpact(rng) {
  const m = new Mix(1.3, 2);
  m.add(thump(0.8, { f0: 110, f1: 45, pTau: 0.03, tau: 0.2, drive: 2 }), 0, 0.45);
  m.add(thump(0.35, { f0: 320, f1: 120, pTau: 0.015, tau: 0.07, drive: 1.6 }), 0, 0.6);
  m.add(fnoise(0.3, { rng, color: 'brown', mode: 'lp', f: 500, q: 0.7, amp: (t) => envAD(t, 0.002, 0.06) }), 0, 0.5);
  m.add(tick({ rng, f: 1800, q: 0.7, dur: 0.006 }), 0, 0.4);
  m.add(whoosh(0.6, { rng, f0: 3000, f1: 250, q: 1.8, peak: 0.12 }), 0.02, 0.35, -0.6);
  m.add(whoosh(0.6, { rng, f0: 3200, f1: 270, q: 1.8, peak: 0.12 }), 0.02, 0.35, 0.6);
  m.add(modal(hz('D5'), 0.8, { set: GLASS, tau: 0.3, rng }), 0.01, 0.2, -0.2);
  m.add(modal(hz('A5'), 0.8, { set: GLASS, tau: 0.28, rng }), 0.015, 0.15, 0.2);
  return m.reverb(IR('hall'), 0.22);
}

/** City switches to scan mode: resonant filter sweep on a Dm chord, scan line, power-up. */
function scanModeOn(rng) {
  const m = new Mix(1.7, 2);
  [['D3', -0.5], ['A3', 0.5], ['D4', -0.2], ['F4', 0.2]].forEach(([nn, p]) => {
    m.add(tone(1.2, {
      wave: 'saw', unison: [-8, 8], rng, q: 3.5, poles: 2,
      f: hz(nn), cut: (t) => 180 * Math.pow(40, smoothstep(0, 0.9, t)),
      amp: (t) => envADSR(t, 0.05, 0.4, 0.8, 0.3, 0.85),
    }), 0, 0.16, p);
  });
  const line = tone(0.9, { wave: 'sine', f: (t) => 1800 * Math.pow(2, t / 0.9), amp: (t) => envBell(t, 0.45, 0.9) });
  m.addPanned(line, 0.05, 0.08, (t) => -0.9 + 2 * (t / 0.9));
  m.add(tone(1.0, { wave: 'sine', f: (t) => 55 * Math.pow(hz('D2') / 55, Math.min(1, t / 0.4)), amp: (t) => envADSR(t, 0.1, 0.3, 0.7, 0.3, 0.7) }), 0, 0.3);
  m.add(tone(1.0, { wave: 'saw', rng, f: hz('D2'), cut: 500, q: 1, amp: (t) => envADSR(t, 0.1, 0.3, 0.7, 0.3, 0.7) }), 0, 0.12);
  for (let k = 0; k < 12; k++) m.add(modal(rng.pick(PENT_HI), 0.1, { set: CHIME, tau: 0.02, rng }), 0.2 + k * 0.0625, 0.08, rng.bi() * 0.8);
  return m.reverb(IR('hall'), 0.2);
}

function scanModeOff(rng) {
  const m = new Mix(1.5, 2);
  const drop = (t) => Math.pow(semis(-5), smoothstep(0.5, 0.95, t));
  [['D3', -0.5], ['A3', 0.5], ['D4', -0.2], ['F4', 0.2]].forEach(([nn, p]) => {
    m.add(tone(1.0, {
      wave: 'saw', unison: [-8, 8], rng, q: 3,
      f: (t) => hz(nn) * drop(t), cut: (t) => 7000 * Math.pow(1 / 45, smoothstep(0, 0.85, t)),
      amp: (t) => envADSR(t, 0.02, 0.3, 0.8, 0.25, 0.7),
    }), 0, 0.15, p);
  });
  const line = tone(0.8, { wave: 'sine', f: (t) => 3600 * Math.pow(0.5, t / 0.8), amp: (t) => envBell(t, 0.3, 0.8) });
  m.addPanned(line, 0, 0.07, (t) => 0.9 - 2 * (t / 0.8));
  m.add(tone(0.9, { wave: 'sine', f: (t) => hz('D2') * Math.pow(0.56, Math.min(1, t / 0.8)), amp: (t) => envADSR(t, 0.02, 0.3, 0.7, 0.3, 0.55) }), 0, 0.3);
  return m.reverb(IR('hall'), 0.18);
}

/* ------------------------------------------------------------ registry */

const big = (id, gen, loud, maxDur, extra = {}) => ({
  id, bus: 'sfx', critical: false, channels: 2, loud, gen, ...extra,
  master: { limitDb: -2.5, hp: 38, trimDb: -46, fadeOutMs: 300, maxDur, ...(extra.master || {}) },
});

export default [
  big('bigwin_intro', bigwinIntro, -16, 1.3, { master: { fadeOutMs: 70 } }),
  big('tier_big', tierBig, -17, 2.6),
  big('tier_super', tierSuper, -16.5, 2.9),
  big('tier_mega', tierMega, -16, 3.2),
  big('tier_epic', tierEpic, -15.5, 3.6, { master: { limitDb: -3.5 } }),
  big('tier_cyber', tierCyber, -14, 4.0, { master: { limitDb: -5 } }),
  big('maxwin', maxWin, -14, 5.8, { master: { limitDb: -5 } }),
  big('coin_rain', coinRain, -19, 1.8),
  big('drone_swarm', droneSwarm, -20, 2.2),
  big('train_pass', trainPass, -18, 2.8),
  big('city_lights_on', cityLightsOn, -18, 1.9),
  big('bonus_trigger', bonusTrigger, -15, 2.0),
  big('bonus_intro', bonusIntro, -15, 2.5),
  big('punch_tear', punchTear, -18, 0.6, { master: { fadeOutMs: 60 } }),
  big('run_whoosh', runWhoosh, -20, 1.0, { master: { fadeOutMs: 60 } }),
  big('fs_add', fsAdd, -17, 1.2),
  big('bonus_end', bonusEnd, -15, 3.0),
  big('dive_impact', diveImpact, -16, 1.2, { master: { limitDb: -3 } }),
  big('scan_mode_on', scanModeOn, -18, 1.6),
  big('scan_mode_off', scanModeOff, -19, 1.35),
];
