// CYBER CAT - core offline DSP (pure JS, deterministic, 48 kHz).
// Everything here is original code: oscillators, filters, envelopes, FFT convolution,
// synthetic impulse responses, limiter, true-peak meter, loop helpers, analysis.

export const SR = 48000;
export const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ RNG */

/** FNV-1a 32-bit hash, used to derive one seed per cue id. */
export function seedFrom(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 seeded generator with a few helpers. */
export function makeRng(seed) {
  let a = seed >>> 0 || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    bi: () => next() * 2 - 1,
    int: (n) => Math.floor(next() * n),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    fork: (salt) => makeRng((Math.floor(next() * 4294967296) ^ seedFrom(String(salt))) >>> 0),
  };
  return rng;
}

/* -------------------------------------------------------------- units */

export const db = (d) => Math.pow(10, d / 20);
export const toDb = (g) => 20 * Math.log10(Math.max(Math.abs(g), 1e-12));
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const cents = (c) => Math.pow(2, c / 1200);
export const semis = (s) => Math.pow(2, s / 12);
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, x) => a + (b - a) * x;

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'D4' -> 62, 'Bb3' -> 58, 'C#5' -> 73 */
export function nm(name) {
  const m = /^([A-G])([b#]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  const pc = PC[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0);
  return (parseInt(m[3], 10) + 1) * 12 + pc;
}
/** note name -> Hz (A4 = 440). */
export const hz = (name) => mtof(nm(name));

/** Quantize a frequency so that it is exactly periodic over `period` seconds (seamless loops). */
export const qf = (f, period) => Math.max(1, Math.round(f * period)) / period;

/* ------------------------------------------------------------ buffers */

export const len = (s) => Math.max(1, Math.round(s * SR));
export const zeros = (n) => new Float32Array(n);

export function copyChs(chs) {
  return chs.map((c) => Float32Array.from(c));
}

export function hasBadSamples(chs) {
  for (const c of chs) for (let i = 0; i < c.length; i++) if (!Number.isFinite(c[i])) return true;
  return false;
}

/* --------------------------------------------------------- envelopes */

/** Smooth attack (half cosine over `a` s) then exponential decay with time constant `tau`. */
export function envAD(t, a, tau) {
  if (t <= 0) return 0;
  if (t < a) return 0.5 - 0.5 * Math.cos((Math.PI * t) / a);
  return Math.exp(-(t - a) / tau);
}

/** ADSR with a release that reaches exactly 0 after `r` s (no step at the end). */
export function envADSR(t, a, d, s, r, gate) {
  if (t <= 0) return 0;
  const on = (x) => {
    if (x < a) return 0.5 - 0.5 * Math.cos((Math.PI * x) / a);
    return s + (1 - s) * Math.exp(((a - x) * 4) / Math.max(d, 1e-4));
  };
  if (t < gate) return on(t);
  const x = (t - gate) / Math.max(r, 1e-4);
  if (x >= 1) return 0;
  const E = Math.exp(-5);
  return (on(gate) * (Math.exp(-5 * x) - E)) / (1 - E);
}

/** Bell-shaped swell: 0 at t=0, 1 at `peak`, back to 0 at `end` (raised cosine halves). */
export function envBell(t, peak, end) {
  if (t <= 0 || t >= end) return 0;
  if (t < peak) return 0.5 - 0.5 * Math.cos((Math.PI * t) / peak);
  return 0.5 + 0.5 * Math.cos((Math.PI * (t - peak)) / (end - peak));
}

/** Hann window value for x in [0, 1]. */
export const hann = (x) => (x <= 0 || x >= 1 ? 0 : 0.5 - 0.5 * Math.cos(TAU * x));

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Raised-cosine fade in over n samples (first sample becomes exactly 0). */
export function fadeIn(ch, n) {
  n = Math.min(n, ch.length);
  for (let i = 0; i < n; i++) ch[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
  return ch;
}
/** Raised-cosine fade out over n samples (last sample becomes exactly 0). */
export function fadeOut(ch, n) {
  n = Math.min(n, ch.length);
  const L = ch.length;
  for (let i = 0; i < n; i++) ch[L - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
  return ch;
}

/* ------------------------------------------------------- oscillators */

export function polyBlep(t, dt) {
  if (dt <= 0) return 0;
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

/** Phase-accumulating oscillator with band-limited (polyBLEP) saw/pulse. */
export class Osc {
  constructor(phase = 0) {
    this.p = phase - Math.floor(phase);
  }
  adv(f) {
    this.p += f / SR;
    if (this.p >= 1 || this.p < 0) this.p -= Math.floor(this.p);
  }
  sin(f) {
    const v = Math.sin(TAU * this.p);
    this.adv(f);
    return v;
  }
  saw(f) {
    const dt = Math.abs(f) / SR;
    const v = 2 * this.p - 1 - polyBlep(this.p, dt);
    this.adv(f);
    return v;
  }
  pulse(f, w = 0.5) {
    const dt = Math.abs(f) / SR;
    let v = this.p < w ? 1 : -1;
    v += polyBlep(this.p, dt);
    let q = this.p - w;
    if (q < 0) q += 1;
    v -= polyBlep(q, dt);
    this.adv(f);
    return v;
  }
  tri(f) {
    const v = 1 - 4 * Math.abs(this.p - 0.5);
    this.adv(f);
    return v;
  }
  wave(kind, f) {
    switch (kind) {
      case 'saw':
        return this.saw(f);
      case 'square':
        return this.pulse(f, 0.5);
      case 'pulse':
        return this.pulse(f, 0.3);
      case 'tri':
        return this.tri(f);
      default:
        return this.sin(f);
    }
  }
}

/* ------------------------------------------------------------- noise */

export class Noise {
  constructor(rng) {
    this.rng = rng;
    this.b0 = this.b1 = this.b2 = this.b3 = this.b4 = this.b5 = this.b6 = 0;
    this.br = 0;
  }
  white() {
    return this.rng.next() * 2 - 1;
  }
  /** Paul Kellet's refined pink filter, ~unit RMS-ish scaling. */
  pink() {
    const w = this.rng.next() * 2 - 1;
    this.b0 = 0.99886 * this.b0 + w * 0.0555179;
    this.b1 = 0.99332 * this.b1 + w * 0.0750759;
    this.b2 = 0.969 * this.b2 + w * 0.153852;
    this.b3 = 0.8665 * this.b3 + w * 0.3104856;
    this.b4 = 0.55 * this.b4 + w * 0.5329522;
    this.b5 = -0.7616 * this.b5 - w * 0.016898;
    const v = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + w * 0.5362;
    this.b6 = w * 0.115926;
    return v * 0.16;
  }
  /** Leaky-integrated (brown/red) noise. */
  brown() {
    const w = this.rng.next() * 2 - 1;
    this.br = 0.996 * this.br + w * 0.06;
    return this.br * 2.2;
  }
  get(color) {
    return color === 'pink' ? this.pink() : color === 'brown' ? this.brown() : this.white();
  }
}

/* ----------------------------------------------------------- filters */

/** Topology-preserving state variable filter (Zavalishin / Cytomic). Safe under fast modulation. */
export class SVF {
  constructor() {
    this.ic1 = 0;
    this.ic2 = 0;
    this.lp = 0;
    this.bp = 0;
    this.hp = 0;
  }
  process(x, fc, q = 0.707) {
    const g = Math.tan((Math.PI * clamp(fc, 5, SR * 0.47)) / SR);
    const k = 1 / Math.max(q, 0.05);
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x - this.ic2;
    const v1 = a1 * this.ic1 + a2 * v3;
    const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2;
    this.bp = k * v1; // unity gain at the centre frequency
    this.hp = x - k * v1 - v2;
    return v2;
  }
  run(x, fc, q, mode) {
    this.process(x, fc, q);
    return mode === 'hp' ? this.hp : mode === 'bp' ? this.bp : this.lp;
  }
}

/** RBJ cookbook biquad (transposed direct form II). */
export class Biquad {
  constructor(type, f, q = 0.707, gainDb = 0) {
    this.z1 = 0;
    this.z2 = 0;
    this.set(type, f, q, gainDb);
  }
  set(type, f, q = 0.707, gainDb = 0) {
    const w0 = (TAU * clamp(f, 1, SR * 0.49)) / SR;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const alpha = sw / (2 * q);
    const A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'lp':
        b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case 'hp':
        b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case 'bp':
        b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case 'notch':
        b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case 'peak':
        b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
        break;
      case 'lowshelf': {
        const s2 = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 - (A - 1) * cw + s2); b1 = 2 * A * (A - 1 - (A + 1) * cw); b2 = A * (A + 1 - (A - 1) * cw - s2);
        a0 = A + 1 + (A - 1) * cw + s2; a1 = -2 * (A - 1 + (A + 1) * cw); a2 = A + 1 + (A - 1) * cw - s2;
        break;
      }
      case 'highshelf': {
        const s2 = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 + (A - 1) * cw + s2); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - s2);
        a0 = A + 1 - (A - 1) * cw + s2; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - s2;
        break;
      }
      default:
        throw new Error(`biquad type ${type}`);
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  process(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/** In-place static biquad over a channel. */
export function filt(ch, type, f, q = 0.707, gainDb = 0) {
  const b = new Biquad(type, f, q, gainDb);
  for (let i = 0; i < ch.length; i++) ch[i] = b.process(ch[i]);
  return ch;
}

/** Apply a static filter to a looping buffer so its state wraps (runs 3 periods, keeps the last). */
export function filtPeriodic(ch, type, f, q = 0.707, gainDb = 0, cycles = 3) {
  const b = new Biquad(type, f, q, gainDb);
  const n = ch.length;
  for (let c = 0; c < cycles - 1; c++) for (let i = 0; i < n; i++) b.process(ch[i]);
  for (let i = 0; i < n; i++) ch[i] = b.process(ch[i]);
  return ch;
}

/** Soft saturation normalised so small signals keep unity gain. */
export function sat(x, drive = 1) {
  return Math.tanh(x * drive) / drive;
}

/* -------------------------------------------------------------- FFT */

const twiddleCache = new Map();
function twiddles(n) {
  let t = twiddleCache.get(n);
  if (!t) {
    const c = new Float64Array(n / 2);
    const s = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      c[i] = Math.cos((TAU * i) / n);
      s[i] = Math.sin((TAU * i) / n);
    }
    t = { c, s };
    twiddleCache.clear();
    twiddleCache.set(n, t);
  }
  return t;
}

/** In-place iterative radix-2 complex FFT. `inverse` scales by 1/n. */
export function fft(re, im, inverse = false) {
  const n = re.length;
  if (n & (n - 1)) throw new Error('fft size must be a power of 2');
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
      tmp = im[i]; im[i] = im[j]; im[j] = tmp;
    }
  }
  const { c, s } = twiddles(n);
  const sign = inverse ? 1 : -1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const wr = c[k];
        const wi = sign * s[k];
        const a = i + j;
        const b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

export const nextPow2 = (n) => {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
};

/**
 * Stereo FFT convolution: yL = xL * hL, yR = xR * hR.
 * Two real signals are packed into one complex FFT (x = xL + i xR), same for the IRs.
 */
export function convolve2(xL, xR, hL, hR) {
  const outLen = xL.length + hL.length - 1;
  const n = nextPow2(outLen);
  const Xr = new Float64Array(n), Xi = new Float64Array(n);
  Xr.set(xL); Xi.set(xR);
  fft(Xr, Xi);
  const Hr = new Float64Array(n), Hi = new Float64Array(n);
  Hr.set(hL); Hi.set(hR);
  fft(Hr, Hi);
  // Process conjugate pairs (k, n-k) so the result can be written in place.
  const mulPair = (k, nk) => {
    const ar = Xr[k], ai = Xi[k], br = Xr[nk], bi = -Xi[nk];
    const hr1 = Hr[k], hi1 = Hi[k], hr2 = Hr[nk], hi2 = -Hi[nk];
    const xlr = (ar + br) / 2, xli = (ai + bi) / 2;
    const xrr = (ai - bi) / 2, xri = -(ar - br) / 2;
    const hlr = (hr1 + hr2) / 2, hli = (hi1 + hi2) / 2;
    const hrr = (hi1 - hi2) / 2, hri = -(hr1 - hr2) / 2;
    const ylr = xlr * hlr - xli * hli, yli = xlr * hli + xli * hlr;
    const yrr = xrr * hrr - xri * hri, yri = xrr * hri + xri * hrr;
    return [ylr - yri, yli + yrr];
  };
  for (let k = 0; k <= n / 2; k++) {
    const nk = (n - k) & (n - 1);
    const a = mulPair(k, nk);
    const b = nk !== k ? mulPair(nk, k) : a;
    Xr[k] = a[0]; Xi[k] = a[1];
    Xr[nk] = b[0]; Xi[nk] = b[1];
  }
  fft(Xr, Xi, true);
  const L = new Float32Array(outLen), R = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) { L[i] = Xr[i]; R[i] = Xi[i]; }
  return [L, R];
}

/** Mono FFT convolution. */
export function convolve(x, h) {
  return convolve2(x, new Float32Array(x.length), h, new Float32Array(h.length))[0];
}

/* ------------------------------------------------------ reverb (IR) */

/**
 * Synthetic stereo impulse response: sparse early reflections + dense exponentially decaying
 * noise whose brightness falls over time (air/wall absorption). Energy-normalised per channel.
 */
export function makeIR({
  seconds = 1.5, rt60 = 1.2, bright = 9000, dark = 2500, predelay = 0.01,
  early = 10, earlySpread = 0.035, lowCut = 120, width = 1, seed = 1, build = 0.012,
} = {}) {
  const n = len(seconds);
  const rng = makeRng(seed);
  const chs = [new Float32Array(n), new Float32Array(n)];
  const pd = Math.round(predelay * SR);
  for (let c = 0; c < 2; c++) {
    const ch = chs[c];
    let lp1 = 0, lp2 = 0;
    for (let i = pd; i < n; i++) {
      const t = (i - pd) / SR;
      const env = Math.exp((-6.9078 * t) / rt60);
      const on = t < build ? Math.sin((0.5 * Math.PI * t) / build) : 1;
      const fc = dark + (bright - dark) * Math.exp(-t / (rt60 * 0.3));
      const a = 1 - Math.exp((-TAU * fc) / SR);
      lp1 += a * (rng.bi() - lp1);
      lp2 += a * (lp1 - lp2);
      ch[i] = lp2 * env * on;
    }
    // early reflections: short smoothed taps
    for (let k = 0; k < early; k++) {
      const tt = predelay * 0.4 + rng.next() * earlySpread;
      const idx = Math.round(tt * SR);
      const amp = (rng.next() < 0.5 ? -1 : 1) * (0.4 + 0.6 * rng.next()) * Math.exp(-tt / (rt60 * 0.25)) * 0.25;
      for (let j = -3; j <= 3; j++) {
        const w = 0.5 + 0.5 * Math.cos((Math.PI * j) / 4);
        if (idx + j >= 0 && idx + j < n) ch[idx + j] += amp * w;
      }
    }
    filt(ch, 'hp', lowCut, 0.6);
    fadeOut(ch, Math.round(n * 0.08));
  }
  // width (mid/side)
  if (width !== 1) {
    for (let i = 0; i < n; i++) {
      const m = (chs[0][i] + chs[1][i]) * 0.5;
      const s = (chs[0][i] - chs[1][i]) * 0.5 * width;
      chs[0][i] = m + s;
      chs[1][i] = m - s;
    }
  }
  for (const ch of chs) {
    let e = 0;
    for (let i = 0; i < n; i++) e += ch[i] * ch[i];
    const g = 1 / Math.sqrt(e || 1);
    for (let i = 0; i < n; i++) ch[i] *= g;
  }
  return chs;
}

/**
 * Convolution reverb. Input: 1 or 2 channels. Output channel count = outChannels (1 or 2).
 * Returns new channels = dry*dryGain + wet*wetGain, extended by the IR length.
 */
export function reverb(chs, ir, wet, { dry = 1, outChannels = chs.length } = {}) {
  const xL = chs[0];
  const xR = chs.length > 1 ? chs[1] : chs[0];
  const [wL, wR] = convolve2(xL, xR, ir[0], ir[1]);
  const n = wL.length;
  if (outChannels === 1) {
    const out = new Float32Array(n);
    const src = chs.length > 1 ? null : chs[0];
    for (let i = 0; i < n; i++) {
      const d = i < xL.length ? (src ? src[i] : (chs[0][i] + chs[1][i]) * 0.5) : 0;
      out[i] = d * dry + (wL[i] + wR[i]) * 0.5 * wet * 1.41;
    }
    return [out];
  }
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const dl = i < xL.length ? xL[i] : 0;
    const dr = i < xR.length ? xR[i] : 0;
    L[i] = dl * dry + wL[i] * wet;
    R[i] = dr * dry + wR[i] * wet;
  }
  return [L, R];
}

/* ----------------------------------------------------------- delays */

/** Fractional delay-line read (cubic Hermite). */
function readFrac(buf, pos) {
  const n = buf.length;
  let i = Math.floor(pos);
  const f = pos - i;
  const at = (k) => buf[((k % n) + n) % n];
  const xm1 = at(i - 1), x0 = at(i), x1 = at(i + 1), x2 = at(i + 2);
  const c = (x1 - xm1) * 0.5;
  const v = x0 - x1;
  const w = c + v;
  const a = w + v + (x2 - x0) * 0.5;
  const b = w + a;
  return ((a * f - b) * f + c) * f + x0;
}

/**
 * Stereo ping-pong delay, in place (the buffer must already contain room for the tail).
 * The mono sum feeds the left line; left feeds right; right feeds back to left.
 */
export function pingPong(L, R, { time = 0.3, feedback = 0.35, mix = 0.25, lp = 4500, hp = 250 } = {}) {
  const d = Math.max(1, Math.round(time * SR));
  const bl = new Float32Array(d), br = new Float32Array(d);
  const lpL = new Biquad('lp', lp, 0.6), lpR = new Biquad('lp', lp, 0.6);
  const hpL = new Biquad('hp', hp, 0.6), hpR = new Biquad('hp', hp, 0.6);
  let w = 0;
  for (let i = 0; i < L.length; i++) {
    const outL = bl[w], outR = br[w];
    const input = (L[i] + R[i]) * 0.5;
    bl[w] = hpL.process(lpL.process(input + outR * feedback));
    br[w] = hpR.process(lpR.process(outL));
    L[i] += outL * mix;
    R[i] += outR * mix;
    w = (w + 1) % d;
  }
}

/**
 * Stereo chorus, in place. `rate` should divide the loop length for loops.
 * Two modulated taps per side, quadrature LFOs.
 */
export function chorus(L, R, { rate = 0.35, depth = 0.0025, base = 0.011, mix = 0.45 } = {}) {
  const size = nextPow2(Math.ceil((base + depth * 2) * SR) + 8);
  const bl = new Float32Array(size), br = new Float32Array(size);
  const mask = size - 1;
  let w = 0;
  for (let i = 0; i < L.length; i++) {
    const t = i / SR;
    bl[w] = L[i];
    br[w] = R[i];
    const m1 = base + depth * Math.sin(TAU * rate * t);
    const m2 = base + depth * Math.sin(TAU * rate * t + Math.PI / 2);
    const wl = readFrac(bl, w - m1 * SR);
    const wr = readFrac(br, w - m2 * SR);
    L[i] = L[i] * (1 - mix * 0.5) + wr * mix;
    R[i] = R[i] * (1 - mix * 0.5) + wl * mix;
    w = (w + 1) & mask;
  }
}

/** Variable-delay read from a source buffer at fractional sample position (0 outside). */
export function sampleAt(buf, pos) {
  if (pos < 1 || pos >= buf.length - 2) return 0;
  const i = Math.floor(pos);
  const f = pos - i;
  const xm1 = buf[i - 1], x0 = buf[i], x1 = buf[i + 1], x2 = buf[i + 2];
  const c = (x1 - xm1) * 0.5;
  const v = x0 - x1;
  const w = c + v;
  const a = w + v + (x2 - x0) * 0.5;
  const b = w + a;
  return ((a * f - b) * f + c) * f + x0;
}

/* ---------------------------------------------------------- dynamics */

/** Sliding-window minimum (monotonic deque), window [i, i+w]. */
function lookaheadMin(arr, w) {
  const n = arr.length;
  const out = new Float32Array(n);
  const dq = new Int32Array(n);
  let head = 0, tail = 0;
  // process from the end: out[i] = min(arr[i..i+w])
  for (let i = n - 1; i >= 0; i--) {
    while (tail > head && arr[dq[tail - 1]] >= arr[i]) tail--;
    dq[tail++] = i;
    while (dq[head] > i + w) head++;
    out[i] = arr[dq[head]];
  }
  return out;
}

/**
 * Offline look-ahead peak limiter (linked channels). Gain never exceeds what the peak needs,
 * attack is a smooth ramp over the look-ahead window, release is exponential.
 */
export function limit(chs, { ceiling = db(-1), lookahead = 0.002, release = 0.08 } = {}) {
  const n = chs[0].length;
  const L = Math.max(1, Math.round(lookahead * SR));
  const req = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (const c of chs) {
      const v = Math.abs(c[i]);
      if (v > m) m = v;
    }
    req[i] = m > ceiling ? ceiling / m : 1;
  }
  const a = lookaheadMin(req, L);
  // causal box average over L+1 samples
  const b = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += a[i];
    if (i > L) acc -= a[i - L - 1];
    b[i] = acc / Math.min(i + 1, L + 1);
    if (i < L) b[i] = Math.min(b[i], a[i]);
  }
  const r = 1 - Math.exp(-1 / (release * SR));
  let g = 1;
  for (let i = 0; i < n; i++) {
    g = Math.min(b[i], g + (1 - g) * r);
    for (const c of chs) c[i] *= g;
  }
  return chs;
}

/** Limiter for a looping buffer: processes two periods, keeps the second so the gain wraps. */
export function limitPeriodic(chs, opts) {
  const n = chs[0].length;
  const dbl = chs.map((c) => {
    const d = new Float32Array(n * 2);
    d.set(c);
    d.set(c, n);
    return d;
  });
  limit(dbl, opts);
  return dbl.map((d) => d.slice(n));
}

/* --------------------------------------------------- metering / norm */

// 4x oversampling interpolator (windowed sinc, 24 taps per phase) for true-peak estimation.
const TP_HALF = 12;
const TP_PHASES = [0.25, 0.5, 0.75].map((frac) => {
  const taps = new Float64Array(TP_HALF * 2);
  let sum = 0;
  for (let k = 0; k < TP_HALF * 2; k++) {
    const x = k - (TP_HALF - 1) - frac;
    const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    const wx = (x + TP_HALF) / (2 * TP_HALF);
    const win = 0.42 - 0.5 * Math.cos(TAU * wx) + 0.08 * Math.cos(2 * TAU * wx);
    taps[k] = sinc * win;
    sum += taps[k];
  }
  for (let k = 0; k < taps.length; k++) taps[k] /= sum;
  return taps;
});

/** Sample peak (linear). */
export function samplePeak(chs) {
  let m = 0;
  for (const c of chs) for (let i = 0; i < c.length; i++) {
    const v = Math.abs(c[i]);
    if (v > m) m = v;
  }
  return m;
}

/** True-peak estimate (linear) using 4x windowed-sinc oversampling. `wrap` treats the buffer as a loop. */
export function truePeak(chs, wrap = false) {
  let m = samplePeak(chs);
  for (const c of chs) {
    const n = c.length;
    const at = wrap ? (i) => c[((i % n) + n) % n] : (i) => (i < 0 || i >= n ? 0 : c[i]);
    for (let i = 0; i < n; i++) {
      // only interpolate around loud-ish samples (speed); peaks between samples need a loud neighbour
      if (Math.abs(c[i]) < m * 0.5 && Math.abs(at(i + 1)) < m * 0.5) continue;
      for (const taps of TP_PHASES) {
        let acc = 0;
        for (let k = 0; k < taps.length; k++) acc += taps[k] * at(i + k - (TP_HALF - 1));
        const v = Math.abs(acc);
        if (v > m) m = v;
      }
    }
  }
  return m;
}

export function rms(chs) {
  let e = 0, n = 0;
  for (const c of chs) {
    for (let i = 0; i < c.length; i++) e += c[i] * c[i];
    n += c.length;
  }
  return Math.sqrt(e / Math.max(1, n));
}

/** ITU-R BS.1770 K-weighting (pre-filter shelf + RLB high-pass), returns new channels. */
export function kWeight(chs) {
  return chs.map((c) => {
    const o = Float32Array.from(c);
    filt(o, 'highshelf', 1681.97, 0.7071, 4);
    filt(o, 'hp', 38.13, 0.5003);
    return o;
  });
}

/** Max RMS over sliding windows (default 200 ms, hop 10 ms) - a "momentary loudness" proxy. */
export function momentaryMax(chs, win = 0.2) {
  const n = chs[0].length;
  const w = Math.min(n, Math.max(1, Math.round(win * SR)));
  const hop = Math.max(1, Math.round(0.01 * SR));
  let best = 0;
  for (let s = 0; s + w <= n; s += hop) {
    let e = 0;
    for (const c of chs) for (let i = s; i < s + w; i++) e += c[i] * c[i];
    best = Math.max(best, e / (w * chs.length));
    if (s + w === n) break;
  }
  if (n <= w) {
    let e = 0;
    for (const c of chs) for (let i = 0; i < n; i++) e += c[i] * c[i];
    best = e / (w * chs.length);
  }
  return Math.sqrt(best);
}

export function scale(chs, g) {
  for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= g;
  return chs;
}

/** Normalise so the true peak sits at `targetDb` dBTP. Returns the applied gain. */
export function normalizeTruePeak(chs, targetDb = -1, wrap = false) {
  const p = truePeak(chs, wrap);
  if (p <= 0) return 1;
  const g = db(targetDb) / p;
  scale(chs, g);
  return g;
}

/** Remove DC without creating edge steps: subtract mean * Hann (Hann has mean 1 after scaling). */
export function removeDcWindowed(ch) {
  const n = ch.length;
  if (n < 4) return ch;
  let m = 0;
  for (let i = 0; i < n; i++) m += ch[i];
  m /= n;
  let wsum = 0;
  for (let i = 0; i < n; i++) wsum += 0.5 - 0.5 * Math.cos((TAU * i) / (n - 1));
  const k = (m * n) / wsum;
  for (let i = 0; i < n; i++) ch[i] -= k * (0.5 - 0.5 * Math.cos((TAU * i) / (n - 1)));
  return ch;
}

export function mean(ch) {
  let m = 0;
  for (let i = 0; i < ch.length; i++) m += ch[i];
  return m / Math.max(1, ch.length);
}

/* ------------------------------------------------------------ loops */

/**
 * Fold everything after N samples back onto the head (sum). For event-based material rendered
 * with a tail: the result is the steady-state periodic signal, seamless at the loop point.
 */
export function foldTail(chs, N) {
  return chs.map((c) => {
    const out = new Float32Array(N);
    for (let i = 0; i < c.length; i++) out[i % N] += c[i];
    return out;
  });
}

/**
 * Crossfade loop for stationary material rendered as N + X samples:
 * out[i] = x[i]*fadeIn(i) + x[N+i]*fadeOut(i) for i < X. Seam x[N-1] -> x[N] is continuous.
 * `power` = true uses equal-power curves (uncorrelated noise), false equal-gain (correlated).
 */
export function crossfadeLoop(chs, N, X, power = true) {
  return chs.map((c) => {
    if (c.length < N + X) throw new Error('crossfadeLoop: buffer too short');
    const out = c.slice(0, N);
    for (let i = 0; i < X; i++) {
      const u = i / X;
      const fi = power ? Math.sin((Math.PI / 2) * u) : u;
      const fo = power ? Math.cos((Math.PI / 2) * u) : 1 - u;
      out[i] = c[i] * fi + c[N + i] * fo;
    }
    return out;
  });
}

/** Seam statistics of a loop: jump vs. typical sample-to-sample motion. */
export function seamStats(ch) {
  const n = ch.length;
  if (n < 8) return { jump: 0, ratio: 0, curv: 0, curvRatio: 0 };
  const d1 = new Float32Array(n - 1);
  const d2 = new Float32Array(n - 2);
  for (let i = 1; i < n; i++) d1[i - 1] = Math.abs(ch[i] - ch[i - 1]);
  for (let i = 2; i < n; i++) d2[i - 2] = Math.abs(ch[i] - 2 * ch[i - 1] + ch[i - 2]);
  const p999 = (arr) => {
    const s = Float32Array.from(arr).sort();
    return s[Math.min(s.length - 1, Math.floor(s.length * 0.999))] || 1e-9;
  };
  const jump = Math.abs(ch[0] - ch[n - 1]);
  const curv = Math.abs(ch[0] - 2 * ch[n - 1] + ch[n - 2]);
  const r1 = p999(d1), r2 = p999(d2);
  return { jump, ratio: jump / Math.max(r1, 1e-9), curv, curvRatio: curv / Math.max(r2, 1e-9), p999d1: r1, p999d2: r2 };
}

/* ---------------------------------------------------------- analysis */

/** Full per-file analysis used by check.mjs and the tests. */
export function analyze(chs, { loop = false } = {}) {
  const n = chs[0].length;
  const peak = samplePeak(chs);
  const tp = truePeak(chs, loop);
  const r = rms(chs);
  const dcs = chs.map((c) => mean(c));
  const first = Math.max(...chs.map((c) => Math.abs(c[0])));
  const last = Math.max(...chs.map((c) => Math.abs(c[n - 1])));
  let seam = null;
  if (loop) {
    const st = chs.map((c) => seamStats(c));
    seam = {
      jump: Math.max(...st.map((s) => s.jump)),
      ratio: Math.max(...st.map((s) => s.ratio)),
      curv: Math.max(...st.map((s) => s.curv)),
      curvRatio: Math.max(...st.map((s) => s.curvRatio)),
    };
  }
  return {
    samples: n,
    channels: chs.length,
    duration: n / SR,
    peakDb: toDb(peak),
    truePeakDb: toDb(tp),
    rmsDb: toDb(r),
    momentaryMaxDb: toDb(momentaryMax(chs)),
    dc: Math.max(...dcs.map(Math.abs)),
    firstDb: toDb(first),
    lastDb: toDb(last),
    first,
    last,
    seam,
    finite: !hasBadSamples(chs),
  };
}
