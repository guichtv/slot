// Minimal WAV I/O: writes 32-bit float PCM, reads 16/24/32-bit int and 32-bit float (incl. EXTENSIBLE).
import { readFileSync, writeFileSync } from 'node:fs';

/** Encode channels (Float32Array[]) to a 32-bit float WAV buffer. */
export function encodeWav(chs, sr = 48000) {
  const nch = chs.length;
  const n = chs[0].length;
  const dataBytes = n * nch * 4;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20); // IEEE float
  buf.writeUInt16LE(nch, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * nch * 4, 28);
  buf.writeUInt16LE(nch * 4, 32);
  buf.writeUInt16LE(32, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      buf.writeFloatLE(chs[c][i], o);
      o += 4;
    }
  }
  return buf;
}

export function writeWav(path, chs, sr = 48000) {
  writeFileSync(path, encodeWav(chs, sr));
}

/** Decode a WAV buffer into { sr, chs }. */
export function decodeWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let off = 12;
  let fmt = null;
  let data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') {
      let format = buf.readUInt16LE(body);
      const nch = buf.readUInt16LE(body + 2);
      const sr = buf.readUInt32LE(body + 4);
      const bits = buf.readUInt16LE(body + 14);
      if (format === 0xfffe && size >= 40) format = buf.readUInt16LE(body + 24);
      fmt = { format, nch, sr, bits };
    } else if (id === 'data') {
      data = { start: body, size: Math.min(size, buf.length - body) };
    }
    off = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('WAV missing fmt or data chunk');
  const { format, nch, sr, bits } = fmt;
  const bps = bits / 8;
  const frames = Math.floor(data.size / (bps * nch));
  const chs = Array.from({ length: nch }, () => new Float32Array(frames));
  let o = data.start;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nch; c++) {
      let v;
      if (format === 3 && bits === 32) v = buf.readFloatLE(o);
      else if (format === 1 && bits === 16) v = buf.readInt16LE(o) / 32768;
      else if (format === 1 && bits === 24) v = buf.readIntLE(o, 3) / 8388608;
      else if (format === 1 && bits === 32) v = buf.readInt32LE(o) / 2147483648;
      else throw new Error(`unsupported WAV format ${format}/${bits}`);
      chs[c][i] = v;
      o += bps;
    }
  }
  return { sr, chs };
}

export function readWav(path) {
  return decodeWav(readFileSync(path));
}
