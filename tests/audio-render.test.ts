import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { audio } from '../src/audio/engine';
import { music, LOOKAHEAD_S } from '../src/audio/music';
import { ambience } from '../src/audio/ambience';
import { SFX_NAMES, scatterSemis, quantizePitch, sfx, tension } from '../src/audio/sfx';

/**
 * Faux AudioContext qui applique les règles de l'API Web Audio qui lèvent des exceptions dans les
 * navigateurs (rampe exponentielle vers 0, start/stop invalides, valeurs non finies) et journalise
 * les démarrages de sources. Aucune écoute possible ici : ces tests vérifient la validité et le
 * calendrier, pas le rendu sonore.
 */
class FakeParam {
  maxAbs = 0;
  constructor(
    public value = 0,
    private kind = 'param',
  ) {}
  private note(v: number, t = 0): void {
    if (!Number.isFinite(v) || !Number.isFinite(t)) throw new Error(`${this.kind}: non-finite ${v} @ ${t}`);
    if (t < 0) throw new RangeError(`${this.kind}: negative time`);
    this.maxAbs = Math.max(this.maxAbs, Math.abs(v));
    stats.maxParam[this.kind] = Math.max(stats.maxParam[this.kind] ?? 0, Math.abs(v));
  }
  setValueAtTime(v: number, t: number) {
    this.note(v, t);
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.note(v, t);
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    if (v <= 0) throw new RangeError(`${this.kind}: exponential ramp to ${v}`);
    this.note(v, t);
    return this;
  }
  setTargetAtTime(v: number, t: number, tc: number) {
    if (!(tc > 0)) throw new RangeError(`${this.kind}: time constant ${tc}`);
    this.note(v, t);
    return this;
  }
  cancelScheduledValues(t: number) {
    this.note(0, t);
    return this;
  }
}

const stats = {
  created: 0,
  gains: [] as Array<{ node: FakeNode; gain: FakeParam }>,
  starts: [] as Array<{ t: number; now: number; kind: string }>,
  maxParam: {} as Record<string, number>,
};

class FakeNode {
  /** relié à un AudioParam : c'est une profondeur de modulation, pas un niveau audio */
  modulates = false;
  constructor(public ctx: FakeCtx) {
    stats.created++;
  }
  connect<T>(n: T): T {
    if (!n) throw new Error('connect to nothing');
    if (n instanceof FakeParam) this.modulates = true;
    return n;
  }
  disconnect(): void {}
}

class FakeSource extends FakeNode {
  private started: number | null = null;
  private stopped = false;
  constructor(
    ctx: FakeCtx,
    private kind: string,
  ) {
    super(ctx);
  }
  start(t = 0, offset = 0): void {
    if (this.started !== null) throw new Error('start twice');
    if (!Number.isFinite(t) || t < 0 || !Number.isFinite(offset) || offset < 0) throw new RangeError(`bad start ${t} ${offset}`);
    this.started = t;
    stats.starts.push({ t, now: this.ctx.currentTime, kind: this.kind });
  }
  stop(t = 0): void {
    if (this.started === null) throw new Error('stop before start');
    if (!Number.isFinite(t) || t < 0) throw new RangeError(`bad stop ${t}`);
    this.stopped = true;
  }
}

class FakeOsc extends FakeSource {
  type = 'sine';
  frequency = new FakeParam(440, 'frequency');
  detune = new FakeParam(0, 'detune');
  constructor(ctx: FakeCtx) {
    super(ctx, 'osc');
  }
  setPeriodicWave(): void {}
}
class FakeBufferSource extends FakeSource {
  buffer: unknown = null;
  loop = false;
  playbackRate = new FakeParam(1, 'playbackRate');
  detune = new FakeParam(0, 'detune');
  constructor(ctx: FakeCtx) {
    super(ctx, 'buffer');
  }
  override start(t = 0, offset = 0): void {
    if (!this.buffer) throw new Error('buffer source without buffer');
    super.start(t, offset);
  }
}
class FakeBuffer {
  private data: Float32Array[];
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(i: number): Float32Array {
    return this.data[i]!;
  }
}

class FakeCtx {
  currentTime = 0;
  sampleRate = 48000;
  state = 'running';
  destination = new FakeNode(this);
  createGain() {
    const node = new FakeNode(this);
    const gain = new FakeParam(1, 'gain');
    stats.gains.push({ node, gain });
    return Object.assign(node, { gain });
  }
  createOscillator() {
    return new FakeOsc(this);
  }
  createBufferSource() {
    return new FakeBufferSource(this);
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode(this), { type: 'lowpass', frequency: new FakeParam(350, 'filterFreq'), Q: new FakeParam(1, 'Q'), gain: new FakeParam(0, 'filterGain') });
  }
  createStereoPanner() {
    return Object.assign(new FakeNode(this), { pan: new FakeParam(0, 'pan') });
  }
  createConvolver() {
    return Object.assign(new FakeNode(this), { buffer: null as unknown });
  }
  createDynamicsCompressor() {
    return Object.assign(new FakeNode(this), { threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam() });
  }
  createBuffer(ch: number, len: number, sr: number) {
    if (!(len > 0) || !Number.isInteger(len)) throw new RangeError(`buffer length ${len}`);
    return new FakeBuffer(ch, len, sr);
  }
  createPeriodicWave() {
    return {};
  }
  resume() {
    return Promise.resolve();
  }
  suspend() {
    return Promise.resolve();
  }
}

const ctx = new FakeCtx();

beforeAll(() => {
  vi.useFakeTimers();
  const g = () => ctx.createGain();
  const reverb = ctx.createConvolver();
  reverb.buffer = ctx.createBuffer(2, 1000, 48000);
  Object.assign(audio as unknown as Record<string, unknown>, {
    ctx,
    master: g(),
    buses: { music: g(), ambience: g(), sfx: g() },
    duck: g(),
    reverbSend: g(),
    limiter: ctx.createDynamicsCompressor(),
    reverb,
    unlocked: true,
  });
});

afterAll(() => {
  vi.useRealTimers();
});

describe('sfx', () => {
  it('maps successive scatters to rising pentatonic degrees', () => {
    const semis = [1, 2, 3, 4, 5].map((n) => scatterSemis(1 + (n - 1) * 0.12));
    expect(semis).toEqual([0, 2, 4, 7, 9]);
    for (let p = 1; p <= 2; p += 0.05) expect([0, 2, 4, 7, 9].includes(Math.round(12 * Math.log2(quantizePitch(p))) % 12)).toBe(true);
  });

  it('every sound renders with valid Web Audio calls and modest levels', () => {
    stats.gains = [];
    for (const name of SFX_NAMES) {
      for (const pitch of [0.9, 1, 1.36]) {
        const before = stats.starts.length;
        ctx.currentTime += 0.5;
        expect(() => sfx(name, { pitch, volume: 1 })).not.toThrow();
        const mine = stats.starts.slice(before);
        expect(mine.length, name).toBeGreaterThan(0);
        for (const s of mine) expect(s.t).toBeGreaterThanOrEqual(s.now);
      }
    }
    // enveloppes bornées (les bruits en bande étroite, très faibles par nature, montent un peu au-dessus de 1 ;
    // la sonie réelle est mesurée par rendu hors ligne, voir docs/AUDIO.md)
    const audioGains = stats.gains.filter((g) => !g.node.modulates).map((g) => g.gain.maxAbs);
    expect(Math.max(...audioGains)).toBeLessThanOrEqual(1.5);
    expect(stats.maxParam.pan ?? 0).toBeLessThanOrEqual(1);
  });

  it('unknown names are silent, not errors', () => {
    const before = stats.starts.length;
    expect(() => sfx('nope')).not.toThrow();
    expect(stats.starts.length).toBe(before);
  });
});

describe('music scheduler', () => {
  it('schedules only inside the lookahead window, crossfades moods and cleans up', () => {
    const tracks = () => (music as unknown as { tracks: Array<{ mood: string }> }).tracks;
    ctx.currentTime += 1;
    music.start('base');
    expect(music.isRunning).toBe(true);
    let violations = 0;
    let scheduled = 0;
    for (let k = 0; k < 2400; k++) {
      ctx.currentTime += 0.025;
      const before = stats.starts.length;
      if (k === 800) music.setMood('bonus');
      if (k === 1600) music.setMood('super');
      if (k === 1700) tension(true);
      if (k === 1800) tension(false);
      music.pump();
      for (const s of stats.starts.slice(before)) {
        scheduled++;
        if (s.t < s.now - 1e-9 || s.t > s.now + LOOKAHEAD_S + 0.1) violations++;
      }
      if (k === 810) expect(tracks().length).toBe(2);
      if (k === 1000) expect(tracks().map((t) => t.mood)).toEqual(['bonus']);
    }
    expect(scheduled).toBeGreaterThan(1000);
    expect(violations).toBe(0);
    expect(tracks().map((t) => t.mood)).toEqual(['super']);
    expect(music.currentMood).toBe('super');
    music.setMood('super'); // même humeur : aucun changement
    expect(tracks().length).toBe(1);
    music.pause(true);
    const paused = stats.starts.length;
    for (let k = 0; k < 40; k++) {
      ctx.currentTime += 0.025;
      music.pump();
    }
    expect(stats.starts.length).toBe(paused);
    music.setMood('base'); // changée pendant la pause : appliquée à la reprise
    music.pause(false);
    ctx.currentTime += 0.5;
    music.pump();
    expect(stats.starts.length).toBeGreaterThan(paused);
    for (let k = 0; k < 120; k++) {
      ctx.currentTime += 0.025;
      music.pump();
    }
    expect(tracks().map((t) => t.mood)).toEqual(['base']);
    music.stop(500);
    for (let k = 0; k < 60; k++) {
      ctx.currentTime += 0.025;
      music.pump();
    }
    expect(tracks().length).toBe(0);
    expect(music.isRunning).toBe(false);
  });
});

describe('ambience', () => {
  it('runs beds for every mood, crossfades and plays rare events', () => {
    const beds = () => (ambience as unknown as { beds: Array<{ mood: string }> }).beds;
    ambience.start('base');
    for (let k = 0; k < 900; k++) {
      ctx.currentTime += 0.1;
      if (k === 300) ambience.setMood('bonus');
      if (k === 600) ambience.setMood('super');
      if (k === 305) expect(beds().length).toBe(2);
      ambience.pump();
    }
    expect(beds().map((b) => b.mood)).toEqual(['super']);
    for (const e of ['distantBlast', 'birds', 'woodpecker', 'sparks', 'loon', 'owl'] as const) {
      const before = stats.starts.length;
      expect(() => ambience.event(e)).not.toThrow();
      expect(stats.starts.length, e).toBeGreaterThan(before);
    }
    ambience.stop(300);
    for (let k = 0; k < 10; k++) {
      ctx.currentTime += 0.1;
      ambience.pump();
    }
    expect(beds().length).toBe(0);
  });
});
