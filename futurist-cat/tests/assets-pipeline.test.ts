import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

describe('npm run assets (tools/assets/process.mjs)', () => {
  it('keys a chroma background (reported), normalises alpha, squares symbols, stores the alpha box', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cc-assets-'));
    mkdirSync(join(root, 'assets/generated/sym-low'), { recursive: true });
    mkdirSync(join(root, 'assets/generated/decor-a'), { recursive: true });
    writeFileSync(join(root, 'assets/plan.json'), JSON.stringify({ version: 1, lots: {}, images: {
      'sym.L1': { lot: 'sym-low', size: [400, 400], alpha: true, required: true, out: 'symbols/L1.webp', subject: '' },
      'sym.L2': { lot: 'sym-low', size: [400, 400], alpha: true, required: true, out: 'symbols/L2.webp', subject: '' },
      'decor.sky': { lot: 'decor-a', size: [640, 360], alpha: false, required: true, out: 'decor/sky.webp', subject: '' },
    } }));
    // L1: real alpha with near-opaque 252 values, subject off-centre
    const a = Buffer.alloc(400 * 400 * 4);
    for (let y = 100; y < 220; y++) for (let x = 60; x < 300; x++) { const i = (y * 400 + x) * 4; a[i] = 60; a[i + 1] = 230; a[i + 2] = 255; a[i + 3] = 252; }
    await sharp(a, { raw: { width: 400, height: 400, channels: 4 } }).png().toFile(join(root, 'assets/generated/sym-low/sym.L1.png'));
    // L2: chroma green background, no alpha
    const b = Buffer.alloc(400 * 400 * 3);
    for (let i = 0; i < 400 * 400; i++) { b[i * 3] = 0; b[i * 3 + 1] = 255; b[i * 3 + 2] = 0; }
    for (let y = 150; y < 250; y++) for (let x = 150; x < 250; x++) { const i = (y * 400 + x) * 3; b[i] = 240; b[i + 1] = 240; b[i + 2] = 250; }
    await sharp(b, { raw: { width: 400, height: 400, channels: 3 } }).png().toFile(join(root, 'assets/generated/sym-low/sym.L2.png'));
    await sharp({ create: { width: 640, height: 360, channels: 3, background: '#101a44' } }).png().toFile(join(root, 'assets/generated/decor-a/decor.sky.png'));
    execFileSync(process.execPath, [resolve(__dirname, '../tools/assets/process.mjs')], { env: { ...process.env, CC_ROOT: root }, stdio: 'pipe' });
    const man = JSON.parse(readFileSync(join(root, 'public/assets/manifest.json'), 'utf8'));
    expect(man.images['sym.L1'].w).toBe(man.images['sym.L1'].h); // squared
    const [bx, by, bw, bh] = man.images['sym.L1'].bbox;
    expect(bw / man.images['sym.L1'].w).toBeGreaterThan(0.85); // trimmed to the subject (+4 % margin)
    expect(bx).toBeGreaterThanOrEqual(0); expect(by).toBeGreaterThan(0); expect(bh).toBeGreaterThan(0);
    const raw = await sharp(join(root, 'public/assets/symbols/L1.webp')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let max = 0; for (let i = 3; i < raw.data.length; i += 4) max = Math.max(max, raw.data[i]!);
    expect(max).toBe(255); // 252 normalised
    const report = JSON.parse(readFileSync(join(root, 'docs/preuves/assets/assets-report.json'), 'utf8'));
    expect(report.warnings.some((w: string) => w.startsWith('sym.L2: fond chroma'))).toBe(true);
    expect(existsSync(join(root, 'public/assets/decor/sky.webp'))).toBe(true);
    expect(readFileSync(join(root, 'docs/IMAGEGEN.md'), 'utf8')).toContain('sym.L2');
  }, 60000);
});
