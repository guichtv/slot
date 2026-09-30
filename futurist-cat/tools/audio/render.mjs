#!/usr/bin/env node
// CYBER CAT - offline audio renderer.
//   node tools/audio/render.mjs                 render + encode every cue
//   node tools/audio/render.mjs --only a,b      render a subset (manifest entries are merged)
//   node tools/audio/render.mjs --no-encode     WAV only (tools/audio/.work)
//   node tools/audio/render.mjs --force         re-encode even if the WAV did not change
// Every sound is synthesised by the code in tools/audio (no samples, no third-party audio).
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import { CUES } from './cues/index.mjs';
import { makeRng, seedFrom, SR, toDb, momentaryMax, samplePeak, rms, hasBadSamples, clamp, kWeight } from './lib/dsp.mjs';
import { finalizeOneShot, finalizeLoop } from './lib/master.mjs';
import { encodeWav } from './lib/wav.mjs';
import { Mix } from './lib/synth.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const WORK = join(HERE, '.work');
const OUT = join(ROOT, 'public/audio');
const MANIFEST = join(OUT, 'manifest.json');

// Encoder settings per bus. Vorbis quality is VBR (q4 ~ 128 kb/s stereo), AAC is ABR.
const ENC = {
  ui: { q: 5, aac: '128k' },
  sfx: { q: 5, aac: '128k' },
  music: { q: 4, aac: '128k' },
  amb: { q: 3, aac: '128k' },
};

function parseArgs(argv) {
  const a = { only: null, encode: true, force: false, list: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--only') a.only = new Set(String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean));
    else if (v.startsWith('--only=')) a.only = new Set(v.slice(7).split(',').map((s) => s.trim()).filter(Boolean));
    else if (v === '--no-encode') a.encode = false;
    else if (v === '--force') a.force = true;
    else if (v === '--list') a.list = true;
  }
  return a;
}

function toChannels(res) {
  if (res instanceof Mix) return res.chs;
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.chs)) return res.chs;
  throw new Error('cue generator must return a Mix or channel array');
}

function matchChannels(chs, n) {
  if (chs.length === n) return chs;
  if (n === 1) {
    const m = new Float32Array(chs[0].length);
    for (let i = 0; i < m.length; i++) m[i] = (chs[0][i] + chs[1][i]) * 0.5;
    return [m];
  }
  return [chs[0], Float32Array.from(chs[0])];
}

function ffmpeg(args) {
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr || r.error}`);
}

function encode(id, wavPath, bus) {
  const e = ENC[bus];
  const common = ['-i', wavPath, '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-ar', String(SR)];
  ffmpeg([...common, '-c:a', 'libvorbis', '-q:a', String(e.q), join(OUT, `${id}.ogg`)]);
  ffmpeg([...common, '-c:a', 'aac', '-b:a', e.aac, '-movflags', '+faststart', join(OUT, `${id}.m4a`)]);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) {
    for (const c of CUES) console.log(`${c.id.padEnd(22)} ${c.bus.padEnd(6)} ${c.loop ? 'loop' : ''}`);
    return;
  }
  mkdirSync(WORK, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const ids = new Set(CUES.map((c) => c.id));
  if (args.only) for (const id of args.only) if (!ids.has(id)) throw new Error(`unknown cue id: ${id}`);

  let manifest = { version: '', sampleRate: SR, key: 'D minor / F major', cues: {} };
  if (args.only && existsSync(MANIFEST)) manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

  const rows = [];
  const tAll = performance.now();
  for (const cue of CUES) {
    if (args.only && !args.only.has(cue.id)) continue;
    const t0 = performance.now();
    const rng = makeRng(seedFrom(cue.id));
    let chs = matchChannels(toChannels(cue.gen(rng)), cue.channels ?? 1);
    chs = cue.loop ? finalizeLoop(chs, cue.master) : finalizeOneShot(chs, cue.master);
    if (hasBadSamples(chs)) throw new Error(`${cue.id}: NaN/Inf in output`);
    const wav = encodeWav(chs, SR);
    const wavPath = join(WORK, `${cue.id}.wav`);
    writeFileSync(wavPath, wav);
    const hash = createHash('sha1').update(wav).digest('hex').slice(0, 10);
    const hashPath = join(WORK, `${cue.id}.hash`);
    const outOk = existsSync(join(OUT, `${cue.id}.ogg`)) && existsSync(join(OUT, `${cue.id}.m4a`));
    const same = existsSync(hashPath) && readFileSync(hashPath, 'utf8') === hash && outOk;
    if (args.encode && (args.force || !same)) {
      encode(cue.id, wavPath, cue.bus);
      writeFileSync(hashPath, hash);
    }
    const mom = toDb(momentaryMax(kWeight(chs)));
    const gainDb = cue.loud == null ? 0 : Math.round(clamp(cue.loud - mom, -30, 0) * 2) / 2;
    const entry = {
      files: { ogg: `${cue.id}.ogg`, m4a: `${cue.id}.m4a` },
      duration: Math.round((chs[0].length / SR) * 10000) / 10000,
      loop: !!cue.loop,
      bus: cue.bus,
      critical: !!cue.critical,
      channels: chs.length,
      gainDb,
      hash,
    };
    if (cue.variants) entry.variants = cue.variants;
    if (cue.maxVoices) entry.maxVoices = cue.maxVoices;
    manifest.cues[cue.id] = entry;
    const ms = performance.now() - t0;
    rows.push({ id: cue.id, dur: entry.duration, ch: chs.length, peak: toDb(samplePeak(chs)), rms: toDb(rms(chs)), mom, gainDb, ms, enc: !same });
    console.log(
      `${cue.id.padEnd(22)} ${entry.duration.toFixed(3).padStart(7)}s ${String(chs.length)}ch peak ${toDb(samplePeak(chs)).toFixed(1).padStart(6)} rms ${toDb(rms(chs)).toFixed(1).padStart(6)} mom ${mom.toFixed(1).padStart(6)} gain ${gainDb.toFixed(1).padStart(5)}  ${(ms / 1000).toFixed(2)}s${same ? '' : ' *'}`,
    );
  }

  // keep manifest order = cue list order, drop unknown ids
  const ordered = {};
  for (const c of CUES) if (manifest.cues[c.id]) ordered[c.id] = manifest.cues[c.id];
  manifest.cues = ordered;
  manifest.version = createHash('sha1').update(Object.values(ordered).map((e) => e.hash).join(',')).digest('hex').slice(0, 10);
  manifest.sampleRate = SR;
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

  let total = 0;
  const byExt = { ogg: 0, m4a: 0 };
  for (const f of readdirSync(OUT)) {
    const s = statSync(join(OUT, f)).size;
    total += s;
    const ext = f.split('.').pop();
    if (ext in byExt) byExt[ext] += s;
  }
  console.log(`\n${rows.length} cue(s) in ${((performance.now() - tAll) / 1000).toFixed(1)}s. public/audio: ${(total / 1048576).toFixed(2)} MB (ogg ${(byExt.ogg / 1048576).toFixed(2)} MB, m4a ${(byExt.m4a / 1048576).toFixed(2)} MB)`);
}

main();
