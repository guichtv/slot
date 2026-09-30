// CYBER CAT - per-cue mastering: DC/rumble removal, optional limiting, trimming, true-peak
// normalisation, click-free edges (one-shots) or wrap-aware processing (loops).
import {
  SR, db, len, filt, filtPeriodic, limit, limitPeriodic, samplePeak, scale, removeDcWindowed, normalizeTruePeak,
  truePeak, rms, fadeIn, fadeOut, mean, sat,
} from './dsp.mjs';

/**
 * One-shot mastering.
 * hp: high-pass (Hz) for DC + rumble. limitDb: if set, peaks are first scaled to 0 dBFS then limited
 * to that ceiling (i.e. `limitDb` dB of gain reduction on the loudest peaks). trimDb: tail cut level
 * relative to the peak. fadeInMs / fadeOutMs: raised-cosine edge fades (ends are exactly 0).
 */
export function finalizeOneShot(chs, {
  targetDb = -1, hp = 28, lp = null, limitDb = null, fadeInMs = 0.5, fadeOutMs = 60, trimDb = -50, minDur = 0.05, maxDur = null,
} = {}) {
  chs = chs.map((c) => Float32Array.from(c));
  for (const c of chs) {
    filt(c, 'hp', hp, 0.707);
    if (lp) filt(c, 'lp', lp, 0.707);
  }
  if (limitDb != null) {
    scale(chs, 1 / Math.max(samplePeak(chs), 1e-9));
    limit(chs, { ceiling: db(limitDb), lookahead: 0.002, release: 0.09 });
  }
  const pk = samplePeak(chs);
  const thr = pk * db(trimDb);
  let last = 0;
  for (const c of chs) {
    for (let i = c.length - 1; i > last; i--) {
      if (Math.abs(c[i]) > thr) {
        last = i;
        break;
      }
    }
  }
  let end = last + len(0.015);
  if (maxDur) end = Math.min(end, len(maxDur));
  end = Math.max(end, len(minDur));
  chs = chs.map((c) => {
    const o = new Float32Array(end);
    o.set(c.subarray(0, Math.min(end, c.length)));
    return o;
  });
  for (const c of chs) removeDcWindowed(c);
  const fi = Math.max(2, len(fadeInMs / 1000));
  const fo = Math.max(8, Math.min(len(fadeOutMs / 1000), Math.floor(end * 0.4)));
  for (const c of chs) {
    fadeIn(c, fi);
    fadeOut(c, fo);
    c[0] = 0;
    c[c.length - 1] = 0;
  }
  normalizeTruePeak(chs, targetDb);
  return chs;
}

/**
 * Loop mastering: every stage treats the buffer as periodic so the seam stays continuous.
 * rmsDb caps the loudness (music/ambience beds sit below the SFX); targetDb caps the true peak.
 */
export function finalizeLoop(chs, { targetDb = -1, rmsDb = null, hp = 25, limitDb = null, drive = 0 } = {}) {
  chs = chs.map((c) => Float32Array.from(c));
  for (const c of chs) filtPeriodic(c, 'hp', hp, 0.707);
  if (drive) {
    const p = samplePeak(chs);
    for (const c of chs) for (let i = 0; i < c.length; i++) c[i] = sat(c[i] / p, drive) * p;
  }
  if (limitDb != null) {
    scale(chs, 1 / Math.max(samplePeak(chs), 1e-9));
    chs = limitPeriodic(chs, { ceiling: db(limitDb), lookahead: 0.002, release: 0.12 });
  }
  for (const c of chs) {
    const m = mean(c);
    for (let i = 0; i < c.length; i++) c[i] -= m;
  }
  const tp = truePeak(chs, true);
  let g = db(targetDb) / Math.max(tp, 1e-9);
  if (rmsDb != null) g = Math.min(g, db(rmsDb) / Math.max(rms(chs), 1e-9));
  scale(chs, g);
  return chs;
}

export { SR };
