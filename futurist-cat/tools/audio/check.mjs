#!/usr/bin/env node
// CYBER CAT - audio QA. Decodes the rendered WAVs (tools/audio/.work) and the encoded files
// (public/audio/*.ogg|m4a via ffmpeg-static) and checks, per cue:
//   peak / true peak (4x oversampled) <= -0.5 dBFS, |DC| <= 0.002, no click at the edges
//   (first/last sample <= -60 dBFS for one-shots), seamless loop point for loops, no NaN,
//   and per bus: music/amb RMS below SFX RMS.
//   encoded files: decoded peak <= -0.5 dBFS, loops sample-aligned (codec padding only at the end).
// Writes docs/preuves/audio-report.json. Exit code 1 if anything fails.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import { analyze, toDb, kWeight, momentaryMax, samplePeak, SR } from './lib/dsp.mjs';
import { readWav } from './lib/wav.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const WORK = join(HERE, '.work');
const OUT = join(ROOT, 'public/audio');
const REPORT = join(ROOT, 'docs/preuves/audio-report.json');

export const THRESHOLDS = {
  maxPeakDb: -0.5,
  maxTruePeakDb: -0.5,
  maxDc: 0.002,
  maxEdgeDb: -60,
  seamRatio: 2.5,
  seamMinAbs: 0.003,
  maxEncodedPeakDb: -0.5,
  maxDurationDiffMs: 1,
  // lossy codecs work in frames: one-shots may gain/lose up to one frame of (silent) padding;
  // loops must start sample-aligned and keep every sample of the loop (extra AAC padding at the
  // end is ignored by the runtime, which loops on [0, manifest.duration]).
  maxCodecPadSamples: 2048,
};

/**
 * Lag (samples) aligning the decoded file with the WAV. Lag 0 is accepted when the residual is
 * >= 15 dB below the signal (periodic material has many equal correlation peaks); otherwise the
 * best cross-correlation lag in +-2048 is returned.
 */
function startLag(ref, dec) {
  const M = Math.min(ref.length, dec.length, SR);
  let e = 0, r = 0;
  for (let i = 0; i < M; i++) {
    e += (ref[i] - dec[i]) ** 2;
    r += ref[i] ** 2;
  }
  if (r > 0 && e / r < 10 ** (-15 / 10)) return 0;
  let best = -Infinity, lag = 0;
  for (let l = -2048; l <= 2048; l++) {
    let s = 0;
    for (let i = 2048; i < M - 2048; i += 3) s += ref[i] * dec[i + l];
    if (s > best) {
      best = s;
      lag = l;
    }
  }
  return lag;
}

function decodeEncoded(path, channels) {
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', path, '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', String(channels), '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg decode failed for ${path}: ${r.stderr}`);
  const buf = r.stdout;
  const f = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  const n = Math.floor(f.length / channels);
  const chs = Array.from({ length: channels }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < channels; c++) chs[c][i] = f[i * channels + c];
  return chs;
}

const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const r1 = (x) => (x == null || !Number.isFinite(x) ? x : Math.round(x * 10) / 10);
const r5 = (x) => Math.round(x * 1e5) / 1e5;

function main() {
  const manifestPath = join(OUT, 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.error('public/audio/manifest.json missing: run node tools/audio/render.mjs first');
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const cues = {};
  let failed = 0;
  const bytes = { ogg: 0, m4a: 0 };
  const busRms = { sfx: [], ui: [], music: [], amb: [] };
  const busLoud = { sfx: [], ui: [], music: [], amb: [] };

  for (const [id, entry] of Object.entries(manifest.cues)) {
    const issues = [];
    const wavPath = join(WORK, `${id}.wav`);
    if (!existsSync(wavPath)) {
      cues[id] = { status: 'fail', issues: ['WAV not rendered (tools/audio/.work)'] };
      failed++;
      continue;
    }
    const { chs, sr } = readWav(wavPath);
    if (sr !== SR) issues.push(`sample rate ${sr}`);
    const a = analyze(chs, { loop: entry.loop });
    const loud = toDb(momentaryMax(kWeight(chs)));
    if (!a.finite) issues.push('NaN/Inf samples');
    if (a.peakDb > THRESHOLDS.maxPeakDb) issues.push(`peak ${a.peakDb.toFixed(2)} dBFS > ${THRESHOLDS.maxPeakDb}`);
    if (a.truePeakDb > THRESHOLDS.maxTruePeakDb) issues.push(`true peak ${a.truePeakDb.toFixed(2)} dBTP > ${THRESHOLDS.maxTruePeakDb}`);
    if (a.dc > THRESHOLDS.maxDc) issues.push(`DC offset ${a.dc.toExponential(2)} > ${THRESHOLDS.maxDc}`);
    if (!entry.loop) {
      if (a.firstDb > THRESHOLDS.maxEdgeDb) issues.push(`click at start (${a.firstDb.toFixed(1)} dBFS)`);
      if (a.lastDb > THRESHOLDS.maxEdgeDb) issues.push(`click at end (${a.lastDb.toFixed(1)} dBFS)`);
    } else if (a.seam) {
      const badJump = a.seam.ratio > THRESHOLDS.seamRatio && a.seam.jump > THRESHOLDS.seamMinAbs;
      const badCurv = a.seam.curvRatio > THRESHOLDS.seamRatio && a.seam.curv > THRESHOLDS.seamMinAbs;
      if (badJump || badCurv) issues.push(`loop seam discontinuity (jump ${a.seam.jump.toFixed(4)}, ${a.seam.ratio.toFixed(2)}x typical)`);
    }
    const durDiff = Math.abs(a.duration - entry.duration) * 1000;
    if (durDiff > THRESHOLDS.maxDurationDiffMs) issues.push(`manifest duration off by ${durDiff.toFixed(2)} ms`);
    // tail level just before the final fade region (information: natural decay vs. hard stop)
    const tailN = Math.min(a.samples, Math.round(0.06 * SR));
    const tail = samplePeak(chs.map((c) => c.subarray(c.length - tailN)));
    const encoded = {};
    for (const fmt of ['ogg', 'm4a']) {
      const p = join(OUT, entry.files?.[fmt] ?? `${id}.${fmt}`);
      if (!existsSync(p)) {
        issues.push(`${fmt} file missing`);
        continue;
      }
      const size = statSync(p).size;
      bytes[fmt] += size;
      const dec = decodeEncoded(p, chs.length);
      const pk = toDb(samplePeak(dec));
      const dn = dec[0].length - a.samples;
      encoded[fmt] = { bytes: size, peakDb: r1(pk), lengthDiffSamples: dn };
      if (pk > THRESHOLDS.maxEncodedPeakDb) issues.push(`${fmt} decoded peak ${pk.toFixed(2)} dBFS > ${THRESHOLDS.maxEncodedPeakDb}`);
      if (entry.loop) {
        const lag = startLag(chs[0], dec[0]);
        encoded[fmt].startLagSamples = lag;
        if (lag !== 0) issues.push(`${fmt} loop not sample-aligned (lag ${lag})`);
        if (dn < 0 || dn > THRESHOLDS.maxCodecPadSamples) issues.push(`${fmt} loop length differs by ${dn} samples`);
      } else if (Math.abs(dn) > THRESHOLDS.maxCodecPadSamples) {
        issues.push(`${fmt} decoded length differs by ${dn} samples`);
      }
    }
    busRms[entry.bus]?.push(a.rmsDb);
    busLoud[entry.bus]?.push(loud);
    const status = issues.length ? 'fail' : 'ok';
    if (issues.length) failed++;
    cues[id] = {
      status,
      bus: entry.bus,
      loop: entry.loop,
      channels: a.channels,
      duration: r5(a.duration),
      peakDb: r1(a.peakDb),
      truePeakDb: r1(a.truePeakDb),
      rmsDb: r1(a.rmsDb),
      loudnessMaxDb: r1(loud),
      gainDb: entry.gainDb ?? 0,
      dc: r5(a.dc),
      firstSampleDb: a.first === 0 ? '-inf' : r1(a.firstDb),
      lastSampleDb: a.last === 0 ? '-inf' : r1(a.lastDb),
      tail60msDb: r1(toDb(tail) - a.peakDb),
      seam: a.seam ? { jump: r5(a.seam.jump), ratio: r1(a.seam.ratio), curvRatio: r1(a.seam.curvRatio) } : null,
      encoded,
      issues,
    };
  }

  // loudness ordering: beds must sit under the SFX
  const med = Object.fromEntries(Object.entries(busRms).map(([b, v]) => [b, r1(median(v))]));
  const medLoud = Object.fromEntries(Object.entries(busLoud).map(([b, v]) => [b, r1(median(v))]));
  const global = [];
  if (med.music != null && med.sfx != null && med.music >= med.sfx) global.push(`music RMS (${med.music}) not below SFX RMS (${med.sfx})`);
  if (med.amb != null && med.sfx != null && med.amb >= med.sfx) global.push(`ambience RMS (${med.amb}) not below SFX RMS (${med.sfx})`);
  const total = bytes.ogg + bytes.m4a;

  const report = {
    tool: 'tools/audio/check.mjs',
    manifestVersion: manifest.version,
    sampleRate: SR,
    thresholds: THRESHOLDS,
    summary: {
      cues: Object.keys(cues).length,
      ok: Object.values(cues).filter((c) => c.status === 'ok').length,
      failed,
      globalIssues: global,
      medianRmsDbByBus: med,
      medianLoudnessMaxDbByBus: medLoud,
      bytes: { ogg: bytes.ogg, m4a: bytes.m4a, total, totalMB: Math.round((total / 1048576) * 100) / 100 },
      verdict: failed === 0 && global.length === 0 ? 'PASS' : 'FAIL',
    },
    cues,
  };
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad('cue', 22)}${pad('bus', 6)}${pad('dur', 8)}${pad('peak', 7)}${pad('TP', 7)}${pad('rms', 7)}${pad('dc', 9)}${pad('edges', 14)}seam / status`);
  for (const [id, c] of Object.entries(cues)) {
    if (!c.bus) {
      console.log(`${pad(id, 22)}FAIL ${c.issues.join('; ')}`);
      continue;
    }
    const edges = c.loop ? 'loop' : `${c.firstSampleDb}/${c.lastSampleDb}`;
    const seam = c.seam ? `jump ${c.seam.jump} (${c.seam.ratio}x) ` : '';
    console.log(`${pad(id, 22)}${pad(c.bus, 6)}${pad(c.duration.toFixed(3), 8)}${pad(c.peakDb, 7)}${pad(c.truePeakDb, 7)}${pad(c.rmsDb, 7)}${pad(c.dc.toExponential(1), 9)}${pad(edges, 14)}${seam}${c.status === 'ok' ? 'ok' : `FAIL: ${c.issues.join('; ')}`}`);
  }
  console.log(`\nmedian RMS by bus (dBFS): ${JSON.stringify(med)}`);
  console.log(`size: ogg ${(bytes.ogg / 1048576).toFixed(2)} MB + m4a ${(bytes.m4a / 1048576).toFixed(2)} MB = ${(total / 1048576).toFixed(2)} MB`);
  for (const g of global) console.log(`GLOBAL FAIL: ${g}`);
  console.log(`${report.summary.verdict}: ${report.summary.ok}/${report.summary.cues} cues ok -> ${REPORT.replace(`${ROOT}/`, '')}`);
  if (process.argv.includes('--md')) {
    const rows = ['| cue | bus | durée (s) | crête WAV (dBFS) | true peak (dBTP) | RMS (dBFS) | DC | bords / jointure | crête ogg | crête m4a | statut |', '|---|---|---:|---:|---:|---:|---:|---|---:|---:|---|'];
    for (const [id, c] of Object.entries(cues)) {
      if (!c.bus) continue;
      const edge = c.loop ? `boucle, saut ${c.seam.ratio}× typique` : `${c.firstSampleDb} / ${c.lastSampleDb}`;
      rows.push(`| ${id} | ${c.bus} | ${c.duration.toFixed(3)} | ${c.peakDb} | ${c.truePeakDb} | ${c.rmsDb} | ${c.dc.toFixed(5)} | ${edge} | ${c.encoded.ogg?.peakDb} | ${c.encoded.m4a?.peakDb} | ${c.status === 'ok' ? 'OK' : 'ÉCHEC'} |`);
    }
    console.log(`\n${rows.join('\n')}`);
  }
  if (report.summary.verdict !== 'PASS') process.exit(1);
}

main();
