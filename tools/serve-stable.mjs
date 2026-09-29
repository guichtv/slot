// Lance BOOMTOOTH en local (build de production figée) — c'est le cœur de LANCER-BOOMTOOTH.cmd et de `npm run serve-stable` :
//   node tools/serve-stable.mjs [--open] [--rebuild] [--dir=dist-stable] [--port=5320]
// 1. Empreinte du code : version + contenu de src/, public/, index.html et des fichiers de config.
// 2. Port déjà pris :
//    - même BOOMTOOTH, même dossier, même empreinte → le navigateur s'ouvre sur le serveur en place, rien d'autre ;
//    - ancien serveur BOOMTOOTH (vite preview de dist-stable, autre empreinte ou autre copie du jeu) → arrêté ;
//    - autre programme → jamais arrêté : port libre suivant (5321-5329).
// 3. Dépendances : npm ci si node_modules manque ou si package-lock.json a changé.
// 4. Build figée reconstruite si l'empreinte a changé (après un git pull) ou avec --rebuild.
// 5. vite preview --strictPort, lien http://127.0.0.1:<port>/?v=<empreinte> (le navigateur ne garde pas l'ancienne page).
// Aucune dépendance npm : ce script tourne avant même l'installation de node_modules.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { ROOT, parseArgs, pkgVersion, rel, walk } from './lib/cli.mjs';

const { opt } = parseArgs(process.argv.slice(2), { booleans: ['rebuild', 'open'] });
const dir = path.resolve(ROOT, typeof opt.dir === 'string' ? opt.dir : 'dist-stable');
const firstPort = Number(opt.port ?? 5320);
const version = pkgVersion();
const WIN = process.platform === 'win32';
const MARK = 'boomtooth-build.json';
const log = (s) => console.log(`[BOOMTOOTH] ${s}`);
const fail = (s) => {
  console.error(`[BOOMTOOTH] ${s}`);
  process.exit(1);
};

if (Number(process.versions.node.split('.')[0]) < 18) fail(`Node ${process.versions.node} trop ancien : installer Node.js 20 ou plus récent (https://nodejs.org).`);

// ------------------------------------------------------------------ empreinte du code

const SOURCES = ['src', 'public', 'index.html', 'vite.config.ts', 'tsconfig.json', 'package.json', 'package-lock.json'];
function codeStamp() {
  const h = crypto.createHash('sha256');
  for (const s of SOURCES) {
    const p = path.join(ROOT, s);
    if (!fs.existsSync(p)) continue;
    for (const f of fs.statSync(p).isDirectory() ? walk(p) : [p]) {
      h.update(rel(ROOT, f));
      h.update('\0');
      h.update(fs.readFileSync(f));
    }
  }
  return `${version}-${h.digest('hex').slice(0, 10)}`;
}
const stamp = codeStamp();
const sameRoot = (a) => typeof a === 'string' && path.resolve(a).toLowerCase() === ROOT.toLowerCase();

// ------------------------------------------------------------------ port : libre, BOOMTOOTH ou autre programme

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
  });
}

async function get(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(2500), redirect: 'manual' });
  return { status: r.status, text: await r.text() };
}

/** 'free' | { boomtooth: true, info } | { boomtooth: false } */
async function whoIsOn(port) {
  if (await portFree(port)) return 'free';
  try {
    const m = await get(`http://127.0.0.1:${port}/${MARK}`);
    const info = JSON.parse(m.text);
    if (info && info.game === 'boomtooth') return { boomtooth: true, info };
  } catch {
    // pas de fichier d'empreinte (build d'avant ce lanceur) : on regarde la page
  }
  try {
    const home = await get(`http://127.0.0.1:${port}/`);
    if (home.text.includes('<title>BOOMTOOTH</title>')) return { boomtooth: true, info: null };
  } catch {
    // ne répond pas en HTTP
  }
  return { boomtooth: false };
}

/** processus qui écoutent sur le port (PID) */
function listeners(port) {
  const pids = new Set();
  if (WIN) {
    const ps = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`], { encoding: 'utf8' });
    for (const l of String(ps.stdout ?? '').split(/\r?\n/)) if (/^\d+$/.test(l.trim())) pids.add(Number(l.trim()));
    if (!pids.size) {
      // repli (netstat, langue du système quelconque) : adresse locale :port et adresse distante « :0 » = en écoute
      const ns = spawnSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' });
      for (const l of String(ns.stdout ?? '').split(/\r?\n/)) {
        const m = /^\s*TCP\s+\S+:(\d+)\s+\S+:0\s+\S+\s+(\d+)\s*$/.exec(l);
        if (m && Number(m[1]) === port) pids.add(Number(m[2]));
      }
    }
  } else {
    const r = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' });
    for (const l of String(r.stdout ?? '').split(/\n/)) if (/^\d+$/.test(l.trim())) pids.add(Number(l.trim()));
  }
  pids.delete(0);
  return [...pids];
}

/** ligne de commande d'un processus ('' si inconnue) */
function cmdline(pid) {
  if (WIN) {
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`], { encoding: 'utf8' });
    return String(r.stdout ?? '').trim();
  }
  const r = spawnSync('ps', ['-o', 'args=', '-p', String(pid)], { encoding: 'utf8' });
  return String(r.stdout ?? '').trim();
}

const isStableServer = (cmd) => /vite/i.test(cmd) && /\bpreview\b/i.test(cmd) && /dist-stable/i.test(cmd);

async function waitFree(port, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await portFree(port)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/** arrête un ancien serveur BOOMTOOTH sur le port ; jamais un autre programme */
async function stopOldServer(port) {
  const pids = listeners(port);
  let stopped = 0;
  for (const pid of pids) {
    const cmd = cmdline(pid);
    // ligne de commande lisible : il faut qu'elle soit celle d'un vite preview de dist-stable
    // (illisible : l'identification HTTP comme BOOMTOOTH suffit, c'est notre page qui répond sur ce port)
    if (cmd && !isStableServer(cmd)) continue;
    log(`arrêt de l'ancien serveur BOOMTOOTH (processus ${pid})`);
    if (WIN) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // déjà arrêté
      }
    }
    stopped++;
  }
  if (!stopped) return false;
  if (await waitFree(port, 6000)) return true;
  if (!WIN) for (const pid of pids) try { process.kill(pid, 'SIGKILL'); } catch { /* déjà arrêté */ }
  return waitFree(port, 3000);
}

function openBrowser(url) {
  if (WIN) spawn('cmd', ['/c', 'start', '""', url], { stdio: 'ignore', detached: true, windowsVerbatimArguments: true }).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

// ------------------------------------------------------------------ déroulé

let port = firstPort;
const on = await whoIsOn(port);
if (on !== 'free') {
  if (on.boomtooth && on.info && on.info.stamp === stamp && sameRoot(on.info.root) && !opt.rebuild) {
    const url = `http://127.0.0.1:${port}/?v=${encodeURIComponent(stamp)}`;
    log(`BOOMTOOTH v${version} tourne déjà et il est à jour : ${url}`);
    if (opt.open) openBrowser(url);
    process.exit(0);
  }
  if (on.boomtooth) {
    const why = on.info ? (sameRoot(on.info.root) ? 'build plus ancienne' : `autre copie du jeu : ${on.info.root}`) : 'build plus ancienne';
    log(`un ancien serveur BOOMTOOTH occupe le port ${port} (${why})`);
    if (!(await stopOldServer(port))) {
      log(`impossible de l'arrêter : fermer la fenêtre « BOOMTOOTH » ouverte avant, puis relancer`);
      port = 0;
    }
  } else {
    log(`le port ${port} est pris par un autre programme (laissé tel quel)`);
    port = 0;
  }
  if (!port) {
    for (let p = firstPort + 1; p <= firstPort + 9 && !port; p++) if (await portFree(p)) port = p;
    if (!port) fail(`aucun port libre entre ${firstPort} et ${firstPort + 9}.`);
    log(`BOOMTOOTH utilisera le port ${port}`);
  }
}

// dépendances : installées si absentes, réinstallées si package-lock.json a changé (git pull)
const lockFile = path.join(ROOT, 'package-lock.json');
const lockMark = path.join(ROOT, 'node_modules', '.boomtooth-lock');
const lockHash = fs.existsSync(lockFile) ? crypto.createHash('sha256').update(fs.readFileSync(lockFile)).digest('hex') : '';
const vite = path.join(ROOT, 'node_modules/vite/bin/vite.js');
const installed = fs.existsSync(vite);
const lockSeen = fs.existsSync(lockMark) ? fs.readFileSync(lockMark, 'utf8').trim() : null;
if (!installed || (lockSeen !== null && lockSeen !== lockHash)) {
  log(installed ? 'package-lock.json a changé : réinstallation des dépendances (npm ci)…' : 'installation des dépendances (npm ci)…');
  const r = spawnSync('npm', ['ci'], { cwd: ROOT, stdio: 'inherit', shell: true });
  if (r.status !== 0 || !fs.existsSync(vite)) fail('échec de « npm ci » (connexion internet ?).');
}
fs.writeFileSync(lockMark, lockHash);

// build figée : reconstruite si le code a changé
let built = null;
try {
  built = JSON.parse(fs.readFileSync(path.join(dir, MARK), 'utf8'));
} catch {
  // absente ou d'avant ce lanceur
}
const fresh = built && built.stamp === stamp && fs.existsSync(path.join(dir, 'index.html'));
if (opt.rebuild || !fresh) {
  log(built ? `le code a changé depuis la build figée (${built.stamp} → ${stamp}) : reconstruction…` : `construction de la build figée ${rel(ROOT, dir)} (${stamp})…`);
  const b = spawnSync(process.execPath, [vite, 'build', '--mode', 'production', '--outDir', dir, '--emptyOutDir', '--logLevel', 'warn'], { cwd: ROOT, stdio: 'inherit' });
  if (b.status !== 0) fail('échec de la construction.');
  fs.writeFileSync(path.join(dir, MARK), JSON.stringify({ game: 'boomtooth', version, stamp, root: ROOT, builtAt: new Date().toISOString() }, null, 1));
} else log(`build figée à jour (${stamp})`);

// serveur
const url = `http://127.0.0.1:${port}/?v=${encodeURIComponent(stamp)}`;
const args = [vite, 'preview', '--outDir', dir, '--port', String(port), '--strictPort', '--host', '127.0.0.1'];
if (opt.open) args.push('--open', `/?v=${encodeURIComponent(stamp)}`);
const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ['inherit', 'pipe', 'pipe'] });
let announced = false;
const relay = (stream, out) =>
  stream.on('data', (d) => {
    const s = d.toString();
    out.write(s);
    if (!announced && s.includes(`:${port}`)) {
      announced = true;
      console.log(`\n  BOOMTOOTH v${version} → ${url}\n  (Ctrl+C ou fermer la fenêtre pour arrêter)\n`);
    }
  });
relay(child.stdout, process.stdout);
relay(child.stderr, process.stderr);
child.on('exit', (code) => {
  if (code && !announced) console.error(`[BOOMTOOTH] le serveur n'a pas démarré (code ${code}) : le port ${port} vient d'être pris ? Relancer.`);
  process.exit(code ?? 0);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
