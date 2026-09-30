// CYBER CAT - WebAudio runtime (no external libs).
//
// Graph:  voice(src -> gain -> [pan]) -> bus[sfx|ui] ----------------------------> master -> limiter -> out
//                                        bus[music|amb] -> bedDuck (duck under fanfares) -^
//
// Contract:
// - Every public method is safe to call at any time: before the manifest is loaded, before unlock(),
//   with unknown ids, after a file failed to load, in environments without WebAudio. Such calls are
//   silent no-ops (each distinct problem is logged once).
// - Nothing plays until unlock() has been called from a user gesture and the context is running.
// - Every stop/steal/crossfade uses a short gain ramp (no clicks).

export type CueId = string;
export type Bus = 'master' | 'music' | 'amb' | 'sfx' | 'ui';
type CueBus = Exclude<Bus, 'master'>;

export interface CueInfo {
  files: { ogg: string; m4a: string };
  duration: number;
  loop: boolean;
  bus: CueBus;
  critical: boolean;
  variants?: CueId[];
  /** Mix trim applied to every play of this cue (dB, from the renderer's loudness pass). */
  gainDb?: number;
  maxVoices?: number;
  channels?: number;
  hash?: string;
}

export interface AudioManifest {
  version: string | number;
  sampleRate?: number;
  cues: Record<CueId, CueInfo>;
}

export interface PlayOptions {
  /** Playback rate (1 = original pitch). */
  rate?: number;
  /** Extra gain in dB on top of the cue's manifest trim. */
  gainDb?: number;
  /** Stereo position -1..1. */
  pan?: number;
  /** Start delay in seconds. */
  delay?: number;
  /** Pick a random variant + tiny detune. Defaults to true when the cue declares variants. */
  variant?: boolean;
}

export interface LoopOptions {
  gainDb?: number;
  /** Fade-in time in seconds (default 0.05). */
  fadeIn?: number;
  rate?: number;
}

export interface VoiceHandle {
  stop(fade?: number): void;
}
export interface LoopHandle extends VoiceHandle {
  setRate(r: number): void;
}

export interface AudioEngineOptions {
  /** Folder that holds manifest.json and the encoded files, e.g. './audio/'. */
  baseUrl: string;
  /** Clock in milliseconds (default performance.now); with the audio clock, used to skip same-instant re-triggers of a cue. */
  now?: () => number;
}

export const dbToGain = (db: number): number => Math.pow(10, db / 20);

/** Semitone steps of the D natural minor scale: in-key pitch raise for successive laser hops. */
const HOP_STEPS = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19];
/** Playback rate for the n-th laser hop (0-based): D, E, F, G, A, Bb, C, D... (laser_hop is tuned to D6). */
export function hopRate(index: number): number {
  const i = Math.max(0, Math.min(HOP_STEPS.length - 1, Math.floor(Number.isFinite(index) ? index : 0)));
  return Math.pow(2, (HOP_STEPS[i] ?? 0) / 12);
}
/** Playback rate for chip_level at chip level 1..3 (A -> C -> E, in key). */
export function chipLevelRate(level: number): number {
  const steps = [0, 3, 7];
  const i = Math.max(0, Math.min(2, Math.floor((Number.isFinite(level) ? level : 1) - 1)));
  return Math.pow(2, (steps[i] ?? 0) / 12);
}

/** Pick the encoded format: Ogg Vorbis where supported, AAC (m4a) otherwise (Safari). */
export function pickFormat(canPlayType: ((type: string) => string) | null): 'ogg' | 'm4a' {
  try {
    if (canPlayType && canPlayType('audio/ogg; codecs="vorbis"') !== '') return 'ogg';
  } catch {
    /* ignore */
  }
  return 'm4a';
}

type WebAudioGlobals = typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
  webkitOfflineAudioContext?: typeof OfflineAudioContext;
};

interface Voice {
  id: CueId;
  group: CueId;
  bus: CueBus;
  loop: boolean;
  started: number;
  stopped: boolean;
  src: AudioBufferSourceNode;
  gain: GainNode;
  kill(fade: number): void;
}

interface BedSlot {
  wanted: CueId | null;
  playing: CueId | null;
  handle: LoopHandle | null;
  fade: number;
}

const BUSES: Bus[] = ['master', 'music', 'amb', 'sfx', 'ui'];
/** Default bus volumes (perceptual 0..1, gain = v^2): music ~-3.7 dB, ambience ~-3.1 dB, UI ~-1.4 dB. */
const DEFAULT_VOLUME: Record<Bus, number> = { master: 1, music: 0.65, amb: 0.7, sfx: 1, ui: 0.85 };
const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

function decodeAudio(ctx: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolve, reject) => {
    try {
      // callback form for older Safari; promise form everywhere else
      const r = ctx.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
      if (r && typeof r.then === 'function') r.then(resolve, reject);
    } catch (e) {
      reject(e);
    }
  });
}

export class AudioEngine {
  private readonly baseUrl: string;
  private readonly now: () => number;
  private manifest: AudioManifest | null = null;
  private manifestPromise: Promise<void> | null = null;
  private ctx: AudioContext | null = null;
  private decodeCtx: BaseAudioContext | null = null;
  private readonly buffers = new Map<CueId, AudioBuffer>();
  private readonly loading = new Map<CueId, Promise<void>>();
  private readonly failed = new Set<CueId>();
  private readonly warned = new Set<string>();
  private readonly busNodes = new Map<Bus, GainNode>();
  private bedDuck: GainNode | null = null;
  private readonly volumes: Record<Bus, number> = { ...DEFAULT_VOLUME };
  private readonly mutes: Record<Bus, boolean> = { master: false, music: false, amb: false, sfx: false, ui: false };
  private voices: Voice[] = [];
  private readonly lastStart = new Map<CueId, { now: number; at: number }>();
  private readonly lastVariant = new Map<CueId, CueId>();
  private readonly beds: BedSlot[] = [0, 1, 2].map(() => ({ wanted: null, playing: null, handle: null, fade: 1 }));
  private readonly format: 'ogg' | 'm4a';
  private everRan = false;
  private hidden = false;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private duckState = { on: false, db: -9 };

  constructor(opts: AudioEngineOptions) {
    const base = opts.baseUrl || './audio/';
    this.baseUrl = base.endsWith('/') ? base : `${base}/`;
    this.now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    let cpt: ((t: string) => string) | null = null;
    try {
      if (typeof Audio !== 'undefined') {
        const a = new Audio();
        cpt = (t: string) => a.canPlayType(t);
      }
    } catch {
      cpt = null;
    }
    this.format = pickFormat(cpt);
  }

  /* ------------------------------------------------------------ state */

  /** True once a user gesture has started the AudioContext. */
  get unlocked(): boolean {
    return this.everRan && this.ctx !== null;
  }

  /** Chosen encoded format ('ogg' or 'm4a'). */
  get fileFormat(): 'ogg' | 'm4a' {
    return this.format;
  }

  /** True if the manifest knows this cue. */
  has(id: CueId): boolean {
    return !!this.manifest?.cues[id];
  }

  /** True if the cue's buffer is decoded and ready. */
  isLoaded(id: CueId): boolean {
    return this.buffers.has(id);
  }

  /* ---------------------------------------------------------- loading */

  loadManifest(): Promise<void> {
    if (this.manifest) return Promise.resolve();
    if (!this.manifestPromise) {
      this.manifestPromise = (async () => {
        try {
          if (typeof fetch !== 'function') throw new Error('fetch unavailable');
          const res = await fetch(`${this.baseUrl}manifest.json`, { cache: 'no-cache' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = (await res.json()) as Partial<AudioManifest>;
          if (!json || typeof json !== 'object' || !json.cues || typeof json.cues !== 'object') throw new Error('bad manifest shape');
          this.manifest = { version: json.version ?? 0, sampleRate: json.sampleRate, cues: json.cues };
        } catch (e) {
          this.warnOnce('manifest', 'audio manifest unavailable, audio disabled', e);
          this.manifest = { version: 0, cues: {} };
        }
      })();
    }
    return this.manifestPromise;
  }

  /** Decode every critical cue (and its variants). Progress counts files, failures included. */
  async loadCritical(onProgress?: (done: number, total: number) => void): Promise<void> {
    await this.loadManifest();
    await this.loadMany(this.idsWhere((c) => c.critical), 4, onProgress);
  }

  /** Decode everything else (background). */
  async loadRest(): Promise<void> {
    await this.loadManifest();
    await this.loadMany(this.idsWhere((c) => !c.critical), 3);
  }

  private idsWhere(pred: (c: CueInfo) => boolean): CueId[] {
    const cues = this.manifest?.cues ?? {};
    const out: CueId[] = [];
    for (const [id, c] of Object.entries(cues)) if (pred(c) && !this.buffers.has(id)) out.push(id);
    return out;
  }

  private async loadMany(ids: CueId[], concurrency: number, onProgress?: (done: number, total: number) => void): Promise<void> {
    const total = ids.length;
    let done = 0;
    const report = (): void => {
      try {
        onProgress?.(done, total);
      } catch {
        /* never let a UI callback break loading */
      }
    };
    report();
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < ids.length) {
        const id = ids[next++];
        if (id === undefined) break;
        await this.loadOne(id);
        done++;
        report();
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, total)) }, () => worker()));
  }

  private getDecodeContext(): BaseAudioContext | null {
    if (this.ctx) return this.ctx;
    if (this.decodeCtx) return this.decodeCtx;
    const g = globalThis as WebAudioGlobals;
    const Off = g.OfflineAudioContext ?? g.webkitOfflineAudioContext;
    if (!Off) return null;
    try {
      this.decodeCtx = new Off(1, 1, this.manifest?.sampleRate ?? 48000);
    } catch (e) {
      this.warnOnce('decodectx', 'cannot create a decoding context', e);
      return null;
    }
    return this.decodeCtx;
  }

  private fileUrl(cue: CueInfo, fmt: 'ogg' | 'm4a'): string {
    const f = cue.files[fmt];
    return `${this.baseUrl}${f}${cue.hash ? `?v=${cue.hash}` : ''}`;
  }

  private loadOne(id: CueId): Promise<void> {
    if (this.buffers.has(id) || this.failed.has(id)) return Promise.resolve();
    const existing = this.loading.get(id);
    if (existing) return existing;
    const p = (async () => {
      const cue = this.manifest?.cues[id];
      if (!cue) return;
      const dctx = this.getDecodeContext();
      if (!dctx || typeof fetch !== 'function') return;
      const order: Array<'ogg' | 'm4a'> = this.format === 'ogg' ? ['ogg', 'm4a'] : ['m4a'];
      let lastErr: unknown = null;
      for (const fmt of order) {
        try {
          const res = await fetch(this.fileUrl(cue, fmt));
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.arrayBuffer();
          const buf = await decodeAudio(dctx, data);
          this.buffers.set(id, buf);
          this.onBufferReady(id);
          return;
        } catch (e) {
          lastErr = e;
        }
      }
      this.failed.add(id);
      this.warnOnce(`load:${id}`, `audio cue "${id}" failed to load`, lastErr);
    })().finally(() => this.loading.delete(id));
    this.loading.set(id, p);
    return p;
  }

  private onBufferReady(id: CueId): void {
    for (let i = 0; i < this.beds.length; i++) if (this.beds[i]?.wanted === id) this.syncBed(i);
  }

  /* ----------------------------------------------------------- unlock */

  /** Call from a user gesture (pointerdown/keydown). Idempotent; also recovers an interrupted context. */
  async unlock(): Promise<void> {
    try {
      if (!this.ctx) {
        const g = globalThis as WebAudioGlobals;
        const Ctor = g.AudioContext ?? g.webkitAudioContext;
        if (!Ctor) return;
        let ctx: AudioContext;
        try {
          ctx = new Ctor({ latencyHint: 'interactive' });
        } catch {
          ctx = new Ctor();
        }
        this.ctx = ctx;
        this.buildGraph(ctx);
        ctx.onstatechange = () => {
          if (ctx.state === 'running') {
            this.everRan = true;
            this.syncBeds();
          }
        };
      }
      const ctx = this.ctx;
      // iOS: a silent buffer started inside the gesture unlocks output
      try {
        const b = ctx.createBuffer(1, 1, ctx.sampleRate);
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(ctx.destination);
        s.start(0);
      } catch {
        /* ignore */
      }
      if (ctx.state !== 'running' && !this.hidden) {
        await Promise.race([ctx.resume().catch(() => undefined), new Promise((r) => setTimeout(r, 1500))]);
      }
      if (ctx.state === 'running') {
        this.everRan = true;
        this.syncBeds();
      }
    } catch (e) {
      this.warnOnce('unlock', 'audio unlock failed', e);
    }
  }

  private buildGraph(ctx: AudioContext): void {
    const master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 1;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    master.connect(limiter);
    limiter.connect(ctx.destination);
    this.busNodes.set('master', master);
    const duck = ctx.createGain();
    duck.connect(master);
    this.bedDuck = duck;
    for (const b of BUSES) {
      if (b === 'master') continue;
      const g = ctx.createGain();
      g.connect(b === 'music' || b === 'amb' ? duck : master);
      this.busNodes.set(b, g);
    }
    for (const b of BUSES) this.applyBusGain(b, 0);
    if (this.duckState.on) duck.gain.value = dbToGain(this.duckState.db);
  }

  /* ------------------------------------------------------------- play */

  play(id: CueId, o: PlayOptions = {}): VoiceHandle | null {
    try {
      const ctx = this.ctx;
      if (!ctx || !this.everRan || this.hidden || ctx.state !== 'running') return null;
      const cue = this.manifest?.cues[id];
      if (!cue) {
        this.warnOnce(`unknown:${id}`, `unknown audio cue "${id}"`);
        return null;
      }
      const variants = cue.variants?.filter((v) => !!this.manifest?.cues[v]) ?? [];
      const useVariant = o.variant ?? variants.length > 1;
      let chosen = id;
      if (useVariant && variants.length > 1) chosen = this.pickVariant(id, variants);
      let buf = this.buffers.get(chosen);
      if (!buf && chosen !== id) {
        chosen = id;
        buf = this.buffers.get(id);
      }
      if (!buf) {
        void this.loadOne(chosen);
        return null;
      }
      // same cue re-triggered within 12 ms (same frame): identical stacking only adds level, skip it.
      // Both clocks must agree, so a frozen game clock (pause, QA virtual time) never mutes repeats.
      const t = this.now();
      const at = ctx.currentTime;
      const last = this.lastStart.get(id);
      if (last && !(o.delay && o.delay > 0) && t - last.now >= 0 && t - last.now < 12 && at - last.at < 0.012) return null;
      this.lastStart.set(id, { now: t, at });
      this.enforceCap(id, cue.maxVoices ?? 4);
      let rate = o.rate ?? 1;
      if (useVariant) rate *= Math.pow(2, ((Math.random() * 2 - 1) * 10) / 1200);
      const chosenCue = this.manifest?.cues[chosen] ?? cue;
      return this.startVoice(ctx, chosen, id, chosenCue, buf, { rate, gainDb: o.gainDb ?? 0, pan: o.pan, delay: o.delay, loop: false, fadeIn: 0 });
    } catch (e) {
      this.warnOnce(`play:${id}`, `audio play "${id}" failed`, e);
      return null;
    }
  }

  loop(id: CueId, o: LoopOptions = {}): LoopHandle | null {
    try {
      const ctx = this.ctx;
      if (!ctx || !this.everRan) return null;
      const cue = this.manifest?.cues[id];
      if (!cue) {
        this.warnOnce(`unknown:${id}`, `unknown audio cue "${id}"`);
        return null;
      }
      const buf = this.buffers.get(id);
      if (!buf) {
        void this.loadOne(id);
        return null;
      }
      this.enforceCap(id, cue.maxVoices ?? 4);
      return this.startVoice(ctx, id, id, cue, buf, { rate: o.rate ?? 1, gainDb: o.gainDb ?? 0, loop: true, fadeIn: o.fadeIn ?? 0.05 });
    } catch (e) {
      this.warnOnce(`loop:${id}`, `audio loop "${id}" failed`, e);
      return null;
    }
  }

  private pickVariant(group: CueId, variants: CueId[]): CueId {
    const last = this.lastVariant.get(group);
    const pool = variants.length > 1 ? variants.filter((v) => v !== last) : variants;
    const v = pool[Math.floor(Math.random() * pool.length)] ?? group;
    this.lastVariant.set(group, v);
    return v;
  }

  private enforceCap(group: CueId, max: number): void {
    const mine = this.voices.filter((v) => v.group === group && !v.stopped);
    let excess = mine.length - Math.max(1, max) + 1;
    for (const v of mine.sort((a, b) => a.started - b.started)) {
      if (excess-- <= 0) break;
      v.kill(0.02);
    }
    // global safety cap
    const live = this.voices.filter((v) => !v.stopped && !v.loop);
    if (live.length > 48) live.sort((a, b) => a.started - b.started)[0]?.kill(0.02);
  }

  private startVoice(
    ctx: AudioContext, id: CueId, group: CueId, cue: CueInfo, buf: AudioBuffer,
    o: { rate: number; gainDb: number; pan?: number; delay?: number; loop: boolean; fadeIn: number },
  ): LoopHandle {
    const bus = this.busNodes.get(cue.bus) ?? this.busNodes.get('sfx');
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = clamp(Number.isFinite(o.rate) ? o.rate : 1, 0.25, 4);
    if (o.loop) {
      src.loop = true;
      src.loopStart = 0;
      const d = cue.duration > 0 && cue.duration <= buf.duration + 0.001 ? cue.duration : buf.duration;
      src.loopEnd = d;
    }
    const gain = ctx.createGain();
    const level = dbToGain((cue.gainDb ?? 0) + (Number.isFinite(o.gainDb) ? o.gainDb : 0));
    const t0 = ctx.currentTime + Math.max(0, o.delay ?? 0);
    if (o.fadeIn > 0) {
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(level, t0 + o.fadeIn);
    } else {
      gain.gain.value = level;
    }
    src.connect(gain);
    let tail: AudioNode = gain;
    if (o.pan !== undefined && o.pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(o.pan, -1, 1);
      gain.connect(p);
      tail = p;
    }
    if (bus) tail.connect(bus);
    const voice: Voice = {
      id, group, bus: cue.bus, loop: o.loop, started: ctx.currentTime, stopped: false, src, gain,
      kill: (fade: number) => {
        if (voice.stopped) return;
        voice.stopped = true;
        try {
          const now = ctx.currentTime;
          const f = Math.max(0.005, Number.isFinite(fade) ? fade : 0.03);
          const p = gain.gain;
          const holder = p as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
          if (typeof holder.cancelAndHoldAtTime === 'function') {
            holder.cancelAndHoldAtTime(now);
          } else {
            const cur = p.value;
            p.cancelScheduledValues(now);
            p.setValueAtTime(cur, now);
          }
          p.linearRampToValueAtTime(0, now + f);
          src.stop(Math.max(now + f + 0.01, t0 + 0.001));
        } catch {
          try {
            src.stop();
          } catch {
            /* already stopped */
          }
        }
      },
    };
    src.onended = () => {
      voice.stopped = true;
      this.voices = this.voices.filter((v) => v !== voice);
      try {
        src.disconnect();
        gain.disconnect();
        if (tail !== gain) tail.disconnect();
      } catch {
        /* ignore */
      }
    };
    src.start(t0);
    this.voices.push(voice);
    return {
      stop: (fade = 0.06) => voice.kill(fade),
      setRate: (r: number) => {
        if (voice.stopped || !Number.isFinite(r)) return;
        try {
          src.playbackRate.setTargetAtTime(clamp(r, 0.25, 4), ctx.currentTime, 0.04);
        } catch {
          /* ignore */
        }
      },
    };
  }

  /* ------------------------------------------------------------- beds */

  /** Crossfade to another music loop (null = fade out). Each track restarts from its top. */
  music(id: CueId | null, fade = 1.5): void {
    this.setBed(0, id, fade);
  }

  /** Main ambience bed (null = fade out). */
  ambience(id: CueId | null, fade = 2): void {
    this.setBed(1, id, fade);
  }

  /** Second ambience layer on top of the main one (e.g. amb_scan during the bonus). */
  ambienceLayer(id: CueId | null, fade = 1.5): void {
    this.setBed(2, id, fade);
  }

  /** Alias of ambienceLayer. */
  ambience2(id: CueId | null, fade = 1.5): void {
    this.setBed(2, id, fade);
  }

  private setBed(slot: number, id: CueId | null, fade: number): void {
    try {
      const b = this.beds[slot];
      if (!b) return;
      b.wanted = id;
      b.fade = Math.max(0.01, Number.isFinite(fade) ? fade : 1);
      if (id && this.manifest && !this.manifest.cues[id]) this.warnOnce(`unknown:${id}`, `unknown audio cue "${id}"`);
      this.syncBed(slot);
    } catch (e) {
      this.warnOnce('bed', 'audio bed change failed', e);
    }
  }

  private syncBeds(): void {
    for (let i = 0; i < this.beds.length; i++) this.syncBed(i);
  }

  private syncBed(slot: number): void {
    const b = this.beds[slot];
    if (!b) return;
    const ctx = this.ctx;
    if (!ctx || !this.everRan || this.hidden) return;
    if (b.playing === b.wanted && (b.handle || !b.wanted)) return;
    if (b.handle && b.playing !== b.wanted) {
      b.handle.stop(b.fade);
      b.handle = null;
      b.playing = null;
    }
    if (!b.wanted || !this.manifest?.cues[b.wanted]) return;
    if (!this.buffers.has(b.wanted)) {
      void this.loadOne(b.wanted);
      return;
    }
    const h = this.loop(b.wanted, { fadeIn: b.fade });
    if (h) {
      b.handle = h;
      b.playing = b.wanted;
    }
  }

  /** Duck music + ambience (e.g. under big-win fanfares). */
  duck(on: boolean, o: { db?: number; fade?: number } = {}): void {
    try {
      this.duckState = { on, db: o.db ?? -9 };
      const d = this.bedDuck;
      const ctx = this.ctx;
      if (!d || !ctx) return;
      const fade = Math.max(0.01, o.fade ?? (on ? 0.25 : 0.8));
      d.gain.cancelScheduledValues(ctx.currentTime);
      d.gain.setTargetAtTime(on ? dbToGain(this.duckState.db) : 1, ctx.currentTime, fade / 3);
    } catch (e) {
      this.warnOnce('duck', 'audio duck failed', e);
    }
  }

  /* ----------------------------------------------------------- volume */

  /** Bus volume 0..1 (perceptual curve: gain = v^2). */
  setVolume(bus: Bus, v: number): void {
    if (!(bus in this.volumes)) return;
    this.volumes[bus] = clamp(Number.isFinite(v) ? v : 0, 0, 1);
    this.applyBusGain(bus);
  }

  getVolume(bus: Bus): number {
    return this.volumes[bus] ?? 0;
  }

  setMuted(bus: Bus, muted: boolean): void {
    if (!(bus in this.mutes)) return;
    this.mutes[bus] = !!muted;
    this.applyBusGain(bus);
  }

  isMuted(bus: Bus): boolean {
    return !!this.mutes[bus];
  }

  private applyBusGain(bus: Bus, ramp = 0.03): void {
    const node = this.busNodes.get(bus);
    const ctx = this.ctx;
    if (!node || !ctx) return;
    const v = this.volumes[bus];
    const g = this.mutes[bus] ? 0 : v * v;
    try {
      if (ramp > 0) {
        node.gain.cancelScheduledValues(ctx.currentTime);
        node.gain.setTargetAtTime(g, ctx.currentTime, ramp / 3);
      } else {
        node.gain.value = g;
      }
    } catch {
      node.gain.value = g;
    }
  }

  /* -------------------------------------------------------- lifecycle */

  /** Page hidden: fade out one-shots, then suspend the context (loops resume where they were). */
  suspend(): void {
    try {
      this.hidden = true;
      const ctx = this.ctx;
      if (!ctx) return;
      for (const v of this.voices) if (!v.loop) v.kill(0.03);
      if (this.suspendTimer) clearTimeout(this.suspendTimer);
      this.suspendTimer = setTimeout(() => {
        this.suspendTimer = null;
        if (this.hidden && ctx.state === 'running') ctx.suspend().catch(() => undefined);
      }, 60);
    } catch (e) {
      this.warnOnce('suspend', 'audio suspend failed', e);
    }
  }

  /** Page visible again. Pending music/ambience changes are applied. */
  resume(): void {
    try {
      this.hidden = false;
      if (this.suspendTimer) {
        clearTimeout(this.suspendTimer);
        this.suspendTimer = null;
      }
      const ctx = this.ctx;
      if (!ctx || !this.everRan) return;
      if (ctx.state !== 'running') {
        ctx.resume().then(() => this.syncBeds(), () => undefined);
      } else {
        this.syncBeds();
      }
    } catch (e) {
      this.warnOnce('resume', 'audio resume failed', e);
    }
  }

  /** Convenience: suspend/resume on document visibility. Returns an unbind function. */
  bindVisibility(doc: Document | undefined = typeof document !== 'undefined' ? document : undefined): () => void {
    if (!doc) return () => undefined;
    const onVis = (): void => (doc.visibilityState === 'hidden' ? this.suspend() : this.resume());
    doc.addEventListener('visibilitychange', onVis);
    return () => doc.removeEventListener('visibilitychange', onVis);
  }

  /** Skip / cancel: stop every sfx and ui voice (one-shots and sfx loops). Music and ambience keep playing. */
  stopAll(fade = 0.08): void {
    for (const v of [...this.voices]) if (v.bus === 'sfx' || v.bus === 'ui') v.kill(fade);
  }

  /* ------------------------------------------------------------- misc */

  private warnOnce(key: string, msg: string, err?: unknown): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    try {
      // unknown ids are expected while cues are being added: keep them at debug level
      const log = key.startsWith('unknown:') ? console.debug : console.warn;
      if (err !== undefined) log(`[audio] ${msg}`, err);
      else log(`[audio] ${msg}`);
    } catch {
      /* no console */
    }
  }
}
