import { audio } from './engine';

/**
 * Musique procédurale BOOMTOOTH : 100 % synthétisée en Web Audio, aucun échantillon tiers.
 *
 * Identité : camp de bûcherons du Grand Nord qui fait sauter la montagne.
 * - 'base'  : groove folk entraînant (104 BPM, sol majeur) : banjo en « rolls » (Karplus-Strong),
 *             contrebasse pincée, planche tapée du pied, wood-block, shaker, sifflet de chantier.
 * - 'bonus' : crépuscule (92 BPM, mi mineur relatif, même armure) : nappes chaudes, cordes étouffées,
 *             balais, basse ronde ; beaucoup d'espace, propice à la tension.
 * - 'super' : nuit sous projecteurs (112 BPM, mi mineur) : basse en croches, toms graves type taiko,
 *             coups de cuivres, banjo en doubles-croches en fond.
 *
 * Synthèse : cordes pincées par Karplus-Strong, percussions et cuivres calculés une fois en JavaScript dans des
 * tampons (coût CPU divisé par deux), nappes / sifflet / harmonica en oscillateurs temps réel. Voir docs/AUDIO.md.
 *
 * Ordonnancement : horloge AudioContext, planificateur « lookahead » (setInterval 25 ms, 0,12 s d'avance),
 * jamais de setTimeout par note. La forme est générée par sections A/B/C de 4 à 8 mesures avec breaks
 * (fills) en fin de section et variations tirées d'un générateur à graine : jamais 16 mesures identiques.
 * Les humeurs se fondent l'une dans l'autre (2 s, calées sur un temps) ; la couche de tension
 * (anticipation) ferme le filtre du groove et ajoute un bourdon montant et une pulsation de mèche.
 */

export type Mood = 'base' | 'bonus' | 'super';
export type Section = 'A' | 'B' | 'C';
export type Inst =
  | 'banjo'
  | 'strum'
  | 'mute'
  | 'bass'
  | 'bassDrive'
  | 'stomp'
  | 'block'
  | 'blockLo'
  | 'shaker'
  | 'brush'
  | 'tick'
  | 'taiko'
  | 'taikoHi'
  | 'whistle'
  | 'reed'
  | 'pad'
  | 'brass';

export interface NoteEvent {
  /** double-croche 0..15 dans la mesure */
  step: number;
  inst: Inst;
  midi: number;
  /** 0..1 */
  vel: number;
  /** durée en doubles-croches */
  len: number;
  /** décalage humain en millisecondes (strum, retard léger) */
  nudge?: number;
}

export interface BarPlan {
  index: number;
  mood: Mood;
  section: Section;
  sectionNo: number;
  barInSection: number;
  sectionLength: number;
  chord: string;
  fill: boolean;
  events: NoteEvent[];
}

/* ------------------------------------------------------------------ */
/* Helpers purs (testés dans tests/audio-music.test.ts)                */
/* ------------------------------------------------------------------ */

/** générateur pseudo-aléatoire déterministe (mulberry32) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const midiHz = (m: number): number => 440 * 2 ** ((m - 69) / 12);

export const STEPS = 16;
export const beatSec = (bpm: number): number => 60 / bpm;
export const barSec = (bpm: number): number => 240 / bpm;
export const stepSec = (bpm: number): number => 15 / bpm;

/**
 * Position (s) d'une double-croche dans la mesure. swing = place de la croche du contretemps
 * dans le temps (0,5 = droit, 0,6 = léger shuffle) ; les doubles-croches sont interpolées.
 */
export function stepOffset(step: number, bpm: number, swing = 0.5): number {
  const beat = 60 / bpm;
  const b = Math.floor(step / 4);
  const s = step % 4;
  const within = s <= 2 ? (s / 2) * swing : swing + ((s - 2) / 2) * (1 - swing);
  return (b + within) * beat;
}

/** premier instant >= t de la grille origin + k·period */
export function nextBoundary(origin: number, period: number, t: number): number {
  if (t <= origin) return origin;
  return origin + Math.ceil((t - origin) / period - 1e-9) * period;
}

/** horloge de pas : temps calculés par multiplication depuis une ancre (aucune dérive cumulée) */
export class StepClock {
  bar = 0;
  step = 0;
  private anchor: number;
  private anchorBar = 0;
  constructor(
    readonly bpm: number,
    readonly swing: number,
    start: number,
  ) {
    this.anchor = start;
  }
  get barLength(): number {
    return barSec(this.bpm);
  }
  barStart(bar = this.bar): number {
    return this.anchor + (bar - this.anchorBar) * this.barLength;
  }
  get time(): number {
    return this.barStart() + stepOffset(this.step, this.bpm, this.swing);
  }
  advance(): void {
    this.step++;
    if (this.step >= STEPS) {
      this.step = 0;
      this.bar++;
    }
  }
  /** reprend à la mesure suivante, placée à l'instant t (après une pause ou un gros retard) */
  rebase(t: number): void {
    if (this.step !== 0) {
      this.step = 0;
      this.bar++;
    }
    this.anchor = t;
    this.anchorBar = this.bar;
  }
  /** prochain temps (noire) >= t */
  nextBeat(t: number): number {
    return nextBoundary(this.anchor, beatSec(this.bpm), t);
  }
}

/* ---------- harmonie : sol majeur / mi mineur (même armure) ---------- */

export interface Chord {
  name: string;
  /** fondamentale à l'octave de la basse */
  root: number;
  /** intervalles depuis la fondamentale */
  iv: number[];
}

const CH = (name: string, root: number, iv: number[]): Chord => ({ name, root, iv });
export const CHORDS: Record<string, Chord> = {
  G: CH('G', 43, [0, 4, 7]),
  C: CH('C', 48, [0, 4, 7]),
  Cmaj7: CH('Cmaj7', 48, [0, 4, 7, 11]),
  D: CH('D', 38, [0, 4, 7]),
  Dsus4: CH('Dsus4', 38, [0, 5, 7]),
  Em: CH('Em', 40, [0, 3, 7]),
  Am: CH('Am', 45, [0, 3, 7]),
  B7: CH('B7', 47, [0, 4, 7, 10]),
};

/** classes de hauteur de sol majeur */
export const KEY_PCS = [7, 9, 11, 0, 2, 4, 6];
/** pentatonique de sol majeur = mi mineur pentatonique */
export const PENTA_PCS = [7, 9, 11, 2, 4];
const pc = (m: number): number => ((m % 12) + 12) % 12;
export const inKey = (m: number): boolean => KEY_PCS.includes(pc(m));

export function chordTones(ch: Chord, lo: number, hi: number, exclude: number[] = []): number[] {
  const pcs = ch.iv.map((i) => pc(ch.root + i));
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (pcs.includes(pc(m)) && !exclude.includes(m)) out.push(m);
  return out;
}

export function pentaIn(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (PENTA_PCS.includes(pc(m))) out.push(m);
  return out;
}

/** avance de n degrés dans la gamme de sol majeur (n négatif = descend) */
export function diatonic(m: number, n: number): number {
  let x = m;
  const dir = n < 0 ? -1 : 1;
  for (let k = 0; k < Math.abs(n); k++) {
    do x += dir;
    while (!inKey(x));
  }
  return x;
}

export interface MoodSpec {
  bpm: number;
  swing: number;
  /** 8 accords par section (une section de 4 mesures prend les 4 premiers) */
  prog: Record<Section, string[]>;
  lengths: Record<Section, number[]>;
  /** probabilité d'une phrase soliste par type de section */
  lead: Record<Section, number>;
}

export const MOODS: Record<Mood, MoodSpec> = {
  base: {
    bpm: 104,
    swing: 0.56,
    prog: {
      A: ['G', 'C', 'G', 'D', 'G', 'Em', 'C', 'D'],
      B: ['Em', 'C', 'G', 'D', 'Em', 'C', 'Am', 'D'],
      C: ['C', 'G', 'Am', 'D', 'C', 'G', 'D', 'D'],
    },
    lengths: { A: [8, 8, 4], B: [8, 4], C: [4] },
    lead: { A: 0.5, B: 0.6, C: 0.3 },
  },
  bonus: {
    bpm: 92,
    swing: 0.54,
    prog: {
      A: ['Em', 'Cmaj7', 'G', 'Dsus4', 'Em', 'Cmaj7', 'Am', 'D'],
      B: ['Am', 'Em', 'C', 'D', 'Am', 'Em', 'C', 'Dsus4'],
      C: ['Em', 'Em', 'Cmaj7', 'Dsus4', 'Em', 'Em', 'Cmaj7', 'D'],
    },
    lengths: { A: [8], B: [8, 4], C: [4] },
    lead: { A: 0.45, B: 0.4, C: 0.2 },
  },
  super: {
    bpm: 112,
    swing: 0.5,
    prog: {
      A: ['Em', 'C', 'D', 'Em', 'Em', 'C', 'D', 'B7'],
      B: ['C', 'D', 'B7', 'Em', 'C', 'D', 'B7', 'B7'],
      C: ['Em', 'Em', 'C', 'D', 'Em', 'Em', 'C', 'B7'],
    },
    lengths: { A: [8, 4], B: [8], C: [4] },
    lead: { A: 0.35, B: 0.45, C: 0.2 },
  },
};

const SUCCESSION: Record<Section, Array<[Section, number]>> = {
  A: [
    ['A', 0.3],
    ['B', 0.55],
    ['C', 0.15],
  ],
  B: [
    ['A', 0.6],
    ['C', 0.4],
  ],
  C: [
    ['A', 0.5],
    ['B', 0.5],
  ],
};

/** « rolls » de banjo (8 croches) : 0..2 = notes d'accord grave → aigu, 3 = corde de bourdon (sol aigu) */
export const ROLLS: number[][] = [
  [0, 1, 3, 0, 1, 3, 0, 3], // forward roll
  [0, 2, 3, 1, 2, 3, 0, 3],
  [0, 1, 2, 3, 2, 1, 0, 3], // forward-reverse
  [0, 3, 1, 3, 0, 3, 2, 3], // pouce alterné
  [1, 0, 3, 2, 0, 3, 1, 3],
  [2, 1, 0, 3, 2, 1, 0, 3], // backward roll
];

/** motifs solistes sur deux mesures : [pas 0..31, durée en pas, mouvement en degrés pentatoniques] */
export const MOTIFS: Array<Array<[number, number, number]>> = [
  [
    [0, 2, 0],
    [2, 2, 1],
    [4, 4, 1],
    [10, 2, -1],
    [12, 4, 1],
    [16, 10, 0],
    [28, 2, -1],
    [30, 2, -1],
  ],
  [
    [0, 6, 0],
    [6, 2, -1],
    [8, 4, -1],
    [12, 4, 2],
    [16, 4, 1],
    [20, 4, -1],
    [24, 8, -2],
  ],
  [
    [2, 2, 0],
    [4, 2, 1],
    [6, 2, 1],
    [8, 6, 1],
    [14, 2, -1],
    [16, 8, -1],
    [26, 2, 1],
    [28, 4, 0],
  ],
  [
    [0, 3, 0],
    [3, 1, 1],
    [4, 4, 2],
    [8, 4, -1],
    [12, 4, -1],
    [16, 12, -2],
  ],
  [
    [4, 2, 0],
    [6, 2, -1],
    [8, 2, -1],
    [10, 6, 2],
    [18, 2, 1],
    [20, 2, 1],
    [22, 6, -1],
    [28, 4, -1],
  ],
];

const MUTE_PATTERNS: number[][] = [
  [0, 3, 6, 8, 11, 14],
  [0, 4, 6, 10, 12],
  [2, 6, 8, 10, 14],
  [0, 6, 10, 12, 15],
];

interface SectionState {
  kind: Section;
  no: number;
  len: number;
  bar: number;
  chords: string[];
  nextKind: Section;
  roll: number;
  alt: number;
  mute: number;
  lead: Map<number, NoteEvent[]>;
  leadInst: Inst;
  ghosts: number;
}

interface BarCtx {
  chord: Chord;
  next: Chord;
  s: SectionState;
  i: number;
  fill: boolean;
  rng: () => number;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * Compositeur déterministe : une graine → toujours la même suite de mesures.
 * Aucune dépendance audio : testable en Node.
 */
export class Composer {
  private rng: () => number;
  private barNo = 0;
  private sectionNo = 0;
  private sec: SectionState | null = null;
  private pending: Section = 'A';
  private streak: Section[] = [];

  constructor(
    readonly mood: Mood,
    seed: number,
  ) {
    this.rng = mulberry32(seed);
  }

  /** la prochaine mesure ouvre une nouvelle section (retour dans cette humeur) */
  restart(kind: Section = 'A'): void {
    this.sec = null;
    this.pending = kind;
  }

  nextBar(): BarPlan {
    if (!this.sec || this.sec.bar >= this.sec.len) this.sec = this.newSection();
    const s = this.sec;
    const i = s.bar++;
    const chord = CHORDS[s.chords[i] as string] as Chord;
    const nextName = i + 1 < s.len ? (s.chords[i + 1] as string) : (MOODS[this.mood].prog[s.nextKind][0] as string);
    const ctx: BarCtx = { chord, next: CHORDS[nextName] as Chord, s, i, fill: i === s.len - 1, rng: this.rng };
    const events = this.mood === 'base' ? composeBase(ctx) : this.mood === 'bonus' ? composeBonus(ctx) : composeSuper(ctx);
    const lead = s.lead.get(i);
    if (lead) events.push(...lead);
    events.sort((a, b) => a.step - b.step);
    return {
      index: this.barNo++,
      mood: this.mood,
      section: s.kind,
      sectionNo: s.no,
      barInSection: i,
      sectionLength: s.len,
      chord: chord.name,
      fill: ctx.fill,
      events,
    };
  }

  private pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.rng() * arr.length) % arr.length] as T;
  }

  private chooseNext(kind: Section): Section {
    const opts = SUCCESSION[kind].filter(([k]) => !(this.streak.length >= 2 && this.streak.every((x) => x === k)));
    const total = opts.reduce((a, [, w]) => a + w, 0);
    let x = this.rng() * total;
    for (const [k, w] of opts) {
      x -= w;
      if (x <= 0) return k;
    }
    return (opts[opts.length - 1] as [Section, number])[0];
  }

  private newSection(): SectionState {
    const spec = MOODS[this.mood];
    const kind = this.pending;
    this.streak = this.streak[this.streak.length - 1] === kind ? [...this.streak, kind] : [kind];
    const len = this.pick(spec.lengths[kind]);
    const chords = spec.prog[kind].slice(0, len);
    const nextKind = this.chooseNext(kind);
    this.pending = nextKind;
    const s: SectionState = {
      kind,
      no: this.sectionNo++,
      len,
      bar: 0,
      chords,
      nextKind,
      roll: Math.floor(this.rng() * ROLLS.length),
      alt: Math.floor(this.rng() * ROLLS.length),
      mute: Math.floor(this.rng() * MUTE_PATTERNS.length),
      lead: new Map(),
      leadInst: 'whistle',
      ghosts: Math.floor(this.rng() * 4),
    };
    if (this.rng() < spec.lead[kind]) this.planLead(s);
    return s;
  }

  /** phrase soliste (sifflet ou harmonica) : appel puis réponse variée pour une section de 8 mesures */
  private planLead(s: SectionState): void {
    const mood = this.mood;
    s.leadInst = mood === 'bonus' ? (this.rng() < 0.6 ? 'reed' : 'whistle') : mood === 'super' ? (this.rng() < 0.5 ? 'reed' : 'whistle') : this.rng() < 0.75 ? 'whistle' : 'reed';
    const [lo, hi] = s.leadInst === 'whistle' ? [71, 88] : [62, 79];
    const scale = pentaIn(lo, hi);
    const motif = Math.floor(this.rng() * MOTIFS.length);
    const starts = s.len >= 8 ? (this.rng() < 0.5 ? [0, 4] : [2, 6]) : [this.rng() < 0.5 ? 0 : 2];
    starts.forEach((start, k) => {
      if (start + 1 >= s.len) return;
      const m = MOTIFS[(motif + (k === 1 && this.rng() < 0.4 ? 1 : 0)) % MOTIFS.length] as Array<[number, number, number]>;
      const chordA = CHORDS[s.chords[start] as string] as Chord;
      let idx = nearestIndex(scale, (chordTones(chordA, lo + 4, hi - 4)[0] ?? lo + 6) + (k === 1 ? 2 : 0));
      const flipTail = k === 1 && this.rng() < 0.5;
      m.forEach(([st, len, mv], n) => {
        const move = flipTail && n >= m.length - 2 ? -mv : mv;
        idx = Math.max(0, Math.min(scale.length - 1, idx + move));
        let midi = scale[idx] as number;
        const bar = start + Math.floor(st / 16);
        const ch = CHORDS[s.chords[bar] as string] as Chord;
        if (len >= 4 && st % 4 === 0) {
          const tones = chordTones(ch, lo, hi);
          midi = tones[nearestIndex(tones, midi)] ?? midi;
          idx = nearestIndex(scale, midi);
        }
        const list = s.lead.get(bar) ?? [];
        list.push({ step: st % 16, inst: s.leadInst, midi, vel: r2(0.6 + this.rng() * 0.25), len });
        s.lead.set(bar, list);
      });
    });
  }
}

function nearestIndex(list: number[], v: number): number {
  let best = 0;
  let d = Infinity;
  list.forEach((x, i) => {
    const dd = Math.abs(x - v);
    if (dd < d) {
      d = dd;
      best = i;
    }
  });
  return best;
}

/** voix du banjo : 3 notes d'accord + bourdon de sol aigu (corde de 5e), sauf sur B7 */
function banjoVoices(ch: Chord): number[] {
  const drone = ch.name === 'B7' ? 69 : 67;
  const tones = chordTones(ch, 55, 69, [drone]).slice(0, 3);
  while (tones.length < 3) tones.push((tones[tones.length - 1] ?? 55) + 12);
  return [...tones, drone];
}

function bassFifth(ch: Chord): number {
  const f = ch.root + 7;
  return f > 47 ? f - 12 : f;
}

/** marche de basse vers l'accord suivant (3 notes diatoniques) */
function walk(ch: Chord, next: Chord): number[] {
  const target = next.root;
  const up = target > ch.root || (target === ch.root && ch.root < 43);
  return up ? [diatonic(target, -3), diatonic(target, -2), diatonic(target, -1)] : [diatonic(target, 3), diatonic(target, 2), diatonic(target, 1)];
}

function composeBase(c: BarCtx): NoteEvent[] {
  const { chord, next, s, i, fill, rng } = c;
  const ev: NoteEvent[] = [];
  const kind = s.kind;
  const jit = (v: number) => r2(v * (0.9 + rng() * 0.2));
  // pied sur la planche
  ev.push({ step: 0, inst: 'stomp', midi: 36, vel: jit(0.85), len: 2 });
  if (kind !== 'C') ev.push({ step: 8, inst: 'stomp', midi: 36, vel: jit(0.65), len: 2 });
  if (fill) ev.push({ step: 14, inst: 'stomp', midi: 36, vel: jit(0.55), len: 1 });
  // wood-blocks accordés (ré / sol)
  if (fill) {
    [11, 12, 13, 14, 15].forEach((st, k) => ev.push({ step: st, inst: k % 2 ? 'blockLo' : 'block', midi: k % 2 ? 79 : 86, vel: r2(0.3 + k * 0.08), len: 1 }));
    ev.push({ step: 4, inst: 'block', midi: 86, vel: jit(0.5), len: 1 });
  } else {
    if (kind !== 'C') ev.push({ step: 4, inst: 'block', midi: 86, vel: jit(0.5), len: 1 });
    ev.push({ step: 12, inst: 'block', midi: 86, vel: jit(0.55), len: 1 });
    const ghost = [7, 15, 10, 3][s.ghosts] as number;
    if (rng() < 0.45) ev.push({ step: ghost, inst: 'blockLo', midi: 79, vel: jit(0.28), len: 1 });
    if (kind === 'B' && rng() < 0.6) ev.push({ step: 10, inst: 'blockLo', midi: 79, vel: jit(0.34), len: 1 });
  }
  // shaker
  for (let st = 0; st < 16; st += 2) {
    const off = st % 4 === 2;
    if (kind === 'C' && !off) continue;
    ev.push({ step: st, inst: 'shaker', midi: 0, vel: jit(off ? 0.42 : 0.24), len: 1 });
    if (kind === 'B' && rng() < 0.7) ev.push({ step: st + 1, inst: 'shaker', midi: 0, vel: jit(0.14), len: 1 });
  }
  // contrebasse : fondamentale / quinte, marche en fin de phrase
  if (kind === 'C') {
    ev.push({ step: 0, inst: 'bass', midi: chord.root, vel: jit(0.8), len: 12 });
  } else {
    ev.push({ step: 0, inst: 'bass', midi: chord.root, vel: jit(0.82), len: 4 });
    const walkNow = (fill || i % 4 === 3) && next.name !== chord.name;
    if (walkNow) {
      ev.push({ step: 8, inst: 'bass', midi: bassFifth(chord), vel: jit(0.7), len: 2 });
      walk(chord, next).forEach((m, k) => ev.push({ step: 10 + k * 2, inst: 'bass', midi: m, vel: jit(0.62), len: 2 }));
    } else {
      ev.push({ step: 8, inst: 'bass', midi: bassFifth(chord), vel: jit(0.72), len: 4 });
      if (kind === 'B' && rng() < 0.5) ev.push({ step: 14, inst: 'bass', midi: chord.root + 12, vel: jit(0.45), len: 2 });
    }
  }
  // guitare : « chuck » étouffé sur 2 et 4
  if (kind !== 'C') {
    for (const st of [4, 12]) {
      chordTones(chord, 52, 66)
        .slice(0, 4)
        .forEach((m, k) => ev.push({ step: st, inst: 'strum', midi: m, vel: jit(0.36), len: 1, nudge: k * 9 }));
    }
    if (kind === 'B' && rng() < 0.5) chordTones(chord, 55, 66).slice(0, 3).forEach((m, k) => ev.push({ step: 14, inst: 'strum', midi: m, vel: jit(0.2), len: 1, nudge: k * 8 }));
  }
  // banjo
  const v = banjoVoices(chord);
  if (fill) {
    // break : roll sur la première moitié, descente pentatonique en doubles-croches
    const roll = ROLLS[s.roll] as number[];
    for (let k = 0; k < 4; k++) ev.push({ step: k * 2, inst: 'banjo', midi: v[roll[k] as number] as number, vel: jit(k % 2 ? 0.36 : 0.5), len: 2 });
    const run = pentaIn(55, 76).reverse();
    const start = Math.floor(rng() * 3);
    for (let k = 0; k < 8; k++) ev.push({ step: 8 + k, inst: 'banjo', midi: run[start + k] as number, vel: jit(0.42 - k * 0.015), len: 1 });
  } else if (kind === 'C') {
    for (let st = 0; st < 16; st += 4) ev.push({ step: st, inst: 'banjo', midi: v[(st / 4 + s.ghosts) % 4] as number, vel: jit(0.42), len: 4 });
  } else {
    const roll = ROLLS[rng() < 0.3 ? s.alt : s.roll] as number[];
    roll.forEach((vi, k) => ev.push({ step: k * 2, inst: 'banjo', midi: v[vi] as number, vel: jit(k % 2 ? 0.34 : 0.48), len: 2 }));
  }
  return ev;
}

function composeBonus(c: BarCtx): NoteEvent[] {
  const { chord, s, fill, rng } = c;
  const ev: NoteEvent[] = [];
  const kind = s.kind;
  const jit = (v: number) => r2(v * (0.9 + rng() * 0.2));
  // nappe : voicing serré + neuvième quand elle est dans la gamme
  const pad = chordTones(chord, 52, 71).slice(0, 4);
  const ninth = chord.root + 14;
  if (chord.iv.length === 3 && inKey(ninth) && rng() < 0.6) pad[pad.length - 1] = ninth + (ninth < 60 ? 12 : 0);
  pad.forEach((m) => ev.push({ step: 0, inst: 'pad', midi: m, vel: jit(0.55), len: 16 }));
  // basse ronde
  ev.push({ step: 0, inst: 'bass', midi: chord.root, vel: jit(0.62), len: kind === 'B' ? 9 : 14 });
  if (kind === 'B') ev.push({ step: 10, inst: 'bass', midi: bassFifth(chord), vel: jit(0.46), len: 6 });
  // cordes étouffées en arpège
  if (kind !== 'C' || rng() < 0.5) {
    const tones = chordTones(chord, 55, 71);
    const pat = MUTE_PATTERNS[fill ? (s.mute + 1) % MUTE_PATTERNS.length : s.mute] as number[];
    pat.forEach((st, k) => {
      if (kind === 'C' && k % 2) return;
      const up = (s.no + k) % 3 !== 0;
      const m = tones[up ? k % tones.length : (tones.length - 1 - (k % tones.length)) % tones.length] as number;
      ev.push({ step: st, inst: 'mute', midi: m, vel: jit(0.34), len: 3 });
    });
  }
  // balais
  if (kind !== 'C') {
    ev.push({ step: 4, inst: 'brush', midi: 0, vel: jit(0.36), len: 4 });
    ev.push({ step: 12, inst: 'brush', midi: 0, vel: jit(0.4), len: 4 });
    for (let st = 0; st < 16; st += 2) if (rng() < 0.75) ev.push({ step: st, inst: 'tick', midi: 0, vel: jit(st % 4 === 2 ? 0.2 : 0.12), len: 1 });
  } else {
    ev.push({ step: 12, inst: 'brush', midi: 0, vel: jit(0.24), len: 4 });
  }
  // toms feutrés : section B et breaks
  if (kind === 'B') ev.push({ step: 0, inst: 'taiko', midi: 38, vel: jit(0.34), len: 4 });
  if (fill) {
    ev.push({ step: 12, inst: 'taikoHi', midi: 45, vel: jit(0.26), len: 2 });
    ev.push({ step: 14, inst: 'taiko', midi: 38, vel: jit(0.34), len: 2 });
  }
  return ev;
}

function composeSuper(c: BarCtx): NoteEvent[] {
  const { chord, s, fill, rng, i } = c;
  const ev: NoteEvent[] = [];
  const kind = s.kind;
  const jit = (v: number) => r2(v * (0.9 + rng() * 0.2));
  // basse en croches, octave sur le contretemps
  for (let st = 0; st < 16; st += 2) {
    if (kind === 'C' && st % 8 !== 0 && i % 2 === 0) continue;
    const oct = st % 4 === 2;
    ev.push({ step: st, inst: 'bassDrive', midi: chord.root + (oct ? 12 : 0), vel: jit(oct ? 0.55 : 0.75), len: 2 });
  }
  // taikos
  if (fill) {
    ev.push({ step: 0, inst: 'taiko', midi: 38, vel: jit(0.9), len: 4 });
    ev.push({ step: 4, inst: 'taikoHi', midi: 45, vel: jit(0.55), len: 2 });
    for (let st = 8; st < 16; st++) ev.push({ step: st, inst: st % 2 ? 'taikoHi' : 'taiko', midi: st % 2 ? 45 : 38, vel: r2(0.4 + (st - 8) * 0.07), len: 1 });
  } else {
    ev.push({ step: 0, inst: 'taiko', midi: 38, vel: jit(0.9), len: 4 });
    ev.push({ step: 6, inst: 'taiko', midi: 38, vel: jit(0.55), len: 2 });
    ev.push({ step: 10, inst: 'taiko', midi: 38, vel: jit(0.68), len: 2 });
    if (kind !== 'C') {
      ev.push({ step: 4, inst: 'taikoHi', midi: 45, vel: jit(0.55), len: 2 });
      ev.push({ step: 12, inst: 'taikoHi', midi: 45, vel: jit(0.6), len: 2 });
    }
    if (rng() < 0.35) ev.push({ step: 15, inst: 'taikoHi', midi: 45, vel: jit(0.35), len: 1 });
  }
  // claquettes et shaker
  if (kind !== 'C') {
    ev.push({ step: 4, inst: 'block', midi: 86, vel: jit(0.42), len: 1 });
    ev.push({ step: 12, inst: 'block', midi: 86, vel: jit(0.46), len: 1 });
    for (let st = 0; st < 16; st++) ev.push({ step: st, inst: 'shaker', midi: 0, vel: jit(st % 2 ? 0.14 : st % 4 === 2 ? 0.34 : 0.22), len: 1 });
  }
  // cuivres
  const brass = chordTones(chord, 55, 70).slice(0, 3);
  if (kind === 'A') {
    const hits: Array<[number, number, number]> = rng() < 0.5 ? [[0, 3, 0.55], [6, 1, 0.4], [10, 2, 0.46]] : [[0, 2, 0.55], [3, 1, 0.36], [10, 4, 0.48]];
    for (const [st, len, vel] of hits) brass.forEach((m) => ev.push({ step: st, inst: 'brass', midi: m, vel: jit(vel), len }));
  } else if (kind === 'B') {
    brass.forEach((m) => ev.push({ step: 0, inst: 'brass', midi: m, vel: jit(0.38), len: 12 }));
    brass.forEach((m) => ev.push({ step: 14, inst: 'brass', midi: m + (m < 62 ? 12 : 0), vel: jit(0.5), len: 2 }));
  } else if (fill) {
    brass.forEach((m) => ev.push({ step: 14, inst: 'brass', midi: m, vel: jit(0.5), len: 2 }));
  }
  // banjo en doubles-croches, en fond
  const v = banjoVoices(chord);
  const roll = ROLLS[rng() < 0.35 ? s.alt : s.roll] as number[];
  const span = fill ? 8 : 16;
  for (let st = 0; st < span; st++) ev.push({ step: st, inst: 'banjo', midi: v[roll[st % 8] as number] as number, vel: jit(st % 4 === 0 ? 0.34 : 0.22), len: 1 });
  return ev;
}

/* ------------------------------------------------------------------ */
/* Synthèse des instruments (partagée avec sfx.ts)                     */
/* ------------------------------------------------------------------ */

/**
 * Karplus-Strong : bruit filtré (brillance + position de l'attaque) réinjecté dans une ligne à retard
 * moyennée. Retourne les échantillons et le playbackRate qui corrige l'accord (retard N + 0,5).
 */
export function karplusStrong(sr: number, freq: number, seconds: number, decay: number, bright: number, pick: number, seed: number): { data: Float32Array; rate: number } {
  const period = sr / freq;
  const N = Math.max(2, Math.floor(period - 0.5));
  const rate = (N + 0.5) / period;
  const len = Math.max(N + 2, Math.floor(sr * seconds));
  const out = new Float32Array(len);
  const rng = mulberry32(seed);
  const exc = new Float32Array(N);
  let lp = 0;
  let mean = 0;
  for (let i = 0; i < N; i++) {
    lp += (rng() * 2 - 1 - lp) * bright;
    exc[i] = lp;
    mean += lp;
  }
  mean /= N;
  const pd = Math.max(1, Math.round(N * pick));
  let peak = 1e-9;
  const shaped = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const v = (exc[i] as number) - mean - ((exc[(i + pd) % N] as number) - mean);
    shaped[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < N; i++) out[i] = ((shaped[i] as number) / peak) * 0.9;
  for (let i = N; i < len; i++) out[i] = decay * 0.5 * ((out[i - N] as number) + (i - N - 1 >= 0 ? (out[i - N - 1] as number) : 0));
  const fade = Math.min(len - N, Math.floor(sr * 0.03));
  for (let k = 0; k < fade; k++) out[len - 1 - k] = (out[len - 1 - k] as number) * (k / fade);
  return { data: out, rate };
}

type KsKind = 'banjo' | 'strum' | 'mute' | 'bass' | 'bassDrive';
/** half : rendu à demi-fréquence d'échantillonnage (timbres sombres) pour économiser la mémoire */
const KS: Record<KsKind, { sec: number; decay: number; bright: number; pick: number; half?: boolean }> = {
  banjo: { sec: 1.2, decay: 0.99, bright: 0.6, pick: 0.13 },
  strum: { sec: 0.35, decay: 0.965, bright: 0.55, pick: 0.22 },
  mute: { sec: 0.7, decay: 0.984, bright: 0.32, pick: 0.2, half: true },
  bass: { sec: 1.8, decay: 0.997, bright: 0.26, pick: 0.28, half: true },
  // basse « poussée » du super bonus : attaque plus claquante, plus de mordant
  bassDrive: { sec: 0.9, decay: 0.995, bright: 0.55, pick: 0.18, half: true },
};
const ksCache = new Map<string, { buffer: AudioBuffer; rate: number }>();

function ksBuffer(kind: KsKind, midi: number): { buffer: AudioBuffer; rate: number } {
  const key = `${kind}:${midi}`;
  const hit = ksCache.get(key);
  if (hit) return hit;
  const c = audio.ctx as BaseAudioContext;
  const spec = KS[kind];
  const sr = spec.half ? Math.round(c.sampleRate / 2) : c.sampleRate;
  const { data, rate } = karplusStrong(sr, midiHz(midi), spec.sec, spec.decay, spec.bright, spec.pick, midi * 31 + kind.length * 977);
  const buffer = c.createBuffer(1, data.length, sr);
  buffer.getChannelData(0).set(data);
  const v = { buffer, rate };
  ksCache.set(key, v);
  return v;
}

function playKS(kind: KsKind, midi: number, t: number, vel: number, dur: number, dest: AudioNode, detune = 0): void {
  const c = audio.ctx as BaseAudioContext;
  const { buffer, rate } = ksBuffer(kind, midi);
  const s = c.createBufferSource();
  s.buffer = buffer;
  s.playbackRate.value = rate;
  if (detune) s.detune.value = detune;
  const g = c.createGain();
  g.gain.setValueAtTime(vel, t);
  const end = Math.min(t + Math.max(0.05, dur), t + buffer.duration / rate);
  g.gain.setTargetAtTime(0, end, 0.025);
  s.connect(g).connect(dest);
  s.start(t);
  s.stop(end + 0.15);
}

/* ---------- percussions : synthèse en code rendue une fois dans des tampons (peu coûteux à jouer) ---------- */

export type DrumKind = 'stomp' | 'block' | 'blockLo' | 'shaker' | 'tick' | 'brush' | 'taiko' | 'taikoHi';

/** filtre biquad RBJ (passe-bas, passe-haut, passe-bande à 0 dB au sommet), appliqué hors ligne */
export function biquad(x: Float32Array, type: 'lowpass' | 'highpass' | 'bandpass', f: number, q: number, sr: number): Float32Array {
  const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
  const cs = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  let b0: number, b1: number, b2: number;
  if (type === 'lowpass') {
    b0 = (1 - cs) / 2;
    b1 = 1 - cs;
    b2 = b0;
  } else if (type === 'highpass') {
    b0 = (1 + cs) / 2;
    b1 = -(1 + cs);
    b2 = b0;
  } else {
    b0 = al;
    b1 = 0;
    b2 = -al;
  }
  const a0 = 1 + al;
  const a1 = -2 * cs;
  const a2 = 1 - al;
  const y = new Float32Array(x.length);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i] as number;
    const yi = (b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    y[i] = yi;
    x2 = x1;
    x1 = xi;
    y2 = y1;
    y1 = yi;
  }
  return y;
}

/** enveloppe : attaque linéaire, maintien, décroissance exponentielle (constante de temps tc) */
function envAt(tt: number, a: number, hold: number, tc: number): number {
  if (tt < a) return tt / a;
  if (tt < a + hold) return 1;
  return Math.exp(-(tt - a - hold) / tc);
}

/** sinus à glissando exponentiel f0 → f1 en sweep secondes, puis f1 */
function sweep(n: number, sr: number, f0: number, f1: number, sw: number, tri = false): Float32Array {
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / sr;
    const f = tt < sw ? f0 * (f1 / f0) ** (tt / sw) : f1;
    ph = (ph + f / sr) % 1;
    out[i] = tri ? 1 - 4 * Math.abs(ph - 0.5) : Math.sin(2 * Math.PI * ph);
  }
  return out;
}

/**
 * Rend un coup de percussion (vélocité 1) : planche tapée du pied, wood-blocks accordés, shaker, balais,
 * taikos. Mêmes recettes que des graphes Web Audio (oscillateurs, bruit filtré, enveloppes), calculées
 * une fois en JavaScript. Trois variantes de bruit par instrument évitent l'effet « mitraillette ».
 */
export function renderDrum(kind: DrumKind, midi: number, sr: number, seed: number): Float32Array {
  const rng = mulberry32(seed);
  const len = { stomp: 0.4, block: 0.15, blockLo: 0.15, shaker: 0.15, tick: 0.08, brush: 0.6, taiko: 1.1, taikoHi: 0.6 }[kind];
  const n = Math.floor(sr * len);
  const out = new Float32Array(n);
  const white = () => {
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = rng() * 2 - 1;
    return w;
  };
  const add = (src: Float32Array, peak: number, a: number, hold: number, tc: number) => {
    for (let i = 0; i < n; i++) out[i] = (out[i] as number) + (src[i] as number) * peak * envAt(i / sr, a, hold, tc);
  };
  const f = midiHz(midi);
  switch (kind) {
    case 'stomp':
      add(sweep(n, sr, 115, 48, 0.1), 0.8, 0.004, 0.02, 0.055);
      add(biquad(white(), 'bandpass', 420, 1.4, sr), 0.32, 0.002, 0.005, 0.015);
      break;
    case 'block':
    case 'blockLo':
      add(sweep(n, sr, f, f, 0.01, true), 0.5, 0.001, 0, 0.0175);
      add(sweep(n, sr, f * 2.76, f * 2.76, 0.01), 0.16, 0.001, 0, 0.0075);
      add(biquad(white(), 'bandpass', 2600, 3, sr), 0.25, 0.001, 0, 0.003);
      break;
    case 'shaker':
      add(biquad(white(), 'bandpass', 6800, 0.9, sr), 0.42, 0.012, 0, 0.0175);
      break;
    case 'tick':
      add(biquad(white(), 'highpass', 6500, 0.7, sr), 0.3, 0.001, 0, 0.0075);
      break;
    case 'brush':
      add(biquad(white(), 'bandpass', 2800, 0.5, sr), 0.3, 0.05, 0.15, 0.055);
      break;
    case 'taiko':
    case 'taikoHi': {
      const low = kind === 'taiko';
      add(sweep(n, sr, f * 1.7, f, 0.07), low ? 0.85 : 0.6, 0.003, 0.02, low ? 0.19 : 0.1);
      add(sweep(n, sr, f * 2.3, f * 1.52, 0.06), 0.2, 0.003, 0, 0.05);
      add(biquad(white(), 'lowpass', low ? 900 : 1500, 0.7, sr), 0.3, 0.002, 0, 0.009);
      break;
    }
  }
  // fin sans clic
  const fade = Math.floor(sr * 0.01);
  for (let k = 0; k < fade; k++) out[n - 1 - k] = (out[n - 1 - k] as number) * (k / fade);
  return out;
}

const drumCache = new Map<string, AudioBuffer>();
let drumRound = 0;
function drumBuffer(kind: DrumKind, midi: number): AudioBuffer {
  const variant = drumRound++ % 3;
  const key = `${kind}:${midi}:${variant}`;
  const hit = drumCache.get(key);
  if (hit) return hit;
  const c = audio.ctx as BaseAudioContext;
  const data = renderDrum(kind, midi, c.sampleRate, 7919 * (variant + 1) + midi);
  const b = c.createBuffer(1, data.length, c.sampleRate);
  b.getChannelData(0).set(data);
  drumCache.set(key, b);
  return b;
}

/** pré-calcule les percussions d'une humeur (appelé au démarrage : aucun calcul pendant le jeu) */
export function prewarmDrums(): void {
  if (!audio.ctx) return;
  const list: Array<[DrumKind, number]> = [['stomp', 36], ['block', 86], ['blockLo', 79], ['shaker', 0], ['tick', 0], ['brush', 0], ['taiko', 38], ['taikoHi', 45]];
  for (const [k, m] of list) for (let v = 0; v < 3; v++) drumBuffer(k, m);
}

function playDrum(kind: DrumKind, midi: number, t: number, vel: number, dest: AudioNode): void {
  const c = audio.ctx as BaseAudioContext;
  const s = c.createBufferSource();
  s.buffer = drumBuffer(kind, midi);
  // légère variation de hauteur sur les bruits (shaker, balais) : jamais deux coups identiques
  if (kind === 'shaker' || kind === 'tick' || kind === 'brush') s.playbackRate.value = 0.97 + ((t * 977) % 1) * 0.06;
  const g = c.createGain();
  g.gain.value = vel;
  s.connect(g).connect(dest);
  s.start(t);
}

/* ---------- cuivres : pré-rendus (3 dents de scie désaccordées + filtre passe-bas à enveloppe) ---------- */

/** dent de scie à correction polyBLEP (peu de repliement) */
function polyBlep(ph: number, dt: number): number {
  if (ph < dt) {
    const x = ph / dt;
    return x + x - x * x - 1;
  }
  if (ph > 1 - dt) {
    const x = (ph - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

/**
 * Note de cuivre (vélocité 1) : attaque « blat » (glissé de hauteur de -25 cents, filtre qui s'ouvre
 * puis se referme), maintien jusqu'à la fin du tampon. Filtre biquad passe-bas variable, recalculé
 * tous les 16 échantillons.
 */
export function renderBrass(midi: number, sr: number, seconds = 2): Float32Array {
  const f = midiHz(midi);
  const n = Math.floor(sr * seconds);
  const out = new Float32Array(n);
  // désaccord asymétrique et amplitudes inégales : pas d'annulations périodiques entre les trois voix
  const det = [-8, 0, 6];
  const amp = [0.8, 1, 0.7];
  const ph = [0.1, 0.43, 0.77];
  const peak = Math.min(5200, f * 7, sr * 0.45);
  const target = Math.min(3200, f * 3.6, sr * 0.45);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    a1 = 0,
    a2 = 0;
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / sr;
    if (i % 16 === 0) {
      const fc = tt < 0.05 ? f * 1.4 + (peak - f * 1.4) * (tt / 0.05) : target + (peak - target) * Math.exp(-(tt - 0.05) / 0.12);
      const w = (2 * Math.PI * fc) / sr;
      const cs = Math.cos(w);
      const al = Math.sin(w) / (2 * 1.1);
      const a0 = 1 + al;
      b0 = (1 - cs) / 2 / a0;
      b1 = (1 - cs) / a0;
      b2 = b0;
      a1 = (-2 * cs) / a0;
      a2 = (1 - al) / a0;
    }
    const scoop = tt < 0.05 ? -25 * (1 - tt / 0.05) : 0;
    let x = 0;
    for (let k = 0; k < 3; k++) {
      const fk = f * 2 ** (((det[k] as number) + scoop) / 1200);
      const dt = fk / sr;
      let p = (ph[k] as number) + dt;
      if (p >= 1) p -= 1;
      ph[k] = p;
      x += (2 * p - 1 - polyBlep(p, dt)) * (amp[k] as number);
    }
    x /= 2.5;
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    // attaque avec léger dépassement (sforzando des coups de cuivres), puis tenue
    const env = tt < 0.028 ? (tt / 0.028) * 1.3 : 1 + 0.3 * Math.exp(-(tt - 0.028) / 0.06);
    out[i] = y * env * 0.1 * 3;
  }
  return out;
}

const brassCache = new Map<number, AudioBuffer>();
function brassBuffer(midi: number): AudioBuffer {
  const hit = brassCache.get(midi);
  if (hit) return hit;
  const c = audio.ctx as BaseAudioContext;
  const sr = Math.round(c.sampleRate / 2);
  const data = renderBrass(midi, sr);
  const b = c.createBuffer(1, data.length, sr);
  b.getChannelData(0).set(data);
  brassCache.set(midi, b);
  return b;
}

let reedWave: PeriodicWave | null = null;
let reedCtx: BaseAudioContext | null = null;
function reed(c: BaseAudioContext): PeriodicWave {
  if (reedWave && reedCtx === c) return reedWave;
  const amps = [0, 1, 0.75, 0.55, 0.42, 0.34, 0.2, 0.16, 0.1, 0.07, 0.05];
  const real = new Float32Array(amps.length);
  const imag = new Float32Array(amps);
  reedWave = c.createPeriodicWave(real, imag);
  reedCtx = c;
  return reedWave;
}

function noiseSrc(c: BaseAudioContext, t: number): AudioBufferSourceNode {
  const s = c.createBufferSource();
  s.buffer = audio.noise();
  s.loop = true;
  s.start(t, (t * 7.31) % 1.5);
  return s;
}

/** enveloppe attaque / maintien / relâchement (approche exponentielle, jamais de rampe vers 0) */
function adsr(c: BaseAudioContext, t: number, a: number, peak: number, hold: number, rel: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  if (hold > 0) g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.setTargetAtTime(0, t + a + hold, rel / 4);
  return g;
}

/**
 * Joue une note d'instrument à l'instant t (secondes AudioContext) vers dest.
 * dur en secondes. Utilisé par la musique et par les fanfares de sfx.ts (timbres communs).
 */
export function voice(inst: Inst, midi: number, t: number, vel: number, dur: number, dest: AudioNode): void {
  const c = audio.ctx as BaseAudioContext | null;
  if (!c) return;
  const f = midiHz(midi);
  switch (inst) {
    case 'banjo':
      return playKS('banjo', midi, t, vel * 0.9, Math.max(dur, 0.6), dest);
    case 'strum':
      return playKS('strum', midi, t, vel * 0.8, Math.min(dur, 0.12), dest);
    case 'mute':
      return playKS('mute', midi, t, vel * 0.85, Math.min(dur, 0.35), dest);
    case 'bass':
      return playKS('bass', midi, t, vel, dur, dest);
    case 'bassDrive':
      return playKS('bassDrive', midi, t, vel, dur * 0.9, dest);
    case 'stomp':
    case 'block':
    case 'blockLo':
    case 'shaker':
    case 'tick':
    case 'brush':
    case 'taiko':
    case 'taikoHi':
      return playDrum(inst, midi, t, vel, dest);
    case 'whistle': {
      const o = c.createOscillator();
      o.frequency.value = f;
      o.detune.setValueAtTime(-45, t);
      o.detune.linearRampToValueAtTime(0, t + 0.06);
      const lfo = c.createOscillator();
      lfo.frequency.value = 5.6;
      const depth = c.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(0, t + 0.14);
      depth.gain.linearRampToValueAtTime(dur > 0.3 ? 16 : 5, t + 0.4);
      lfo.connect(depth).connect(o.detune);
      const g = adsr(c, t, 0.035, vel * 0.32, Math.max(0, dur - 0.035), 0.09);
      o.connect(g).connect(dest);
      const n = noiseSrc(c, t);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = 10;
      const ng = adsr(c, t, 0.03, vel * 0.1, Math.max(0, dur - 0.03), 0.07);
      n.connect(bp).connect(ng).connect(dest);
      const end = t + dur + 0.3;
      o.start(t);
      lfo.start(t);
      o.stop(end);
      lfo.stop(end);
      n.stop(end);
      return;
    }
    case 'reed': {
      const g = adsr(c, t, 0.03, vel * 0.1, Math.max(0, dur - 0.03), 0.1);
      // trémolo sur un étage séparé (gain 1 ± 0,15) : aucune fuite hors de l'enveloppe
      const tremStage = c.createGain();
      tremStage.gain.value = 1;
      const trem = c.createOscillator();
      trem.frequency.value = 6.2;
      const tg = c.createGain();
      tg.gain.value = 0.15;
      trem.connect(tg).connect(tremStage.gain);
      const end = t + dur + 0.35;
      for (const d of [-6, 6]) {
        const o = c.createOscillator();
        o.setPeriodicWave(reed(c));
        o.frequency.value = f;
        o.detune.value = d;
        o.connect(tremStage);
        o.start(t);
        o.stop(end);
      }
      tremStage.connect(g).connect(dest);
      trem.start(t);
      trem.stop(end);
      return;
    }
    case 'pad': {
      const g = adsr(c, t, 0.7, vel * 0.09, Math.max(0, dur - 0.7), 1.4);
      const end = t + dur + 1.6;
      for (const d of [-8, 7]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = d;
        o.connect(g);
        o.start(t);
        o.stop(end);
      }
      const sub = c.createOscillator();
      sub.type = 'triangle';
      sub.frequency.value = f / 2;
      sub.connect(g);
      sub.start(t);
      sub.stop(end);
      g.connect(dest);
      return;
    }
    case 'brass': {
      // note de cuivre pré-rendue (attaque « blat » incluse), relâchement par enveloppe
      const b = brassBuffer(midi);
      const src = c.createBufferSource();
      src.buffer = b;
      const g = c.createGain();
      const rel = Math.min(Math.max(0.05, dur), b.duration - 0.2);
      g.gain.setValueAtTime(vel, t);
      g.gain.setTargetAtTime(0, t + rel, 0.03);
      src.connect(g).connect(dest);
      src.start(t);
      src.stop(t + rel + 0.2);
      return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Pistes (une par humeur active) et moteur                            */
/* ------------------------------------------------------------------ */

type Group = 'pluck' | 'strum' | 'bass' | 'kit' | 'taiko' | 'lead' | 'pad' | 'brass';
const GROUP_OF: Record<Inst, Group> = {
  banjo: 'pluck',
  strum: 'strum',
  mute: 'strum',
  bass: 'bass',
  bassDrive: 'bass',
  stomp: 'kit',
  block: 'kit',
  blockLo: 'kit',
  shaker: 'kit',
  brush: 'kit',
  tick: 'kit',
  taiko: 'taiko',
  taikoHi: 'taiko',
  whistle: 'lead',
  reed: 'lead',
  pad: 'pad',
  brass: 'brass',
};

/** niveaux de mixage par humeur et par groupe */
export const MIX: Record<Mood, Record<Group, number>> = {
  base: { pluck: 0.5, strum: 0.32, bass: 0.72, kit: 0.5, taiko: 0.4, lead: 0.34, pad: 0.2, brass: 0.3 },
  bonus: { pluck: 0.4, strum: 0.42, bass: 0.62, kit: 0.42, taiko: 0.4, lead: 0.28, pad: 0.3, brass: 0.3 },
  super: { pluck: 0.26, strum: 0.3, bass: 0.62, kit: 0.42, taiko: 0.72, lead: 0.32, pad: 0.2, brass: 0.36 },
};
const SEND: Record<Mood, Record<Group, number>> = {
  base: { pluck: 0.1, strum: 0.06, bass: 0.02, kit: 0.1, taiko: 0.2, lead: 0.3, pad: 0.35, brass: 0.2 },
  bonus: { pluck: 0.22, strum: 0.2, bass: 0.05, kit: 0.2, taiko: 0.35, lead: 0.45, pad: 0.5, brass: 0.3 },
  super: { pluck: 0.12, strum: 0.1, bass: 0.03, kit: 0.12, taiko: 0.3, lead: 0.35, pad: 0.35, brass: 0.22 },
};
const PAN: Record<Group, number> = { pluck: 0.22, strum: -0.3, bass: 0, kit: -0.12, taiko: 0, lead: 0.08, pad: 0, brass: 0.12 };

/** niveau de chaque humeur (base = référence), étalonné par rendu hors ligne */
export const MOOD_LEVEL: Record<Mood, number> = { base: 0.9, bonus: 1.3, super: 0.75 };
/** niveau de sortie de la musique vers le bus (volumes du moteur par défaut → RMS ≈ -26 dBFS au maître) */
const OUT_LEVEL = 2.7;

export const CROSSFADE_S = 2;
export const LOOKAHEAD_S = 0.12;
export const TICK_MS = 25;

/** courbe d'égale puissance approchée par segments linéaires */
function fade(p: AudioParam, from: number, to: number, t0: number, dur: number): void {
  p.cancelScheduledValues(t0);
  p.setValueAtTime(from, t0);
  const n = 6;
  for (let k = 1; k <= n; k++) {
    const x = k / n;
    const w = from < to ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2);
    const v = from < to ? from + (to - from) * w : to + (from - to) * w;
    p.linearRampToValueAtTime(v, t0 + dur * x);
  }
}

class Track {
  readonly bus: GainNode;
  readonly sendBus: GainNode;
  readonly lp: BiquadFilterNode;
  readonly clock: StepClock;
  private groups = new Map<Group, AudioNode>();
  private composedBar = -1;
  private byStep: NoteEvent[][] = [];
  endAt: number | null = null;

  constructor(
    readonly mood: Mood,
    readonly composer: Composer,
    out: AudioNode,
    verb: AudioNode,
    start: number,
  ) {
    const c = audio.ctx as BaseAudioContext;
    const spec = MOODS[mood];
    this.clock = new StepClock(spec.bpm, spec.swing, start);
    this.bus = c.createGain();
    this.bus.gain.value = 0;
    this.sendBus = c.createGain();
    this.sendBus.gain.value = 0;
    this.lp = c.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 18000;
    this.lp.Q.value = 0.7;
    this.lp.connect(this.bus).connect(out);
    this.sendBus.connect(verb);
  }

  private group(g: Group): AudioNode {
    const hit = this.groups.get(g);
    if (hit) return hit;
    const c = audio.ctx as BaseAudioContext;
    const input = c.createGain();
    input.gain.value = MIX[this.mood][g];
    let tail: AudioNode = input;
    const chain = (n: AudioNode) => {
      tail.connect(n);
      tail = n;
    };
    const biquad = (type: BiquadFilterType, freq: number, q = 0.7, gain = 0) => {
      const b = c.createBiquadFilter();
      b.type = type;
      b.frequency.value = freq;
      b.Q.value = q;
      b.gain.value = gain;
      chain(b);
    };
    if (g === 'pluck') {
      biquad('highpass', 170);
      biquad('peaking', 1150, 1.2, 4);
      biquad('lowpass', 7000, 0.5);
    } else if (g === 'strum') {
      biquad('highpass', 200);
      biquad('lowpass', 3800);
    } else if (g === 'bass') {
      biquad('lowpass', 1500);
      biquad('peaking', 100, 0.9, 3);
    } else if (g === 'pad') {
      biquad('lowpass', this.mood === 'bonus' ? 1100 : 1500, 0.4);
    } else if (g === 'lead') {
      biquad('highpass', 250);
      biquad('lowpass', 4800);
    } else if (g === 'brass') biquad('peaking', 1500, 1, 2);
    if (typeof (c as AudioContext).createStereoPanner === 'function') {
      const p = c.createStereoPanner();
      p.pan.value = PAN[g];
      chain(p);
    }
    tail.connect(this.lp);
    const send = c.createGain();
    send.gain.value = SEND[this.mood][g];
    tail.connect(send).connect(this.sendBus);
    this.groups.set(g, input);
    return input;
  }

  fadeIn(t: number, dur: number): void {
    const level = MOOD_LEVEL[this.mood];
    fade(this.bus.gain, 0, level, t, dur);
    fade(this.sendBus.gain, 0, level, t, dur);
  }

  fadeOut(t: number, dur: number): void {
    const from = Math.max(0, Math.min(2, this.bus.gain.value));
    fade(this.bus.gain, from, 0, t, dur);
    fade(this.sendBus.gain, from, 0, t, dur);
    this.endAt = t + dur;
  }

  /** planifie tous les pas dont l'heure tombe avant horizon */
  schedule(now: number, horizon: number): void {
    for (let guard = 0; guard < 256; guard++) {
      let t = this.clock.time;
      if (t >= horizon || (this.endAt !== null && t >= this.endAt)) return;
      if (t < now - 0.25) {
        // grosse latence (onglet ralenti, thread bloqué) : on saute plutôt que de tout rejouer d'un coup
        this.clock.rebase(now + 0.05);
        t = this.clock.time;
        if (t >= horizon) return;
      }
      if (this.composedBar !== this.clock.bar) {
        this.composedBar = this.clock.bar;
        const plan = this.composer.nextBar();
        this.byStep = Array.from({ length: STEPS }, () => []);
        for (const e of plan.events) this.byStep[e.step]?.push(e);
      }
      const ss = stepSec(this.clock.bpm);
      for (const e of this.byStep[this.clock.step] ?? []) {
        const at = Math.max(now, t + (e.nudge ?? 0) / 1000);
        voice(e.inst, e.midi, at, e.vel, e.len * ss, this.group(GROUP_OF[e.inst]));
      }
      this.clock.advance();
    }
  }

  setTensionFilter(on: boolean, t: number): void {
    this.lp.frequency.cancelScheduledValues(t);
    this.lp.frequency.setValueAtTime(this.lp.frequency.value, t);
    this.lp.frequency.setTargetAtTime(on ? 850 : 18000, t, on ? 0.18 : 0.35);
  }

  dispose(): void {
    this.bus.disconnect();
    this.sendBus.disconnect();
  }
}

interface TensionState {
  clock: StepClock;
  out: GainNode;
  stopAt: number | null;
  started: number;
  oscs: OscillatorNode[];
}

/** tonique par humeur, pour le bourdon de tension */
const TONIC: Record<Mood, number> = { base: 43, bonus: 40, super: 40 };

export class Music {
  private out: GainNode | null = null;
  private verb: ConvolverNode | null = null;
  private tracks: Track[] = [];
  private composers: Partial<Record<Mood, Composer>> = {};
  private mood: Mood = 'base';
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private paused = false;
  private waiting = false;
  private tension: TensionState | null = null;
  /** graine de la forme musicale (identique d'une session à l'autre : identité reconnaissable) */
  seed = 0xb00f;

  get currentMood(): Mood {
    return this.mood;
  }

  get isRunning(): boolean {
    return this.running;
  }

  private ensureGraph(): boolean {
    const c = audio.ctx;
    if (!c) return false;
    if (this.out) return true;
    this.out = c.createGain();
    this.out.gain.value = OUT_LEVEL;
    this.out.connect(audio.buses.music);
    this.verb = c.createConvolver();
    this.verb.buffer = audio.reverb.buffer;
    const wet = c.createGain();
    wet.gain.value = 0.5;
    this.verb.connect(wet).connect(this.out);
    prewarmDrums();
    return true;
  }

  private composer(m: Mood): Composer {
    const hit = this.composers[m];
    if (hit) return hit;
    const k = new Composer(m, this.seed + (m === 'base' ? 0 : m === 'bonus' ? 101 : 202));
    this.composers[m] = k;
    return k;
  }

  /** démarre la musique (attend l'activation audio si nécessaire) */
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
    const c = audio.ctx as AudioContext;
    const t = c.currentTime + 0.08;
    this.running = true;
    this.paused = false;
    const o = this.out as GainNode;
    o.gain.cancelScheduledValues(t);
    o.gain.setValueAtTime(o.gain.value, t);
    o.gain.linearRampToValueAtTime(OUT_LEVEL, t + 0.1);
    this.addTrack(this.mood, t, 1.2);
    this.ensureTimer();
  }

  private addTrack(m: Mood, t: number, fadeS: number): Track {
    const k = this.composer(m);
    k.restart('A');
    const tr = new Track(m, k, this.out as GainNode, this.verb as ConvolverNode, t);
    tr.fadeIn(t, fadeS);
    if (this.tension && this.tension.stopAt === null) tr.setTensionFilter(true, t);
    this.tracks.push(tr);
    return tr;
  }

  /** change d'humeur : fondu enchaîné d'égale puissance (2 s) calé sur le prochain temps */
  setMood(m: Mood): void {
    if (m === this.mood) return;
    this.mood = m;
    if (!this.running || this.paused || !audio.ctx) return; // en pause : appliqué à la reprise
    this.crossfadeTo(m, audio.ctx.currentTime + 0.06);
    this.pump();
  }

  private crossfadeTo(m: Mood, after: number): void {
    const live = this.tracks.filter((tr) => tr.endAt === null);
    const lead = live[live.length - 1];
    if (lead && lead.mood === m && live.length === 1) return;
    const t0 = lead ? lead.clock.nextBeat(after) : after;
    for (const tr of live) tr.fadeOut(t0, CROSSFADE_S);
    this.addTrack(m, t0, CROSSFADE_S);
  }

  /** arrêt en fondu */
  stop(fadeMs = 1200): void {
    if (!audio.ctx || !this.running) return;
    const t = audio.ctx.currentTime;
    for (const tr of this.tracks) if (tr.endAt === null) tr.fadeOut(t, Math.max(0.05, fadeMs / 1000));
    this.running = false;
    this.paused = false;
    this.ensureTimer(); // nettoyage des pistes après le fondu
  }

  /**
   * Pause musicale (menus plein écran, pause du jeu). L'onglet masqué est déjà géré par la suspension
   * du contexte (audio engine). À la reprise, la musique repart sur une nouvelle mesure.
   */
  pause(p: boolean): void {
    if (!audio.ctx || !this.out || p === this.paused) return;
    this.paused = p;
    const t = audio.ctx.currentTime;
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    if (p) {
      g.linearRampToValueAtTime(0, t + 0.3);
      this.stopTimer();
    } else {
      g.linearRampToValueAtTime(OUT_LEVEL, t + 0.6);
      for (const tr of this.tracks) tr.clock.rebase(tr.clock.nextBeat(t + 0.08));
      if (this.running) this.crossfadeTo(this.mood, t + 0.08); // humeur changée pendant la pause
      this.ensureTimer();
    }
  }

  /** couche de tension pendant l'anticipation (bourdon montant, pulsation de mèche calée sur le tempo) */
  setTension(on: boolean): void {
    const c = audio.ctx;
    if (!c || !audio.ready) return;
    const t = c.currentTime;
    const live = this.tracks.filter((tr) => tr.endAt === null);
    for (const tr of live) tr.setTensionFilter(on, t);
    if (on) {
      if (this.tension && this.tension.stopAt === null) return;
      const lead = live[live.length - 1];
      const bpm = MOODS[this.mood].bpm;
      const start = lead ? lead.clock.nextBeat(t + 0.02) : t + 0.02;
      const out = c.createGain();
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(1, t + 0.35);
      out.connect(audio.buses.sfx);
      const root = TONIC[this.mood];
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 5;
      lp.frequency.setValueAtTime(260, t);
      lp.frequency.exponentialRampToValueAtTime(1900, t + 3.5);
      const dg = c.createGain();
      dg.gain.value = 0.05;
      const trem = c.createOscillator();
      trem.frequency.value = bpm / 30;
      const tg = c.createGain();
      tg.gain.value = 0.018;
      trem.connect(tg).connect(dg.gain);
      lp.connect(dg).connect(out);
      const oscs: OscillatorNode[] = [trem];
      for (const [iv, d] of [
        [0, -6],
        [7, 5],
        [12, 0],
      ] as Array<[number, number]>) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midiHz(root + iv);
        o.detune.setValueAtTime(d, t);
        o.detune.linearRampToValueAtTime(d + 200, t + 4.5);
        o.connect(lp);
        oscs.push(o);
      }
      for (const o of oscs) o.start(t);
      this.tension = { clock: new StepClock(bpm, 0.5, start), out, stopAt: null, started: t, oscs };
      this.ensureTimer();
      this.pump();
    } else if (this.tension && this.tension.stopAt === null) {
      const ts = this.tension;
      ts.stopAt = t;
      ts.out.gain.cancelScheduledValues(t);
      ts.out.gain.setValueAtTime(ts.out.gain.value, t);
      ts.out.gain.linearRampToValueAtTime(0, t + 0.25);
      for (const o of ts.oscs) o.stop(t + 0.3);
    }
  }

  private pumpTension(now: number, horizon: number): void {
    const ts = this.tension;
    if (!ts) return;
    if (ts.stopAt !== null) {
      if (now > ts.stopAt + 0.5) {
        ts.out.disconnect();
        this.tension = null;
      }
      return;
    }
    for (let guard = 0; guard < 64; guard++) {
      const t = ts.clock.time;
      if (t >= horizon) break;
      if (t >= now - 0.05 && ts.clock.step % 2 === 0) {
        const rise = Math.min(1, (t - ts.started) / 3);
        const on = ts.clock.step % 4 === 0;
        tensionTick(Math.max(t, now), 0.35 + rise * 0.45, on, ts.out);
      }
      ts.clock.advance();
    }
  }

  /** planificateur : appelé toutes les 25 ms (et à la demande) */
  pump(ahead = LOOKAHEAD_S): void {
    const c = audio.ctx;
    if (!c || !this.out) return;
    const now = c.currentTime;
    const horizon = now + ahead;
    if (!this.paused) for (const tr of this.tracks) tr.schedule(now, horizon);
    this.pumpTension(now, horizon);
    this.tracks = this.tracks.filter((tr) => {
      if (tr.endAt !== null && now > tr.endAt + 0.4) {
        tr.dispose();
        return false;
      }
      return true;
    });
    if (!this.running && !this.tension && this.tracks.length === 0) this.stopTimer();
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

/** pulsation de mèche : tic sec + battement sourd sur les temps */
function tensionTick(t: number, level: number, onBeat: boolean, dest: AudioNode): void {
  const c = audio.ctx as BaseAudioContext;
  const n = noiseSrc(c, t);
  const hp = c.createBiquadFilter();
  hp.type = 'bandpass';
  hp.frequency.value = 4200;
  hp.Q.value = 2;
  const g = adsr(c, t, 0.001, 0.07 * level, 0, 0.03);
  n.connect(hp).connect(g).connect(dest);
  n.stop(t + 0.08);
  if (onBeat) {
    const o = c.createOscillator();
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
    const og = adsr(c, t, 0.004, 0.22 * level, 0.02, 0.16);
    o.connect(og).connect(dest);
    o.start(t);
    o.stop(t + 0.35);
  }
}

export const music = new Music();
