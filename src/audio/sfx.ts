import { audio, vary } from './engine';

/**
 * Sons originaux synthétisés (Web Audio), instruments du thème : bois, métal, mèche, explosions,
 * banjo/marimba pour les gains, cuivres pour les paliers. Aucun son tiers. Variation légère des répétitions.
 * La musique et les ambiances sont gérées par music.ts.
 */
type Opts = { pitch?: number; volume?: number };

const now = () => audio.ctx!.currentTime;

function env(g: GainNode, t: number, a: number, peak: number, d: number, sustain = 0): void {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d);
}

function tone(type: OscillatorType, freq: number, t: number, dur: number, vol: number, dest: AudioNode, glide?: number): void {
  const ctx = audio.ctx!;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
  env(g, t, 0.005, vol, dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(t: number, dur: number, vol: number, dest: AudioNode, filter: BiquadFilterType, f0: number, f1?: number, q = 0.8): void {
  const ctx = audio.ctx!;
  const s = ctx.createBufferSource();
  s.buffer = audio.noise();
  s.loop = true;
  const bf = ctx.createBiquadFilter();
  bf.type = filter;
  bf.frequency.setValueAtTime(f0, t);
  if (f1) bf.frequency.exponentialRampToValueAtTime(f1, t + dur);
  bf.Q.value = q;
  const g = ctx.createGain();
  env(g, t, 0.004, vol, dur);
  s.connect(bf).connect(g).connect(dest);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.05);
}

/** corde pincée (Karplus-Strong simplifié via filtre en peigne) : banjo / guitare du chantier */
function pluck(freq: number, t: number, vol: number, dest: AudioNode, bright = 3200): void {
  const ctx = audio.ctx!;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = freq;
  const bp = ctx.createBiquadFilter();
  bp.type = 'lowpass';
  bp.frequency.setValueAtTime(bright, t);
  bp.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.35);
  const g = ctx.createGain();
  env(g, t, 0.003, vol, 0.45);
  o.connect(bp).connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.6);
}

const NOTE = (n: number) => 220 * 2 ** (n / 12);
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export function sfx(name: string, opts: Opts = {}): void {
  if (!audio.ready) return; // un son demandé avant l'activation n'est jamais rejoué plus tard
  const out = audio.buses.sfx;
  const t = now() + 0.005;
  const p = (opts.pitch ?? 1) * vary(0.03);
  const v = (opts.volume ?? 1) * vary(0.06);
  switch (name) {
    case 'ui':
      tone('triangle', 660 * p, t, 0.06, 0.12 * v, out);
      noise(t, 0.03, 0.05 * v, out, 'highpass', 3000);
      break;
    case 'spinStart': // départ doux : ratchet en bois
      for (let i = 0; i < 4; i++) noise(t + i * 0.035, 0.03, 0.12 * v, out, 'bandpass', 1800 + i * 200, undefined, 4);
      tone('sine', 140 * p, t, 0.18, 0.12 * v, out, 90);
      break;
    case 'reelStop': // arrêt mat : bloc de bois frappé
      tone('sine', 190 * p, t, 0.12, 0.22 * v, out, 120);
      noise(t, 0.05, 0.14 * v, out, 'bandpass', 900 * p, undefined, 2.5);
      break;
    case 'scatter': // Scatter : clac de détonateur + tintement montant
      noise(t, 0.04, 0.2 * v, out, 'bandpass', 2400, undefined, 3);
      tone('square', 520 * p, t + 0.02, 0.18, 0.08 * v, out);
      tone('triangle', 1040 * p, t + 0.05, 0.3, 0.1 * v, out);
      break;
    case 'win':
    case 'winLow': {
      const base = (name === 'win' ? 4 : 0) + Math.floor(Math.random() * 3);
      [0, 2, 4].forEach((k, i) => pluck(NOTE(PENTA[(base + k) % PENTA.length] as number) * p, t + i * 0.06, 0.13 * v, out));
      break;
    }
    case 'winHigh':
      [0, 2, 4, 5].forEach((k, i) => pluck(NOTE(12 + (PENTA[k] as number)) * p, t + i * 0.05, 0.15 * v, out, 4200));
      tone('triangle', NOTE(24) * p, t + 0.2, 0.4, 0.06 * v, out);
      break;
    case 'fuse': // mèche : grésillement
      noise(t, 0.5, 0.08 * v, out, 'highpass', 5000);
      break;
    case 'match': // allumette sur la dent en or
      noise(t, 0.12, 0.2 * v, out, 'bandpass', 3500, 1800, 2);
      noise(t + 0.08, 0.35, 0.06 * v, out, 'highpass', 4500);
      break;
    case 'blast':
    case 'blastBig': {
      const big = name === 'blastBig' ? 1.4 : 1;
      noise(t, 0.9 * big, 0.55 * v, out, 'lowpass', 2400, 90, 0.7);
      tone('sine', 80 * p, t, 0.6 * big, 0.5 * v, out, 32);
      noise(t, 0.08, 0.35 * v, out, 'highpass', 2500);
      // débris : petits cliquetis de pierre
      for (let i = 0; i < 7; i++) noise(t + 0.15 + i * 0.07 + Math.random() * 0.05, 0.03, 0.08 * v, out, 'bandpass', 1400 + Math.random() * 1600, undefined, 5);
      audio.send(out, 0);
      break;
    }
    case 'carve': // coups de ciseau + pierre qui se met en place
      [0, 0.1, 0.2].forEach((d, i) => {
        noise(t + d, 0.05, 0.16 * v, out, 'bandpass', 3000 + i * 400, undefined, 6);
        tone('triangle', (880 + i * 110) * p, t + d, 0.08, 0.06 * v, out);
      });
      tone('sine', 110 * p, t + 0.28, 0.3, 0.2 * v, out, 70);
      break;
    case 'tumble': // gravats qui tombent
      for (let i = 0; i < 5; i++) noise(t + i * 0.05, 0.06, 0.08 * v, out, 'bandpass', 700 + Math.random() * 600, undefined, 2);
      break;
    case 'multUp': // chiffres regravés dans la pierre
      tone('square', 330 * p, t, 0.08, 0.08 * v, out);
      noise(t, 0.1, 0.18 * v, out, 'bandpass', 2600, 1200, 3);
      tone('triangle', 660 * p, t + 0.06, 0.25, 0.1 * v, out);
      break;
    case 'thump': // queue sur le bloc
      tone('sine', 70 * p, t, 0.3, 0.45 * v, out, 45);
      noise(t, 0.06, 0.2 * v, out, 'lowpass', 600);
      break;
    case 'trigger': // déclenchement du bonus : fanfare de cuivres synthétiques
    case 'retrigger':
      [0, 4, 7, 12].forEach((k, i) => {
        tone('sawtooth', NOTE(k + 3) * p, t + i * 0.09, 0.35, 0.07 * v, out);
        tone('square', NOTE(k + 15) * p, t + i * 0.09, 0.3, 0.03 * v, out);
      });
      audio.duckMusic(0.3, 900, 500);
      break;
    case 'plusFs':
      [0, 7, 12].forEach((k, i) => pluck(NOTE(k + 12) * p, t + i * 0.07, 0.16 * v, out, 5000));
      break;
    case 'tier':
      [0, 4, 7, 12, 16].forEach((k, i) => {
        tone('sawtooth', NOTE(k) * p, t + i * 0.07, 0.5, 0.06 * v, out);
        pluck(NOTE(k + 12) * p, t + i * 0.07, 0.12 * v, out, 5200);
      });
      audio.duckMusic(0.25, 1600, 700);
      break;
    case 'countTick':
      tone('triangle', 1400 * p, t, 0.03, 0.04 * v, out);
      break;
    case 'coin':
      tone('triangle', 1760 * p, t, 0.08, 0.05 * v, out);
      tone('triangle', 2640 * p, t + 0.03, 0.1, 0.03 * v, out);
      break;
    case 'whoosh':
      noise(t, 0.35, 0.12 * v, out, 'bandpass', 600, 2400, 1.2);
      break;
    case 'error':
      tone('square', 180, t, 0.16, 0.08 * v, out);
      tone('square', 140, t + 0.14, 0.2, 0.08 * v, out);
      break;
  }
}

/** tension d'anticipation : bourdon qui monte, pulsation de mèche */
let tensionNodes: { o: OscillatorNode; g: GainNode; lfo: OscillatorNode } | null = null;
export function tension(on: boolean): void {
  if (!audio.ready) return;
  const ctx = audio.ctx!;
  const t = ctx.currentTime;
  if (on && !tensionNodes) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t);
    o.frequency.linearRampToValueAtTime(220, t + 2.4);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.5);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lg = ctx.createGain();
    lg.gain.value = 0.04;
    lfo.connect(lg).connect(g.gain);
    o.connect(f).connect(g).connect(audio.buses.sfx);
    o.start();
    lfo.start();
    tensionNodes = { o, g, lfo };
  } else if (!on && tensionNodes) {
    const n = tensionNodes;
    n.g.gain.cancelScheduledValues(t);
    n.g.gain.setValueAtTime(n.g.gain.value, t);
    n.g.gain.linearRampToValueAtTime(0, t + 0.25);
    n.o.stop(t + 0.3);
    n.lfo.stop(t + 0.3);
    tensionNodes = null;
  }
}
