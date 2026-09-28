import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { audio } from '../src/audio/engine';
import { flushIdle, music, Music, LOOKAHEAD_S } from '../src/audio/music';
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
  /** valeurs programmées (panoramiques seulement : sens des déplacements stéréo) */
  history: number[] = [];
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
    if (this.kind === 'pan') this.history.push(v);
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.note(v, t);
    if (this.kind === 'pan') this.history.push(v);
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
  buffers: [] as Array<{ sr: number; len: number }>,
  panners: [] as Array<{ pan: FakeParam }>,
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
    const p = Object.assign(new FakeNode(this), { pan: new FakeParam(0, 'pan') });
    stats.panners.push(p);
    return p;
  }
  createConvolver() {
    return Object.assign(new FakeNode(this), { buffer: null as unknown });
  }
  createDynamicsCompressor() {
    return Object.assign(new FakeNode(this), { threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam() });
  }
  createBuffer(ch: number, len: number, sr: number) {
    if (!(len > 0) || !Number.isInteger(len)) throw new RangeError(`buffer length ${len}`);
    stats.buffers.push({ sr, len });
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

/** branche le faux contexte dans un moteur audio, comme le ferait unlock() */
function install(engine: object): void {
  const g = () => ctx.createGain();
  const reverb = ctx.createConvolver();
  reverb.buffer = ctx.createBuffer(2, 1000, 48000);
  Object.assign(engine as Record<string, unknown>, {
    ctx,
    master: g(),
    buses: { music: g(), ambience: g(), sfx: g() },
    duck: g(),
    reverbSend: g(),
    limiter: ctx.createDynamicsCompressor(),
    reverb,
    unlocked: true,
  });
}

beforeAll(() => {
  vi.useFakeTimers();
  install(audio);
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
    expect(beds()).toHaveLength(0); // rien de lourd dans le geste d'activation : bruits calculés en tâche de fond
    flushIdle();
    expect(beds().map((b) => b.mood)).toEqual(['base']);
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

describe('robustness', () => {
  const run = (n: number, m: { pump(): void } = music) => {
    for (let k = 0; k < n; k++) {
      ctx.currentTime += 0.025;
      m.pump();
    }
  };
  const tracks = () => (music as unknown as { tracks: Array<{ mood: string; endAt: number | null }> }).tracks;

  it('start(mood) on a running engine changes mood; a quick return revives the fading track', () => {
    music.start('base');
    run(80);
    music.start('bonus'); // déjà lancée : fondu vers bonus (l'humeur n'est plus ignorée)
    expect(music.currentMood).toBe('bonus');
    expect(tracks().map((t) => t.mood)).toEqual(['base', 'bonus']);
    run(8);
    music.setMood('base'); // retour pendant le fondu : la piste base est ramenée, pas doublée
    expect(tracks().filter((t) => t.mood === 'base')).toHaveLength(1);
    expect(tracks().find((t) => t.mood === 'base')?.endAt).toBeNull();
    run(160);
    expect(tracks().map((t) => t.mood)).toEqual(['base']);
    music.stop(300);
    music.start(); // relance pendant l'arrêt : même piste
    expect(tracks()).toHaveLength(1);
    expect(tracks()[0]?.endAt).toBeNull();
    run(40);
    music.stop(300);
    run(60);
    expect(tracks()).toHaveLength(0);
  });

  it('tension works without the music running, never stacks, and releases the scheduler', () => {
    const m = new Music();
    const priv = m as unknown as { timer: unknown; tension: unknown; retired: unknown[] };
    m.setTension(true);
    expect(priv.tension).not.toBeNull();
    const before = stats.starts.length;
    run(40, m);
    expect(stats.starts.length).toBeGreaterThan(before); // pulsation de mèche
    m.setTension(true); // déjà active : aucune seconde couche
    m.setTension(false);
    m.setTension(true); // relance immédiate : l'ancienne couche est retirée proprement
    m.setTension(false);
    expect(priv.retired).toHaveLength(2);
    run(40, m);
    expect(priv.retired).toHaveLength(0);
    expect(priv.tension).toBeNull();
    expect(priv.timer).toBeNull();
  });

  it('never throws into the game, and stays silent while muted', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const orig = ctx.createOscillator;
    ctx.createOscillator = () => {
      throw new Error('node failure');
    };
    try {
      expect(() => sfx('win')).not.toThrow();
      expect(() => sfx('maxWin')).not.toThrow();
      expect(() => tension(true)).not.toThrow();
      expect(() => tension(false)).not.toThrow();
      expect(() => ambience.event('owl')).not.toThrow();
    } finally {
      ctx.createOscillator = orig;
      warn.mockRestore();
    }
    audio.setMuted(true);
    const before = stats.starts.length;
    sfx('blast');
    ambience.event('birds');
    expect(stats.starts.length).toBe(before);
    audio.setMuted(false);
  });

  it('ambience start(mood) on a running engine changes mood; geese follow the flock direction', () => {
    const beds = () => (ambience as unknown as { beds: Array<{ mood: string }> }).beds;
    ambience.start('base');
    run(10, ambience);
    ambience.start('bonus');
    expect(ambience.currentMood).toBe('bonus');
    for (let k = 0; k < 30; k++) {
      ctx.currentTime += 0.1;
      ambience.pump();
    }
    expect(beds().map((b) => b.mood)).toEqual(['bonus']);
    for (const dir of [1, -1] as const) {
      const first = stats.panners.length;
      ambience.event('birds', dir);
      const h = stats.panners[first]?.pan.history ?? [];
      expect(h.length).toBeGreaterThanOrEqual(2);
      // entre du côté d'où vient le vol, puis se déplace dans son sens
      expect(Math.sign(h[0]!)).toBe(-dir);
      expect(Math.sign(h[h.length - 1]! - h[0]!)).toBe(dir);
    }
    ambience.stop(200);
    for (let k = 0; k < 10; k++) {
      ctx.currentTime += 0.1;
      ambience.pump();
    }
    expect(beds()).toHaveLength(0);
  });

  it('pre-computes every fanfare voice in idle time once audio is unlocked', async () => {
    // modules neufs : caches vides, comme au lancement du jeu
    vi.resetModules();
    const eng = await import('../src/audio/engine');
    const fx = await import('../src/audio/sfx');
    install(eng.audio);
    // cuivres : 2 s à demi-fréquence d'échantillonnage (seuls tampons de cette forme)
    const brass = () => stats.buffers.filter((b) => b.sr === ctx.sampleRate / 2 && b.len === ctx.sampleRate).length;
    const base = brass();
    const listeners = (eng.audio as unknown as { listeners: Array<() => void> }).listeners;
    expect(listeners.length).toBeGreaterThan(0); // sfx.ts attend l'activation
    for (const fn of listeners.splice(0)) fn(); // ce que fait unlock()
    expect(brass()).toBe(base); // rien de calculé dans le geste d'activation
    vi.advanceTimersByTime(10_000); // temps libre du navigateur
    const warmed = brass();
    expect(warmed - base).toBe(fx.FANFARE_VOICES.filter(([i]) => i === 'brass').length);
    for (const n of ['anticipationLand', 'trigger', 'retrigger', 'tier', 'maxWin', 'bonusOutro']) fx.sfx(n);
    expect(brass()).toBe(warmed); // aucune note de fanfare calculée au moment du gain
  });
});
