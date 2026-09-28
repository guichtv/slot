// Build figée servie en local (équivalent multiplateforme de LANCER-BOOMTOOTH.cmd) :
//   node tools/serve-stable.mjs [--rebuild] [--open] [--dir=dist-stable] [--port=5320]
// Construit dist-stable/ (production) s'il manque ou avec --rebuild, puis le sert avec vite preview
// sur 127.0.0.1:<port> --strictPort et affiche le lien http://127.0.0.1:<port>/?v=<version de package.json>.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { ROOT, parseArgs, pkgVersion } from './lib/cli.mjs';

const { opt } = parseArgs(process.argv.slice(2), { booleans: ['rebuild', 'open'] });
const dir = path.resolve(ROOT, typeof opt.dir === 'string' ? opt.dir : 'dist-stable');
const port = Number(opt.port ?? 5320);
const version = pkgVersion();
const url = `http://127.0.0.1:${port}/?v=${encodeURIComponent(version)}`;
const vite = path.join(ROOT, 'node_modules/vite/bin/vite.js');
if (!fs.existsSync(vite)) {
  console.error('node_modules absent : lancer « npm ci » d’abord.');
  process.exit(1);
}

if (opt.rebuild || !fs.existsSync(path.join(dir, 'index.html'))) {
  console.log(`construction de la build figée → ${path.relative(ROOT, dir) || dir}`);
  const b = spawnSync(process.execPath, [vite, 'build', '--mode', 'production', '--outDir', dir, '--emptyOutDir', '--logLevel', 'warn'], { cwd: ROOT, stdio: 'inherit' });
  if (b.status !== 0) {
    console.error('échec de la build');
    process.exit(1);
  }
}
const built = fs.statSync(path.join(dir, 'index.html')).mtime;
console.log(`build figée du ${built.toLocaleString('fr-FR')} (--rebuild pour la refaire)`);

const args = [vite, 'preview', '--outDir', dir, '--port', String(port), '--strictPort', '--host', '127.0.0.1'];
if (opt.open) args.push('--open', `/?v=${encodeURIComponent(version)}`);
const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ['inherit', 'pipe', 'pipe'] });
let announced = false;
const relay = (stream, out) =>
  stream.on('data', (d) => {
    const s = d.toString();
    out.write(s);
    if (!announced && s.includes(`:${port}`)) {
      announced = true;
      console.log(`\n  BOOMTOOTH v${version} → ${url}\n  (Ctrl+C pour arrêter)\n`);
    }
  });
relay(child.stdout, process.stdout);
relay(child.stderr, process.stderr);
child.on('exit', (code) => {
  if (code && !announced) console.error(`vite preview s'est arrêté (code ${code}) — port ${port} déjà occupé ?`);
  process.exit(code ?? 0);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
