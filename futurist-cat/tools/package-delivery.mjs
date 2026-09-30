// LIVRAISON-CYBERCAT-vX.Y.Z[-rN]/  (never overwrites a delivery)
//   FRONTEND/ + CYBERCAT-FRONTEND-vX.Y.Z.zip  (public build, index.html at the root, used files only)
//   MEDIA/ · CONTRAT-EVENTS.md · game-math-config.example.json · CONTROLES/ · GAME-DETAILS-EN.txt
//   LIRE-AVANT-IMPORT.md · SHA256SUMS.txt
// FRONTEND is produced ONLY if tools/check-release.mjs --pre passes; otherwise FRONTEND-ABSENT.txt
// lists what blocks it (never a fake or partial game).
//   node tools/package-delivery.mjs [--stake]
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateRawSync, crc32 } from 'node:zlib';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STAKE = process.argv.includes('--stake');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
let name = `LIVRAISON-CYBERCAT-v${pkg.version}`;
for (let r = 1; existsSync(resolve(ROOT, name)); r++) name = `LIVRAISON-CYBERCAT-v${pkg.version}-r${r}`;
const OUT = resolve(ROOT, name);
mkdirSync(OUT);
const node = (args, opts = {}) => execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts });

// ---------------- FRONTEND (gated)
let gate = '';
try { node(['tools/check-release.mjs', '--pre', ...(STAKE ? ['--stake'] : [])]); } catch (e) { gate = String(e.stderr || e.stdout || e.message); }
if (!gate) {
  execFileSync(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'production', '--outDir', 'dist-public', '--emptyOutDir'], { cwd: ROOT, stdio: 'inherit' });
  if (STAKE) rmSync(resolve(ROOT, 'dist-public/fixtures'), { recursive: true, force: true });
  rmSync(resolve(ROOT, 'dist-public/assets/cat/cat.meta.json'), { force: true });
  try { node(['tools/check-release.mjs', '--post', 'dist-public']); } catch (e) { gate = `check --post : ${e.stderr || e.stdout}`; }
}
if (!gate) {
  cpSync(resolve(ROOT, 'dist-public'), join(OUT, 'FRONTEND'), { recursive: true });
  writeZip(join(OUT, 'FRONTEND'), join(OUT, `CYBERCAT-FRONTEND-v${pkg.version}.zip`));
} else {
  writeFileSync(join(OUT, 'FRONTEND-ABSENT.txt'), `Le build public n'est PAS livre : la porte de release (tools/check-release.mjs) le bloque.\n\n${gate}\n\nRien n'a ete remplace par un element factice. Voir LIRE-AVANT-IMPORT.md.\n`);
}

// ---------------- the rest
if (existsSync(resolve(ROOT, 'media'))) cpSync(resolve(ROOT, 'media'), join(OUT, 'MEDIA'), { recursive: true }); else mkdirSync(join(OUT, 'MEDIA'));
cpSync(resolve(ROOT, 'CONTRAT-EVENTS.md'), join(OUT, 'CONTRAT-EVENTS.md'));
cpSync(resolve(ROOT, 'public/game-math-config.json'), join(OUT, 'game-math-config.example.json'));
const C = join(OUT, 'CONTROLES');
mkdirSync(C);
for (const f of ['docs/VERIFICATION.md']) if (existsSync(resolve(ROOT, f))) cpSync(resolve(ROOT, f), join(C, f.split('/').pop()));
if (existsSync(resolve(ROOT, 'docs/preuves'))) cpSync(resolve(ROOT, 'docs/preuves'), join(C, 'preuves'), { recursive: true });
if (existsSync(resolve(ROOT, 'captures/videos'))) cpSync(resolve(ROOT, 'captures/videos'), join(C, 'videos'), { recursive: true });
for (const f of ['GAME-DETAILS-EN.txt', 'LIRE-AVANT-IMPORT.md']) if (existsSync(resolve(ROOT, 'docs/delivery', f))) cpSync(resolve(ROOT, 'docs/delivery', f), join(OUT, f));

// ---------------- checksums
const sums = [];
const walk = (d) => { for (const n of readdirSync(d).sort()) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n !== 'SHA256SUMS.txt') sums.push(`${createHash('sha256').update(readFileSync(p)).digest('hex')}  ${relative(OUT, p).split('\\').join('/')}`); } };
walk(OUT);
writeFileSync(join(OUT, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
console.log(`[package] ${name} ${gate ? '(SANS FRONTEND : bloque par la porte de release)' : '(FRONTEND inclus)'}`);

// minimal zip writer (deflate), index.html at the root
function writeZip(dir, out) {
  const files = [];
  const w = (d) => { for (const n of readdirSync(d).sort()) { const p = join(d, n); if (statSync(p).isDirectory()) w(p); else files.push(p); } };
  w(dir);
  const chunks = [], central = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(relative(dir, f).split('\\').join('/'));
    const data = readFileSync(f);
    const comp = deflateRawSync(data, { level: 9 });
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, comp);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(0, 12); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cenSize = central.reduce((a, b) => a + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cenSize, 12); end.writeUInt32LE(offset, 16);
  writeFileSync(out, Buffer.concat([...chunks, ...central, end]));
}
