// CYBER CAT - synthesis building blocks (original code, no samples).
// Voices return Float32Array (mono) or [L, R]; Mix layers them with offsets, gains and pans.
import {
  SR, TAU, len, Osc, SVF, Noise, cents, clamp, envADSR, filt, reverb, makeIR, sat, sampleAt,
} from './dsp.mjs';

const asFn = (v) => (typeof v === 'function' ? v : () => v);

/** Raised-cosine fade over the last `ms` of a generator's buffer so no layer ever ends on a step. */
export function endFade(buf, ms = 6) {
  const n = Math.min(buf.length >> 1, Math.round((ms * SR) / 1000));
  const L = buf.length;
  for (let i = 0; i < n; i++) buf[L - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
  return buf;
}

/* ------------------------------------------------------------------ Mix */

export class Mix {
  constructor(seconds, channels = 1) {
    this.n = len(seconds);
    this.chs = Array.from({ length: channels }, () => new Float32Array(this.n));
  }
  get channels() {
    return this.chs.length;
  }
  ensure(n) {
    if (n <= this.n) return;
    this.chs = this.chs.map((c) => {
      const d = new Float32Array(n);
      d.set(c);
      return d;
    });
    this.n = n;
  }
  /** Add a mono/stereo source (Float32Array, [L,R] or Mix) at `at` seconds. Mono sources are equal-power panned. */
  add(src, at = 0, gain = 1, pan = 0) {
    const s = src instanceof Mix ? src.chs : src instanceof Float32Array ? [src] : src;
    const off = Math.max(0, Math.round(at * SR));
    this.ensure(off + s[0].length);
    if (this.chs.length === 1) {
      const d = this.chs[0];
      const g = gain / s.length;
      for (const c of s) for (let i = 0; i < c.length; i++) d[off + i] += c[i] * g;
    } else if (s.length === 1) {
      const th = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
      const gl = Math.cos(th) * Math.SQRT2 * gain;
      const gr = Math.sin(th) * Math.SQRT2 * gain;
      const [L, R] = this.chs;
      const c = s[0];
      for (let i = 0; i < c.length; i++) {
        L[off + i] += c[i] * gl;
        R[off + i] += c[i] * gr;
      }
    } else {
      const gl = gain * Math.min(1, 1 - pan);
      const gr = gain * Math.min(1, 1 + pan);
      const [L, R] = this.chs;
      for (let i = 0; i < s[0].length; i++) {
        L[off + i] += s[0][i] * gl;
        R[off + i] += s[1][i] * gr;
      }
    }
    return this;
  }
  /** Add a mono source with a time-varying pan (function of time since source start). */
  addPanned(src, at, gain, panFn) {
    const off = Math.max(0, Math.round(at * SR));
    this.ensure(off + src.length);
    if (this.chs.length === 1) return this.add(src, at, gain);
    const [L, R] = this.chs;
    for (let i = 0; i < src.length; i++) {
      const th = ((clamp(panFn(i / SR), -1, 1) + 1) * Math.PI) / 4;
      L[off + i] += src[i] * Math.cos(th) * Math.SQRT2 * gain;
      R[off + i] += src[i] * Math.sin(th) * Math.SQRT2 * gain;
    }
    return this;
  }
  reverb(ir, wet, dry = 1) {
    this.chs = reverb(this.chs, ir, wet, { dry, outChannels: this.chs.length });
    this.n = this.chs[0].length;
    return this;
  }
  filter(type, f, q = 0.707, g = 0) {
    for (const c of this.chs) filt(c, type, f, q, g);
    return this;
  }
  gain(g) {
    for (const c of this.chs) for (let i = 0; i < c.length; i++) c[i] *= g;
    return this;
  }
  /** Mid/side width (1 = unchanged, 0 = mono, >1 wider). */
  width(w) {
    if (this.chs.length < 2) return this;
    const [L, R] = this.chs;
    for (let i = 0; i < L.length; i++) {
      const m = (L[i] + R[i]) * 0.5;
      const s = (L[i] - R[i]) * 0.5 * w;
      L[i] = m + s;
      R[i] = m - s;
    }
    return this;
  }
}

/* ------------------------------------------------------------ IR cache */

const IR_DEFS = {
  // tiny bright room for UI
  short: { seconds: 0.45, rt60: 0.28, bright: 12000, dark: 6000, predelay: 0.003, early: 8, earlySpread: 0.01, seed: 11, build: 0.004 },
  // the rooftop lab for short SFX: tight, bright
  lab: { seconds: 0.9, rt60: 0.55, bright: 12000, dark: 4200, predelay: 0.006, early: 10, earlySpread: 0.02, seed: 17 },
  // the glass rooftop lab, bigger moments: short, bright, airy
  glass: { seconds: 1.5, rt60: 0.95, bright: 12500, dark: 3800, predelay: 0.008, early: 12, earlySpread: 0.028, seed: 23 },
  // dense plate for snares / stabs
  plate: { seconds: 2.2, rt60: 1.6, bright: 10000, dark: 2800, predelay: 0.005, early: 0, seed: 37, build: 0.003 },
  // large hall for fanfares and pads
  hall: { seconds: 3.6, rt60: 2.6, bright: 8500, dark: 1600, predelay: 0.022, early: 14, earlySpread: 0.06, seed: 51, lowCut: 140 },
  // open city space (distant, dark)
  city: { seconds: 4.8, rt60: 3.6, bright: 4800, dark: 900, predelay: 0.045, early: 16, earlySpread: 0.14, seed: 77, lowCut: 70 },
};
const irCache = new Map();
export function IR(name) {
  let ir = irCache.get(name);
  if (!ir) {
    ir = makeIR(IR_DEFS[name]);
    irCache.set(name, ir);
  }
  return ir;
}

/* ------------------------------------------------------------ helpers */

/** Piecewise-linear envelope from [[t, v], ...]. */
export function pw(points) {
  return (t) => {
    if (t <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [t1, v1] = points[i];
      if (t <= t1) {
        const [t0, v0] = points[i - 1];
        return v0 + ((v1 - v0) * (t - t0)) / Math.max(t1 - t0, 1e-9);
      }
    }
    return points[points.length - 1][1];
  };
}

/** Exponential glide from a to b over `dur` s (then holds). */
export const glide = (a, b, dur) => (t) => (t >= dur ? b : a * Math.pow(b / a, t / dur));

/* -------------------------------------------------------------- voices */

/**
 * Generic subtractive voice. f/amp/cut/q may be numbers or functions of t (s).
 * `unison`: array of detune cents. `mode`: lp|bp|hp. `poles`: 2 or 4 (cascaded SVF).
 */
export function tone(dur, {
  wave = 'sine', f = 440, amp = 1, cut = null, q = 0.707, mode = 'lp', unison = null, rng = null,
  drive = 0, poles = 2, pw: pwidth = 0.5,
} = {}) {
  const n = len(dur);
  const out = new Float32Array(n);
  const F = asFn(f), A = asFn(amp), C = cut == null ? null : asFn(cut), Q = asFn(q);
  const dets = (unison || [0]).map((c) => cents(c));
  const oscs = dets.map(() => new Osc(rng ? rng.next() : 0));
  const norm = 1 / Math.sqrt(dets.length);
  const s1 = C ? new SVF() : null;
  const s2 = C && poles > 2 ? new SVF() : null;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const a = A(t);
    const fr = F(t);
    let s = 0;
    for (let k = 0; k < oscs.length; k++) {
      s += wave === 'pulse' ? oscs[k].pulse(fr * dets[k], pwidth) : oscs[k].wave(wave, fr * dets[k]);
    }
    s *= norm;
    if (s1) {
      const fc = C(t);
      const qq = Q(t);
      s = s1.run(s, fc, s2 ? 0.54 : qq, mode);
      if (s2) s = s2.run(s, fc, qq, mode);
    }
    if (drive) s = sat(s, drive);
    out[i] = s * a;
  }
  return endFade(out);
}

/** Filtered noise with functional cutoff/Q/amp. color: white|pink|brown. */
export function fnoise(dur, { rng, color = 'white', mode = 'bp', f = 1000, q = 1, amp = 1, poles = 2 } = {}) {
  const n = len(dur);
  const out = new Float32Array(n);
  const nz = new Noise(rng);
  const F = asFn(f), Q = asFn(q), A = asFn(amp);
  const s1 = mode ? new SVF() : null;
  const s2 = mode && poles > 2 ? new SVF() : null;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = nz.get(color);
    if (s1) {
      const fc = F(t);
      const qq = Q(t);
      s = s1.run(s, fc, s2 ? 0.54 : qq, mode);
      if (s2) s = s2.run(s, fc, qq, mode);
    }
    out[i] = s * A(t);
  }
  return endFade(out);
}

/** Short band-passed noise transient (the "tick" part of a click). */
export function tick({ rng, f = 4000, q = 1.5, dur = 0.004, color = 'white' } = {}) {
  const n = len(dur + 0.012);
  const burst = len(dur);
  const out = new Float32Array(n);
  const nz = new Noise(rng);
  const s = new SVF();
  for (let i = 0; i < n; i++) {
    const x = i < burst ? nz.get(color) * (0.5 - 0.5 * Math.cos((TAU * i) / burst)) : 0;
    out[i] = s.run(x, f, q, 'bp');
  }
  return endFade(out);
}

export const GLASS = { ratios: [1, 2.32, 4.25, 6.63, 9.38], amps: [1, 0.5, 0.28, 0.14, 0.07], taus: [1, 0.6, 0.38, 0.25, 0.16] };
export const CHIME = { ratios: [1, 2.001, 3.01, 4.16, 5.43], amps: [1, 0.32, 0.16, 0.08, 0.04], taus: [1, 0.55, 0.35, 0.24, 0.17] };
export const BELL = { ratios: [0.5, 1, 1.2, 1.5, 2, 2.5, 3.01], amps: [0.25, 1, 0.4, 0.22, 0.32, 0.12, 0.07], taus: [1.0, 1, 0.8, 0.6, 0.45, 0.32, 0.25] };
export const PLATE = { ratios: [1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.5], amps: [1, 0.85, 0.7, 0.5, 0.45, 0.35, 0.28, 0.2], taus: [1, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35] };
export const BAR = { ratios: [1, 2.756, 5.404, 8.933], amps: [1, 0.4, 0.18, 0.08], taus: [1, 0.45, 0.25, 0.15] };

/**
 * Modal (additive) resonator: inharmonic partials with individual decays.
 * `tau` is the fundamental decay; `set.taus` scale it per partial. Detuned pairs add shimmer.
 */
export function modal(f, dur, { set = GLASS, tau = 0.4, rng, detune = 0.0015, attack = 0.0012, pitch = null, bright = 1, pairs = true } = {}) {
  // never truncate a ringing partial: extend until the slowest one has decayed by 60 dB
  let slow = 0;
  for (let k = 0; k < set.ratios.length; k++) if (f * set.ratios[k] <= 17500) slow = Math.max(slow, tau * (set.taus[k] ?? 0.2));
  const n = Math.max(len(dur), len(slow * 6.9 + attack));
  const out = new Float32Array(n);
  let pv = null;
  if (pitch) {
    pv = new Float32Array(n);
    for (let i = 0; i < n; i++) pv[i] = pitch(i / SR);
  }
  const att = Math.max(1, Math.round(attack * SR));
  for (let k = 0; k < set.ratios.length; k++) {
    const fk = f * set.ratios[k];
    if (fk > 17500) continue;
    const a0 = (set.amps[k] ?? 0.05) * (k === 0 ? 1 : Math.pow(bright, k * 0.5));
    const tk = tau * (set.taus[k] ?? 0.2);
    const dec = Math.exp(-1 / (tk * SR));
    const copies = pairs ? 2 : 1;
    for (let v = 0; v < copies; v++) {
      const dv = pairs ? (v === 0 ? -1 : 1) * detune * (0.6 + 0.8 * (rng ? rng.next() : 0.5)) : 0;
      const fv = fk * (1 + dv);
      let ph = rng ? rng.next() : 0;
      let e = a0 / copies;
      for (let i = 0; i < n; i++) {
        const w = i < att ? Math.sin((0.5 * Math.PI * i) / att) : 1;
        out[i] += w * e * Math.sin(TAU * ph);
        ph += (fv * (pv ? pv[i] : 1)) / SR;
        if (ph >= 1) ph -= Math.floor(ph);
        e *= dec;
        if (e < 1e-6) break;
      }
    }
  }
  return endFade(out);
}

/** Two-operator FM (phase modulation) with decaying index. */
export function fm2(f, dur, {
  ratio = 1, index = 1, indexTau = 0.15, indexEnd = 0, tau = 0.4, attack = 0.002, pitch = null, fb = 0, amp = null, rng = null,
} = {}) {
  const n = amp ? len(dur) : Math.max(len(dur), len(tau * 6.9 + attack));
  const out = new Float32Array(n);
  let pc = rng ? rng.next() : 0;
  let pm = rng ? rng.next() : 0;
  let prev = 0;
  const P = pitch ? asFn(pitch) : null;
  const A = amp ? asFn(amp) : null;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const fc = f * (P ? P(t) : 1);
    const I = indexEnd + (index - indexEnd) * Math.exp(-t / indexTau);
    const m = Math.sin(TAU * pm + fb * prev);
    prev = m;
    const v = Math.sin(TAU * pc + I * m);
    pc += fc / SR;
    pm += (fc * ratio) / SR;
    if (pc >= 1) pc -= Math.floor(pc);
    if (pm >= 1) pm -= Math.floor(pm);
    const e = A ? A(t) : (t < attack ? Math.sin((0.5 * Math.PI * t) / attack) : 1) * Math.exp(-t / tau);
    out[i] = v * e;
  }
  return endFade(out);
}

/** Soft sub/impact thump: sine with exponential pitch drop. */
export function thump(dur, { f0 = 140, f1 = 55, pTau = 0.025, tau = 0.12, attack = 0.001, drive = 1.2 } = {}) {
  const n = Math.max(len(dur), len(tau * 6.9 + attack));
  const out = new Float32Array(n);
  let ph = 0;
  const att = Math.max(1, Math.round(attack * SR));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = f1 + (f0 - f1) * Math.exp(-t / pTau);
    const w = i < att ? Math.sin((0.5 * Math.PI * i) / att) : 1;
    out[i] = sat(Math.sin(TAU * ph), drive) * w * Math.exp(-t / tau);
    ph += f / SR;
    if (ph >= 1) ph -= 1;
  }
  return endFade(out);
}

/** Band-passed noise sweep with a bell envelope (whoosh). */
export function whoosh(dur, { rng, f0 = 400, f1 = 3000, q = 1.4, peak = 0.5, color = 'pink', curve = 1 } = {}) {
  return fnoise(dur, {
    rng, color, mode: 'bp', q,
    f: (t) => f0 * Math.pow(f1 / f0, Math.pow(clamp(t / dur, 0, 1), curve)),
    amp: (t) => {
      const x = t / dur;
      if (x <= 0 || x >= 1) return 0;
      return x < peak ? Math.pow(Math.sin((0.5 * Math.PI * x) / peak), 2) : Math.pow(Math.cos((0.5 * Math.PI * (x - peak)) / (1 - peak)), 1.5);
    },
  });
}

/** Scatter of tiny glass grains (stereo if `mix` is stereo). Adds into `mix` and returns it. */
export function sparkle(mix, { rng, notes, t0 = 0, t1 = 0.3, count = 10, gain = 0.3, tau = [0.04, 0.12], spread = 0.8, set = GLASS, curve = 1 } = {}) {
  for (let k = 0; k < count; k++) {
    const u = Math.pow(rng.next(), curve);
    const t = t0 + (t1 - t0) * u;
    const f = rng.pick(notes);
    const tt = rng.range(tau[0], tau[1]);
    const g = modal(f, tt * 6 + 0.02, { set, tau: tt, rng, attack: 0.0015 });
    mix.add(g, t, gain * rng.range(0.45, 1), rng.bi() * spread);
  }
  return mix;
}

/* ---------------------------------------------------------- instruments */

/** Warm synth brass (poly-synth style): detuned saws, scoop, delayed vibrato, swelling low-pass. */
export function brass(f, gate, { rng, bright = 1, rel = 0.32, vib = 1, scoop = 1, att = 0.022, voices = 4 } = {}) {
  const dur = gate + rel + 0.02;
  const n = len(dur);
  const out = new Float32Array(n);
  const dets = [-10, -3.5, 3, 9.5, 15].slice(0, voices).map((c) => cents(c));
  const oscs = dets.map(() => new Osc(rng.next()));
  const s1 = new SVF(), s2 = new SVF();
  const vibPh = rng.next();
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const sc = 1 - 0.022 * scoop * Math.exp(-t / 0.03);
    const vd = clamp((t - 0.22) / 0.3, 0, 1);
    const vb = 1 + vib * 0.0035 * vd * Math.sin(TAU * (5.2 * t + vibPh));
    let s = 0;
    for (let k = 0; k < oscs.length; k++) s += oscs[k].saw(f * sc * vb * dets[k]);
    s /= Math.sqrt(oscs.length);
    const fe = envADSR(t, 0.075, 0.4, 0.55, rel, gate);
    const fc = Math.min(15000, 300 + f * 1.1 + bright * 3600 * fe);
    s = s1.run(s, fc, 0.54, 'lp');
    s = s2.run(s, fc, 0.9, 'lp');
    out[i] = sat(s * 1.2, 1.3) * envADSR(t, att, 0.3, 0.8, rel, gate);
  }
  return endFade(out);
}

/** Supersaw pad, stereo. `lfo(t)` multiplies the cutoff. */
export function superSaw(f, gate, {
  rng, voices = 7, spread = 18, cut = 2000, q = 0.75, att = 0.35, dec = 0.6, sus = 0.85, rel = 1.1, lfo = null, drive = 0, brightEnv = 0,
} = {}) {
  const dur = gate + rel + 0.02;
  const n = len(dur);
  const L = new Float32Array(n), R = new Float32Array(n);
  const dets = [];
  for (let k = 0; k < voices; k++) dets.push(cents(voices === 1 ? 0 : -spread + (2 * spread * k) / (voices - 1)));
  const oscs = dets.map(() => new Osc(rng.next()));
  const pans = dets.map((_, k) => (voices === 1 ? 0 : -1 + (2 * k) / (voices - 1)) * (k % 2 ? -0.85 : 0.85));
  const gl = pans.map((p) => Math.cos(((p + 1) * Math.PI) / 4));
  const gr = pans.map((p) => Math.sin(((p + 1) * Math.PI) / 4));
  const fl = [new SVF(), new SVF()], fr = [new SVF(), new SVF()];
  const norm = 1 / Math.sqrt(voices);
  const LF = lfo ? asFn(lfo) : null;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let l = 0, r = 0;
    for (let k = 0; k < oscs.length; k++) {
      const s = oscs[k].saw(f * dets[k]);
      l += s * gl[k];
      r += s * gr[k];
    }
    const e = envADSR(t, att, dec, sus, rel, gate);
    const fc = cut * (LF ? LF(t) : 1) * (1 + brightEnv * e);
    l = fl[1].run(fl[0].run(l * norm, fc, 0.54, 'lp'), fc, q, 'lp');
    r = fr[1].run(fr[0].run(r * norm, fc, 0.54, 'lp'), fc, q, 'lp');
    if (drive) {
      l = sat(l, drive);
      r = sat(r, drive);
    }
    L[i] = l * e;
    R[i] = r * e;
  }
  return [endFade(L), endFade(R)];
}

/** Plucked synth (arp): saw pair through an enveloped resonant low-pass. */
export function pluck(f, gate, { rng, cut = 600, env = 3500, envTau = 0.08, q = 1.3, tau = 0.35, rel = 0.06, wave = 'saw', det = 7, sub = 0 } = {}) {
  const dur = gate + rel + 0.01;
  const n = len(dur);
  const out = new Float32Array(n);
  const o1 = new Osc(rng.next()), o2 = new Osc(rng.next()), o3 = new Osc(rng.next());
  const d1 = cents(-det), d2 = cents(det);
  const s1 = new SVF(), s2 = new SVF();
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = (o1.wave(wave, f * d1) + o2.wave(wave, f * d2)) * 0.6;
    if (sub) s += o3.sin(f * 0.5) * sub;
    const fc = cut + env * Math.exp(-t / envTau);
    s = s2.run(s1.run(s, fc, 0.54, 'lp'), fc, q, 'lp');
    const a = (t < 0.002 ? t / 0.002 : 1) * Math.exp(-t / tau) * envADSR(t, 0.0005, 0.001, 1, rel, gate);
    out[i] = s * a;
  }
  return endFade(out);
}

/** Synth bass: saw + sine sub, enveloped low-pass, gentle saturation. */
export function bass(f, gate, { rng, cut = 170, env = 650, envTau = 0.1, q = 1.1, sub = 0.8, rel = 0.05, drive = 1.6, att = 0.004, sus = 0.75 } = {}) {
  const dur = gate + rel + 0.01;
  const n = len(dur);
  const out = new Float32Array(n);
  const o1 = new Osc(rng.next()), o2 = new Osc(rng.next()), o3 = new Osc(0);
  const s1 = new SVF(), s2 = new SVF();
  const dA = f * cents(-4), dB = f * cents(4);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = (o1.saw(dA) + o2.saw(dB)) * 0.5;
    const fc = cut + env * Math.exp(-t / envTau);
    s = s2.run(s1.run(s, fc, 0.54, 'lp'), fc, q, 'lp');
    s += o3.sin(f) * sub;
    out[i] = sat(s, drive) * envADSR(t, att, 0.25, sus, rel, gate);
  }
  return endFade(out);
}

/** FM electric piano (DX-style): body pair + short tine. */
export function epiano(f, gate, { vel = 1, rel = 0.45, rng = null } = {}) {
  const dur = gate + rel + 0.02;
  const n = len(dur);
  const out = new Float32Array(n);
  let p1 = rng ? rng.next() : 0, m1 = 0, p2 = 0, m2 = 0;
  const decay = 1.3 * Math.pow(440 / f, 0.35);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const I1 = 0.2 + 1.1 * vel * Math.exp(-t / 0.5);
    const body = Math.sin(TAU * p1 + I1 * Math.sin(TAU * m1));
    const tine = Math.sin(TAU * p2 + 0.9 * Math.sin(TAU * m2)) * 0.22 * vel * Math.exp(-t / 0.05);
    p1 += f / SR; m1 += f / SR; p2 += f / SR; m2 += (f * 14) / SR;
    if (p1 >= 1) p1 -= 1;
    if (m1 >= 1) m1 -= 1;
    if (p2 >= 1) p2 -= 1;
    if (m2 >= 1) m2 -= Math.floor(m2);
    const a = (t < 0.002 ? t / 0.002 : 1) * Math.exp(-t / decay) * envADSR(t, 0.0005, 0.001, 1, rel, gate);
    out[i] = (body * 0.8 + tine) * a;
  }
  return endFade(out);
}

/** Soft saw/pulse lead with glide (freq function), vibrato and filter. */
export function lead(fFn, gate, { rng, cut = 2600, q = 0.9, rel = 0.18, vib = 1, att = 0.012, det = 6, wave = 'saw' } = {}) {
  const dur = gate + rel + 0.02;
  const n = len(dur);
  const out = new Float32Array(n);
  const o1 = new Osc(rng.next()), o2 = new Osc(rng.next()), o3 = new Osc(rng.next());
  const s1 = new SVF(), s2 = new SVF();
  const F = asFn(fFn);
  const d1 = cents(-det), d2 = cents(det);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const vd = clamp((t - 0.18) / 0.25, 0, 1);
    const fv = F(t) * (1 + vib * 0.004 * vd * Math.sin(TAU * 5.4 * t));
    let s = (o1.wave(wave, fv * d1) + o2.wave(wave, fv * d2)) * 0.55 + o3.sin(fv) * 0.35;
    const e = envADSR(t, att, 0.25, 0.8, rel, gate);
    const fc = cut * (0.55 + 0.45 * e);
    s = s2.run(s1.run(s, fc, 0.54, 'lp'), fc, q, 'lp');
    out[i] = s * e;
  }
  return endFade(out);
}

/* --------------------------------------------------------------- drums */

export function kick({ rng, vel = 1, f0 = 155, f1 = 46, pTau = 0.032, tau = 0.3, click = 0.35, dur = 0.55, drive = 1.4 } = {}) {
  const out = thump(dur, { f0, f1, pTau, tau, drive, attack: 0.0008 });
  const n = out.length;
  const c = tick({ rng, f: 3200, q: 0.8, dur: 0.003 });
  for (let i = 0; i < n; i++) out[i] = (out[i] + (i < c.length ? c[i] * click : 0)) * vel;
  // gentle tail fade so the release reaches zero
  const fl = Math.min(n, len(0.05));
  for (let i = 0; i < fl; i++) out[n - 1 - i] *= i / fl;
  return out;
}

export function snare({ rng, vel = 1, tone: tf = 190, tau = 0.13, body = 0.55, noise = 0.9, dur = 0.45, bright = 1 } = {}) {
  const n = len(dur);
  const out = new Float32Array(n);
  const b1 = thump(dur, { f0: tf * 1.5, f1: tf, pTau: 0.012, tau: 0.07, drive: 1 });
  const b2 = thump(dur, { f0: tf * 2.6, f1: tf * 1.75, pTau: 0.01, tau: 0.05, drive: 1 });
  const nz = fnoise(dur, {
    rng, color: 'white', mode: 'bp', f: 3200 * bright, q: 0.55,
    amp: (t) => (t < 0.0015 ? t / 0.0015 : 1) * Math.exp(-t / tau),
  });
  filt(nz, 'highshelf', 9000, 0.7, -6);
  for (let i = 0; i < n; i++) out[i] = (b1[i] * body + b2[i] * body * 0.4 + nz[i] * noise) * vel;
  const fl = Math.min(n, len(0.04));
  for (let i = 0; i < fl; i++) out[n - 1 - i] *= i / fl;
  return out;
}

export function clap({ rng, vel = 1, dur = 0.4 } = {}) {
  const n = len(dur);
  const out = new Float32Array(n);
  const hits = [0, 0.009, 0.019, 0.028];
  const nz = new Noise(rng);
  const s = new SVF();
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let a = 0;
    for (let h = 0; h < hits.length; h++) {
      const dt = t - hits[h];
      if (dt >= 0) a += (h === hits.length - 1 ? Math.exp(-dt / 0.11) : Math.exp(-dt / 0.006)) * (dt < 0.0008 ? dt / 0.0008 : 1);
    }
    out[i] = s.run(nz.white(), 1250, 0.9, 'bp') * a * vel;
  }
  return endFade(out);
}

const HAT_F = [205.3, 304.4, 369.6, 522.7, 540, 800].map((x) => x * 1.6);
export function hat({ rng, vel = 1, open = false } = {}) {
  const dur = open ? 0.45 : 0.1;
  const n = len(dur);
  const out = new Float32Array(n);
  const oscs = HAT_F.map(() => new Osc(rng.next()));
  const nz = new Noise(rng);
  const bp = new SVF(), hp = new SVF();
  const tau = open ? 0.14 : 0.022;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    for (let k = 0; k < oscs.length; k++) s += oscs[k].pulse(HAT_F[k], 0.5);
    s = s * 0.15 + nz.white() * 0.5;
    s = bp.run(s, 10500, 0.7, 'bp');
    s = hp.run(s, 7200, 0.7, 'hp');
    out[i] = s * (t < 0.0008 ? t / 0.0008 : 1) * Math.exp(-t / tau) * vel;
  }
  filt(out, 'highshelf', 12000, 0.7, -5);
  const fl = Math.min(n, len(0.01));
  for (let i = 0; i < fl; i++) out[n - 1 - i] *= i / fl;
  return out;
}

export function shaker({ rng, vel = 1 } = {}) {
  return fnoise(0.09, {
    rng, color: 'white', mode: 'bp', f: 7500, q: 0.9,
    amp: (t) => vel * (t < 0.012 ? Math.sin((0.5 * Math.PI * t) / 0.012) : Math.exp(-(t - 0.012) / 0.018)) * (t > 0.085 ? (0.09 - t) / 0.005 : 1),
  });
}

export function tom(f, { rng, vel = 1, tau = 0.22 } = {}) {
  const b = thump(0.7, { f0: f * 1.8, f1: f, pTau: 0.04, tau, drive: 1.2 });
  const nz = fnoise(0.7, { rng, color: 'pink', mode: 'bp', f: f * 6, q: 0.8, amp: (t) => Math.exp(-t / 0.03) });
  for (let i = 0; i < b.length; i++) b[i] = (b[i] + (i < nz.length ? nz[i] * 0.35 : 0)) * vel;
  return endFade(b);
}

/** Soft, dark-ish crash cymbal (metallic partials + noise). */
export function crash({ rng, dur = 2.4, vel = 1, tau = 0.8 } = {}) {
  const n = len(dur);
  const out = new Float32Array(n);
  const fr = [];
  for (let k = 0; k < 14; k++) fr.push(rng.range(280, 1100));
  const oscs = fr.map(() => new Osc(rng.next()));
  const nz = new Noise(rng);
  const hp = new SVF(), lp = new SVF();
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    for (let k = 0; k < oscs.length; k++) s += oscs[k].pulse(fr[k], 0.5);
    s = s * 0.08 + nz.white() * 0.6;
    s = hp.run(s, 5200, 0.6, 'hp');
    s = lp.run(s, 11000 - 5000 * Math.min(1, t / dur), 0.6, 'lp');
    const a = (t < 0.004 ? t / 0.004 : 1) * (0.35 * Math.exp(-t / 0.06) + 0.65 * Math.exp(-t / tau));
    out[i] = s * a * vel;
  }
  const fl = Math.min(n, len(0.2));
  for (let i = 0; i < fl; i++) out[n - 1 - i] *= i / fl;
  return out;
}

/* -------------------------------------------------------------- doppler */

/**
 * Render a moving source past the listener. `src` is sampled at source time ts = t0 + i/SR.
 * Straight path along x at `speed` m/s, perpendicular distance `dist`, closest at `tClose` (s).
 * Returns stereo [L, R] of length `dur`: propagation delay (doppler), 1/r gain, air absorption, pan.
 */
export function dopplerPass(src, srcT0, dur, { speed = 40, dist = 15, tClose = 1, c = 343, rRef = null, direction = 1, maxPan = 0.95 } = {}) {
  const n = len(dur);
  const L = new Float32Array(n), R = new Float32Array(n);
  const ref = rRef ?? dist;
  const lpf = new SVF();
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let te = t;
    for (let it = 0; it < 4; it++) {
      const x = speed * (te - tClose);
      te = t - Math.sqrt(x * x + dist * dist) / c;
    }
    const x = speed * (te - tClose) * direction;
    const r = Math.sqrt(x * x + dist * dist);
    let s = sampleAt(src, (te - srcT0) * SR);
    const fc = clamp(16000 * Math.pow(dist / r, 1.3), 900, 16000);
    s = lpf.run(s, fc, 0.6, 'lp') * (ref / r);
    const pan = clamp(x / r, -1, 1) * maxPan;
    const th = ((pan + 1) * Math.PI) / 4;
    L[i] = s * Math.cos(th) * Math.SQRT2;
    R[i] = s * Math.sin(th) * Math.SQRT2;
  }
  return [L, R];
}

/* --------------------------------------------------------------- misc */

/** Mono sum helper. */
export function sum(...bufs) {
  const n = Math.max(...bufs.map((b) => b.length));
  const out = new Float32Array(n);
  for (const b of bufs) for (let i = 0; i < b.length; i++) out[i] += b[i];
  return out;
}
