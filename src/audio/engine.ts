/**
 * Moteur audio Web Audio.
 * - Bus : musique, ambiance, effets (+ maître), volumes indépendants et mute.
 * - Activation à la première interaction ; onglet masqué / pause : suspension propre.
 * - Ducking de la musique sous les fanfares ; légères variations des sons répétés.
 * - Un son demandé avant l'activation n'est jamais rejoué plus tard (pas de rattrapage d'événements passés).
 * - Limiteur doux sur le maître : ni saturation ni grésillement.
 */
export type Bus = 'music' | 'ambience' | 'sfx';

export interface Voice {
  stop(fadeMs?: number): void;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  buses!: Record<Bus, GainNode>;
  private duck!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private reverbSend!: GainNode;
  reverb!: ConvolverNode;
  private volumes: Record<Bus | 'master', number> = { master: 0.8, music: 0.55, ambience: 0.6, sfx: 0.85 };
  private muted = false;
  private unlocked = false;
  private hidden = false;
  private noiseBuf: AudioBuffer | null = null;
  private listeners: Array<() => void> = [];

  constructor() {
    if (typeof document === 'undefined') return;
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      this.applySuspend();
    });
  }

  get ready(): boolean {
    return this.unlocked && !!this.ctx && this.ctx.state === 'running';
  }

  onUnlock(fn: () => void): void {
    if (this.unlocked) fn();
    else this.listeners.push(fn);
  }

  unlock(): void {
    if (this.unlocked) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.connect(this.limiter).connect(ctx.destination);
    this.duck = ctx.createGain();
    this.duck.connect(this.master);
    this.buses = {
      music: ctx.createGain(),
      ambience: ctx.createGain(),
      sfx: ctx.createGain(),
    };
    this.buses.music.connect(this.duck);
    this.buses.ambience.connect(this.master);
    this.buses.sfx.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.2, 2.8);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.9;
    this.reverbSend.connect(this.reverb).connect(this.master);
    this.applyVolumes();
    this.unlocked = true;
    void ctx.resume();
    const l = this.listeners;
    this.listeners = [];
    for (const fn of l) fn();
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    let seed = 1337;
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const n = (seed / 0x7fffffff) * 2 - 1;
        d[i] = n * (1 - i / len) ** decay;
      }
    }
    return buf;
  }

  noise(): AudioBuffer {
    if (this.noiseBuf) return this.noiseBuf;
    const ctx = this.ctx as AudioContext;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 99;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    this.noiseBuf = buf;
    return buf;
  }

  /** envoi vers la réverbération partagée */
  send(node: AudioNode, amount: number): void {
    if (!this.ctx || amount <= 0) return;
    const g = this.ctx.createGain();
    g.gain.value = amount;
    node.connect(g).connect(this.reverbSend);
  }

  setVolume(bus: Bus | 'master', v: number): void {
    this.volumes[bus] = Math.max(0, Math.min(1, v));
    this.applyVolumes();
  }

  getVolume(bus: Bus | 'master'): number {
    return this.volumes[bus];
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolumes();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const curve = (v: number) => v * v; // perception
    this.master.gain.setTargetAtTime(this.muted ? 0 : curve(this.volumes.master), t, 0.03);
    for (const b of ['music', 'ambience', 'sfx'] as Bus[]) this.buses[b].gain.setTargetAtTime(curve(this.volumes[b]), t, 0.03);
  }

  private pausedByGame = false;
  setPaused(p: boolean): void {
    this.pausedByGame = p;
    this.applySuspend();
  }

  private applySuspend(): void {
    if (!this.ctx) return;
    if (this.hidden || this.pausedByGame) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  /** baisse la musique (fanfares) puis la remonte */
  duckMusic(amount = 0.35, holdMs = 1200, releaseMs = 600): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.duck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(amount, t + 0.08);
    g.setValueAtTime(amount, t + holdMs / 1000);
    g.linearRampToValueAtTime(1, t + (holdMs + releaseMs) / 1000);
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }
}

export const audio = new AudioEngine();

/** variation légère (hauteur/volume) pour les sons répétés */
let varSeed = 7;
export function vary(amount = 0.04): number {
  varSeed = (varSeed * 16807) % 2147483647;
  return 1 + ((varSeed / 2147483647) * 2 - 1) * amount;
}
