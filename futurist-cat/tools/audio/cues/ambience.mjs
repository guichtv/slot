// Ambience loops (bus "amb", stereo, 20 s, seamless).
// Stationary layers (rain, traffic bed, current) are rendered T + X and equal-power crossfaded;
// event layers (drops, cars, train, radar sweeps) are rendered with tails and folded; tonal layers
// (neon hum, sub pulse) are exact periodic formulas. Reverb on a folded layer = circular
// convolution, i.e. the periodic steady state.
import {
  Mix, IR, SR, TAU, len, hz, qf, filt, envBell, smoothstep, fnoise, tone, modal, foldTail, noiseLoop, periodic, addChs,
  CHIME, GLASS, PENT_HI,
} from './common.mjs';

const T = 20;

function ambCity(rng) {
  const N = len(T);
  const X = 0.8;
  // fine rain: broad hiss + softer body, slow periodic density swell, decorrelated L/R
  const rain = noiseLoop(T, X, (d) => [0, 1].map((c) => {
    const hiss = fnoise(d, { rng, color: 'white', mode: 'bp', f: 4200, q: 0.4, amp: (t) => 0.85 + 0.15 * Math.sin((TAU * 2 * t) / T + c) });
    const body = fnoise(d, { rng, color: 'pink', mode: 'bp', f: 1100, q: 0.5, amp: (t) => 0.8 + 0.2 * Math.sin((TAU * 3 * t) / T + 2 * c) });
    const out = new Float32Array(hiss.length);
    for (let i = 0; i < out.length; i++) out[i] = hiss[i] * 0.3 + body[i] * 0.6;
    filt(out, 'highshelf', 7000, 0.7, -5);
    return out;
  }));
  // distant traffic bed
  const traffic = noiseLoop(T, X, (d) => [0, 1].map((c) => fnoise(d, {
    rng, color: 'pink', mode: 'bp', f: 260, q: 0.5, amp: (t) => 0.75 + 0.25 * Math.sin((TAU * 3 * t) / T + 1.3 * c),
  })));
  // events: drops on the glass roof, distant cars, one distant train
  const ev = new Mix(T + 1, 2);
  const nDrops = 26 * T;
  for (let k = 0; k < nDrops; k++) {
    const t = rng.next() * T;
    const f = rng.range(2200, 7000);
    const tau = rng.range(0.0015, 0.004);
    const z = tone(tau * 7 + 0.002, { wave: 'sine', f: (x) => f * (1 + 8 * x), amp: (x) => (x < 0.0006 ? x / 0.0006 : Math.exp(-(x - 0.0006) / tau)) });
    ev.add(z, t, 0.05 * Math.pow(rng.next(), 2) + 0.004, rng.bi() * 0.95);
  }
  for (let k = 0; k < 2 * T; k++) {
    const t = rng.next() * T;
    ev.add(modal(rng.range(1400, 2600), 0.08, { set: GLASS, tau: rng.range(0.006, 0.012), rng }), t, 0.02 + 0.03 * rng.next(), rng.bi() * 0.8);
  }
  const traffics = [];
  for (const [t0, dur, p0, p1] of [[1.5, 5, -0.8, 0.5], [8.5, 6, 0.7, -0.4], [14.5, 4.5, -0.3, 0.8]]) {
    const z = fnoise(dur, { rng, color: 'pink', mode: 'bp', q: 1.2, f: (x) => 350 + 500 * envBell(x, dur * 0.45, dur), amp: (x) => envBell(x, dur * 0.45, dur) });
    traffics.push([z, t0, p0, p1, dur]);
  }
  for (const [z, t0, p0, p1, dur] of traffics) ev.addPanned(z, t0, 0.35, (x) => p0 + (p1 - p0) * smoothstep(0, dur, x));
  // distant maglev train, once per loop
  {
    const t0 = 11;
    const dur = 7;
    const rumble = fnoise(dur, { rng, color: 'pink', mode: 'bp', f: 170, q: 0.6, amp: (x) => envBell(x, dur * 0.5, dur) });
    const whine = tone(dur, { wave: 'saw', rng, f: (x) => hz('D3') * (1.015 - 0.03 * smoothstep(dur * 0.35, dur * 0.65, x)), cut: 700, q: 0.8, amp: (x) => envBell(x, dur * 0.5, dur) });
    for (let i = 0; i < rumble.length; i++) rumble[i] = rumble[i] * 0.8 + whine[i] * 0.12;
    ev.addPanned(rumble, t0, 0.7, (x) => -0.6 + 1.2 * smoothstep(0, dur, x));
  }
  ev.reverb(IR('city'), 0.35);
  const events = foldTail(ev.chs, N);
  // neon hum tuned to D, exactly periodic, with a slow flicker
  const f0 = qf(hz('D3'), T);
  const hum = periodic(T, 2, (t, c) => {
    const fl = 0.8 + 0.2 * Math.sin((TAU * 5 * t) / T + c);
    let s = 0;
    const amps = [0.6, 1, 0.5, 0.3, 0.15];
    for (let k = 0; k < amps.length; k++) s += amps[k] * Math.sin(TAU * f0 * (k + 1) * t + k * 1.7 + c * 0.4);
    return s * fl;
  });
  const out = [new Float32Array(N), new Float32Array(N)];
  addChs(out, rain, 0.5);
  addChs(out, traffic, 0.22);
  addChs(out, events, 1);
  addChs(out, hum, 0.006);
  return out;
}

function ambScan(rng) {
  const N = len(T);
  // breathing sub pulse on D (8 breaths per loop)
  const fa = qf(hz('D2'), T);
  const fb = qf(hz('A2'), T);
  const fc = qf(hz('D4'), T);
  const sub = periodic(T, 2, (t, c) => {
    const br = 0.55 + 0.45 * (0.5 - 0.5 * Math.cos((TAU * 8 * t) / T)); // 8 breaths per loop
    return (Math.sin(TAU * fa * t) * 0.5 + Math.sin(TAU * fb * t + 1) * 0.4 + Math.sin(TAU * fc * t + c) * 0.12) * br;
  });
  // electrical current: band noise with an exact 7 Hz flutter
  const cur = noiseLoop(T, 0.6, (d) => [0, 1].map(() => fnoise(d, {
    rng, color: 'pink', mode: 'bp', f: 3200, q: 1.5, amp: (t) => 0.7 + 0.3 * Math.sin(TAU * (140 / T) * t),
  })));
  // radar sweeps + twinkles
  const ev = new Mix(T + 2, 2);
  for (let k = 0; k < 4; k++) {
    const t0 = k * 5 + 0.5;
    const d = 1.6;
    const z = fnoise(d, { rng, color: 'pink', mode: 'bp', q: 6, f: (x) => 1500 * Math.pow(10 / 3, x / d), amp: (x) => envBell(x, d * 0.5, d) });
    ev.addPanned(z, t0, 0.6, (x) => (k % 2 ? 0.85 - 1.7 * (x / d) : -0.85 + 1.7 * (x / d)));
    ev.add(modal(hz(k % 2 ? 'D6' : 'A6'), 1.2, { set: GLASS, tau: 0.25, rng }), t0, 0.12, k % 2 ? 0.5 : -0.5);
  }
  for (let k = 0; k < 30; k++) {
    ev.add(modal(rng.pick(PENT_HI), 0.3, { set: CHIME, tau: rng.range(0.02, 0.05), rng }), rng.next() * T, rng.range(0.03, 0.07), rng.bi() * 0.9);
  }
  ev.reverb(IR('hall'), 0.4);
  const events = foldTail(ev.chs, N);
  const out = [new Float32Array(N), new Float32Array(N)];
  addChs(out, sub, 0.07);
  addChs(out, cur, 0.12);
  addChs(out, events, 1);
  return out;
}

const amb = (id, gen, rmsDb) => ({
  id, bus: 'amb', critical: false, channels: 2, loop: true, loud: null, gen, maxVoices: 2,
  master: { hp: 40, rmsDb, targetDb: -1 },
});

export default [
  { ...amb('amb_city', ambCity, -30), critical: true },
  amb('amb_scan', ambScan, -32),
];

