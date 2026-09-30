import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SR, makeRng, seedFrom, Osc, SVF, envADSR, envAD, fadeIn, fadeOut, convolve, samplePeak, truePeak, normalizeTruePeak,
  removeDcWindowed, mean, foldTail, crossfadeLoop, seamStats, limit, db, toDb, hz, qf, hasBadSamples, analyze, makeIR,
} from '../tools/audio/lib/dsp.mjs';
import { encodeWav, decodeWav } from '../tools/audio/lib/wav.mjs';
import { finalizeOneShot, finalizeLoop } from '../tools/audio/lib/master.mjs';
import { AudioEngine, hopRate, chipLevelRate, pickFormat, dbToGain } from '../src/audio/audio';

/* ------------------------------------------------------------------ DSP */

describe('audio DSP helpers', () => {
  it('seeded RNG is deterministic and in range', () => {
    const a = makeRng(seedFrom('reel_stop'));
    const b = makeRng(seedFrom('reel_stop'));
    for (let i = 0; i < 1000; i++) {
      const x = a.next();
      expect(x).toBe(b.next());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(seedFrom('a')).not.toBe(seedFrom('b'));
  });

  it('band-limited oscillators stay finite and bounded', () => {
    const o = new Osc(0.3);
    let finite = true;
    let peak = 0;
    for (let i = 0; i < SR; i++) {
      const f = 40 + (i / SR) * 8000;
      for (const v of [o.saw(f), o.pulse(f, 0.3), o.sin(f)]) {
        if (!Number.isFinite(v)) finite = false;
        peak = Math.max(peak, Math.abs(v));
      }
    }
    expect(finite).toBe(true);
    expect(peak).toBeLessThan(1.3);
  });

  it('SVF is stable under fast cutoff modulation and high Q', () => {
    const f = new SVF();
    const rng = makeRng(1);
    let peak = 0;
    let finite = true;
    for (let i = 0; i < SR; i++) {
      const fc = 50 + 12000 * (0.5 + 0.5 * Math.sin(i / 7));
      const y = f.run(rng.bi(), fc, 8, 'bp');
      if (!Number.isFinite(y)) finite = false;
      peak = Math.max(peak, Math.abs(y));
    }
    expect(finite).toBe(true);
    expect(peak).toBeLessThan(20);
  });

  it('envelopes start and end at zero, ADSR release ends exactly at zero', () => {
    expect(envADSR(0, 0.01, 0.1, 0.5, 0.2, 0.5)).toBe(0);
    expect(envADSR(0.71, 0.01, 0.1, 0.5, 0.2, 0.5)).toBe(0);
    expect(envADSR(0.5 + 0.2 - 1e-6, 0.01, 0.1, 0.5, 0.2, 0.5)).toBeLessThan(1e-4);
    // continuous at the gate
    const a = envADSR(0.5 - 1e-6, 0.01, 0.1, 0.5, 0.2, 0.5);
    const b = envADSR(0.5 + 1e-6, 0.01, 0.1, 0.5, 0.2, 0.5);
    expect(Math.abs(a - b)).toBeLessThan(1e-3);
    expect(envAD(0, 0.01, 0.1)).toBe(0);
    const ch = new Float32Array(1000).fill(0.8);
    fadeIn(ch, 100);
    fadeOut(ch, 100);
    expect(ch[0]).toBe(0);
    expect(ch[999]).toBe(0);
    expect(ch[500]).toBeCloseTo(0.8, 6);
  });

  it('FFT convolution matches direct convolution', () => {
    const rng = makeRng(7);
    const x = Float32Array.from({ length: 300 }, () => rng.bi());
    const h = Float32Array.from({ length: 77 }, () => rng.bi());
    const y = convolve(x, h);
    expect(y.length).toBe(x.length + h.length - 1);
    for (let n = 0; n < y.length; n += 13) {
      let s = 0;
      for (let k = 0; k < h.length; k++) if (n - k >= 0 && n - k < x.length) s += (x[n - k] ?? 0) * (h[k] ?? 0);
      expect(Math.abs((y[n] ?? 0) - s)).toBeLessThan(1e-4);
    }
  });

  it('synthetic impulse responses are finite, stereo and energy-normalised', () => {
    const ir = makeIR({ seconds: 0.5, rt60: 0.3, seed: 3 });
    expect(ir.length).toBe(2);
    expect(hasBadSamples(ir)).toBe(false);
    for (const c of ir) {
      let e = 0;
      for (const v of c) e += v * v;
      expect(e).toBeCloseTo(1, 3);
    }
  });

  it('true-peak normalisation hits the target and true peak >= sample peak', () => {
    const n = 4800;
    // a high sine whose samples straddle the crest: inter-sample peaks exist
    const ch = Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 11025 * i) / SR + 0.7));
    expect(truePeak([ch])).toBeGreaterThanOrEqual(samplePeak([ch]));
    normalizeTruePeak([ch], -1);
    expect(toDb(truePeak([ch]))).toBeCloseTo(-1, 1);
    expect(toDb(samplePeak([ch]))).toBeLessThanOrEqual(-1 + 1e-6);
  });

  it('look-ahead limiter keeps every sample under the ceiling', () => {
    const rng = makeRng(9);
    const ch = Float32Array.from({ length: SR / 2 }, (_, i) => rng.bi() * (i % 5000 < 50 ? 3 : 0.3));
    limit([ch], { ceiling: db(-3) });
    expect(samplePeak([ch])).toBeLessThanOrEqual(db(-3) + 1e-6);
  });

  it('windowed DC removal zeroes the mean without moving the edges', () => {
    const ch = Float32Array.from({ length: 5000 }, (_, i) => (i === 0 || i === 4999 ? 0 : 0.2 + 0.1 * Math.sin(i / 30)));
    removeDcWindowed(ch);
    expect(Math.abs(mean(ch))).toBeLessThan(1e-5);
    expect(Math.abs(ch[0] ?? 1)).toBeLessThan(1e-9);
    expect(Math.abs(ch[4999] ?? 1)).toBeLessThan(1e-6);
  });

  it('tail folding yields the steady-state periodic signal (naive truncation does not)', () => {
    const T = 0.5;
    const N = Math.round(T * SR);
    // decaying tone bursts every 0.125 s; the last one rings past the loop point
    const burst = (dst: Float32Array, s: number) => {
      for (let i = 0; s + i < dst.length; i++) dst[s + i] = (dst[s + i] ?? 0) + Math.sin((2 * Math.PI * 440 * i) / SR) * Math.exp(-i / (0.08 * SR)) * Math.min(1, i / 48);
    };
    const one = new Float32Array(N + SR);
    for (let k = 0; k < 4; k++) burst(one, Math.round(k * 0.125 * SR));
    const folded = foldTail([one], N)[0] as Float32Array;
    // reference: the same pattern repeated for many periods, one period taken from the middle
    const long = new Float32Array(N * 6);
    for (let c = 0; c < 6; c++) for (let k = 0; k < 4; k++) burst(long, c * N + Math.round(k * 0.125 * SR));
    const steady = long.subarray(3 * N, 4 * N);
    let errFold = 0, errNaive = 0;
    for (let i = 0; i < N; i++) {
      errFold = Math.max(errFold, Math.abs((folded[i] ?? 0) - (steady[i] ?? 0)));
      errNaive = Math.max(errNaive, Math.abs((one[i] ?? 0) - (steady[i] ?? 0)));
    }
    expect(folded.length).toBe(N);
    expect(errFold).toBeLessThan(1e-4);
    expect(errNaive).toBeGreaterThan(0.05);
    expect(seamStats(folded).ratio).toBeLessThan(2.5);
  });

  it('crossfaded noise loop is continuous at the seam', () => {
    const rng = makeRng(11);
    const N = 24000;
    const X = 4800;
    let lp = 0;
    const x = Float32Array.from({ length: N + X }, () => (lp += 0.05 * (rng.bi() - lp)));
    const out = crossfadeLoop([x], N, X, true)[0] as Float32Array;
    expect(out.length).toBe(N);
    expect(seamStats(out).ratio).toBeLessThan(2.5);
  });

  it('tuning helpers: A4 = 440 Hz, periodic quantisation divides the loop', () => {
    expect(hz('A4')).toBeCloseTo(440, 6);
    expect(hz('D4')).toBeCloseTo(293.665, 2);
    const f = qf(hz('D2'), 1.2);
    expect(Math.abs(f * 1.2 - Math.round(f * 1.2))).toBeLessThan(1e-9);
  });

  it('WAV float round-trip is exact', () => {
    const chs = [Float32Array.from({ length: 100 }, (_, i) => Math.sin(i)), Float32Array.from({ length: 100 }, (_, i) => Math.cos(i) * 0.5)];
    const { sr, chs: back } = decodeWav(encodeWav(chs, SR));
    expect(sr).toBe(SR);
    expect(back.length).toBe(2);
    for (let c = 0; c < 2; c++) for (let i = 0; i < 100; i++) expect(back[c]?.[i]).toBe(chs[c]?.[i]);
  });

  it('one-shot mastering: zero edges, -1 dBTP, no DC, no NaN', () => {
    const rng = makeRng(5);
    const raw = Float32Array.from({ length: SR }, (_, i) => 0.3 + rng.bi() * Math.exp(-i / 6000));
    const [out] = finalizeOneShot([raw], { targetDb: -1 }) as [Float32Array];
    const a = analyze([out]);
    expect(a.finite).toBe(true);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(0);
    expect(a.truePeakDb).toBeCloseTo(-1, 1);
    expect(a.dc).toBeLessThan(0.002);
  });

  it('loop mastering keeps the loop seamless and caps RMS', () => {
    const N = SR;
    const chs = [Float32Array.from({ length: N }, (_, i) => 0.2 + Math.sin((2 * Math.PI * 5 * i) / N) * 0.6)];
    const out = finalizeLoop(chs, { rmsDb: -20, targetDb: -1 });
    const a = analyze(out, { loop: true });
    expect(a.rmsDb).toBeLessThanOrEqual(-20 + 1e-6);
    expect(a.seam?.ratio ?? 99).toBeLessThan(2.5);
    expect(a.dc).toBeLessThan(0.002);
  });
});

/* ------------------------------------------------------------- manifest */

const AUDIO_DIR = resolve(__dirname, '../public/audio');
const manifestPath = resolve(AUDIO_DIR, 'manifest.json');

const REQUIRED: Record<string, { bus: string; loop?: boolean }> = {};
const add = (bus: string, ids: string[], loop = false) => ids.forEach((id) => (REQUIRED[id] = { bus, loop }));
add('ui', ['ui_click', 'ui_click_2', 'ui_click_3', 'ui_hover', 'ui_open', 'ui_close', 'ui_toggle', 'ui_bet_up', 'ui_bet_down', 'ui_error', 'ui_buy_confirm', 'ui_autoplay_start']);
add('sfx', ['spin_start', 'reel_stop', 'reel_stop_2', 'reel_stop_3', 'reel_stop_last', 'quick_stop', 'anticipation_riser', 'scatter_land_1', 'scatter_land_2', 'scatter_land_3', 'scatter_fail']);
add('sfx', ['reel_loop', 'anticipation_loop', 'circuit_hum', 'win_count_loop'], true);
add('sfx', ['eyes_charge', 'laser_fire', 'laser_hop', 'laser_hop_2', 'laser_hop_3', 'laser_hop_4', 'upgrade_tick', 'upgrade_max', 'mult_stamp', 'chip_place', 'chip_level', 'chip_off', 'chip_off_2', 'chip_off_3']);
add('sfx', ['win_small', 'win_connect', 'win_count_end', 'sym_H1', 'sym_H2', 'sym_H3', 'sym_H4', 'sym_W', 'sym_S']);
add('sfx', ['bigwin_intro', 'tier_big', 'tier_super', 'tier_mega', 'tier_epic', 'tier_cyber', 'maxwin', 'coin_rain', 'drone_swarm', 'train_pass', 'city_lights_on']);
add('sfx', ['bonus_trigger', 'bonus_intro', 'punch_tear', 'run_whoosh', 'fs_add', 'bonus_end', 'dive_impact', 'scan_mode_on', 'scan_mode_off']);
add('music', ['music_base', 'music_bonus', 'music_bonus_double'], true);
add('amb', ['amb_city', 'amb_scan'], true);

describe.runIf(existsSync(manifestPath))('audio manifest', () => {
  const manifest = existsSync(manifestPath) ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    version: string;
    cues: Record<string, { files: { ogg: string; m4a: string }; duration: number; loop: boolean; bus: string; critical: boolean; variants?: string[]; gainDb?: number }>;
  }) : { version: '', cues: {} };

  it('lists every required cue with the right bus and loop flag', () => {
    expect(typeof manifest.version).toBe('string');
    for (const [id, req] of Object.entries(REQUIRED)) {
      const c = manifest.cues[id];
      expect(c, id).toBeDefined();
      expect(c?.bus, id).toBe(req.bus);
      expect(c?.loop, id).toBe(!!req.loop);
    }
  });

  it('has well-formed entries whose files exist', () => {
    for (const [id, c] of Object.entries(manifest.cues)) {
      expect(c.duration, id).toBeGreaterThan(0);
      expect(['sfx', 'ui', 'music', 'amb']).toContain(c.bus);
      expect(typeof c.critical).toBe('boolean');
      expect(c.gainDb ?? 0).toBeLessThanOrEqual(0);
      for (const f of [c.files.ogg, c.files.m4a]) expect(existsSync(resolve(AUDIO_DIR, f)), f).toBe(true);
      for (const v of c.variants ?? []) expect(manifest.cues[v], `${id} variant ${v}`).toBeDefined();
    }
  });

  it('declares the variant groups and the critical set of the brief', () => {
    expect(manifest.cues.reel_stop?.variants).toEqual(['reel_stop', 'reel_stop_2', 'reel_stop_3']);
    expect(manifest.cues.laser_hop?.variants?.length).toBe(4);
    expect(manifest.cues.ui_click?.variants?.length).toBe(3);
    expect(manifest.cues.chip_off?.variants?.length).toBe(3);
    const critical = Object.entries(manifest.cues).filter(([, c]) => c.critical).map(([id]) => id).sort();
    const expected = Object.keys(manifest.cues)
      .filter((id) => id.startsWith('ui_') || id.startsWith('reel_stop') || ['spin_start', 'reel_loop', 'quick_stop', 'amb_city'].includes(id))
      .sort();
    expect(critical).toEqual(expected);
  });
});

/* -------------------------------------------------------------- runtime */

class FakeParam {
  value = 1;
  setValueAtTime(v: number) { this.value = v; return this; }
  linearRampToValueAtTime(v: number) { this.value = v; return this; }
  setTargetAtTime(v: number) { this.value = v; return this; }
  cancelScheduledValues() { return this; }
  cancelAndHoldAtTime() { return this; }
}
class FakeNode {
  out: FakeNode[] = [];
  connect(n: FakeNode) { this.out.push(n); return n; }
  disconnect() { this.out = []; }
}
class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeSource extends FakeNode {
  buffer: { tag?: string; duration: number } | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  playbackRate = new FakeParam();
  onended: (() => void) | null = null;
  startedAt = -1;
  stoppedAt = -1;
  start(t = 0) { this.startedAt = t; }
  stop(t = 0) { this.stoppedAt = t; }
}
class FakeCtx {
  static last: FakeCtx | null = null;
  state = 'suspended';
  currentTime = 0;
  sampleRate = 48000;
  destination = new FakeNode();
  onstatechange: (() => void) | null = null;
  sources: FakeSource[] = [];
  constructor() { FakeCtx.last = this; }
  createGain() { return new FakeGain(); }
  createBufferSource() { const s = new FakeSource(); this.sources.push(s); return s; }
  createStereoPanner() { const n = new FakeNode() as FakeNode & { pan: FakeParam }; n.pan = new FakeParam(); return n; }
  createDynamicsCompressor() {
    const n = new FakeNode() as FakeNode & Record<string, FakeParam>;
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new FakeParam();
    return n;
  }
  createBuffer(_ch: number, length: number, sr: number) { return { duration: length / sr }; }
  resume() { this.state = 'running'; this.onstatechange?.(); return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  decodeAudioData(data: ArrayBuffer) {
    const tag = new TextDecoder().decode(new Uint8Array(data));
    return Promise.resolve({ tag, duration: 1 });
  }
}

const cue = (bus: string, extra: Record<string, unknown> = {}) => ({ files: { ogg: 'x.ogg', m4a: 'x.m4a' }, duration: 1, loop: false, bus, critical: true, gainDb: 0, ...extra });
const FAKE_MANIFEST = {
  version: 't',
  cues: {
    hit: cue('sfx', { variants: ['hit', 'hit_2'], files: { ogg: 'hit.ogg', m4a: 'hit.m4a' } }),
    hit_2: cue('sfx', { files: { ogg: 'hit_2.ogg', m4a: 'hit_2.m4a' } }),
    tick: cue('ui', { files: { ogg: 'tick.ogg', m4a: 'tick.m4a' } }),
    bed: cue('music', { loop: true, critical: false, files: { ogg: 'bed.ogg', m4a: 'bed.m4a' } }),
    bed2: cue('music', { loop: true, critical: false, files: { ogg: 'bed2.ogg', m4a: 'bed2.m4a' } }),
  },
};

function installFakes() {
  vi.stubGlobal('AudioContext', FakeCtx);
  vi.stubGlobal('OfflineAudioContext', FakeCtx);
  vi.stubGlobal('fetch', async (url: string) => {
    const name = String(url).split('/').pop()?.split('?')[0] ?? '';
    if (name === 'manifest.json') return { ok: true, json: async () => FAKE_MANIFEST } as unknown as Response;
    if (name.startsWith('missing')) return { ok: false, status: 404 } as unknown as Response;
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode(name.replace(/\.(ogg|m4a)$/, '')).buffer } as unknown as Response;
  });
}

describe('AudioEngine runtime', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('pure helpers', () => {
    expect(hopRate(0)).toBe(1);
    expect(hopRate(7)).toBeCloseTo(2, 10);
    expect(hopRate(-3)).toBe(1);
    expect(chipLevelRate(1)).toBe(1);
    expect(chipLevelRate(3)).toBeCloseTo(Math.pow(2, 7 / 12), 10);
    expect(pickFormat(() => 'maybe')).toBe('ogg');
    expect(pickFormat(() => '')).toBe('m4a');
    expect(pickFormat(null)).toBe('m4a');
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
  });

  it('is a silent no-op without WebAudio, without manifest and before unlock', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const e = new AudioEngine({ baseUrl: './audio/' });
    await e.loadManifest();
    await e.loadCritical();
    await e.loadRest();
    await e.unlock();
    expect(e.unlocked).toBe(false);
    expect(e.play('anything')).toBeNull();
    expect(e.loop('anything')).toBeNull();
    expect(() => {
      e.music('x');
      e.ambience('y');
      e.ambienceLayer(null);
      e.duck(true);
      e.setVolume('music', 0.3);
      e.setMuted('sfx', true);
      e.suspend();
      e.resume();
      e.stopAll();
    }).not.toThrow();
    expect(e.getVolume('music')).toBeCloseTo(0.3);
  });

  it('loads with real progress, plays, caps voices, picks variants, crossfades beds', async () => {
    installFakes();
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    let clock = 0;
    const e = new AudioEngine({ baseUrl: './audio', now: () => (clock += 20) });
    const progress: Array<[number, number]> = [];
    await e.loadCritical((d, t) => progress.push([d, t]));
    expect(progress[0]).toEqual([0, 3]);
    expect(progress[progress.length - 1]).toEqual([3, 3]);
    expect(e.isLoaded('hit')).toBe(true);
    expect(e.play('hit')).toBeNull(); // not unlocked yet
    e.music('bed'); // remembered until unlock + load
    await e.unlock();
    expect(e.unlocked).toBe(true);
    const ctx = FakeCtx.last as FakeCtx;
    expect(e.play('does_not_exist')).toBeNull();
    // voice cap: 4 per cue by default, the oldest is stolen
    const before = ctx.sources.length;
    for (let i = 0; i < 5; i++) expect(e.play('tick', { variant: false })).not.toBeNull();
    const ticks = ctx.sources.slice(before);
    expect(ticks.length).toBe(5);
    expect(ticks[0]?.stoppedAt).toBeGreaterThanOrEqual(0);
    expect(ticks[4]?.stoppedAt).toBe(-1);
    // variants: both files get used
    const tags = new Set<string>();
    for (let i = 0; i < 12; i++) {
      e.play('hit', { variant: true });
      tags.add(ctx.sources[ctx.sources.length - 1]?.buffer?.tag ?? '');
    }
    expect([...tags].sort()).toEqual(['hit', 'hit_2']);
    // beds: bed starts once its buffer is decoded, then crossfades to bed2
    await e.loadRest();
    const bed = ctx.sources.find((s) => s.buffer?.tag === 'bed');
    expect(bed?.loop).toBe(true);
    e.music('bed2', 1);
    await e.loadRest();
    expect(bed?.stoppedAt).toBeGreaterThanOrEqual(0);
    expect(ctx.sources.some((s) => s.buffer?.tag === 'bed2' && s.loop)).toBe(true);
    // stopAll stops sfx/ui voices but not the music bed
    const loop = e.loop('hit');
    expect(loop).not.toBeNull();
    e.stopAll(0.05);
    const live = ctx.sources.filter((s) => s.stoppedAt < 0 && s.buffer?.tag).map((s) => s.buffer?.tag);
    expect(live).toEqual(['bed2']);
    // same-instant re-trigger is skipped only when both clocks agree
    const frozen = new AudioEngine({ baseUrl: './audio/', now: () => 1000 });
    await frozen.loadCritical();
    await frozen.unlock();
    const c2 = FakeCtx.last as FakeCtx;
    expect(frozen.play('tick')).not.toBeNull();
    expect(frozen.play('tick')).toBeNull(); // same game time, same audio time
    c2.currentTime += 0.5; // frozen game clock (pause / QA), real audio time moves on
    expect(frozen.play('tick')).not.toBeNull();
    // hidden: one-shots are refused (no burst on return)
    e.suspend();
    expect(e.play('tick')).toBeNull();
    e.resume();
  });

  it('never throws when a file fails to load', async () => {
    installFakes();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const e = new AudioEngine({ baseUrl: './audio/' });
    await e.loadManifest();
    // point one cue at missing files
    (FAKE_MANIFEST.cues.tick as unknown as { files: { ogg: string; m4a: string } }).files = { ogg: 'missing.ogg', m4a: 'missing.m4a' };
    try {
      await e.loadCritical();
      await e.unlock();
      expect(e.isLoaded('tick')).toBe(false);
      expect(e.play('tick')).toBeNull();
    } finally {
      (FAKE_MANIFEST.cues.tick as unknown as { files: { ogg: string; m4a: string } }).files = { ogg: 'tick.ogg', m4a: 'tick.m4a' };
    }
  });
});
