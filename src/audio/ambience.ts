import { audio } from './engine';
import { mulberry32, type Mood } from './music';

/**
 * Ambiances continues du camp (bus « ambience »), 100 % synthétisées :
 * - base  : rivière et chute d'eau lointaines (bruits filtrés à modulation lente), vent léger en rafales,
 *           chants d'oiseaux synthétiques (quatre « espèces »), tambourinage lointain d'un pic.
 * - bonus : crépuscule : grillons (porteuse modulée en impulsions), insectes de nuit, vent plus grave,
 *           rivière plus lointaine, rares hululements et cris de plongeon (huard) sur le lac.
 * - super : nuit sous projecteurs : grillons, vent grave, groupe électrogène lointain (ronflement,
 *           battement du moteur, grésillement des projecteurs).
 * Événements rares ponctuels : ambience.event('distantBlast' | 'birds' | 'woodpecker' | ...).
 * Changement d'humeur : fondu enchaîné de 2 s. Ordonnancement sur l'horloge audio (lookahead).
 */

export type AmbienceEvent = 'distantBlast' | 'birds' | 'woodpecker' | 'sparks' | 'loon' | 'owl';

/* ------------------------------------------------------------------ */
/* Générateurs purs (testés dans tests/audio-ambience.test.ts)          */
/* ------------------------------------------------------------------ */

export interface Chirp {
  /** instant relatif (s) */
  t: number;
  f0: number;
  f1: number;
  dur: number;
  vol: number;
}

/** chant d'oiseau : 0 mésange (deux sifflets), 1 trille de paruline, 2 bruant (intro + trille), 3 grive (roulades) */
export function birdSong(rng: () => number, species: number): Chirp[] {
  const k = () => 0.92 + rng() * 0.16;
  const out: Chirp[] = [];
  switch (species % 4) {
    case 0: {
      const a = 3950 * k();
      out.push({ t: 0, f0: a, f1: a * 0.99, dur: 0.26, vol: 1 });
      out.push({ t: 0.34, f0: a * 0.86, f1: a * 0.84, dur: 0.3, vol: 0.85 });
      break;
    }
    case 1: {
      const n = 8 + Math.floor(rng() * 7);
      const base = 4600 * k();
      for (let i = 0; i < n; i++) out.push({ t: i * 0.068, f0: base * (1 + i * 0.01) * 1.15, f1: base * (1 + i * 0.01) * 0.82, dur: 0.045, vol: 0.55 + 0.45 * Math.sin((Math.PI * (i + 1)) / (n + 1)) });
      break;
    }
    case 2: {
      const b = 3000 * k();
      out.push({ t: 0, f0: b, f1: b, dur: 0.16, vol: 0.8 });
      out.push({ t: 0.22, f0: b * 1.18, f1: b * 1.18, dur: 0.12, vol: 0.8 });
      out.push({ t: 0.38, f0: b * 1.18, f1: b * 1.15, dur: 0.12, vol: 0.75 });
      for (let i = 0; i < 6; i++) out.push({ t: 0.56 + i * 0.055, f0: b * 1.45, f1: b * 1.2, dur: 0.04, vol: 0.6 });
      break;
    }
    default: {
      const n = 3 + Math.floor(rng() * 3);
      let t = 0;
      for (let i = 0; i < n; i++) {
        const lo = 2200 * k();
        const hi = lo * (1.25 + rng() * 0.2);
        const up = rng() < 0.5;
        out.push({ t, f0: up ? lo : hi, f1: up ? hi : lo, dur: 0.17, vol: 0.8 });
        t += 0.26 + rng() * 0.06;
      }
    }
  }
  return out;
}

export interface Hit {
  t: number;
  vol: number;
  f: number;
}

/** tambourinage de pic : 14 à 24 coups vers 17 Hz, ralentissement et extinction en fin de rafale */
export function woodpeckerHits(rng: () => number): Hit[] {
  const n = 14 + Math.floor(rng() * 11);
  const f = 1350 + rng() * 400;
  const out: Hit[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    out.push({ t, vol: x < 0.6 ? 1 : 1 - (x - 0.6) * 1.6, f: f * (1 - x * 0.04) });
    t += 0.056 + x * 0.018;
  }
  return out;
}

/** chant d'un grillon : count impulsions de width s, espacées de period s */
export function cricketPulses(start: number, count: number, period = 0.026, width = 0.014): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) out.push([start + i * period, start + i * period + width]);
  return out;
}

/** bruit blanc, rose (Paul Kellet) ou brun (intégré avec fuite), normalisé dans [-1, 1] */
export function fillNoise(out: Float32Array, color: 'white' | 'pink' | 'brown', rng: () => number): void {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  let br = 0;
  let peak = 1e-9;
  for (let i = 0; i < out.length; i++) {
    const w = rng() * 2 - 1;
    let v = w;
    if (color === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    } else if (color === 'brown') {
      br = (br + 0.02 * w) / 1.02;
      v = br;
    }
    out[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  // bouclage sans clic : fondu croisé des 20 ms de fin vers le début
  const x = Math.min(Math.floor(out.length / 4), 960);
  for (let i = 0; i < x; i++) {
    const a = i / x;
    const j = out.length - x + i;
    out[j] = (out[j] as number) * (1 - a) + (out[i] as number) * a;
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) / peak;
}

/** prochain délai aléatoire dans [min, max] */
export const gap = (rng: () => number, min: number, max: number): number => min + rng() * (max - min);

/* ------------------------------------------------------------------ */
/* Moteur                                                              */
/* ------------------------------------------------------------------ */

interface Bed {
  mood: Mood;
  gain: GainNode;
  level: number;
  nodes: AudioScheduledSourceNode[];
  tick(now: number, horizon: number): void;
  endAt: number | null;
}

const LOOKAHEAD = 0.3;
/** niveaux étalonnés par rendu hors ligne (volumes du moteur par défaut → RMS ≈ -33 dBFS au maître en base) */
const OUT_LEVEL = 1.8;
const BED_LEVEL: Record<Mood, number> = { base: 1, bonus: 1.45, super: 1.1 };
const TICK_MS = 100;
const XFADE = 2;

export class Ambience {
  private out: GainNode | null = null;
  private verb: ConvolverNode | null = null;
  private verbIn: GainNode | null = null;
  private beds: Bed[] = [];
  private mood: Mood = 'base';
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private paused = false;
  private waiting = false;
  private rng = mulberry32(0xa11b);
  private buf: { pink: AudioBuffer; brown: AudioBuffer } | null = null;

  get currentMood(): Mood {
    return this.mood;
  }

  private ensureGraph(): boolean {
    const c = audio.ctx;
    if (!c) return false;
    if (this.out) return true;
    this.out = c.createGain();
    this.out.gain.value = OUT_LEVEL;
    this.out.connect(audio.buses.ambience);
    this.verb = c.createConvolver();
    this.verb.buffer = audio.reverb.buffer;
    this.verbIn = c.createGain();
    this.verbIn.gain.value = 1;
    const wet = c.createGain();
    wet.gain.value = 0.6;
    this.verbIn.connect(this.verb).connect(wet).connect(this.out);
    const mk = (seconds: number, color: 'pink' | 'brown', seed: number) => {
      const b = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
      fillNoise(b.getChannelData(0), color, mulberry32(seed));
      return b;
    };
    this.buf = { pink: mk(7.9, 'pink', 71), brown: mk(6.7, 'brown', 73) };
    return true;
  }

  start(mood?: Mood): void {
    if (mood) this.mood = mood;
    if (this.running) return;
    if (!this.ensureGraph()) {
      if (!this.waiting) {
        this.waiting = true;
        audio.onUnlock(() => {
          this.waiting = false;
          this.start();
        });
      }
      return;
    }
    this.running = true;
    this.paused = false;
    const c = audio.ctx as AudioContext;
    const t = c.currentTime + 0.05;
    const o = (this.out as GainNode).gain;
    o.cancelScheduledValues(t);
    o.setValueAtTime(o.value, t);
    o.linearRampToValueAtTime(OUT_LEVEL, t + 0.1);
    this.addBed(this.mood, t, 2.5);
    this.ensureTimer();
  }

  setMood(m: Mood): void {
    if (m === this.mood) return;
    this.mood = m;
    if (!this.running || !audio.ctx) return;
    const t = audio.ctx.currentTime + 0.03;
    for (const b of this.beds) if (b.endAt === null) this.fadeBed(b, t, XFADE);
    this.addBed(m, t, XFADE);
  }

  stop(fadeMs = 1500): void {
    if (!audio.ctx || !this.running) return;
    const t = audio.ctx.currentTime;
    for (const b of this.beds) if (b.endAt === null) this.fadeBed(b, t, Math.max(0.05, fadeMs / 1000));
    this.running = false;
    this.paused = false;
    this.ensureTimer();
  }

  pause(p: boolean): void {
    if (!audio.ctx || !this.out || p === this.paused) return;
    this.paused = p;
    const t = audio.ctx.currentTime;
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(p ? 0 : OUT_LEVEL, t + (p ? 0.3 : 0.8));
  }

  /** événement rare ponctuel (décor) */
  event(kind: AmbienceEvent): void {
    if (!audio.ready || !this.ensureGraph() || this.paused) return;
    const c = audio.ctx as AudioContext;
    const t = c.currentTime + 0.03;
    const dest = this.out as GainNode;
    const rng = this.rng;
    switch (kind) {
      case 'distantBlast':
        this.distantBlast(t, dest);
        break;
      case 'birds': {
        // envol : battements d'ailes qui s'éloignent, puis cris
        const from = rng() < 0.5 ? -0.6 : 0.6;
        const pan = this.panner(from, dest);
        pan.pan.setValueAtTime(from, t);
        pan.pan.linearRampToValueAtTime(-from * 0.8, t + 1.6);
        const n = 10 + Math.floor(rng() * 7);
        let tt = t;
        for (let i = 0; i < n; i++) {
          this.noiseHit(tt, 'bandpass', 650 + rng() * 350, 1.6, 0.05 * (1 - (i / n) * 0.7), 0.028, pan);
          tt += 0.062 + i * 0.004;
        }
        for (let k = 0; k < 4 + Math.floor(rng() * 3); k++) this.song(t + 0.2 + rng() * 1.2, Math.floor(rng() * 4), 0.028, this.panner(rng() * 1.4 - 0.7, dest));
        break;
      }
      case 'woodpecker':
        this.woodpecker(t, this.panner(rng() * 1.2 - 0.6, dest), 0.07);
        break;
      case 'sparks': {
        // étincelles de chantier : crépitements secs
        const pan = this.panner(rng() * 0.8 - 0.4, dest);
        const n = 8 + Math.floor(rng() * 8);
        for (let i = 0; i < n; i++) this.noiseHit(t + rng() * 0.45, 'highpass', 3000 + rng() * 3000, 0.7, 0.03 + rng() * 0.03, 0.004 + rng() * 0.004, pan);
        this.noiseHit(t, 'bandpass', 5200, 1.2, 0.012, 0.35, pan);
        break;
      }
      case 'loon':
        this.loon(t, this.panner(rng() * 1.2 - 0.6, dest));
        break;
      case 'owl':
        this.owl(t, this.panner(rng() * 1.2 - 0.6, dest));
        break;
    }
  }

  /* ---------------- construction des lits ---------------- */

  private addBed(m: Mood, t: number, fadeS: number): void {
    const c = audio.ctx as AudioContext;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(this.out as GainNode);
    const bed: Bed = { mood: m, gain, level: BED_LEVEL[m], nodes: [], tick: () => undefined, endAt: null };
    if (m === 'base') this.buildBase(bed, t);
    else this.buildNight(bed, t, m === 'super');
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(bed.level, t + fadeS);
    this.beds.push(bed);
  }

  private fadeBed(b: Bed, t: number, dur: number): void {
    const g = b.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + dur);
    b.endAt = t + dur;
    for (const n of b.nodes) {
      try {
        n.stop(t + dur + 0.1);
      } catch {
        /* déjà arrêté */
      }
    }
  }

  private loop(bed: Bed, which: 'pink' | 'brown', rate: number, t: number): AudioBufferSourceNode {
    const c = audio.ctx as AudioContext;
    const s = c.createBufferSource();
    const b = (this.buf as { pink: AudioBuffer; brown: AudioBuffer })[which];
    s.buffer = b;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(t, this.rng() * b.duration);
    bed.nodes.push(s);
    return s;
  }

  private filter(type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
    const b = (audio.ctx as AudioContext).createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  private gainNode(v: number): GainNode {
    const g = (audio.ctx as AudioContext).createGain();
    g.gain.value = v;
    return g;
  }

  private panner(p: number, dest: AudioNode): StereoPannerNode {
    const s = (audio.ctx as AudioContext).createStereoPanner();
    s.pan.value = Math.max(-1, Math.min(1, p));
    s.connect(dest);
    return s;
  }

  private lfo(bed: Bed | null, freq: number, depth: number, target: AudioParam, t: number, type: OscillatorType = 'sine'): OscillatorNode {
    const c = audio.ctx as AudioContext;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start(t);
    bed?.nodes.push(o);
    return o;
  }

  /** rivière / chute d'eau : grondement brun + chuintement rose, modulations lentes */
  private water(bed: Bed, t: number, level: number, bright: number, pan: number): void {
    const rumble = this.loop(bed, 'brown', 1, t);
    const lp = this.filter('lowpass', 520 + bright * 200);
    const g1 = this.gainNode(0.24 * level);
    this.lfo(bed, 0.071, 0.05 * level, g1.gain, t);
    rumble.connect(lp).connect(g1).connect(this.panner(pan, bed.gain));
    const hiss = this.loop(bed, 'pink', 0.97, t);
    const bp = this.filter('bandpass', 1400 + bright * 700, 0.55);
    this.lfo(bed, 0.113, 260, bp.frequency, t);
    const g2 = this.gainNode(0.07 * level * bright);
    this.lfo(bed, 0.19, 0.02 * level * bright, g2.gain, t);
    hiss.connect(bp).connect(g2).connect(this.panner(pan - 0.15, bed.gain));
    // seconde couche décorrélée de l'autre côté : largeur stéréo
    const hiss2 = this.loop(bed, 'pink', 1.03, t);
    const bp2 = this.filter('bandpass', 1100 + bright * 600, 0.6);
    const g3 = this.gainNode(0.035 * level * bright);
    hiss2.connect(bp2).connect(g3).connect(this.panner(pan + 0.5, bed.gain));
  }

  /** vent : bande de bruit dont les rafales sont planifiées */
  private wind(bed: Bed, t: number, center: number, base: number, peak: number): (now: number, horizon: number) => void {
    const src = this.loop(bed, center < 400 ? 'brown' : 'pink', 1, t);
    const bp = this.filter('bandpass', center, 1.1);
    const g = this.gainNode(base);
    const pan = this.panner(0, bed.gain);
    this.lfo(bed, 0.037, 0.55, pan.pan, t);
    src.connect(bp).connect(g).connect(pan);
    let next = t + gap(this.rng, 1, 4);
    return (now, horizon) => {
      if (next > horizon) return;
      const at = Math.max(next, now);
      const up = gap(this.rng, 0.9, 1.8);
      const p = base + (peak - base) * gap(this.rng, 0.45, 1);
      g.gain.setTargetAtTime(p, at, up / 3);
      g.gain.setTargetAtTime(base, at + up, gap(this.rng, 0.8, 1.4));
      bp.frequency.setTargetAtTime(center * gap(this.rng, 1.2, 1.6), at, up / 3);
      bp.frequency.setTargetAtTime(center, at + up, 1);
      next = at + up + gap(this.rng, 3, 8);
    };
  }

  private buildBase(bed: Bed, t: number): void {
    this.water(bed, t, 1, 1, -0.35);
    const wind = this.wind(bed, t, 560, 0.018, 0.06);
    let nextBird = t + gap(this.rng, 1.5, 4);
    let nextPecker = t + gap(this.rng, 12, 30);
    bed.tick = (now, horizon) => {
      wind(now, horizon);
      if (nextBird <= horizon) {
        const at = Math.max(nextBird, now);
        const sp = Math.floor(this.rng() * 4);
        this.song(at, sp, gap(this.rng, 0.018, 0.04), this.panner(this.rng() * 1.6 - 0.8, bed.gain));
        // parfois une réponse d'un second oiseau
        if (this.rng() < 0.35) this.song(at + gap(this.rng, 0.8, 1.6), sp, gap(this.rng, 0.012, 0.025), this.panner(this.rng() * 1.6 - 0.8, bed.gain));
        nextBird = at + gap(this.rng, 3.5, 11);
      }
      if (nextPecker <= horizon) {
        const at = Math.max(nextPecker, now);
        this.woodpecker(at, this.panner(this.rng() * 1.4 - 0.7, bed.gain), 0.035);
        nextPecker = at + gap(this.rng, 22, 55);
      }
    };
  }

  private buildNight(bed: Bed, t: number, superNight: boolean): void {
    const c = audio.ctx as AudioContext;
    this.water(bed, t, 0.55, 0.45, -0.4);
    const wind = this.wind(bed, t, 300, 0.035, 0.1);
    // insectes de nuit : bande étroite très aiguë, modulée
    const ins = this.loop(bed, 'pink', 1, t);
    const bp = this.filter('bandpass', 6800, 5);
    const ig = this.gainNode(0.016);
    this.lfo(bed, 13, 0.01, ig.gain, t, 'triangle');
    const swell = this.gainNode(1);
    this.lfo(bed, 0.05, 0.4, swell.gain, t);
    ins.connect(bp).connect(ig).connect(swell).connect(this.panner(0.3, bed.gain));
    // grillons : porteuses sinus, portes d'amplitude planifiées
    const crickets = (superNight ? [4400, 4750] : [4300, 4650, 4950]).map((f, i) => {
      const o = c.createOscillator();
      o.frequency.value = f;
      const gate = this.gainNode(0);
      o.connect(gate).connect(this.panner(i === 0 ? -0.55 : i === 1 ? 0.6 : 0.1, bed.gain));
      o.start(t);
      bed.nodes.push(o);
      return { gate, next: t + this.rng() * 0.5, period: gap(this.rng, 0.42, 0.62), pulses: 3 + (i % 2), vol: (superNight ? 0.014 : 0.02) * (1 - i * 0.2) };
    });
    let nextCall = t + gap(this.rng, 14, 30);
    if (superNight) {
      // groupe électrogène lointain + grésillement des projecteurs
      const hum = c.createOscillator();
      hum.type = 'sawtooth';
      hum.frequency.value = 58;
      const hum2 = c.createOscillator();
      hum2.type = 'triangle';
      hum2.frequency.value = 116.4;
      this.lfo(bed, 0.23, 0.5, hum.frequency, t);
      const lp = this.filter('lowpass', 240, 1);
      const hg = this.gainNode(0.05);
      this.lfo(bed, 7.2, 0.014, hg.gain, t);
      hum.connect(lp);
      hum2.connect(lp);
      lp.connect(hg).connect(this.panner(0.45, bed.gain));
      const buzz = c.createOscillator();
      buzz.type = 'square';
      buzz.frequency.value = 120;
      const bb = this.filter('bandpass', 2400, 3);
      const bg = this.gainNode(0.0035);
      buzz.connect(bb).connect(bg).connect(this.panner(-0.2, bed.gain));
      for (const o of [hum, hum2, buzz]) {
        o.start(t);
        bed.nodes.push(o);
      }
    }
    bed.tick = (now, horizon) => {
      wind(now, horizon);
      for (const k of crickets) {
        while (k.next <= horizon) {
          const at = Math.max(k.next, now);
          for (const [a, b] of cricketPulses(at, k.pulses)) {
            k.gate.gain.setValueAtTime(0, a);
            k.gate.gain.linearRampToValueAtTime(k.vol, a + 0.003);
            k.gate.gain.setValueAtTime(k.vol, b - 0.003);
            k.gate.gain.linearRampToValueAtTime(0, b);
          }
          // les grillons se taisent parfois quelques secondes
          k.next = at + (this.rng() < 0.07 ? gap(this.rng, 1.5, 4) : k.period * (0.96 + this.rng() * 0.08));
        }
      }
      if (nextCall <= horizon) {
        const at = Math.max(nextCall, now);
        const pan = this.panner(this.rng() * 1.2 - 0.6, bed.gain);
        if (!superNight && this.rng() < 0.5) this.loon(at, pan);
        else this.owl(at, pan);
        nextCall = at + gap(this.rng, 25, 60);
      }
    };
  }

  /* ---------------- voix ponctuelles ---------------- */

  private song(t: number, species: number, vol: number, dest: AudioNode): void {
    const c = audio.ctx as AudioContext;
    for (const ch of birdSong(this.rng, species)) {
      const at = t + ch.t;
      const o = c.createOscillator();
      o.frequency.setValueAtTime(ch.f0, at);
      o.frequency.exponentialRampToValueAtTime(ch.f1, at + ch.dur);
      const g = c.createGain();
      const peak = vol * ch.vol;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(peak, at + ch.dur * 0.2);
      g.gain.setValueAtTime(peak, at + ch.dur * 0.6);
      g.gain.linearRampToValueAtTime(0, at + ch.dur);
      o.connect(g).connect(dest);
      if (this.verbIn) g.connect(this.gainNode(0.25)).connect(this.verbIn);
      o.start(at);
      o.stop(at + ch.dur + 0.02);
    }
  }

  private woodpecker(t: number, dest: AudioNode, vol: number): void {
    const c = audio.ctx as AudioContext;
    const lp = this.filter('lowpass', 3200);
    lp.connect(dest);
    if (this.verbIn) lp.connect(this.gainNode(0.5)).connect(this.verbIn);
    for (const h of woodpeckerHits(this.rng)) {
      const at = t + h.t;
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = h.f * 0.62;
      const g = c.createGain();
      g.gain.setValueAtTime(vol * h.vol, at);
      g.gain.setTargetAtTime(0, at + 0.002, 0.006);
      o.connect(g).connect(lp);
      o.start(at);
      o.stop(at + 0.05);
      this.noiseHit(at, 'bandpass', h.f, 4, vol * h.vol * 0.8, 0.008, lp);
    }
  }

  private noiseHit(t: number, type: BiquadFilterType, f: number, q: number, vol: number, dur: number, dest: AudioNode): void {
    const c = audio.ctx as AudioContext;
    const s = c.createBufferSource();
    s.buffer = audio.noise();
    const bf = this.filter(type, f, q);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.004, dur / 3));
    g.gain.setTargetAtTime(0, t + Math.min(0.004, dur / 3), dur / 3);
    s.connect(bf).connect(g).connect(dest);
    s.start(t, (t * 3.7) % 1.5);
    s.stop(t + dur * 2 + 0.05);
  }

  private distantBlast(t: number, dest: AudioNode): void {
    const c = audio.ctx as AudioContext;
    const boom = (at: number, peak: number, f: number, decay: number) => {
      const s = c.createBufferSource();
      s.buffer = (this.buf as { brown: AudioBuffer }).brown;
      const lp = this.filter('lowpass', f, 0.9);
      const g = c.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(peak, at + 0.03);
      g.gain.setTargetAtTime(0, at + 0.05, decay / 3);
      s.connect(lp).connect(g).connect(dest);
      if (this.verbIn) g.connect(this.gainNode(0.8)).connect(this.verbIn);
      s.start(at, this.rng() * 3);
      s.stop(at + decay * 1.6 + 0.2);
    };
    boom(t, 0.3, 170, 1.6);
    this.noiseHit(t, 'bandpass', 800, 0.8, 0.035, 0.09, dest);
    boom(t + 0.55, 0.1, 120, 1.2); // écho sur la montagne
    boom(t + 0.25, 0.08, 80, 2.6); // grondement
    for (let i = 0; i < 6; i++) this.noiseHit(t + 0.9 + this.rng() * 0.8, 'bandpass', 900 + this.rng() * 900, 3, 0.01, 0.02, dest);
  }

  /** huard (plongeon) : longue plainte glissée, signature des lacs du Nord */
  private loon(t: number, dest: AudioNode): void {
    const c = audio.ctx as AudioContext;
    const o = c.createOscillator();
    o.type = 'sine';
    const f = 620 + this.rng() * 60;
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * 1.5, t + 0.5);
    o.frequency.setValueAtTime(f * 1.5, t + 1.1);
    o.frequency.linearRampToValueAtTime(f * 1.33, t + 1.5);
    o.frequency.setValueAtTime(f * 1.33, t + 2.1);
    const vib = this.lfo(null, 5, 6, o.frequency, t);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.018, t + 0.25);
    g.gain.setValueAtTime(0.018, t + 1.8);
    g.gain.linearRampToValueAtTime(0, t + 2.3);
    o.connect(g).connect(dest);
    if (this.verbIn) g.connect(this.gainNode(0.9)).connect(this.verbIn);
    o.start(t);
    o.stop(t + 2.4);
    vib.stop(t + 2.4);
  }

  private owl(t: number, dest: AudioNode): void {
    const c = audio.ctx as AudioContext;
    const n = 2 + Math.floor(this.rng() * 2);
    const f = 360 + this.rng() * 40;
    let at = t;
    for (let i = 0; i < n; i++) {
      const long = i === n - 1;
      const o = c.createOscillator();
      o.frequency.setValueAtTime(f * 1.04, at);
      o.frequency.linearRampToValueAtTime(f * 0.96, at + (long ? 0.6 : 0.25));
      const g = c.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.02, at + 0.06);
      g.gain.linearRampToValueAtTime(0, at + (long ? 0.6 : 0.25));
      o.connect(g).connect(dest);
      if (this.verbIn) g.connect(this.gainNode(0.7)).connect(this.verbIn);
      o.start(at);
      o.stop(at + 0.7);
      at += long ? 0.8 : 0.38;
    }
  }

  /* ---------------- planificateur ---------------- */

  pump(ahead = LOOKAHEAD): void {
    const c = audio.ctx;
    if (!c || !this.out) return;
    const now = c.currentTime;
    const horizon = now + ahead;
    if (!this.paused) for (const b of this.beds) if (b.endAt === null) b.tick(now, horizon);
    this.beds = this.beds.filter((b) => {
      if (b.endAt !== null && now > b.endAt + 0.3) {
        b.gain.disconnect();
        return false;
      }
      return true;
    });
    if (!this.running && this.beds.length === 0) this.stopTimer();
  }

  private ensureTimer(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.pump(), TICK_MS);
  }

  private stopTimer(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}

export const ambience = new Ambience();
