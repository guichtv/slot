// Music loops (bus "music", stereo, seamless). D minor synthwave.
// Every note is scheduled inside [0, T); tails (release, delay, reverb) are rendered past T and
// folded back onto the head, so the loop point is the steady-state continuation of the track.
// All modulators (pad LFO, chorus, arp filter scan, sidechain) have periods that divide T.
import {
  Mix, IR, SR, TAU, len, hz, nm, mtof, filt, foldTail, reverb, pingPong, chorus, rms, toDb, kWeight,
  superSaw, pluck, bass, epiano, lead, kick, snare, clap, hat, shaker, tom, crash, modal, fnoise, tone, BELL, CHIME,
} from './common.mjs';

const f = (name, shift = 0) => mtof(nm(name) + shift);

class Song {
  constructor({ bpm, bars, tail = 5 }) {
    this.beat = 60 / bpm;
    this.barLen = 4 * this.beat;
    this.bars = bars;
    this.T = bars * this.barLen;
    this.N = len(this.T);
    this.dur = this.T + tail;
    const bus = () => new Mix(this.dur, 2);
    this.drums = bus();
    this.bass = bus();
    this.pad = bus();
    this.arp = bus();
    this.keys = bus();
    this.lead = bus();
    this.send = bus(); // extra reverb-only send (snare, fx)
    this.kicks = [];
  }
  t(bar, beat = 0) {
    return bar * this.barLen + beat * this.beat;
  }
  /** Periodic sidechain gain curve from the kick times. */
  duck(depth, release) {
    const env = new Float32Array(this.N).fill(1);
    const L = len(release * 6);
    for (const tk of this.kicks) {
      const s = Math.round(tk * SR);
      for (let j = 0; j < L; j++) {
        const x = j / SR;
        const d = depth * (x < 0.006 ? x / 0.006 : Math.exp(-(x - 0.006) / release));
        const i = (s + j) % this.N;
        if (1 - d < env[i]) env[i] = 1 - d;
      }
    }
    return env;
  }
  applyDuck(mix, env) {
    for (const c of mix.chs) for (let i = 0; i < c.length; i++) c[i] *= env[i % this.N];
  }
  kick(bar, beat, vel, rng, opts = {}) {
    const t = this.t(bar, beat);
    this.kicks.push(t);
    this.drums.add(kick({ rng, vel: 1, ...opts }), t, vel);
  }
  /**
   * Mixdown: sends -> hall convolution, sum, fold to N samples.
   * `sends` = reverb send per bus.
   */
  mixdown({ sends, ir = 'hall', wet = 1, busGains = {} }) {
    const buses = ['drums', 'bass', 'pad', 'arp', 'keys', 'lead'];
    const out = new Mix(this.dur, 2);
    const verbIn = new Mix(this.dur, 2);
    const report = {};
    for (const b of buses) {
      const g = busGains[b] ?? 1;
      out.add(this[b].chs, 0, g);
      if (sends[b]) verbIn.add(this[b].chs, 0, sends[b] * g);
      report[b] = toDb(rms(kWeight(this[b].chs)) * g).toFixed(1);
    }
    verbIn.add(this.send.chs, 0, 1);
    for (const c of verbIn.chs) filt(c, 'hp', 220, 0.7);
    const wetChs = reverb(verbIn.chs, IR(ir), wet, { dry: 0 });
    out.add(wetChs, 0, 1);
    // keep the low end tidy (LTI, so it commutes with the fold)
    for (const c of out.chs) filt(c, 'lowshelf', 85, 0.7, -3);
    if (process.env.AUDIO_DEBUG) console.log('   bus rms dB', JSON.stringify(report));
    return foldTail(out.chs, this.N);
  }
}

/** Pad chords with an absolute-time LFO on the cutoff (period = 4 bars). */
function padBar(song, bar, notes, { rng, gain, cut, att = 0.5, rel = 1.4, gateBars = 1, depth = 0.35 }) {
  const start = song.t(bar);
  const P = song.barLen * 4;
  const lfo = (x) => 1 + depth * Math.sin((TAU * (start + x)) / P);
  for (const nn of notes) song.pad.add(superSaw(f(nn), song.barLen * gateBars - 0.08, { rng, cut, att, rel, lfo, voices: 7, spread: 16 }), start, gain);
}

/* ============================================================ BASE */

const BASE_CHORDS = [
  ['D2', ['A3', 'C4', 'E4', 'F4']], // Dm9
  ['Bb1', ['A3', 'C4', 'D4', 'F4']], // Bbmaj9
  ['F2', ['G3', 'A3', 'C4', 'E4']], // Fmaj9
  ['C2', ['G3', 'A3', 'D4', 'E4']], // C6/9
  ['G1', ['Bb3', 'D4', 'F4', 'A4']], // Gm9
  ['Bb1', ['A3', 'D4', 'F4', 'C5']], // Bbmaj9
  ['F2', ['A3', 'C4', 'F4', 'G4']], // Fadd9
  ['A1', ['G3', 'A3', 'D4', 'E4']], // A7sus4
  ['D2', ['A3', 'C4', 'E4', 'F4']],
  ['Bb1', ['A3', 'C4', 'D4', 'F4']],
  ['F2', ['G3', 'A3', 'C4', 'E4']],
  ['C2', ['G3', 'C4', 'D4', 'E4']], // Cadd9
  ['G1', ['Bb3', 'D4', 'F4', 'A4']],
  ['Bb1', ['A3', 'D4', 'F4', 'C5']],
  ['C2', ['G3', 'Bb3', 'D4', 'E4']], // C9
  ['A1', ['G3', 'A3', 'D4', 'E4']],
];

const BASE_MELODY = [
  [8, 0, 'A4', 1.5], [8, 1.5, 'C5', 0.5], [8, 2, 'D5', 1.5], [8, 3.5, 'E5', 0.5],
  [9, 0, 'F5', 2], [9, 2, 'E5', 1], [9, 3, 'D5', 1],
  [10, 0, 'C5', 1.5], [10, 1.5, 'A4', 0.5], [10, 2, 'C5', 1], [10, 3, 'E5', 1],
  [11, 0, 'D5', 3],
  [12, 0, 'F5', 1.5], [12, 1.5, 'D5', 0.5], [12, 2, 'Bb4', 1], [12, 3, 'A4', 1],
  [13, 0, 'G4', 1], [13, 1, 'Bb4', 1], [13, 2, 'D5', 2],
  [14, 0, 'E5', 1.5], [14, 1.5, 'D5', 0.5], [14, 2, 'C5', 1], [14, 3, 'G4', 1],
  [15, 0, 'A4', 3.5],
];

function musicBase(rng) {
  const s = new Song({ bpm: 96, bars: 16, tail: 5 });
  const B = s.beat;
  BASE_CHORDS.forEach(([root, pad], bar) => {
    const B2 = bar >= 8;
    padBar(s, bar, pad, { rng, gain: 0.075, cut: 1300, att: 0.55, rel: 1.5 });
    // bass
    const pat = B2
      ? [[0, 0.45, 0], [0.5, 0.4, 12], [1, 0.45, 0], [1.5, 0.4, 0], [2, 0.45, 0], [2.5, 0.4, 12], [3, 0.45, 0], [3.5, 0.4, 7]]
      : [[0, 1.5, 0], [1.5, 0.4, 0], [2, 1.4, 0], [3.5, 0.4, 12]];
    for (const [b, g, sh] of pat) s.bass.add(bass(f(root, sh), g * B, { rng, cut: 170, env: 520, envTau: 0.12, drive: 1.3, sub: 0.45 }), s.t(bar, b), 0.3);
    // arp: A = 8ths, B = 16ths; notes = pad an octave up
    const tones = pad.map((n) => f(n, 12));
    const steps = B2 ? 16 : 8;
    const order = B2 ? [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 3, 2, 1, 2] : [0, 2, 1, 3, 2, 0, 3, 1];
    for (let k = 0; k < steps; k++) {
      const b = (k * 4) / steps;
      const acc = k % (steps / 4) === 0 ? 1 : 0.7;
      const x = s.t(bar, b);
      const cutMod = 650 + 450 * (0.5 - 0.5 * Math.cos((TAU * x) / (s.barLen * 8)));
      s.arp.add(pluck(tones[order[k]], (4 / steps) * B * 0.7, { rng, cut: cutMod, env: 1800, envTau: 0.07, q: 1.1, tau: 0.22 }), x, 0.075 * acc, k % 2 ? 0.3 : -0.3);
    }
    // drums
    s.kick(bar, 0, 0.55, rng, { f0: 130, f1: 48, tau: 0.28, click: 0.2 });
    s.kick(bar, 2.5, 0.42, rng, { f0: 130, f1: 48, tau: 0.28, click: 0.2 });
    if (B2) s.kick(bar, 1.75, 0.3, rng, { f0: 130, f1: 48, tau: 0.25, click: 0.15 });
    for (const b of [1, 3]) {
      const sn = snare({ rng, vel: 1, tone: 200, tau: 0.12, body: 0.4, noise: 0.7, bright: 0.8 });
      s.drums.add(sn, s.t(bar, b), 0.22);
      s.send.add(sn, s.t(bar, b), 0.16);
      s.drums.add(clap({ rng }), s.t(bar, b), 0.07);
    }
    const hatSteps = B2 ? 16 : 8;
    if (bar >= 2 || B2) {
      for (let k = 0; k < hatSteps; k++) {
        const b = (k * 4) / hatSteps;
        const onBeat = Math.abs(b - Math.round(b)) < 1e-6;
        s.drums.add(hat({ rng, vel: 1 }), s.t(bar, b), (onBeat ? 0.045 : 0.07) * (B2 ? 0.8 : 1), 0.25);
      }
    }
    if (B2) for (let k = 0; k < 8; k++) s.drums.add(shaker({ rng }), s.t(bar, k * 0.5 + 0.25), 0.05, -0.35);
    if (bar === 7 || bar === 15) {
      s.drums.add(snare({ rng, tau: 0.08 }), s.t(bar, 3.5), 0.12, -0.2);
      s.drums.add(snare({ rng, tau: 0.08 }), s.t(bar, 3.75), 0.16, 0.2);
    }
    if (bar === 15) {
      s.drums.add(tom(f('A2'), { rng }), s.t(bar, 3), 0.18, 0.3);
      s.drums.add(tom(f('F2'), { rng }), s.t(bar, 3.25), 0.18, -0.3);
    }
  });
  // counter bells in the A section
  for (const [bar, nn] of [[1, 'A5'], [3, 'G5'], [5, 'F5'], [7, 'E5']]) {
    s.keys.add(modal(f(nn), 3, { set: BELL, tau: 0.9, rng }), s.t(bar), 0.1, 0.35);
  }
  // e-piano melody in the B section, doubled by a soft bell an octave up
  for (const [bar, b, nn, d] of BASE_MELODY) {
    s.keys.add(epiano(f(nn), d * B * 0.95, { vel: 0.8, rel: 0.6, rng }), s.t(bar, b), 0.2, -0.1);
    s.keys.add(modal(f(nn, 12), 1.5, { set: CHIME, tau: 0.35, rng }), s.t(bar, b), 0.03, 0.2);
  }
  // FX: pad chorus, arp/keys delays, sidechain
  chorus(s.pad.chs[0], s.pad.chs[1], { rate: 1 / (s.barLen * 2), depth: 0.0022, base: 0.012, mix: 0.4 });
  pingPong(s.arp.chs[0], s.arp.chs[1], { time: 0.75 * B, feedback: 0.35, mix: 0.3, lp: 3800 });
  pingPong(s.keys.chs[0], s.keys.chs[1], { time: 1.5 * B, feedback: 0.3, mix: 0.22, lp: 3500 });
  const d = s.duck(0.28, 0.16);
  s.applyDuck(s.pad, d);
  s.applyDuck(s.arp, d);
  s.applyDuck(s.bass, s.duck(0.45, 0.12));
  return s.mixdown({ sends: { drums: 0.05, bass: 0, pad: 0.3, arp: 0.28, keys: 0.35, lead: 0.3 }, busGains: { drums: 0.85, bass: 0.75, pad: 1.5, arp: 2.0, keys: 0.85 } });
}

/* =========================================================== BONUS */

const BONUS_CHORDS = [
  ['D2', ['A3', 'D4', 'F4', 'A4']], // Dm
  ['Bb1', ['Bb3', 'D4', 'F4', 'A4']], // Bbmaj7
  ['F2', ['A3', 'C4', 'F4', 'A4']], // F
  ['C2', ['G3', 'C4', 'E4', 'G4']], // C
  ['D2', ['A3', 'D4', 'F4', 'A4']],
  ['Bb1', ['Bb3', 'D4', 'F4', 'A4']],
  ['G1', ['G3', 'Bb3', 'D4', 'G4']], // Gm
  ['A1', ['G3', 'A3', 'D4', 'E4']], // A7sus4
  ['D2', ['A3', 'D4', 'F4', 'A4']],
  ['Bb1', ['Bb3', 'D4', 'F4', 'A4']],
  ['F2', ['A3', 'C4', 'F4', 'A4']],
  ['C2', ['G3', 'C4', 'E4', 'G4']],
  ['G1', ['G3', 'Bb3', 'D4', 'G4']],
  ['Bb1', ['Bb3', 'D4', 'F4', 'A4']],
  ['C2', ['G3', 'C4', 'E4', 'G4']],
  ['A1', ['G3', 'A3', 'D4', 'E4']],
];

const HOOK = [
  [8, 0, 'D5', 0.75], [8, 0.75, 'F5', 0.75], [8, 1.5, 'A5', 1.5], [8, 3, 'G5', 0.5], [8, 3.5, 'F5', 0.5],
  [9, 0, 'F5', 1.5], [9, 1.5, 'D5', 0.5], [9, 2, 'F5', 1], [9, 3, 'G5', 1],
  [10, 0, 'A5', 0.75], [10, 0.75, 'C6', 0.75], [10, 1.5, 'A5', 1], [10, 2.5, 'G5', 0.5], [10, 3, 'F5', 1],
  [11, 0, 'E5', 2], [11, 2, 'G5', 1], [11, 3, 'E5', 1],
  [12, 0, 'D5', 0.75], [12, 0.75, 'G5', 0.75], [12, 1.5, 'Bb5', 1], [12, 2.5, 'A5', 0.5], [12, 3, 'G5', 1],
  [13, 0, 'F5', 1], [13, 1, 'D5', 1], [13, 2, 'F5', 1], [13, 3, 'A5', 1],
  [14, 0, 'G5', 1.5], [14, 1.5, 'E5', 0.5], [14, 2, 'C5', 1], [14, 3, 'E5', 1],
  [15, 0, 'D5', 2], [15, 2, 'E5', 2],
];
// diatonic third below the hook (DOUBLE REGARD harmony)
const THIRD_BELOW = { D5: 'Bb4', F5: 'D5', A5: 'F5', G5: 'E5', C6: 'A5', E5: 'C5', Bb5: 'G5', C5: 'A4' };
// counter line for the first half of DOUBLE REGARD
const COUNTER = [
  [0, 0, 'D5', 2], [0, 2, 'F5', 2], [1, 0, 'D5', 4], [2, 0, 'C5', 2], [2, 2, 'A4', 2], [3, 0, 'G4', 4],
  [4, 0, 'A4', 2], [4, 2, 'D5', 2], [5, 0, 'F5', 4], [6, 0, 'D5', 2], [6, 2, 'Bb4', 2], [7, 0, 'A4', 4],
];

function bonusTrack(rng, intense) {
  const s = new Song({ bpm: 110, bars: 16, tail: 5 });
  const B = s.beat;
  const scanP = s.barLen * 2;
  BONUS_CHORDS.forEach(([root, pad], bar) => {
    const B2 = bar >= 8;
    padBar(s, bar, pad, { rng, gain: intense ? 0.06 : 0.055, cut: intense ? 2100 : 1600, att: 0.25, rel: 1.0, depth: 0.25 });
    // bass
    if (intense) {
      for (let k = 0; k < 16; k++) {
        const sh = k % 4 === 3 ? 12 : 0;
        s.bass.add(bass(f(root, sh), 0.2 * B, { rng, cut: 200, env: 900, envTau: 0.06, drive: 1.6, sub: 0.4 }), s.t(bar, k * 0.25), k % 4 === 0 ? 0.3 : 0.24);
      }
    } else {
      for (let k = 0; k < 8; k++) {
        const sh = k % 2 ? 12 : 0;
        s.bass.add(bass(f(root, sh), 0.4 * B, { rng, cut: 190, env: 800, envTau: 0.07, drive: 1.5, sub: 0.45 }), s.t(bar, k * 0.5), k % 2 ? 0.24 : 0.3);
      }
    }
    // arps (scan filter sweep, period 2 bars); DOUBLE REGARD = two arps, one per eye (L/R)
    const tones = pad.map((n) => f(n, 12));
    const orderA = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2];
    const orderB = [3, 2, 1, 0, 1, 2, 3, 2, 3, 1, 2, 0, 2, 1, 3, 1];
    for (let k = 0; k < 16; k++) {
      const x = s.t(bar, k * 0.25);
      const ph = (TAU * x) / scanP;
      const cutA = 700 + 1300 * (0.5 - 0.5 * Math.cos(ph));
      const acc = k % 4 === 0 ? 1 : 0.72;
      s.arp.add(pluck(tones[orderA[k]], 0.2 * B, { rng, cut: cutA, env: 2200, envTau: 0.05, q: 2.2, tau: 0.16 }), x, 0.075 * acc, intense ? -0.65 : (k % 2 ? 0.3 : -0.3));
      if (intense) {
        const cutB = 700 + 1300 * (0.5 + 0.5 * Math.cos(ph));
        s.arp.add(pluck(tones[orderB[k]] * 2, 0.18 * B, { rng, cut: cutB, env: 2400, envTau: 0.05, q: 2.2, tau: 0.14 }), x + 0.125 * B, 0.055 * acc, 0.65);
      }
    }
    // drums: four on the floor
    for (let b = 0; b < 4; b++) s.kick(bar, b, intense ? 0.62 : 0.55, rng, { f0: 150, f1: 50, tau: 0.24, click: 0.35 });
    if (intense && (bar % 4 === 3)) s.kick(bar, 3.5, 0.4, rng, { f0: 150, f1: 47, tau: 0.22 });
    for (const b of [1, 3]) {
      const sn = snare({ rng, vel: 1, tone: 190, tau: 0.13, body: 0.5, noise: 0.85 });
      s.drums.add(sn, s.t(bar, b), 0.26);
      s.send.add(sn, s.t(bar, b), 0.12);
      s.drums.add(clap({ rng }), s.t(bar, b), intense ? 0.12 : 0.08);
    }
    for (let k = 0; k < 16; k++) {
      const b = k * 0.25;
      const off = k % 4 === 2;
      if (off) s.drums.add(hat({ rng }), s.t(bar, b), 0.075, 0.2);
      else if (intense || B2) s.drums.add(hat({ rng }), s.t(bar, b), k % 4 === 0 ? 0.03 : 0.04, 0.2);
    }
    if (intense || bar % 2 === 1) s.drums.add(hat({ rng, open: true }), s.t(bar, 3.5), 0.05, -0.2);
    if (bar === 7 || bar === 15) {
      for (const [b, v] of [[3, 0.08], [3.25, 0.11], [3.5, 0.14], [3.75, 0.18]]) s.drums.add(snare({ rng, tau: 0.08 }), s.t(bar, b), v, (b - 3.4) * 0.6);
      if (intense) {
        s.drums.add(tom(f('D3'), { rng }), s.t(bar, 2), 0.18, -0.4);
        s.drums.add(tom(f('A2'), { rng }), s.t(bar, 2.5), 0.18, 0.4);
        const sw = fnoise(B * 2, { rng, color: 'white', mode: 'hp', q: 0.6, f: (x) => 2500 + 4000 * x / (B * 2), amp: (x) => Math.pow(x / (B * 2), 2.5) });
        s.drums.add(sw, s.t(bar, 2), 0.035);
        s.send.add(sw, s.t(bar, 2), 0.04);
      }
    }
    if (bar === 0 || bar === 8) s.drums.add(crash({ rng, dur: 2.4, vel: 1 }), s.t(bar), intense ? 0.1 : 0.08, 0.3);
    // scanner blips on every beat, alternating eyes
    for (let b = 0; b < 4; b++) s.keys.add(modal(f(b % 2 ? 'A6' : 'D7'), 0.2, { set: CHIME, tau: 0.03, rng }), s.t(bar, b + 0.5), 0.025, b % 2 ? 0.7 : -0.7);
  });
  // lead
  const leadNote = (bar, b, nn, d, g, pan = 0) => s.lead.add(lead(f(nn), d * B * 0.92, { rng, cut: 2400, q: 0.8, rel: 0.2, vib: 1 }), s.t(bar, b), g, pan);
  for (const [bar, b, nn, d] of HOOK) {
    leadNote(bar, b, nn, d, 0.13);
    if (intense && THIRD_BELOW[nn]) leadNote(bar, b, THIRD_BELOW[nn], d, 0.07, 0.25);
  }
  if (intense) for (const [bar, b, nn, d] of COUNTER) leadNote(bar, b, nn, d, 0.1, -0.2);
  // FX
  chorus(s.pad.chs[0], s.pad.chs[1], { rate: 1 / (s.barLen * 2), depth: 0.002, base: 0.012, mix: 0.4 });
  pingPong(s.arp.chs[0], s.arp.chs[1], { time: 0.75 * B, feedback: 0.3, mix: 0.25, lp: 4200 });
  pingPong(s.lead.chs[0], s.lead.chs[1], { time: 0.75 * B, feedback: 0.28, mix: 0.2, lp: 4000 });
  pingPong(s.keys.chs[0], s.keys.chs[1], { time: 0.5 * B, feedback: 0.35, mix: 0.4, lp: 6000 });
  const d = s.duck(intense ? 0.4 : 0.34, 0.14);
  s.applyDuck(s.pad, d);
  s.applyDuck(s.arp, s.duck(0.25, 0.12));
  s.applyDuck(s.lead, s.duck(0.15, 0.12));
  s.applyDuck(s.bass, s.duck(0.55, 0.11));
  return s.mixdown({ sends: { drums: 0.04, bass: 0, pad: 0.25, arp: 0.22, keys: 0.3, lead: 0.24 }, busGains: { drums: 0.85, bass: 1.25, pad: 1.8, arp: 2.8, lead: 1.7, keys: 2.5 } });
}

/* ========================================================= REGISTRY */

const mus = (id, gen) => ({
  id, bus: 'music', critical: false, channels: 2, loop: true, loud: null, gen, maxVoices: 2,
  master: { hp: 30, limitDb: -2, rmsDb: -20, targetDb: -1 },
});

export default [
  mus('music_base', musicBase),
  mus('music_bonus', (r) => bonusTrack(r, false)),
  mus('music_bonus_double', (r) => bonusTrack(r, true)),
];

