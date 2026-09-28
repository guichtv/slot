import { audio, vary } from './engine';
import { audioWarn, idleReverb, music, prewarm, voice, type Inst } from './music';

/**
 * Effets sonores originaux, 100 % synthétisés (Web Audio), aucun son tiers.
 * Matières du thème : bois (wood-blocks, planches), acier (détonateur, ciseau), mèche (grésillement),
 * granit (éclats, fissures, gravats), explosions en couches (claquement, corps, infra, grondement, débris).
 * Les gains et fanfares utilisent les timbres de la musique (banjo Karplus-Strong, cuivres, taikos,
 * sifflet), accordés en sol majeur pour rester consonants avec la musique quelle que soit l'humeur.
 * Chaque répétition varie légèrement (hauteur, volume, placement) via vary().
 * Niveaux : crêtes modestes (somme des couches < ~0,8 avant le bus), le maître a un limiteur.
 */
export const SFX_NAMES = [
  'ui',
  'toggle',
  'spinStart',
  'reelStop',
  'scatter',
  'anticipationLand',
  'anticipationMiss',
  'win',
  'winLow',
  'winHigh',
  'fuse',
  'chain',
  'match',
  'blast',
  'blastBig',
  'carve',
  'crack',
  'tumble',
  'collect',
  'multUp',
  'engrave',
  'thump',
  'trigger',
  'retrigger',
  'plusFs',
  'tier',
  'maxWin',
  'bonusIntro',
  'bonusOutro',
  'countTick',
  'coin',
  'whoosh',
  'error',
  'buyOpen',
  'buyConfirm',
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

type Opts = { pitch?: number; volume?: number };

/* ---------------- helpers purs ---------------- */

const PENTA_LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

/** hauteur du Scatter n (le présentateur envoie 1 + (n-1)·0,12) → n-ième degré pentatonique */
export function scatterSemis(rawPitch: number): number {
  const n = Math.max(0, Math.round((rawPitch - 1) / 0.12));
  return PENTA_LADDER[Math.min(PENTA_LADDER.length - 1, n)] as number;
}

/** ramène un facteur de hauteur au degré pentatonique le plus proche (reste dans la tonalité) */
export function quantizePitch(p: number): number {
  const semis = 12 * Math.log2(Math.max(0.1, p));
  let best = 0;
  let bd = Infinity;
  for (let o = -2; o <= 3; o++)
    for (const s of [0, 2, 4, 7, 9]) {
      const x = o * 12 + s;
      const d = Math.abs(x - semis);
      if (d < bd) {
        bd = d;
        best = x;
      }
    }
  return 2 ** (best / 12);
}

/* ---------------- graphe ---------------- */

let graph: { ctx: BaseAudioContext; dry: GainNode; wet: GainNode } | null = null;
function bus(): { dry: GainNode; wet: GainNode } {
  const c = audio.ctx as BaseAudioContext;
  if (graph && graph.ctx === c) return graph;
  const dry = c.createGain();
  dry.connect(audio.buses.sfx);
  // réverbération branchée pendant le temps libre (sa préparation est coûteuse)
  const wet = c.createGain();
  const ret = c.createGain();
  ret.gain.value = 0.55;
  ret.connect(audio.buses.sfx);
  idleReverb(wet, ret);
  graph = { ctx: c, dry, wet };
  return graph;
}

function ctx(): BaseAudioContext {
  return audio.ctx as BaseAudioContext;
}

/** noeud de panoramique relié au bus sec (+ envoi réverbération optionnel) */
function out(p = 0, send = 0): AudioNode {
  const c = ctx();
  const b = bus();
  const n = c.createStereoPanner();
  n.pan.value = Math.max(-1, Math.min(1, p));
  n.connect(b.dry);
  if (send > 0) {
    const s = c.createGain();
    s.gain.value = send;
    n.connect(s).connect(b.wet);
  }
  return n;
}

interface ToneOpts {
  glide?: number;
  a?: number;
  detune?: number;
}

function tone(type: OscillatorType, f: number, t: number, dur: number, vol: number, dest: AudioNode, o: ToneOpts = {}): void {
  const c = ctx();
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  if (o.glide) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.glide), t + dur);
  if (o.detune) osc.detune.value = o.detune;
  const g = c.createGain();
  const a = o.a ?? 0.004;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + a);
  g.gain.setTargetAtTime(0, t + a, Math.max(0.004, (dur - a) / 4));
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.1);
}

interface NoiseOpts {
  f1?: number;
  q?: number;
  a?: number;
}

function noise(t: number, dur: number, vol: number, dest: AudioNode, type: BiquadFilterType, f0: number, o: NoiseOpts = {}): void {
  const c = ctx();
  const s = c.createBufferSource();
  s.buffer = audio.noise();
  s.loop = true;
  const bf = c.createBiquadFilter();
  bf.type = type;
  bf.frequency.setValueAtTime(f0, t);
  if (o.f1) bf.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + dur);
  bf.Q.value = o.q ?? 0.8;
  const g = c.createGain();
  const a = o.a ?? 0.003;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + a);
  g.gain.setTargetAtTime(0, t + a, Math.max(0.002, (dur - a) / 4));
  s.connect(bf).connect(g).connect(dest);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.1);
}

/** cloche / métal : partiels inharmoniques */
function bell(f: number, t: number, dur: number, vol: number, dest: AudioNode): void {
  tone('sine', f, t, dur, vol, dest);
  tone('sine', f * 2.76, t, dur * 0.5, vol * 0.35, dest);
  tone('sine', f * 5.4, t, dur * 0.25, vol * 0.15, dest);
}

/** crépitements aléatoires (mèche, fissures, étincelles) */
function crackle(t: number, span: number, n: number, vol: number, dest: AudioNode, lo = 2500, hi = 6000): void {
  for (let i = 0; i < n; i++) noise(t + Math.random() * span, 0.006 + Math.random() * 0.006, vol * (0.5 + Math.random() * 0.5), dest, 'bandpass', lo + Math.random() * (hi - lo), { q: 2, a: 0.001 });
}

function notes(inst: Inst, list: number[], t: number, spacing: number, vel: number, dur: number, dest: AudioNode): void {
  list.forEach((m, i) => voice(inst, m, t + i * spacing, vel, dur, dest));
}

/**
 * Étalonnage de sonie : facteur par effet, mesuré par rendu hors ligne (Chromium, OfflineAudioContext,
 * volumes par défaut du moteur) pour viser ces crêtes au maître :
 * clics d'interface -22 dB, arrêts de rouleaux -16, Scatter -12, mèche -16/-18, explosions -8/-6,
 * gains -14/-12, fanfares -7/-6, gain maximal -3. Les bruits filtrés en bande étroite sont faibles
 * par nature, d'où des facteurs supérieurs à 1.
 */
export const TRIM: Partial<Record<SfxName, number>> = {
  ui: 1.41,
  toggle: 3.39,
  spinStart: 2.14,
  reelStop: 1.24,
  scatter: 2.37,
  anticipationLand: 0.86,
  anticipationMiss: 4.32,
  win: 0.72,
  winLow: 0.78,
  winHigh: 0.92,
  fuse: 4.9,
  chain: 8.1,
  match: 4.52,
  blast: 1.36,
  blastBig: 1.43,
  carve: 1.41,
  crack: 2.4,
  tumble: 2.63,
  collect: 2.32,
  multUp: 1.76,
  engrave: 6.5,
  thump: 1.26,
  trigger: 1.1,
  tier: 1.07,
  maxWin: 1.15,
  bonusIntro: 1.45,
  countTick: 3.39,
  coin: 3.35,
  whoosh: 7,
  error: 2.72,
  buyOpen: 1.36,
  buyConfirm: 0.8,
};

const G_MAJOR = [55, 59, 62, 67];
const PENTA = [55, 57, 59, 62, 64, 67, 69, 71, 74, 76, 79, 81, 83];

/**
 * Notes de cuivres des fanfares (anticipation, déclenchement, relance, paliers, gain maximal, fin de bonus),
 * banjo aigu (gains, cascades) et tambours : calculés en tâche de fond dès l'activation audio, pour
 * qu'aucune fanfare ne bloque l'image à son premier passage (mesuré : ~120 ms à froid pour le gain maximal).
 */
export const FANFARE_VOICES: ReadonlyArray<readonly [Inst, number]> = [
  ...[55, 57, 59, 60, 62, 64, 66, 67, 69, 71, 74, 78, 81].map((m) => ['brass', m] as const),
  ...[...PENTA, 86, 91].map((m) => ['banjo', m] as const),
  ['taiko', 38],
  ['taikoHi', 45],
];
audio.onUnlock(() => {
  try {
    bus();
    prewarm(FANFARE_VOICES);
  } catch (e) {
    audioWarn(e);
  }
});

/* ---------------- effets ---------------- */

/**
 * Joue un effet. Silencieux avant l'activation audio (jamais rejoué plus tard), en sourdine et onglet
 * masqué. Ne lève jamais d'exception : un incident audio ne doit pas interrompre la manche.
 */
export function sfx(name: string, opts: Opts = {}): void {
  if (!audio.ready || audio.isMuted) return;
  try {
    play(name, opts);
  } catch (e) {
    audioWarn(e);
  }
}

function play(name: string, opts: Opts): void {
  const c = ctx();
  const t = c.currentTime + 0.005;
  const raw = opts.pitch ?? 1;
  const p = raw * vary(0.03);
  const v = (opts.volume ?? 1) * vary(0.06) * (TRIM[name as SfxName] ?? 1);
  const side = (Math.random() * 2 - 1) * 0.15;
  switch (name as SfxName) {
    case 'ui': {
      const d = out(side * 0.5);
      tone('triangle', 900 * p, t, 0.05, 0.1 * v, d);
      tone('sine', 1800 * p, t, 0.02, 0.035 * v, d);
      noise(t, 0.015, 0.06 * v, d, 'bandpass', 2400, { q: 2, a: 0.001 });
      break;
    }
    case 'toggle': {
      // loquet d'acier : deux déclics, le second plus grave
      const d = out(0);
      noise(t, 0.012, 0.12 * v, d, 'bandpass', 3000 * p, { q: 6, a: 0.001 });
      tone('triangle', 1500 * p, t, 0.03, 0.05 * v, d);
      noise(t + 0.045, 0.014, 0.1 * v, d, 'bandpass', 2100 * p, { q: 5, a: 0.001 });
      tone('triangle', 1000 * p, t + 0.045, 0.05, 0.06 * v, d, { glide: 850 * p });
      break;
    }
    case 'spinStart': {
      // cliquet en bois qui accélère, poulie, souffle des rouleaux
      const d = out(side, 0.05);
      let tt = t;
      [0.045, 0.038, 0.032, 0.027, 0.024].forEach((dt, i) => {
        noise(tt, 0.022, 0.32 * v, d, 'bandpass', (1700 + i * 150) * p, { q: 3, a: 0.001 });
        tone('triangle', (620 + i * 40) * p, tt, 0.03, 0.05 * v, d);
        tt += dt;
      });
      tone('sine', 135 * p, t, 0.18, 0.1 * v, d, { glide: 80 });
      noise(t + 0.05, 0.4, 0.2 * v, d, 'bandpass', 380, { f1: 1900, q: 1, a: 0.14 });
      break;
    }
    case 'reelStop': {
      // bloc de bois frappé, mat
      const d = out((raw - 1) * 8);
      tone('sine', 170 * p, t, 0.13, 0.16 * v, d, { glide: 105 * p });
      tone('triangle', 520 * p, t, 0.05, 0.12 * v, d, { glide: 470 * p });
      tone('sine', 1430 * p, t, 0.025, 0.035 * v, d);
      noise(t, 0.05, 0.3 * v, d, 'bandpass', 900 * p, { q: 1.8, a: 0.001 });
      noise(t, 0.01, 0.08 * v, d, 'highpass', 3000, { a: 0.001 });
      break;
    }
    case 'scatter': {
      // détonateur : clac métallique, coup sourd, tintement montant d'un degré par Scatter
      const f = 784 * 2 ** (scatterSemis(raw) / 12);
      const d = out(side, 0.25);
      noise(t, 0.035, 0.16 * v, d, 'bandpass', 2600, { q: 3, a: 0.001 });
      tone('sine', 120, t, 0.22, 0.18 * v, d, { glide: 60 });
      bell(f, t + 0.015, 0.6, 0.075 * v, d);
      tone('triangle', f * 2, t + 0.06, 0.35, 0.03 * v, d);
      noise(t + 0.02, 0.18, 0.025 * v, d, 'highpass', 6500, { a: 0.01 });
      break;
    }
    case 'anticipationLand': {
      // l'attente paie : impact de tambour, accord de cuivres, roulade de banjo, éclat
      const d = out(0, 0.3);
      voice('taiko', 38, t, 0.8 * v, 0.5, d);
      notes('brass', G_MAJOR, t + 0.02, 0, 0.75 * v, 0.55, d);
      notes('banjo', [67, 71, 74, 79], t + 0.05, 0.05, 0.5 * v, 0.6, d);
      noise(t, 0.9, 0.04 * v, d, 'highpass', 5500, { a: 0.05 });
      audio.duckMusic(0.5, 500, 400);
      break;
    }
    case 'anticipationMiss': {
      // la mèche s'éteint : grésillement qui s'étouffe, « pff » de fumée, petite chute de hauteur
      const d = out(side, 0.1);
      noise(t, 0.5, 0.06 * v, d, 'highpass', 4500, { f1: 2500 });
      crackle(t, 0.25, 4, 0.05 * v, d);
      noise(t + 0.18, 0.3, 0.08 * v, d, 'lowpass', 1200, { f1: 250, a: 0.02 });
      tone('sine', 587, t + 0.2, 0.35, 0.045 * v, d, { glide: 440, a: 0.02 });
      break;
    }
    case 'win':
    case 'winLow': {
      // banjo, trois notes de la pentatonique (en tonalité avec la musique)
      const start = (name === 'win' ? 3 : 0) + Math.floor(Math.random() * 3);
      const d = out(side, 0.12);
      notes('banjo', [0, 2, 4].map((k) => PENTA[start + k] as number), t, 0.06, 0.55 * v, 0.5, d);
      if (name === 'win') tone('sine', 2637, t + 0.14, 0.12, 0.02 * v, d);
      break;
    }
    case 'winHigh': {
      const d = out(side, 0.18);
      notes('banjo', [67, 71, 74, 79, 83], t, 0.045, 0.55 * v, 0.6, d);
      voice('whistle', 86, t + 0.22, 0.6 * v, 0.28, d);
      voice('taikoHi', 45, t, 0.35 * v, 0.2, d);
      break;
    }
    case 'fuse': {
      const d = out(side);
      noise(t, 0.5, 0.06 * v, d, 'highpass', 5000);
      noise(t, 0.45, 0.025 * v, d, 'bandpass', 1800, { q: 0.8 });
      crackle(t, 0.45, 7, 0.07 * v, d);
      break;
    }
    case 'chain': {
      // la mèche court d'une charge à l'autre : grésillement qui file d'un côté à l'autre
      const c2 = ctx();
      const from = Math.random() < 0.5 ? -0.5 : 0.5;
      const pn = c2.createStereoPanner();
      pn.pan.setValueAtTime(from, t);
      pn.pan.linearRampToValueAtTime(-from, t + 0.45);
      pn.connect(bus().dry);
      noise(t, 0.45, 0.07 * v, pn, 'bandpass', 2000 * p, { f1: 6500 * p, q: 1.5, a: 0.02 });
      crackle(t, 0.45, 10, 0.06 * v, pn);
      noise(t + 0.42, 0.12, 0.08 * v, pn, 'lowpass', 1400, { a: 0.01 });
      break;
    }
    case 'match': {
      // allumette frottée sur la dent en or : grattement, « ting » doré, embrasement
      const d = out(side, 0.08);
      noise(t, 0.12, 0.16 * v, d, 'bandpass', 3500, { f1: 1800, q: 2 });
      crackle(t, 0.1, 4, 0.06 * v, d, 2000, 4000);
      tone('triangle', 3150 * p, t + 0.01, 0.18, 0.045 * v, d);
      tone('sine', 4700 * p, t + 0.01, 0.1, 0.02 * v, d);
      noise(t + 0.1, 0.3, 0.11 * v, d, 'lowpass', 400, { f1: 1600, a: 0.05 });
      noise(t + 0.15, 0.4, 0.035 * v, d, 'highpass', 4500, { a: 0.03 });
      break;
    }
    case 'blast':
    case 'blastBig': {
      const big = name === 'blastBig';
      const k = big ? 1.4 : 1;
      const d = out(side * 0.5, big ? 0.35 : 0.25);
      noise(t, 0.06, 0.28 * v, d, 'highpass', 2200, { a: 0.001 }); // claquement
      noise(t, 0.9 * k, 0.4 * v, d, 'lowpass', 2600, { f1: 90, q: 0.7, a: 0.004 }); // corps
      tone('sine', 78 * p, t, 0.6 * k, 0.42 * v, d, { glide: 30 }); // infra
      noise(t + 0.08, 1.6 * k, 0.12 * v, d, 'lowpass', 220, { f1: 60, a: 0.12 }); // grondement
      for (let i = 0; i < (big ? 11 : 7); i++) noise(t + 0.15 + i * 0.07 + Math.random() * 0.05, 0.03, 0.06 * v, d, 'bandpass', 1400 + Math.random() * 1600, { q: 5, a: 0.001 }); // débris
      if (big) {
        tone('sine', 52, t + 0.02, 1.1, 0.25 * v, d, { glide: 28 });
        noise(t + 0.38, 0.9, 0.1 * v, d, 'lowpass', 500, { f1: 120, a: 0.02 }); // écho sur la montagne
        audio.duckMusic(0.45, 500, 700);
      } else audio.duckMusic(0.6, 250, 500);
      break;
    }
    case 'carve': {
      // coups de ciseau, pierre qui se met en place, révélation du géant
      const d = out(side, 0.15);
      [0, 0.1, 0.2].forEach((dt, i) => {
        noise(t + dt, 0.05, 0.13 * v, d, 'bandpass', 3000 + i * 400, { q: 6, a: 0.001 });
        tone('triangle', (1700 + i * 130) * p, t + dt, 0.07, 0.045 * v, d);
      });
      noise(t + 0.28, 0.3, 0.05 * v, d, 'bandpass', 520, { q: 1.2, a: 0.03 });
      tone('sine', 110 * p, t + 0.3, 0.3, 0.18 * v, d, { glide: 70 });
      notes('banjo', [67, 71, 74], t + 0.34, 0.05, 0.3 * v, 0.5, d);
      break;
    }
    case 'crack': {
      // le géant se fissure en cases simples
      const d = out(side, 0.1);
      crackle(t, 0.25, 9, 0.4 * v, d, 1800, 5000);
      noise(t + 0.02, 0.15, 0.2 * v, d, 'bandpass', 650 * p, { q: 0.9, a: 0.002 });
      tone('sine', 90 * p, t, 0.2, 0.08 * v, d, { glide: 55 });
      break;
    }
    case 'tumble': {
      // gravats qui retombent
      const d = out(side, 0.08);
      const n = 8 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) noise(t + Math.random() * 0.42, 0.03 + Math.random() * 0.04, (0.15 + Math.random() * 0.15) * v, d, 'bandpass', 600 + Math.random() * 1800, { q: 1.2, a: 0.001 });
      noise(t, 0.5, 0.12 * v, d, 'bandpass', 420, { q: 0.8, a: 0.1 });
      break;
    }
    case 'collect': {
      // un éclat de granit arrive sur le bloc
      const d = out(0.2, 0.08);
      tone('triangle', 700 * p, t, 0.06, 0.1 * v, d, { glide: 560 * p });
      noise(t, 0.02, 0.07 * v, d, 'bandpass', 1400 * p, { q: 3, a: 0.001 });
      tone('sine', 2100 * quantizePitch(p), t + 0.01, 0.1, 0.025 * v, d);
      break;
    }
    case 'multUp': {
      // coup sur le bloc, chiffres regravés, tintement accordé qui monte avec la valeur
      const q = quantizePitch(raw);
      const d = out(0.15, 0.2);
      tone('sine', 90, t, 0.2, 0.14 * v, d, { glide: 55 });
      tone('triangle', 420, t, 0.06, 0.08 * v, d, { glide: 360 });
      noise(t, 0.1, 0.3 * v, d, 'bandpass', 2600, { f1: 1200, q: 2 });
      bell(784 * q, t + 0.06, 0.45, 0.12 * v, d);
      break;
    }
    case 'engrave': {
      // ciseau qui grave : raclement modulé et petits éclats métalliques
      const c2 = ctx();
      const d = out(0.15, 0.1);
      const am = c2.createGain();
      am.gain.value = 0.5;
      const lfo = c2.createOscillator();
      lfo.frequency.value = 22 * p;
      const lg = c2.createGain();
      lg.gain.value = 0.5;
      lfo.connect(lg).connect(am.gain);
      am.connect(d);
      lfo.start(t);
      lfo.stop(t + 0.5);
      noise(t, 0.4, 0.08 * v, am, 'bandpass', 3200 * p, { q: 4, a: 0.02 });
      for (let i = 0; i < 3; i++) tone('triangle', (2000 + Math.random() * 600) * p, t + 0.05 + i * 0.12, 0.05, 0.035 * v, d);
      noise(t + 0.42, 0.04, 0.08 * v, d, 'bandpass', 2400, { q: 4, a: 0.001 });
      break;
    }
    case 'thump': {
      // coup de queue sur le bloc
      const d = out(0.15);
      tone('sine', 72 * p, t, 0.3, 0.3 * v, d, { glide: 44 });
      tone('triangle', 340 * p, t, 0.08, 0.12 * v, d, { glide: 260 * p });
      noise(t, 0.06, 0.16 * v, d, 'lowpass', 600, { a: 0.001 });
      noise(t, 0.035, 0.3 * v, d, 'bandpass', 1100, { q: 1.2, a: 0.001 });
      break;
    }
    case 'trigger':
    case 'retrigger': {
      // piston du détonateur puis fanfare de chantier (cuivres, banjo, taikos)
      const re = name === 'retrigger';
      const d = out(0, 0.3);
      for (let i = 0; i < 3; i++) noise(t + i * 0.03, 0.02, 0.1 * v, d, 'bandpass', 2800 - i * 200, { q: 4, a: 0.001 });
      tone('sine', 90, t + 0.1, 0.25, 0.25 * v, d, { glide: 50 });
      const base = re ? 62 : 55;
      notes('brass', [base, base + 4, base + 7, base + 12], t + 0.12, 0.09, 0.8 * v, 0.35, d);
      notes('brass', [base + 12, base + 16, base + 19], t + 0.48, 0, 0.7 * v, re ? 0.4 : 0.7, d);
      notes('banjo', [67, 71, 74, 79, 83, 86], t + 0.12, 0.045, 0.4 * v, 0.6, d);
      voice('taiko', 38, t + 0.12, 0.7 * v, 0.4, d);
      voice('taiko', 38, t + 0.48, 0.85 * v, 0.6, d);
      noise(t + 0.48, 1.1, 0.035 * v, d, 'highpass', 6000, { a: 0.05 });
      audio.duckMusic(0.3, re ? 700 : 1100, 500);
      break;
    }
    case 'plusFs': {
      const d = out(side, 0.2);
      notes('banjo', [67, 74, 79], t, 0.07, 0.55 * v, 0.5, d);
      bell(1568, t + 0.2, 0.4, 0.04 * v, d);
      break;
    }
    case 'tier': {
      // palier de célébration : accord de cuivres, roulement de taikos, cascade de banjo
      const d = out(0, 0.3);
      notes('brass', [55, 59, 62, 67], t, 0, 0.85 * v, 0.8, d);
      [0, 0.09, 0.18, 0.27].forEach((dt, i) => voice(i % 2 ? 'taikoHi' : 'taiko', i % 2 ? 45 : 38, t + dt, (0.5 + i * 0.1) * v, 0.3, d));
      notes('banjo', [83, 79, 76, 74, 71, 67], t + 0.3, 0.05, 0.4 * v, 0.6, d);
      noise(t, 1.2, 0.04 * v, d, 'highpass', 5500, { a: 0.08 });
      audio.duckMusic(0.25, 1600, 700);
      break;
    }
    case 'maxWin': {
      // gain maximal : cadence IV-V-I aux cuivres, taikos, montée de banjo, boum lointain
      const d = out(0, 0.35);
      notes('brass', [60, 64, 67], t, 0, 0.8 * v, 0.3, d);
      notes('brass', [62, 66, 69], t + 0.35, 0, 0.85 * v, 0.3, d);
      notes('brass', [55, 59, 62, 67, 71], t + 0.7, 0, 0.9 * v, 1.6, d);
      for (let i = 0; i < 8; i++) voice(i % 2 ? 'taikoHi' : 'taiko', i % 2 ? 45 : 38, t + i * 0.085, (0.4 + i * 0.06) * v, 0.3, d);
      voice('taiko', 38, t + 0.7, 1 * v, 1, d);
      notes('banjo', [55, 59, 62, 67, 71, 74, 79, 83, 86, 91], t + 0.1, 0.055, 0.4 * v, 0.7, d);
      voice('whistle', 91, t + 0.72, 0.6 * v, 0.9, d);
      noise(t + 0.7, 2.2, 0.05 * v, d, 'highpass', 5500, { a: 0.1 });
      noise(t + 0.7, 1.8, 0.12 * v, d, 'lowpass', 180, { f1: 50, a: 0.05 });
      audio.duckMusic(0.15, 3200, 1200);
      break;
    }
    case 'bonusIntro': {
      // le soleil se couche : nappe qui gonfle, tambour grave, souffle ascendant, appel au sifflet
      const d = out(0, 0.4);
      notes('pad', [52, 55, 59, 66], t, 0, 0.9 * v, 1.6, d);
      voice('taiko', 38, t, 0.7 * v, 0.8, d);
      noise(t, 1.3, 0.06 * v, d, 'bandpass', 300, { f1: 1600, q: 1, a: 0.6 });
      notes('whistle', [71, 76], t + 0.5, 0.35, 0.55 * v, 0.3, d);
      voice('whistle', 79, t + 1.2, 0.5 * v, 0.7, d);
      audio.duckMusic(0.2, 1800, 900);
      break;
    }
    case 'bonusOutro': {
      // cadence qui se pose : ré → sol, banjo, éclat
      const d = out(0, 0.3);
      notes('brass', [57, 62, 66], t, 0, 0.7 * v, 0.45, d);
      notes('brass', [55, 59, 62, 67], t + 0.5, 0, 0.8 * v, 1.2, d);
      notes('banjo', [62, 67, 71, 74, 79], t + 0.5, 0.05, 0.45 * v, 0.7, d);
      voice('taiko', 38, t + 0.5, 0.7 * v, 0.7, d);
      noise(t + 0.5, 1.2, 0.035 * v, d, 'highpass', 5500, { a: 0.06 });
      audio.duckMusic(0.25, 1600, 800);
      break;
    }
    case 'countTick': {
      const d = out(0);
      tone('triangle', 1400 * p, t, 0.025, 0.035 * v, d);
      noise(t, 0.008, 0.02 * v, d, 'highpass', 5000, { a: 0.001 });
      break;
    }
    case 'coin': {
      // pépite d'or qui tinte
      const d = out(side * 2, 0.15);
      tone('sine', 2637 * p, t, 0.12, 0.045 * v, d);
      tone('sine', 3520 * p, t + 0.03, 0.09, 0.03 * v, d, { detune: 8 });
      tone('triangle', 5274 * p, t, 0.03, 0.012 * v, d);
      break;
    }
    case 'whoosh': {
      const c2 = ctx();
      const pn = c2.createStereoPanner();
      pn.pan.setValueAtTime(-0.4, t);
      pn.pan.linearRampToValueAtTime(0.4, t + 0.35);
      pn.connect(bus().dry);
      noise(t, 0.38, 0.1 * v, pn, 'bandpass', 500 * p, { f1: 2600 * p, q: 1.2, a: 0.12 });
      break;
    }
    case 'error': {
      // double « bonk » en bois, doux
      const d = out(0);
      tone('triangle', 330, t, 0.12, 0.09 * v, d, { glide: 300 });
      tone('triangle', 262, t + 0.14, 0.18, 0.09 * v, d, { glide: 240 });
      noise(t, 0.03, 0.05 * v, d, 'bandpass', 900, { q: 2, a: 0.001 });
      break;
    }
    case 'buyOpen': {
      // panneau de bois qui pivote (grincement) puis se cale (deux coups)
      const c2 = ctx();
      const d = out(side, 0.1);
      const o = c2.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(170, t);
      o.frequency.linearRampToValueAtTime(240, t + 0.12);
      o.frequency.linearRampToValueAtTime(200, t + 0.22);
      const bp = c2.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 4;
      const g = c2.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.09 * v, t + 0.04);
      g.gain.setTargetAtTime(0, t + 0.18, 0.02);
      o.connect(bp).connect(g).connect(d);
      o.start(t);
      o.stop(t + 0.3);
      for (const [dt, f] of [
        [0.2, 190],
        [0.28, 150],
      ] as Array<[number, number]>) {
        tone('sine', f * p, t + dt, 0.1, 0.12 * v, d, { glide: f * 0.65 });
        tone('triangle', f * 2.9 * p, t + dt, 0.05, 0.08 * v, d);
        noise(t + dt, 0.04, 0.25 * v, d, 'bandpass', 950, { q: 1.8, a: 0.001 });
      }
      break;
    }
    case 'buyConfirm': {
      // piston enfoncé, accord de banjo, étincelle de mèche
      const d = out(0, 0.2);
      for (let i = 0; i < 4; i++) noise(t + i * 0.025, 0.018, 0.09 * v, d, 'bandpass', 2600 - i * 150, { q: 4, a: 0.001 });
      tone('sine', 95, t + 0.1, 0.22, 0.22 * v, d, { glide: 52 });
      notes('banjo', G_MAJOR, t + 0.12, 0.018, 0.5 * v, 0.6, d);
      crackle(t + 0.14, 0.3, 6, 0.05 * v, d);
      break;
    }
  }
}

/** tension d'anticipation : couche portée par la musique (bourdon montant, pulsation calée sur le tempo) */
export function tension(on: boolean): void {
  music.setTension(on);
}
