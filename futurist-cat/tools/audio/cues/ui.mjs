// UI cues (bus "ui"): short glassy interface sounds, all tonal content in D minor / F major.
import {
  Mix, IR, hz, cents, tick, modal, fm2, thump, fnoise, whoosh, sparkle, envBell, TAU,
  GLASS, CHIME, BELL, BAR, PENT_TOP,
} from './common.mjs';

/** Glass tick: noise transient + tiny glass blip + soft tactile body. */
function uiClick(rng, v) {
  const m = new Mix(0.16);
  const f = hz('A6') * [1, cents(-35), cents(30)][v];
  m.add(tick({ rng, f: [5200, 4700, 5800][v], q: 1.6, dur: 0.0025 }), 0, 0.8);
  m.add(modal(f, 0.1, { set: GLASS, tau: [0.022, 0.019, 0.025][v], rng, attack: 0.0008, pitch: (t) => 1 + 0.035 * Math.exp(-t / 0.004) }), 0.0004, 0.55);
  m.add(thump(0.06, { f0: 620, f1: [380, 360, 400][v], pTau: 0.006, tau: 0.012, drive: 1 }), 0, 0.22);
  return m.reverb(IR('short'), 0.1);
}

function uiHover(rng) {
  const m = new Mix(0.12);
  m.add(modal(hz('D7'), 0.08, { set: CHIME, tau: 0.014, rng, attack: 0.002 }), 0, 0.5);
  m.add(fnoise(0.03, { rng, mode: 'bp', f: 8000, q: 0.8, amp: (t) => envBell(t, 0.004, 0.03) }), 0, 0.15);
  return m.reverb(IR('short'), 0.12);
}

function uiOpen(rng) {
  const m = new Mix(0.55);
  m.add(whoosh(0.2, { rng, f0: 700, f1: 5200, q: 1.8, peak: 0.6 }), 0, 0.35);
  m.add(modal(hz('D6'), 0.4, { set: GLASS, tau: 0.09, rng }), 0.03, 0.55);
  m.add(modal(hz('A6'), 0.45, { set: GLASS, tau: 0.12, rng }), 0.085, 0.5);
  m.add(fm2(hz('A5'), 0.3, { ratio: 2, index: 1.2, indexTau: 0.05, tau: 0.08, rng }), 0.085, 0.12);
  m.add(thump(0.1, { f0: 220, f1: 140, pTau: 0.02, tau: 0.03 }), 0.02, 0.18);
  return m.reverb(IR('lab'), 0.16);
}

function uiClose(rng) {
  const m = new Mix(0.5);
  m.add(whoosh(0.18, { rng, f0: 5000, f1: 700, q: 1.8, peak: 0.35 }), 0, 0.3);
  m.add(modal(hz('A6'), 0.35, { set: GLASS, tau: 0.08, rng }), 0.0, 0.45);
  m.add(modal(hz('D6'), 0.4, { set: GLASS, tau: 0.1, rng }), 0.055, 0.5);
  m.add(thump(0.1, { f0: 180, f1: 110, pTau: 0.02, tau: 0.03 }), 0.055, 0.18);
  return m.reverb(IR('lab'), 0.14).filter('lp', 9000, 0.6);
}

function uiToggle(rng) {
  const m = new Mix(0.18);
  m.add(tick({ rng, f: 3800, q: 2, dur: 0.002 }), 0, 0.6);
  m.add(modal(hz('F6'), 0.06, { set: BAR, tau: 0.012, rng }), 0, 0.4);
  m.add(tick({ rng, f: 5200, q: 2, dur: 0.002 }), 0.042, 0.5);
  m.add(modal(hz('C7'), 0.07, { set: BAR, tau: 0.016, rng }), 0.042, 0.45);
  return m.reverb(IR('short'), 0.1);
}

function uiBet(rng, up) {
  const m = new Mix(0.26);
  const [a, b] = up ? ['D6', 'A6'] : ['A6', 'D6'];
  const flick = up ? (t) => 1 - 0.03 * Math.exp(-t / 0.008) : (t) => 1 + 0.03 * Math.exp(-t / 0.008);
  m.add(fm2(hz(a), 0.1, { ratio: 2, index: 0.8, indexTau: 0.02, tau: 0.025, pitch: flick, rng }), 0, 0.45);
  m.add(fm2(hz(b), 0.14, { ratio: 2, index: 0.8, indexTau: 0.025, tau: 0.035, pitch: flick, rng }), 0.05, 0.5);
  m.add(modal(hz(b) * 2, 0.08, { set: CHIME, tau: 0.015, rng }), 0.05, 0.12);
  m.add(tick({ rng, f: 5000, q: 1.5, dur: 0.002 }), 0, 0.25);
  return m.reverb(IR('short'), 0.12);
}

/** Soft "denied": two muted FM bumps on a minor second (E/F, both in key), gently low-passed. */
function uiError(rng) {
  const m = new Mix(0.4);
  for (const [at, p, g] of [[0, 1, 0.5], [0.12, 0.97, 0.42]]) {
    const pitch = (t) => p * (1 - 0.025 * Math.min(1, t / 0.08));
    m.add(fm2(hz('E4'), 0.16, { ratio: 1, index: 1.3, indexTau: 0.04, indexEnd: 0.4, tau: 0.06, attack: 0.004, pitch, rng }), at, g);
    m.add(fm2(hz('F4'), 0.16, { ratio: 1, index: 1.3, indexTau: 0.04, indexEnd: 0.4, tau: 0.06, attack: 0.004, pitch, rng }), at, g * 0.8);
    m.add(thump(0.08, { f0: 160, f1: 110, pTau: 0.02, tau: 0.02 }), at, 0.2);
  }
  m.filter('lp', 2600, 0.6);
  return m.reverb(IR('lab'), 0.1);
}

/** "Purchase accepted": F major glass arpeggio into a bright resolved chord ring. */
function uiBuyConfirm(rng) {
  const m = new Mix(1.1);
  ['F5', 'A5', 'C6', 'F6'].forEach((nn, k) => m.add(modal(hz(nn), 0.6, { set: GLASS, tau: 0.16, rng }), k * 0.045, 0.42));
  m.add(fm2(hz('F5'), 0.8, { ratio: 2, index: 1.5, indexTau: 0.08, indexEnd: 0.2, tau: 0.3, rng }), 0.135, 0.3);
  m.add(fm2(hz('C6'), 0.8, { ratio: 2, index: 1.2, indexTau: 0.07, indexEnd: 0.2, tau: 0.28, rng }), 0.135, 0.22);
  m.add(modal(hz('A6'), 0.9, { set: BELL, tau: 0.3, rng }), 0.135, 0.22);
  m.add(thump(0.2, { f0: 180, f1: hz('F2'), pTau: 0.02, tau: 0.06 }), 0, 0.35);
  sparkle(m, { rng, notes: PENT_TOP, t0: 0.14, t1: 0.4, count: 6, gain: 0.12, tau: [0.03, 0.07] });
  return m.reverb(IR('glass'), 0.22);
}

function uiAutoplay(rng) {
  const m = new Mix(0.6);
  ['D6', 'F6', 'A6', 'D7'].forEach((nn, k) => m.add(modal(hz(nn), 0.3, { set: CHIME, tau: 0.06, rng }), k * 0.035, 0.4));
  m.add(fnoise(0.4, { rng, color: 'pink', mode: 'bp', f: (t) => 1500 + 1200 * Math.sin(TAU * 8 * t), q: 3, amp: (t) => envBell(t, 0.1, 0.35) }), 0, 0.2);
  m.add(thump(0.08, { f0: 200, f1: 130, pTau: 0.02, tau: 0.025 }), 0, 0.15);
  return m.reverb(IR('lab'), 0.15);
}

const ui = (id, gen, loud, extra = {}) => ({ id, bus: 'ui', critical: true, channels: 1, loud, gen, ...extra });

export default [
  ui('ui_click', (r) => uiClick(r, 0), -24, { variants: ['ui_click', 'ui_click_2', 'ui_click_3'], master: { fadeOutMs: 10 } }),
  ui('ui_click_2', (r) => uiClick(r, 1), -24, { master: { fadeOutMs: 10 } }),
  ui('ui_click_3', (r) => uiClick(r, 2), -24, { master: { fadeOutMs: 10 } }),
  ui('ui_hover', uiHover, -32, { master: { fadeOutMs: 10 } }),
  ui('ui_open', uiOpen, -22),
  ui('ui_close', uiClose, -23),
  ui('ui_toggle', uiToggle, -24, { master: { fadeOutMs: 10 } }),
  ui('ui_bet_up', (r) => uiBet(r, true), -24),
  ui('ui_bet_down', (r) => uiBet(r, false), -24),
  ui('ui_error', uiError, -22),
  ui('ui_buy_confirm', uiBuyConfirm, -19, { master: { maxDur: 1.2, fadeOutMs: 200 } }),
  ui('ui_autoplay_start', uiAutoplay, -22),
];

