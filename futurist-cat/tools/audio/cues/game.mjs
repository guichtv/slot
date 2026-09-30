// Reels, laser mechanic, wins and symbol reactions (bus "sfx").
import {
  Mix, IR, SR, TAU, len, filt, hz, cents, semis, qf, clamp, smoothstep, envAD, envADSR, envBell, hann,
  tick, modal, fm2, thump, fnoise, tone, whoosh, sparkle, brass, pluck, foldTail, periodic, noiseLoop, addChs,
  GLASS, CHIME, BELL, PLATE, BAR, PENT_HI, PENT_TOP,
} from './common.mjs';

/* ================================================================ REELS */

/** Servo whirr + latch: the reels unlock and spin up. */
function spinStart(rng) {
  const m = new Mix(0.5);
  m.add(tick({ rng, f: 3000, q: 2.5, dur: 0.003 }), 0, 0.7);
  m.add(modal(1350, 0.12, { set: PLATE, tau: 0.018, rng }), 0, 0.3);
  const servo = tone(0.36, {
    wave: 'saw', unison: [-8, 8], rng, mode: 'bp', q: 2.2,
    f: (t) => 70 * Math.pow(160 / 70, Math.min(1, t / 0.3)),
    cut: (t) => 500 * Math.pow(3, Math.min(1, t / 0.3)),
    amp: (t) => envADSR(t, 0.04, 0.2, 0.9, 0.12, 0.24),
  });
  let gp = 0;
  for (let i = 0; i < servo.length; i++) {
    const t = i / SR;
    gp += (45 + 60 * Math.min(1, t / 0.3)) / SR;
    servo[i] *= 0.75 + 0.25 * Math.sin(TAU * gp);
  }
  filt(servo, 'lp', 2600, 0.6);
  m.add(servo, 0.01, 0.55);
  m.add(whoosh(0.34, { rng, f0: 500, f1: 2400, q: 1.2, peak: 0.7 }), 0.02, 0.25);
  m.add(thump(0.14, { f0: 130, f1: 70, pTau: 0.02, tau: 0.035 }), 0, 0.45);
  return m.reverb(IR('short'), 0.12);
}

/** Seamless 1.2 s spin bed: tuned hum (periodic), sensor ticks (folded), air band (crossfaded). */
function reelLoop(rng) {
  const T = 1.2;
  const N = len(T);
  const f0 = 176 / T; // 146.67 Hz (D3), exactly periodic
  const f1 = 177 / T; // one beat per loop: slow chorus
  const hum = periodic(T, 1, (t) => {
    let s = 0;
    for (let k = 1; k <= 8; k++) s += (Math.sin(TAU * f0 * k * t + k) + Math.sin(TAU * f1 * k * t + 2 * k)) / Math.pow(k, 1.25);
    return s * 0.5 * (0.85 + 0.15 * Math.cos((TAU * t) / T));
  });
  const ticks = new Mix(T + 0.5);
  for (let k = 0; k < 12; k++) {
    const acc = k % 4 === 0 ? 1 : 0.6;
    ticks.add(tick({ rng, f: 2600 + (k % 2) * 500, q: 1.2, dur: 0.002 }), (k * T) / 12, 0.5 * acc);
    ticks.add(modal(k % 2 ? 1480 : 1320, 0.05, { set: BAR, tau: 0.009, rng }), (k * T) / 12, 0.22 * acc);
  }
  ticks.reverb(IR('short'), 0.12);
  const tk = foldTail(ticks.chs, N);
  const air = noiseLoop(T, 0.2, (d) => [fnoise(d, { rng, color: 'pink', mode: 'bp', f: 800, q: 0.7, amp: (t) => 0.8 + 0.2 * Math.cos((TAU * 2 * t) / T) })]);
  const out = [new Float32Array(N)];
  addChs(out, hum, 0.16);
  addChs(out, tk, 0.9);
  addChs(out, air, 0.22);
  return out;
}

/** Soft thunk + glassy click. Three variants. Body sits at 110-320 Hz so it reads on phone speakers. */
function reelStop(rng, v) {
  const m = new Mix(0.45);
  m.add(thump(0.2, { f0: [300, 280, 320][v], f1: [120, 110, 130][v], pTau: 0.012, tau: 0.045, drive: 1.4 }), 0, 0.8);
  m.add(thump(0.3, { f0: 120, f1: [58, 55, 62][v], pTau: 0.02, tau: 0.06, drive: 1.2 }), 0, 0.35);
  m.add(modal([430, 400, 460][v], 0.1, { set: BAR, tau: 0.025, rng }), 0, 0.3);
  m.add(fnoise(0.06, { rng, color: 'pink', mode: 'lp', f: 1200, q: 0.7, amp: (t) => Math.exp(-t / 0.006) }), 0, 0.45);
  m.add(tick({ rng, f: [4200, 3800, 4600][v], q: 1.8, dur: 0.0025 }), 0.001, 0.4);
  m.add(modal(hz(['D6', 'C6', 'E6'][v]), 0.3, { set: GLASS, tau: 0.05, rng }), 0.002, 0.28);
  return m.reverb(IR('lab'), 0.1);
}

function reelStopLast(rng) {
  const m = new Mix(0.8);
  m.add(thump(0.3, { f0: 280, f1: 105, pTau: 0.014, tau: 0.06, drive: 1.5 }), 0, 0.85);
  m.add(thump(0.5, { f0: 130, f1: 49, pTau: 0.02, tau: 0.1, drive: 1.4 }), 0, 0.45);
  m.add(modal(390, 0.12, { set: BAR, tau: 0.03, rng }), 0, 0.3);
  m.add(fnoise(0.08, { rng, color: 'pink', mode: 'lp', f: 1000, amp: (t) => Math.exp(-t / 0.012) }), 0, 0.5);
  m.add(tick({ rng, f: 4000, q: 1.8, dur: 0.003 }), 0.001, 0.45);
  m.add(modal(hz('D5'), 0.8, { set: GLASS, tau: 0.22, rng }), 0.002, 0.25);
  m.add(modal(hz('A5'), 0.8, { set: GLASS, tau: 0.2, rng }), 0.004, 0.2);
  m.add(tick({ rng, f: 3000, q: 2, dur: 0.002 }), 0.06, 0.12);
  m.add(tick({ rng, f: 3300, q: 2, dur: 0.002 }), 0.1, 0.07);
  return m.reverb(IR('lab'), 0.16);
}

/** All five reels slam, panned left to right, over one heavy sub. */
function quickStop(rng) {
  const m = new Mix(0.9, 2);
  const ts = [0, 0.021, 0.04, 0.057, 0.072];
  const notes = ['D6', 'F6', 'A5', 'C6', 'D6'];
  ts.forEach((t, k) => {
    const pan = -0.75 + k * 0.375;
    m.add(thump(0.25, { f0: 300 - k * 8, f1: 115, pTau: 0.012, tau: 0.045, drive: 1.4 }), t, 0.5, pan);
    m.add(modal(420 + k * 15, 0.1, { set: BAR, tau: 0.025, rng }), t, 0.2, pan);
    m.add(tick({ rng, f: 4000 + k * 150, q: 1.8, dur: 0.0025 }), t, 0.35, pan);
    m.add(modal(hz(notes[k]), 0.35, { set: GLASS, tau: 0.06, rng }), t, 0.2, pan);
  });
  m.add(thump(0.6, { f0: 180, f1: 55, pTau: 0.03, tau: 0.14, drive: 1.6 }), 0.03, 0.5);
  m.add(thump(0.4, { f0: 320, f1: 140, pTau: 0.02, tau: 0.08, drive: 1.5 }), 0.03, 0.45);
  m.add(fnoise(0.25, { rng, color: 'pink', mode: 'lp', f: (t) => 2500 * Math.exp(-t / 0.05) + 300, amp: (t) => Math.exp(-t / 0.04) }), 0.02, 0.4);
  return m.reverb(IR('lab'), 0.15);
}

/**
 * Tension loop: Shepard-Risset glissando (endlessly rising, exactly periodic over 2 s),
 * 8 Hz pulse, "Shepard noise" band and a soft heartbeat.
 */
function anticipationLoop(rng) {
  const T = 2.0;
  const N = len(T);
  const K = 6;
  const fmin = 55;
  const ln2 = Math.LN2;
  const p0 = [0];
  for (let k = 0; k < K; k++) p0.push((p0[k] + (fmin * T * Math.pow(2, k)) / ln2) % 1);
  // attack then exponential decay re-based so it reaches exactly 0 at the next pulse (no step)
  const P = 0.125, A = 0.006, TAUP = 0.045, E = Math.exp(-(P - A) / TAUP);
  const pulse = (t) => {
    const x = t % P;
    return x < A ? Math.sin((0.5 * Math.PI * x) / A) : (Math.exp(-(x - A) / TAUP) - E) / (1 - E);
  };
  const shep = periodic(T, 1, (t) => {
    let s = 0;
    const g = Math.pow(2, t / T);
    for (let k = 0; k < K; k++) {
      const u = k + t / T;
      const w = 0.5 - 0.5 * Math.cos((TAU * u) / K);
      const ph = p0[k] + (fmin * Math.pow(2, k) * T * (g - 1)) / ln2;
      s += w * Math.sin(TAU * ph);
    }
    return s * (0.45 + 0.55 * pulse(t));
  });
  // Shepard noise: three octave-spaced bands rising one octave per loop
  const nz = noiseLoop(T, 0.25, (d) => {
    const out = new Float32Array(len(d));
    for (let b = 0; b < 3; b++) {
      const band = fnoise(d, {
        rng, color: 'pink', mode: 'bp', q: 4,
        f: (t) => 500 * Math.pow(2, ((b + t / T) % 3)),
        amp: (t) => 0.5 - 0.5 * Math.cos((TAU * ((b + t / T) % 3)) / 3),
      });
      for (let i = 0; i < out.length; i++) out[i] += band[i];
    }
    return [out];
  });
  const beat = new Mix(T + 1);
  for (const t of [0, 0.5, 1.0, 1.5]) beat.add(thump(0.4, { f0: 90, f1: qf(hz('D2'), T), pTau: 0.02, tau: 0.08 }), t, t % 1 === 0 ? 0.5 : 0.35);
  const hb = foldTail(beat.chs, N);
  const out = [new Float32Array(N)];
  addChs(out, shep, 0.3);
  addChs(out, nz, 0.12);
  addChs(out, hb, 0.5);
  return out;
}

/** 1.8 s riser: detuned saws D3 -> D5, opening filter, accelerating tremolo, rising noise. */
function anticipationRiser(rng) {
  const D = 1.8;
  const m = new Mix(2.0, 2);
  const trem = (t) => (0.65 + 0.35 * Math.cos(TAU * (4 * t + (16 * t * t * t) / (3 * D * D)))) * (1 - smoothstep(D - 0.05, D, t));
  for (const pan of [-0.6, 0.6]) {
    m.add(tone(D, {
      wave: 'saw', unison: [-12, -4, 5, 13], rng, q: 1.2,
      f: (t) => hz('D3') * Math.pow(4, Math.pow(Math.min(1, t / D), 1.4)),
      cut: (t) => 400 * Math.pow(15, t / D),
      amp: (t) => Math.pow(Math.min(1, t / D), 1.5) * trem(t),
    }), 0, 0.3, pan);
    m.add(fnoise(D, { rng, color: 'pink', mode: 'hp', q: 0.7, f: (t) => 300 * Math.pow(20, t / D), amp: (t) => Math.pow(t / D, 2) * (1 - smoothstep(D - 0.05, D, t)) }), 0, 0.3, pan * 0.8);
  }
  m.add(tone(D, { wave: 'sine', f: (t) => hz('D2') * Math.pow(2, t / D), amp: (t) => Math.pow(t / D, 2) * (1 - smoothstep(D - 0.05, D, t)) }), 0, 0.3);
  return m.reverb(IR('hall'), 0.12);
}

/** Scatter landings: escalating portal pings (D5/A5 -> F5/C6 -> A5/D6/F6 triumphant open). */
function scatterLand(rng, step) {
  if (step < 2) {
    const m = new Mix(1.0);
    const [a, b, sub] = step === 0 ? ['D5', 'A5', 'D2'] : ['F5', 'C6', 'F2'];
    m.add(modal(hz(a), 1.0, { set: BELL, tau: 0.35, rng }), 0, 0.5);
    m.add(fm2(hz(b), 0.7, { ratio: 3.5, index: 1.2, indexTau: 0.06, tau: 0.22, rng }), 0.005, 0.25);
    const f0 = step === 0 ? 350 : 500;
    m.add(fnoise(0.45, { rng, color: 'pink', mode: 'bp', f: (t) => f0 * Math.pow(3.5, Math.min(1, t / 0.3)), q: 6, amp: (t) => envBell(t, 0.08, 0.45) }), 0, 0.3);
    m.add(thump(0.35, { f0: 110, f1: hz(sub), pTau: 0.03, tau: 0.09 }), 0, 0.4);
    m.add(tick({ rng, f: 5000, q: 1.5 }), 0, 0.2);
    if (step === 1) sparkle(m, { rng, notes: [hz('C7'), hz('F7')], t0: 0.03, t1: 0.2, count: 3, gain: 0.12 });
    return m.reverb(IR('glass'), 0.22);
  }
  const m = new Mix(1.7, 2);
  [['A5', -0.35], ['D6', 0.35], ['F6', 0]].forEach(([nn, p]) => m.add(modal(hz(nn), 1.5, { set: BELL, tau: 0.5, rng }), 0, 0.3, p));
  m.add(fm2(hz('D5'), 1.0, { ratio: 2, index: 2, indexTau: 0.1, indexEnd: 0.3, tau: 0.4, rng }), 0, 0.18);
  for (const [nn, p] of [['D4', -0.4], ['A4', 0.4], ['D5', 0]]) m.add(brass(hz(nn), 0.22, { rng, bright: 1.2 }), 0.01, 0.2, p);
  m.add(whoosh(0.5, { rng, f0: 300, f1: 6000, q: 2, peak: 0.85 }), 0, 0.3, -0.3);
  m.add(whoosh(0.5, { rng, f0: 320, f1: 6400, q: 2, peak: 0.85 }), 0, 0.3, 0.3);
  m.add(thump(0.9, { f0: 90, f1: hz('D1'), pTau: 0.05, tau: 0.3, drive: 1.6 }), 0, 0.8);
  sparkle(m, { rng, notes: PENT_TOP, t0: 0.05, t1: 0.6, count: 14, gain: 0.14 });
  return m.reverb(IR('hall'), 0.28);
}

/** Soft deflate: portal hum sinks and closes. */
function scatterFail(rng) {
  const m = new Mix(0.9);
  const drop = (t) => Math.pow(semis(-7), Math.min(1, t / 0.55));
  const cut = (t) => 1600 * Math.pow(0.12, Math.min(1, t / 0.6));
  m.add(tone(0.75, { wave: 'saw', unison: [-6, 6], rng, f: (t) => hz('D3') * drop(t), cut, q: 1.3, amp: (t) => envADSR(t, 0.02, 0.3, 0.7, 0.3, 0.35) }), 0, 0.5);
  m.add(tone(0.75, { wave: 'saw', unison: [-5, 5], rng, f: (t) => hz('A3') * drop(t), cut, q: 1.3, amp: (t) => envADSR(t, 0.02, 0.3, 0.7, 0.3, 0.35) }), 0, 0.3);
  m.add(fnoise(0.65, { rng, color: 'pink', mode: 'lp', f: (t) => 2500 * Math.pow(0.1, t / 0.6), amp: (t) => envBell(t, 0.05, 0.6) }), 0, 0.25);
  return m.reverb(IR('lab'), 0.15);
}

/* ================================================================ LASER */

function eyesCharge(rng) {
  const D = 0.5;
  const rel = (t) => 1 - smoothstep(D - 0.045, D, t);
  const m = new Mix(0.62);
  m.add(fm2(hz('A4'), D, {
    ratio: 2, index: 0.2, indexEnd: 1.4, indexTau: 0.25, rng,
    pitch: (t) => Math.pow(4, t / D),
    amp: (t) => Math.pow(Math.min(1, t / D), 1.6) * (0.8 + 0.2 * Math.cos(TAU * (10 * t + (10 * t * t) / D))) * rel(t),
  }), 0, 0.5);
  m.add(fnoise(D, { rng, color: 'pink', mode: 'bp', q: 2.5, f: (t) => 1000 * Math.pow(6, t / D), amp: (t) => Math.pow(t / D, 2) * rel(t) }), 0, 0.22);
  m.add(tone(D, { wave: 'sine', f: hz('D3'), amp: (t) => Math.pow(t / D, 2) * rel(t) }), 0, 0.2);
  m.add(modal(hz('D7'), 0.12, { set: CHIME, tau: 0.03, rng }), 0.47, 0.3);
  m.filter('lp', 9000, 0.6);
  return m.reverb(IR('lab'), 0.12);
}

function laserFire(rng) {
  const m = new Mix(0.5);
  m.add(fm2(1, 0.3, { ratio: 0.5, index: 1.4, indexTau: 0.05, indexEnd: 0.1, tau: 0.09, attack: 0.001, rng, pitch: (t) => 2400 * Math.exp(-t / 0.035) + 380 }), 0, 0.7);
  m.add(thump(0.2, { f0: 300, f1: 110, pTau: 0.02, tau: 0.05 }), 0, 0.35);
  m.add(modal(hz('D6'), 0.35, { set: GLASS, tau: 0.08, rng }), 0.01, 0.2);
  m.add(tick({ rng, f: 3000, q: 0.8, dur: 0.006 }), 0, 0.3);
  m.filter('lp', 7500, 0.6);
  return m.reverb(IR('lab'), 0.2);
}

/** Laser dot hop: rising "bwip" landing on D6 (runtime steps it up the D minor scale). */
function laserHop(rng, v) {
  const m = new Mix(0.25);
  const f0 = hz('D6');
  const st = [4, 3, 5, 4][v];
  m.add(fm2(f0, 0.18, {
    ratio: [2, 3, 2, 1.5][v], index: 0.7, indexTau: 0.02, indexEnd: 0.1, tau: [0.035, 0.03, 0.04, 0.033][v], attack: 0.0015, rng,
    pitch: (t) => Math.pow(2, -(st / 12) * Math.exp(-t / 0.01)),
  }), 0, 0.7);
  m.add(modal(f0 * 2, 0.12, { set: CHIME, tau: 0.015 + v * 0.002, rng }), 0.004, 0.18);
  m.add(tick({ rng, f: 6000 + v * 300, q: 1.4, dur: 0.0018 }), 0, 0.18);
  return m.reverb(IR('short'), 0.14);
}

function upgradeTick(rng) {
  const m = new Mix(0.45);
  m.add(fm2(hz('A5'), 0.18, { ratio: 2, index: 1, indexTau: 0.03, tau: 0.04, rng }), 0, 0.45);
  m.add(fm2(hz('D6'), 0.3, { ratio: 2, index: 1.1, indexTau: 0.04, tau: 0.07, rng }), 0.055, 0.55);
  m.add(tone(0.05, { wave: 'sine', f: (t) => 2000 * Math.pow(2.5, t / 0.05), amp: (t) => envBell(t, 0.01, 0.05) }), 0.05, 0.15);
  m.add(modal(hz('A7'), 0.1, { set: CHIME, tau: 0.02, rng }), 0.07, 0.12);
  return m.reverb(IR('lab'), 0.18);
}

function upgradeMax(rng) {
  const m = new Mix(0.5);
  sparkle(m, { rng, notes: ['D7', 'F7', 'A7', 'C8', 'D8'].map(hz), t0: 0, t1: 0.12, count: 9, gain: 0.35, tau: [0.03, 0.08] });
  m.add(fnoise(0.3, { rng, mode: 'hp', f: 8000, q: 0.7, amp: (t) => envBell(t, 0.02, 0.3) * (0.6 + 0.4 * Math.sin(TAU * 30 * t)) }), 0, 0.08);
  m.add(modal(hz('D6'), 0.35, { set: GLASS, tau: 0.1, rng }), 0, 0.25);
  return m.reverb(IR('lab'), 0.25);
}

/** Weighty multiplier token slam: sub impact + stamped metal plate + D bell ring. */
function multStamp(rng) {
  const m = new Mix(0.7);
  m.add(thump(0.45, { f0: 150, f1: 50, pTau: 0.022, tau: 0.1, drive: 1.8 }), 0, 0.55);
  m.add(thump(0.3, { f0: 360, f1: 150, pTau: 0.015, tau: 0.06, drive: 1.6 }), 0, 0.7);
  m.add(modal(hz('D4'), 0.5, { set: PLATE, tau: 0.13, rng, bright: 0.8 }), 0.001, 0.45);
  m.add(fnoise(0.1, { rng, mode: 'bp', f: 1900, q: 0.8, amp: (t) => Math.exp(-t / 0.009) }), 0, 0.6);
  m.add(modal(hz('D5'), 0.6, { set: BELL, tau: 0.16, rng }), 0.004, 0.22);
  m.add(tick({ rng, f: 2500, q: 1, dur: 0.003 }), 0, 0.4);
  return m.reverb(IR('lab'), 0.16);
}

function chipPlace(rng) {
  const m = new Mix(0.3);
  m.add(tick({ rng, f: 3500, q: 2, dur: 0.002 }), 0, 0.5);
  m.add(modal(900, 0.1, { set: BAR, tau: 0.02, rng }), 0, 0.35);
  m.add(fm2(hz('D6'), 0.16, { ratio: 1, index: 0.6, indexTau: 0.02, tau: 0.035, pitch: (t) => 1 + 0.06 * Math.exp(-t / 0.006), rng }), 0.003, 0.4);
  m.add(thump(0.08, { f0: 260, f1: 160, pTau: 0.01, tau: 0.02 }), 0, 0.3);
  return m.reverb(IR('short'), 0.15);
}

/** Chip level-up: electric sweep A5 -> A6 (runtime raises the pitch per level). */
function chipLevel(rng) {
  const m = new Mix(0.4);
  m.add(fm2(hz('A5'), 0.28, { ratio: 2, index: 0.8, indexTau: 0.05, indexEnd: 0.2, tau: 0.08, rng, pitch: (t) => Math.pow(2, Math.min(1, t / 0.06)) }), 0, 0.6);
  m.add(modal(hz('A6'), 0.22, { set: CHIME, tau: 0.05, rng }), 0.06, 0.25);
  m.add(fnoise(0.08, { rng, mode: 'bp', f: (t) => 2000 * Math.pow(2, t / 0.06), q: 3, amp: (t) => envBell(t, 0.03, 0.08) }), 0, 0.1);
  return m.reverb(IR('lab'), 0.15);
}

/** Chip extinguish: falling blip, closing filter, little fizz. */
function chipOff(rng, v) {
  const m = new Mix(0.35);
  const f0 = hz(['D6', 'C6', 'E6'][v]);
  const dropT = [0.1, 0.12, 0.09][v];
  const drop = (t) => Math.pow(0.5, Math.min(1, t / dropT));
  m.add(tone(0.22, { wave: 'sine', f: (t) => f0 * drop(t), amp: (t) => envAD(t, 0.002, 0.05) }), 0, 0.5);
  m.add(tone(0.22, { wave: 'saw', rng, f: (t) => f0 * 0.5 * drop(t), cut: (t) => 5000 * Math.pow(0.15, Math.min(1, t / 0.12)), q: 1.5, amp: (t) => envAD(t, 0.002, 0.04) }), 0, 0.2);
  m.add(fnoise(0.16, { rng, mode: 'bp', f: (t) => 4000 * Math.pow(0.25, Math.min(1, t / 0.12)), q: 2, amp: (t) => envAD(t, 0.003, 0.03) }), 0.005, 0.18);
  return m.reverb(IR('short'), 0.12);
}

/** Subtle electrical hum tuned to D (exactly periodic over 2 s) + faint current noise. */
function circuitHum(rng) {
  const T = 2.0;
  const N = len(T);
  const f0 = qf(hz('D2'), T);
  const amps = [0.5, 0.6, 0.45, 0.3, 0.2, 0.13, 0.09, 0.06, 0.04, 0.03];
  const ph = amps.map(() => rng.next() * TAU);
  const fw = qf(hz('D7'), T);
  const hum = periodic(T, 1, (t) => {
    let s = 0;
    for (let k = 0; k < amps.length; k++) s += amps[k] * Math.sin(TAU * f0 * (k + 1) * t + ph[k]);
    const am = 1 + 0.12 * Math.sin((TAU * t) / T) + 0.04 * Math.sin(TAU * 6 * t);
    return s * am * 0.3 + 0.012 * Math.sin(TAU * fw * t) * (0.7 + 0.3 * Math.sin((TAU * t) / T + 1));
  });
  const cur = noiseLoop(T, 0.25, (d) => [fnoise(d, { rng, color: 'pink', mode: 'bp', f: 2500, q: 0.8, amp: 0.05 })]);
  const out = [new Float32Array(N)];
  addChs(out, hum);
  addChs(out, cur);
  return out;
}

/* ================================================================= WINS */

function winSmall(rng) {
  const m = new Mix(1.0);
  ['D6', 'F6', 'A6'].forEach((nn, k) => m.add(modal(hz(nn), 0.9, { set: BELL, tau: 0.22, rng }), k * 0.05, 0.45));
  m.add(fm2(hz('D5'), 0.6, { ratio: 2, index: 1, indexTau: 0.1, tau: 0.25, rng }), 0, 0.2);
  sparkle(m, { rng, notes: [hz('D7'), hz('F7'), hz('A7')], t0: 0.05, t1: 0.3, count: 5, gain: 0.12 });
  return m.reverb(IR('glass'), 0.25);
}

/** Connection shimmer: light running up the D minor pentatonic over a soft Dm swell. */
function winConnect(rng) {
  const m = new Mix(0.8);
  const pent = ['D5', 'F5', 'G5', 'A5', 'C6', 'D6', 'F6', 'G6', 'A6', 'C7', 'D7'];
  pent.forEach((nn, k) => m.add(modal(hz(nn), 0.3, { set: CHIME, tau: 0.05, rng }), k * 0.022, 0.22 * (0.6 + (0.4 * k) / 10)));
  m.add(fnoise(0.3, { rng, color: 'pink', mode: 'bp', f: (t) => 1500 * Math.pow(5, t / 0.25), q: 8, amp: (t) => envBell(t, 0.2, 0.3) }), 0, 0.25);
  for (const nn of ['D4', 'F4', 'A4']) m.add(tone(0.55, { wave: 'saw', unison: [-8, 0, 8], rng, f: hz(nn), cut: 1400, amp: (t) => envBell(t, 0.12, 0.55) }), 0, 0.12);
  return m.reverb(IR('glass'), 0.25);
}

/** Musical counter loop: 12 glass ticks per second arpeggiating Dm(add9), folded seamless. */
function winCountLoop(rng) {
  const T = 1.0;
  const N = len(T);
  const m = new Mix(T + 0.6);
  const seq = ['D6', 'F6', 'A6', 'F6', 'E6', 'A6', 'C7', 'A6', 'F6', 'A6', 'D7', 'A6'];
  seq.forEach((nn, k) => {
    const t = (k * T) / 12;
    m.add(modal(hz(nn), 0.35, { set: CHIME, tau: 0.045, rng }), t, k % 4 === 0 ? 0.5 : 0.36);
    m.add(tick({ rng, f: 6500, q: 1.2, dur: 0.0015 }), t, 0.12);
  });
  m.reverb(IR('glass'), 0.18);
  return foldTail(m.chs, N);
}

function winCountEnd(rng) {
  const m = new Mix(1.2);
  [['F5', 0.3], ['A5', 0.35], ['D6', 0.45], ['A6', 0.3]].forEach(([nn, g]) => m.add(modal(hz(nn), 1.2, { set: BELL, tau: 0.35, rng }), 0, g));
  m.add(thump(0.3, { f0: 160, f1: hz('D2'), pTau: 0.02, tau: 0.07 }), 0, 0.5);
  sparkle(m, { rng, notes: PENT_TOP, t0: 0.02, t1: 0.3, count: 7, gain: 0.15 });
  return m.reverb(IR('glass'), 0.28);
}

/* ============================================================== SYMBOLS */

/** H1 nano-food can: tab crack, air pop, can ring, fizz with bubbles. */
function symH1(rng) {
  const m = new Mix(0.95);
  m.add(tick({ rng, f: 2600, q: 1.1, dur: 0.004 }), 0, 0.7);
  m.add(tone(0.07, { wave: 'sine', f: (t) => 480 + 700 * Math.exp(-t / 0.008), amp: (t) => envAD(t, 0.001, 0.015) }), 0.002, 0.6);
  m.add(modal(hz('E5'), 0.35, { set: PLATE, tau: 0.06, rng }), 0, 0.18);
  m.add(fnoise(0.6, { rng, color: 'pink', mode: 'bp', f: 5500, q: 0.9, amp: (t) => envAD(t, 0.03, 0.2) }), 0.02, 0.14);
  for (let k = 0; k < 50; k++) {
    const at = 0.03 + 0.52 * Math.pow(rng.next(), 1.8);
    const f = rng.range(1800, 4500);
    const d = rng.range(0.008, 0.014);
    m.add(tone(d, { wave: 'sine', f: (t) => f * (1 + 25 * t), amp: (t) => hann(t / d) }), at, rng.range(0.04, 0.1));
  }
  m.add(modal(hz('A6'), 0.3, { set: CHIME, tau: 0.07, rng }), 0.05, 0.15);
  return m.reverb(IR('lab'), 0.14);
}

/** H2 fibre-optic yarn: pluck + flickering Fmaj9 partials + narrow light sweep. */
function symH2(rng) {
  const m = new Mix(0.95);
  m.add(pluck(hz('F5'), 0.05, { rng, cut: 1500, env: 5000, envTau: 0.05, q: 1.5, tau: 0.25 }), 0, 0.35);
  ['F6', 'A6', 'C7', 'E7', 'G7'].forEach((nn, k) => {
    const f = hz(nn);
    m.add(tone(0.75, {
      wave: 'sine', f: (t) => f * (1 + 0.002 * Math.sin(TAU * 5 * t)),
      amp: (t) => envADSR(t, 0.06 + k * 0.03, 0.2, 0.6, 0.3, 0.35) * (0.7 + 0.3 * Math.sin(TAU * (13 + 3 * k) * t + k)),
    }), 0, 0.12);
  });
  m.add(fnoise(0.6, { rng, color: 'pink', mode: 'bp', q: 10, f: (t) => 2000 + 6000 * envBell(t, 0.25, 0.6), amp: (t) => envBell(t, 0.15, 0.6) }), 0, 0.3);
  return m.reverb(IR('lab'), 0.3);
}

/** H3 chrome robo-fish: two metallic tings (flip), flop swish, splash with droplets. */
function symH3(rng) {
  const m = new Mix(0.95);
  m.add(modal(hz('A5'), 0.4, { set: PLATE, tau: 0.07, rng, bright: 0.9 }), 0, 0.35);
  m.add(modal(hz('D6'), 0.4, { set: PLATE, tau: 0.08, rng }), 0.075, 0.3);
  m.add(whoosh(0.12, { rng, f0: 1800, f1: 500, q: 1.2, peak: 0.4 }), 0, 0.25);
  m.add(fnoise(0.45, { rng, color: 'pink', mode: 'lp', q: 0.7, f: (t) => 5000 * Math.exp(-t / 0.08) + 700, amp: (t) => envAD(t, 0.004, 0.09) }), 0.13, 0.5);
  for (let k = 0; k < 14; k++) {
    const at = rng.range(0.14, 0.5);
    const f = rng.range(900, 2600);
    const d = rng.range(0.01, 0.02);
    m.add(tone(d, { wave: 'sine', f: (t) => f * (1 + 40 * t), amp: (t) => hann(t / d) }), at, rng.range(0.1, 0.2));
  }
  return m.reverb(IR('lab'), 0.2);
}

/** H4 mouse-drone: tiny rotor buzz passing left to right with a doppler bend. */
function symH4(rng) {
  const D = 0.7;
  const m = new Mix(0.9, 2);
  const bend = (t) => 1.06 - 0.12 * smoothstep(0.15, 0.55, t);
  const env = (t) => envBell(t, 0.33, D) * (0.75 + 0.25 * Math.sin(TAU * 38 * t));
  const rotor = tone(D, { wave: 'pulse', pw: 0.25, rng, f: (t) => 190 * bend(t), cut: 1900, q: 1.6, mode: 'bp', amp: env });
  const harm = tone(D, { wave: 'saw', rng, f: (t) => 380 * bend(t), cut: 3500, q: 0.8, amp: (t) => env(t) * 0.3 });
  for (let i = 0; i < rotor.length; i++) rotor[i] += harm[i];
  m.addPanned(rotor, 0, 0.6, (t) => -0.85 + 1.7 * smoothstep(0, D, t));
  m.add(tone(0.06, { wave: 'sine', f: (t) => 1500 * Math.pow(1.5, t / 0.06), amp: (t) => envBell(t, 0.02, 0.06) }), 0.3, 0.1);
  m.filter('lp', 6000, 0.6);
  return m.reverb(IR('lab'), 0.12);
}

/** Wild emblem power-up: FM swell (octave rise) into a bright D chord hit. */
function symW(rng) {
  const m = new Mix(1.2);
  m.add(fm2(hz('D4'), 0.3, {
    ratio: 1, index: 0.3, indexEnd: 2, indexTau: 0.15, rng,
    pitch: (t) => Math.pow(2, Math.min(1, t / 0.24)),
    amp: (t) => Math.pow(Math.min(1, t / 0.24), 2) * (t < 0.26 ? 1 : Math.exp(-(t - 0.26) / 0.02)),
  }), 0, 0.35);
  for (const nn of ['D5', 'A5', 'D6']) m.add(brass(hz(nn), 0.12, { rng, bright: 1.3 }), 0.24, 0.2);
  for (const [nn, g] of [['D6', 0.25], ['F6', 0.2], ['A6', 0.2]]) m.add(modal(hz(nn), 0.9, { set: GLASS, tau: 0.3, rng }), 0.24, g);
  m.add(thump(0.45, { f0: 120, f1: hz('D2'), pTau: 0.02, tau: 0.12 }), 0.24, 0.6);
  sparkle(m, { rng, notes: PENT_TOP, t0: 0.25, t1: 0.6, count: 8, gain: 0.12 });
  return m.reverb(IR('hall'), 0.18);
}

/** Scatter portal: swelling D/A hum with a moving resonance and a glassy top. */
function symS(rng) {
  const m = new Mix(1.2);
  const cut = (t) => 300 + 900 * envBell(t, 0.35, 0.8);
  m.add(tone(0.8, { wave: 'saw', unison: [-7, 7], rng, f: hz('D2'), cut, q: 3, amp: (t) => envBell(t, 0.3, 0.8) }), 0, 0.5);
  m.add(tone(0.8, { wave: 'saw', rng, f: hz('A2'), cut, q: 3, amp: (t) => envBell(t, 0.3, 0.8) }), 0, 0.3);
  m.add(tone(0.8, { wave: 'sine', f: hz('D4'), amp: (t) => envBell(t, 0.3, 0.8) * (0.5 + 0.5 * Math.sin(TAU * 6 * t)) }), 0, 0.15);
  m.add(modal(hz('A5'), 0.8, { set: BELL, tau: 0.3, rng }), 0.25, 0.25);
  m.add(modal(hz('D6'), 0.8, { set: BELL, tau: 0.3, rng }), 0.3, 0.18);
  return m.reverb(IR('lab'), 0.3);
}

/* ============================================================= REGISTRY */

const sfx = (id, gen, loud, extra = {}) => ({ id, bus: 'sfx', critical: false, channels: 1, loud, gen, ...extra });

export default [
  sfx('spin_start', spinStart, -21, { critical: true }),
  sfx('reel_loop', reelLoop, -30, { critical: true, loop: true, master: { hp: 30, rmsDb: -20 } }),
  sfx('reel_stop', (r) => reelStop(r, 0), -22, { critical: true, variants: ['reel_stop', 'reel_stop_2', 'reel_stop_3'], maxVoices: 5, master: { hp: 45 } }),
  sfx('reel_stop_2', (r) => reelStop(r, 1), -22, { critical: true, maxVoices: 5, master: { hp: 45 } }),
  sfx('reel_stop_3', (r) => reelStop(r, 2), -22, { critical: true, maxVoices: 5, master: { hp: 45 } }),
  sfx('reel_stop_last', reelStopLast, -19, { critical: true, master: { hp: 40 } }),
  sfx('quick_stop', quickStop, -17, { critical: true, channels: 2, master: { limitDb: -3, hp: 40 } }),
  sfx('anticipation_loop', anticipationLoop, -24, { loop: true, maxVoices: 1, master: { rmsDb: -18 } }),
  sfx('anticipation_riser', anticipationRiser, -19, { channels: 2, master: { fadeOutMs: 40, maxDur: 1.9 } }),
  sfx('scatter_land_1', (r) => scatterLand(r, 0), -19),
  sfx('scatter_land_2', (r) => scatterLand(r, 1), -18),
  sfx('scatter_land_3', (r) => scatterLand(r, 2), -16, { channels: 2, master: { limitDb: -2 } }),
  sfx('scatter_fail', scatterFail, -22),
  sfx('eyes_charge', eyesCharge, -21, { master: { fadeOutMs: 15 } }),
  sfx('laser_fire', laserFire, -19),
  sfx('laser_hop', (r) => laserHop(r, 0), -23, { variants: ['laser_hop', 'laser_hop_2', 'laser_hop_3', 'laser_hop_4'], maxVoices: 6 }),
  sfx('laser_hop_2', (r) => laserHop(r, 1), -23, { maxVoices: 6 }),
  sfx('laser_hop_3', (r) => laserHop(r, 2), -23, { maxVoices: 6 }),
  sfx('laser_hop_4', (r) => laserHop(r, 3), -23, { maxVoices: 6 }),
  sfx('upgrade_tick', upgradeTick, -22, { maxVoices: 6 }),
  sfx('upgrade_max', upgradeMax, -23),
  sfx('mult_stamp', multStamp, -17, { master: { limitDb: -3, hp: 40 } }),
  sfx('chip_place', chipPlace, -23, { maxVoices: 6 }),
  sfx('chip_level', chipLevel, -22, { maxVoices: 6 }),
  sfx('chip_off', (r) => chipOff(r, 0), -24, { variants: ['chip_off', 'chip_off_2', 'chip_off_3'], maxVoices: 6 }),
  sfx('chip_off_2', (r) => chipOff(r, 1), -24, { maxVoices: 6 }),
  sfx('chip_off_3', (r) => chipOff(r, 2), -24, { maxVoices: 6 }),
  sfx('circuit_hum', circuitHum, -32, { loop: true, maxVoices: 1, master: { hp: 35, rmsDb: -24 } }),
  sfx('win_small', winSmall, -20),
  sfx('win_connect', winConnect, -21),
  sfx('win_count_loop', winCountLoop, -25, { loop: true, maxVoices: 1, master: { rmsDb: -18 } }),
  sfx('win_count_end', winCountEnd, -19),
  sfx('sym_H1', symH1, -21),
  sfx('sym_H2', symH2, -21),
  sfx('sym_H3', symH3, -21),
  sfx('sym_H4', symH4, -21, { channels: 2 }),
  sfx('sym_W', symW, -19),
  sfx('sym_S', symS, -20),
];

