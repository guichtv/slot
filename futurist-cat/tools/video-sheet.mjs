// Contact sheet of a video, to LOOK at it frame by frame (time of each frame written on it).
//   node tools/video-sheet.mjs captures/v.mp4 [--every 0.5] [--from 0] [--to 999] [--cols 6] [--width 320] [--out x.png]
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import sharp from 'sharp';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const src = resolve(args[0]);
const every = Number(opt('every', '0.5'));
const from = Number(opt('from', '0')), to = Number(opt('to', '999'));
const cols = Number(opt('cols', '6')), width = Number(opt('width', '320'));
const out = resolve(opt('out', src.replace(/\.mp4$/, `-sheet-${from}.png`)));
const dir = mkdtempSync(join(tmpdir(), 'vsheet-'));
try {
  // our recordings are constant frame rate: pick every Nth frame by NUMBER so each label is exact
  const probe = spawnSync(ffmpeg, ['-i', src], { encoding: 'utf8' }).stderr;
  const fps = Number(/(\d+(?:\.\d+)?) fps/.exec(probe)?.[1] ?? 30);
  const N = Math.max(1, Math.round(every * fps));
  const f0 = Math.round(from * fps), f1 = Math.round(Math.min(to, 1e5) * fps);
  const vf = `select='between(n\\,${f0}\\,${f1})*not(mod(n-${f0}\\,${N}))',scale=${width}:-2`;
  const r = spawnSync(ffmpeg, ['-y', '-i', src, '-vf', vf, '-vsync', '0', join(dir, 'f%05d.png')], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr.split('\n').slice(-6).join('\n')); process.exit(1); }
  const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort().slice(0, 400);
  if (!files.length) { console.error('aucune image'); process.exit(1); }
  const m = await sharp(join(dir, files[0])).metadata();
  const cw = m.width, ch = m.height, pad = 2;
  const rows = Math.ceil(files.length / cols);
  const layers = [];
  for (let i = 0; i < files.length; i++) {
    const x = (i % cols) * (cw + pad), y = Math.floor(i / cols) * (ch + pad);
    const t = ((f0 + i * N) / fps).toFixed(2);
    const label = Buffer.from(`<svg width="76" height="20"><rect width="76" height="20" fill="black" fill-opacity="0.65"/><text x="4" y="15" font-family="monospace" font-size="14" fill="white">${t}s</text></svg>`);
    layers.push({ input: join(dir, files[i]), left: x, top: y }, { input: label, left: x, top: y });
  }
  await sharp({ create: { width: cols * (cw + pad) - pad, height: rows * (ch + pad) - pad, channels: 3, background: '#000' } })
    .composite(layers).png().toFile(out);
  console.log(out);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
