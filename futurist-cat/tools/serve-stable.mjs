// Frozen build of the last stable version, served on its own port (5344, strict).
//   node tools/serve-stable.mjs [--rebuild] [--open] [--port 5344]
// Rebuilds dist-stable/ when the version or the code stamp changed. Static server, no deps.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || 5344) || 5344;
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
const DIST = resolve(ROOT, 'dist-stable');
const STAMP = join(DIST, '.stamp');

function codeStamp() {
  const h = createHash('sha256');
  const walk = (d) => { for (const n of readdirSync(d).sort()) { const p = join(d, n); const s = statSync(p); if (s.isDirectory()) walk(p); else h.update(`${p}:${s.size}:${s.mtimeMs}`); } };
  for (const d of ['src', 'public', 'index.html', 'vite.config.ts']) { const p = resolve(ROOT, d); if (existsSync(p)) (statSync(p).isDirectory() ? walk(p) : h.update(`${p}:${statSync(p).mtimeMs}`)); }
  return `${pkg.version}:${h.digest('hex').slice(0, 16)}`;
}
const stamp = codeStamp();
const current = existsSync(STAMP) ? readFileSync(STAMP, 'utf8') : '';
if (args.includes('--rebuild') || current !== stamp) {
  console.log(`[stable] build ${pkg.version} -> dist-stable/`);
  execSync(`npx vite build --mode qa --outDir dist-stable --emptyOutDir`, { cwd: ROOT, stdio: 'inherit' });
  writeFileSync(STAMP, stamp);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm', '.map': 'application/json' };
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let p = normalize(join(DIST, decodeURIComponent(url.pathname)));
  if (!p.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream', 'Cache-Control': extname(p) === '.html' ? 'no-cache' : 'max-age=3600' });
  res.end(readFileSync(p));
});
server.on('error', (e) => { console.error(`[stable] port ${port} indisponible (${e.code}) : ferme l'autre serveur ou utilise --port`); process.exit(1); });
server.listen(port, '127.0.0.1', () => {
  const link = `http://127.0.0.1:${port}/?v=${pkg.version}`;
  console.log(`[stable] ${link}  (recharge la page)`);
  if (args.includes('--open')) {
    const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', link]] : process.platform === 'darwin' ? ['open', [link]] : ['xdg-open', [link]];
    spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).unref();
  }
});
