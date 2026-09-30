// Type declarations for wav.mjs.
export function encodeWav(chs: Float32Array[], sr?: number): Buffer;
export function writeWav(path: string, chs: Float32Array[], sr?: number): void;
export function decodeWav(buf: Buffer): { sr: number; chs: Float32Array[] };
export function readWav(path: string): { sr: number; chs: Float32Array[] };
