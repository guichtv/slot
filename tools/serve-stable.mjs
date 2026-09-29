// Lance BOOMTOOTH en local (build de production figée) — c'est le cœur de LANCER-BOOMTOOTH.cmd et de `npm run serve-stable` :
//   node tools/serve-stable.mjs [--open] [--rebuild] [--dir=dist-stable] [--port=5320]
// 1. Un seul lancement à la fois (verrou .cache/serve-stable.lock) : un double-clic attend le premier puis ouvre le jeu.
// 2. Empreinte du code : version + contenu de src/, public/, index.html et des fichiers de config.
// 3. Ports 5320-5329 : même BOOMTOOTH à jour (même dossier, même empreinte) → le navigateur s'ouvre dessus, rien d'autre ;
//    ancien serveur BOOMTOOTH (vite preview de dist-stable, identifié par sa ligne de commande) → arrêté, avec sa
//    fenêtre de lancement ; tout autre programme → jamais touché.
// 4. Dépendances : npm ci si node_modules est absent, incomplet ou si package-lock.json a changé (repère dans .cache/).
// 5. Build figée reconstruite si l'empreinte a changé (après un git pull) ou avec --rebuild ; l'ancien serveur n'est
//    arrêté qu'une fois la nouvelle build réussie (un échec laisse l'ancien jeu en place).
// 6. vite preview --strictPort, lien http://127.0.0.1:<port>/?v=<empreinte> (le navigateur ne garde pas l'ancienne page).
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
const CACHE = path.join(ROOT, '.cache');
const log = (s) => console.log(`[BOOMTOOTH] ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let unlock = () => {};
function fail(s) {
  console.error(`[BOOMTOOTH] ${s}`);
  unlock();
  process.exit(1);
}
if (WIN) process.title = 'BOOMTOOTH';

// Vite 7 : Node ^20.19 ou >= 22.12
const [maj, min] = process.versions.node.split('.').map(Number);
if (!(maj > 22 || (maj === 22 && min >= 12) || (maj === 20 && min >= 19))) fail(`Node ${process.versions.node} trop ancien : installer Node.js 22 LTS ou plus récent (https://nodejs.org).`);
fs.mkdirSync(CACHE, { recursive: true });

// ------------------------------------------------------------------ un seul lancement à la fois

const LOCK = path.join(CACHE, 'serve-stable.lock');
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}
function tryLock(retry = true) {
  let fd;
  try {
    fd = fs.openSync(LOCK, 'wx');
  } catch {
    let pid = 0;
    try {
      pid = Number(fs.readFileSync(LOCK, 'utf8').trim());
    } catch {
      // retiré entre-temps
    }
    if (retry && (!pid || !alive(pid))) {
      // verrou d'un lancement mort (fenêtre fermée en cours de route)
      try {
        fs.unlinkSync(LOCK);
      } catch {
        // un autre lancement vient de le reprendre
      }
      return tryLock(false);
    }
    return false;
  }
  fs.writeSync(fd, String(process.pid));
  fs.closeSync(fd);
  let held = true;
  unlock = () => {
    if (!held) return;
    held = false;
    try {
      if (fs.readFileSync(LOCK, 'utf8').trim() === String(process.pid)) fs.unlinkSync(LOCK);
    } catch {
      // déjà retiré
    }
  };
  process.on('exit', () => unlock());
  return true;
}

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
const sameRoot = (a) => typeof a === 'string' && path.resolve(a).toLowerCase() === ROOT.toLowerCase();

// ------------------------------------------------------------------ ports

/** 'free' | 'busy' | 'reserved' (plage réservée par Windows : Hyper-V, WSL…) */
function portState(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', (e) => resolve(e.code === 'EACCES' ? 'reserved' : 'busy'));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve('free')));
  });
}

async function get(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(2500), redirect: 'manual' });
  return r.text();
}

/** 'free' | 'reserved' | 'foreign' | { info } (BOOMTOOTH ; info null = build d'avant ce lanceur) */
async function whoIsOn(port) {
  const st = await portState(port);
  if (st !== 'busy') return st;
  try {
    const info = JSON.parse(await get(`http://127.0.0.1:${port}/${MARK}`));
    if (info && info.game === 'boomtooth') return { info };
  } catch {
    // pas de fichier d'empreinte : on regarde la page
  }
  try {
    if ((await get(`http://127.0.0.1:${port}/`)).includes('<title>BOOMTOOTH</title>')) return { info: null };
  } catch {
    // ne répond pas en HTTP
  }
  return 'foreign';
}

// ------------------------------------------------------------------ processus (arrêt vérifié uniquement)

const PS_OPTS = { encoding: 'utf8', timeout: 15000, windowsHide: true };
function ps(script) {
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], PS_OPTS);
  return r.error ? null : String(r.stdout ?? '');
}

/** processus en écoute sur 127.0.0.1:port : { pid, ppid, cmd } (cmd '' si illisible) */
function listeners(port) {
  const out = [];
  if (WIN) {
    const txt = ps(
      `Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { $p = Get-CimInstance Win32_Process -Filter "ProcessId=$_"; "$_\`t$($p.ParentProcessId)\`t$($p.CommandLine)" }`,
    );
    for (const l of String(txt ?? '').split(/\r?\n/)) {
      const m = /^(\d+)\t(\d*)\t(.*)$/.exec(l);
      if (m) out.push({ pid: Number(m[1]), ppid: Number(m[2] || 0), cmd: m[3].trim() });
    }
  } else {
    const r = spawnSync('lsof', ['-nP', `-iTCP@127.0.0.1:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' });
    for (const l of String(r.stdout ?? '').split(/\n/)) {
      const pid = Number(l.trim());
      if (!pid) continue;
      const c = spawnSync('ps', ['-o', 'ppid=,args=', '-p', String(pid)], { encoding: 'utf8' });
      const m = /^\s*(\d+)\s+(.*)$/.exec(String(c.stdout ?? '').trim());
      out.push({ pid, ppid: m ? Number(m[1]) : 0, cmd: m ? m[2] : '' });
    }
  }
  return out.filter((p) => p.pid > 0 && p.pid !== process.pid);
}

const isStableServer = (cmd) => /vite/i.test(cmd) && /\bpreview\b/i.test(cmd) && /dist-stable/i.test(cmd);

/** Windows : fenêtre cmd d'un ancien LANCER-BOOMTOOTH.cmd au-dessus du serveur (jamais la nôtre) */
function launcherWindow(pid) {
  if (!WIN) return 0;
  const txt = ps(
    `$ours = @(); $q = ${process.pid}; for ($i = 0; $i -lt 12 -and $q; $i++) { $ours += $q; $q = (Get-CimInstance Win32_Process -Filter "ProcessId=$q").ParentProcessId }
     $q = ${pid}; for ($i = 0; $i -lt 12 -and $q; $i++) { $p = Get-CimInstance Win32_Process -Filter "ProcessId=$q"; if (-not $p) { break }
       if ($p.Name -eq 'cmd.exe' -and $p.CommandLine -match 'LANCER-BOOMTOOTH' -and -not ($ours -contains $q)) { "$q"; break }
       $q = $p.ParentProcessId }`,
  );
  const m = /^(\d+)\s*$/m.exec(String(txt ?? ''));
  return m ? Number(m[1]) : 0;
}

async function waitFree(port, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if ((await portState(port)) === 'free') return true;
    await sleep(250);
  }
  return false;
}

/** arrête l'ancien serveur BOOMTOOTH sur le port (ligne de commande vérifiée) ; jamais un autre programme */
async function stopOldServer(port) {
  const all = listeners(port);
  const targets = all.filter((p) => p.cmd && isStableServer(p.cmd));
  if (!targets.length) {
    if (await waitFree(port, 500)) return true;
    const unknown = all.find((p) => !p.cmd);
    if (unknown) log(`processus ${unknown.pid} sur le port ${port} : ligne de commande illisible, laissé tel quel (fermer l'ancienne fenêtre du serveur à la main)`);
    return false;
  }
  for (const t of targets) {
    const win = launcherWindow(t.pid);
    log(`arrêt de l'ancien serveur BOOMTOOTH (processus ${t.pid}${win ? `, fenêtre ${win}` : ''})`);
    if (WIN) {
      // la fenêtre de l'ancien lanceur (et tout ce qu'elle a lancé), sinon le serveur seul
      if (win) spawnSync('taskkill', ['/PID', String(win), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      spawnSync('taskkill', ['/PID', String(t.pid), '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      try {
        process.kill(t.pid, 'SIGTERM');
      } catch {
        // déjà arrêté
      }
    }
  }
  if (await waitFree(port, 6000)) return true;
  if (!WIN) {
    for (const t of targets) {
      const again = listeners(port).find((p) => p.pid === t.pid);
      if (again && isStableServer(again.cmd)) {
        try {
          process.kill(t.pid, 'SIGKILL');
        } catch {
          // déjà arrêté
        }
      }
    }
  }
  return waitFree(port, 3000);
}

function openBrowser(url) {
  if (WIN) spawn('cmd', ['/c', 'start', '""', url], { stdio: 'ignore', detached: true, windowsVerbatimArguments: true, windowsHide: true }).on('error', () => {}).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

async function reuse(port, stamp) {
  const url = `http://127.0.0.1:${port}/?v=${encodeURIComponent(stamp)}`;
  log(`BOOMTOOTH v${version} tourne déjà et il est à jour : ${url}`);
  if (opt.open) {
    openBrowser(url);
    log('le navigateur s\'ouvre sur le jeu (sinon, copier le lien ci-dessus)');
    await sleep(4000);
  }
  unlock();
  process.exit(0);
}

// ------------------------------------------------------------------ déroulé

if (!tryLock()) {
  log('un autre lancement de BOOMTOOTH est en cours : attente…');
  const stamp = codeStamp();
  const end = Date.now() + 240000;
  while (Date.now() < end) {
    await sleep(1500);
    for (let p = firstPort; p <= firstPort + 9; p++) {
      const on = await whoIsOn(p);
      if (typeof on === 'object' && on.info && on.info.stamp === stamp && sameRoot(on.info.root)) await reuse(p, stamp);
    }
    if (tryLock()) break;
  }
  let mine = false;
  try {
    mine = fs.readFileSync(LOCK, 'utf8').trim() === String(process.pid);
  } catch {
    // pas de verrou
  }
  if (!mine) fail('l\'autre lancement ne répond pas : fermer ses fenêtres puis relancer.');
}

const stamp = codeStamp();

// ports : serveur à jour → réutilisé ; anciens serveurs BOOMTOOTH repérés ; premier port utilisable
let target = 0;
const stale = [];
let reserved = false;
for (let p = firstPort; p <= firstPort + 9; p++) {
  const on = await whoIsOn(p);
  if (typeof on === 'object') {
    if (on.info && on.info.stamp === stamp && sameRoot(on.info.root) && !opt.rebuild) await reuse(p, stamp);
    stale.push({ port: p, info: on.info });
    if (!target && p === firstPort) target = p;
  } else if (on === 'free') {
    if (!target) target = p;
  } else if (on === 'reserved') reserved = true;
  else if (p === firstPort) log(`le port ${p} est pris par un autre programme (laissé tel quel)`);
}
if (!target && reserved) {
  // plage réservée par Windows : on laisse le système proposer un port
  target = await new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
  log(`ports ${firstPort}-${firstPort + 9} réservés par Windows (Hyper-V / WSL) : port ${target}`);
}
if (!target) {
  // tous pris par d'anciens serveurs BOOMTOOTH : on reprendra le premier
  if (stale.length) target = stale[0].port;
  else fail(`aucun port libre entre ${firstPort} et ${firstPort + 9}.`);
}
for (const s of stale) {
  const why = opt.rebuild && s.info && s.info.stamp === stamp ? 'reconstruction demandée' : s.info ? (sameRoot(s.info.root) ? 'build plus ancienne' : `autre copie du jeu : ${s.info.root}`) : 'build d\'avant ce lanceur';
  log(`ancien serveur BOOMTOOTH sur le port ${s.port} (${why})`);
}
if (target !== firstPort && !stale.some((s) => s.port === target)) log(`BOOMTOOTH utilisera le port ${target}`);
const stopStale = async () => {
  for (const s of stale) {
    const ok = await stopOldServer(s.port);
    if (!ok && s.port === target) {
      log(`impossible d'arrêter le serveur du port ${s.port} : fermer son ancienne fenêtre (titre « BOOMTOOTH » ou « cmd.exe »)`);
      target = 0;
    }
  }
  if (!target) {
    for (let p = firstPort; p <= firstPort + 9 && !target; p++) if ((await portState(p)) === 'free') target = p;
    if (!target) fail(`aucun port libre entre ${firstPort} et ${firstPort + 9}.`);
  }
};

// dépendances
const lockFile = path.join(ROOT, 'package-lock.json');
const depMark = path.join(CACHE, 'boomtooth-deps');
const lockHash = fs.existsSync(lockFile) ? crypto.createHash('sha256').update(fs.readFileSync(lockFile)).digest('hex') : 'none';
const vite = path.join(ROOT, 'node_modules/vite/bin/vite.js');
const complete = () => fs.existsSync(vite) && fs.existsSync(path.join(ROOT, 'node_modules', '.package-lock.json'));
const seen = fs.existsSync(depMark) ? fs.readFileSync(depMark, 'utf8').trim() : null;
if (!complete() || seen === 'installing' || (seen !== null && seen !== lockHash)) {
  // npm ci remplace node_modules : les anciens serveurs de CE dossier doivent s'arrêter avant
  const own = stale.filter((s) => !s.info || sameRoot(s.info.root));
  if (own.length) {
    for (const s of own) await stopOldServer(s.port);
    stale.splice(0, stale.length, ...stale.filter((s) => !own.includes(s)));
    if (!target) target = firstPort;
  }
  log(complete() ? 'les dépendances ont changé : réinstallation (npm ci)…' : 'installation des dépendances (npm ci, une à deux minutes)…');
  fs.writeFileSync(depMark, 'installing');
  const r = spawnSync('npm ci', { cwd: ROOT, stdio: 'inherit', shell: true });
  if (WIN) process.title = 'BOOMTOOTH';
  if (r.status !== 0 || !complete()) fail('échec de « npm ci » (connexion internet ? antivirus ?). Relancer.');
}
fs.writeFileSync(depMark, lockHash);

// build figée : reconstruite si le code a changé ; l'ancien serveur tourne encore pendant ce temps
let built = null;
try {
  built = JSON.parse(fs.readFileSync(path.join(dir, MARK), 'utf8'));
} catch {
  // absente ou d'avant ce lanceur
}
const fresh = built && built.stamp === stamp && fs.existsSync(path.join(dir, 'index.html'));
if (opt.rebuild || !fresh) {
  log(opt.rebuild ? 'reconstruction demandée…' : built ? `le code a changé depuis la build figée (${built.stamp} → ${stamp}) : reconstruction…` : `construction de la build figée ${rel(ROOT, dir)} (${stamp})…`);
  const b = spawnSync(process.execPath, [vite, 'build', '--mode', 'production', '--outDir', dir, '--emptyOutDir', '--logLevel', 'warn'], { cwd: ROOT, stdio: 'inherit' });
  if (b.status !== 0) fail('échec de la construction (l\'ancien serveur, s\'il tournait, est resté en place).');
  built = { game: 'boomtooth', version, stamp, root: ROOT, builtAt: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, MARK), JSON.stringify(built, null, 1));
} else {
  if (!sameRoot(built.root)) fs.writeFileSync(path.join(dir, MARK), JSON.stringify({ ...built, root: ROOT }, null, 1));
  log(`build figée à jour (${stamp})`);
}

await stopStale();

// serveur
const url = `http://127.0.0.1:${target}/?v=${encodeURIComponent(stamp)}`;
const args = [vite, 'preview', '--outDir', dir, '--port', String(target), '--strictPort', '--host', '127.0.0.1'];
if (opt.open) args.push('--open', `/?v=${encodeURIComponent(stamp)}`);
const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ['inherit', 'pipe', 'pipe'] });
let announced = false;
const relay = (stream, out) =>
  stream.on('data', (d) => {
    const s = d.toString();
    out.write(s);
    if (!announced && s.includes(`:${target}`)) {
      announced = true;
      unlock();
      console.log(`\n  BOOMTOOTH v${version} → ${url}\n  (Ctrl+C ou fermer la fenêtre pour arrêter)\n`);
    }
  });
relay(child.stdout, process.stdout);
relay(child.stderr, process.stderr);
child.on('exit', (code) => {
  if (!announced) fail(`le serveur n'a pas démarré (code ${code}) : le port ${target} vient d'être pris ? Relancer.`);
  // arrêt normal (fenêtre fermée, Ctrl+C) ou remplacé par un nouveau lancement
  log('serveur arrêté.');
  process.exit(0);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
