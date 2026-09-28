// Dossier de livraison : node tools/package-delivery.mjs [--version=x.y.z] [--allow-fail]
// 1. npm run build (production → dist/)   2. check-release --dir dist --json   3. npx vitest run
// 4. crée LIVRAISON-BOOMTOOTH-v<version>/ : FRONTEND/, BOOMTOOTH-frontend-v<version>.zip, MEDIA/, CONTROLES/,
//    GAME-DETAILS-EN.txt, LIRE-AVANT-IMPORT.md, SHA256SUMS.
// RÈGLE ABSOLUE : une livraison existante n'est jamais écrasée (changer de version).
// Contrôles en échec : rien n'est créé, sauf avec --allow-fail (la livraison est alors marquée ÉCHEC, code 1).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { ROOT, parseArgs, walk, rel, human, readJson, pkgVersion } from './lib/cli.mjs';

const { opt } = parseArgs(process.argv.slice(2), { booleans: ['allow-fail'] });
const version = typeof opt.version === 'string' ? opt.version : pkgVersion();
if (!/^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(version)) {
  console.error(`version invalide : « ${version} »`);
  process.exit(1);
}
const NAME = `LIVRAISON-BOOMTOOTH-v${version}`;
const dest = path.join(ROOT, NAME);
const refuse = () => {
  console.error(`ARRÊT : ${NAME}/ existe déjà. Une livraison n'est jamais écrasée : choisir une autre version (--version=…).`);
  process.exit(3);
};
if (fs.existsSync(dest)) refuse();

const WIN = process.platform === 'win32';
const strip = (s) => String(s ?? '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
function run(cmd, args, { shell = false, env = {} } = {}) {
  const t = Date.now();
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', shell, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...env }, maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? 1, out: strip(`${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? `\n${r.error.message}` : ''}`), s: Math.round((Date.now() - t) / 1000) };
}
const tail = (s, n = 15) => s.trim().split('\n').slice(-n).join('\n');
console.log(`package-delivery v${version} → ${NAME}/`);

// ---------- 1. build de production ----------
const build = run('npm', ['run', 'build'], { shell: WIN });
if (build.code !== 0) {
  console.error(`✗ build de production (code ${build.code})\n${tail(build.out)}`);
  process.exit(1);
}
const dist = path.join(ROOT, 'dist');
console.log(`✓ build de production (${build.s} s)`);

// ---------- 2. check-release ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'boomtooth-pkg-'));
const crJson = path.join(tmp, 'check-release.json');
const cr = run(process.execPath, [path.join(ROOT, 'tools/check-release.mjs'), '--dir', dist, '--json', crJson]);
const crReport = fs.existsSync(crJson) ? readJson(crJson) : null;
const crLine = crReport ? `${crReport.result.toUpperCase()} (${crReport.counts.failures} échec(s), ${crReport.counts.warnings} avertissement(s))` : `code ${cr.code}`;
console.log(`${cr.code === 0 ? '✓' : '✗'} check-release : ${crLine}`);

// ---------- 3. tests unitaires ----------
const vt = run('npx', ['vitest', 'run'], { shell: WIN });
const vtLine = (vt.out.match(/^\s*Tests\s+(.+)$/m)?.[1] ?? `code ${vt.code}`).trim();
console.log(`${vt.code === 0 ? '✓' : '✗'} vitest : ${vtLine}`);

const controlsOk = cr.code === 0 && vt.code === 0;
if (!controlsOk && !opt['allow-fail']) {
  console.error('Livraison NON créée : contrôles en échec (corriger, ou relancer avec --allow-fail pour livrer quand même, marqué ÉCHEC).');
  const bad = (crReport?.sections ?? []).flatMap((s) => s.items.filter((i) => i.level === 'échec' || i.level === 'bloquant').map((i) => `  ✗ (${s.id}) ${i.msg}`));
  if (bad.length) console.error(bad.slice(0, 12).join('\n'));
  else if (cr.code !== 0) console.error(tail(cr.out, 12));
  if (vt.code !== 0) console.error(tail(vt.out, 12));
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

// ---------- 4. dossier de livraison ----------
try {
  fs.mkdirSync(dest); // non récursif : échoue si le dossier est apparu entre-temps
} catch {
  refuse();
}
const CTRL = path.join(dest, 'CONTROLES');
const MEDIA = path.join(dest, 'MEDIA');
fs.mkdirSync(CTRL);
fs.mkdirSync(MEDIA);

// FRONTEND/
fs.cpSync(dist, path.join(dest, 'FRONTEND'), { recursive: true });
const distFiles = walk(dist).map((p) => rel(dist, p));

// zip : contenu de dist/ à la racine
const zipName = `BOOMTOOTH-frontend-v${version}.zip`;
const zipPath = path.join(dest, zipName);
const zipTool = await makeZip(dist, zipPath, distFiles);
const inZip = zipEntries(fs.readFileSync(zipPath)).filter((n) => !n.endsWith('/'));
const zipOk = inZip.length === distFiles.length && inZip.includes('index.html') && distFiles.every((f) => inZip.includes(f));
console.log(`${zipOk ? '✓' : '✗'} ${zipName} (${zipTool}, ${inZip.length}/${distFiles.length} fichiers, ${human(fs.statSync(zipPath).size)})`);

// MEDIA/ : WebP → PNG
const MEDIA_SRC = [
  ['', 'public/assets/identity/id.cover.webp'],
  ['', 'public/assets/identity/id.tile.webp'],
  ['', 'public/assets/identity/id.logo.webp'],
  ['BG', 'public/assets/decor/decor.skyRich.webp'],
  ['BG', 'public/assets/decor/decor.mid.webp'],
  ...fs.readdirSync(path.join(ROOT, 'public/assets/decor')).filter((f) => /^decor\.fg\..+\.webp$/.test(f)).sort().map((f) => ['FG', `public/assets/decor/${f}`]),
];
const media = [];
for (const [sub, src] of MEDIA_SRC) {
  const abs = path.join(ROOT, src);
  if (!fs.existsSync(abs)) {
    media.push({ src, missing: true });
    continue;
  }
  const outDir = path.join(MEDIA, sub);
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, path.basename(src).replace(/\.webp$/, '.png'));
  const info = await sharp(abs).png({ compressionLevel: 9 }).toFile(out);
  media.push({ src, out: rel(dest, out), w: info.width, h: info.height });
}
// vidéos de démonstration enregistrées par tools/record.mjs (captures/video/*.mp4), si présentes
const VID_SRC = path.join(ROOT, 'captures/video');
const videos = fs.existsSync(VID_SRC) ? fs.readdirSync(VID_SRC).filter((f) => f.endsWith('.mp4')).sort() : [];
if (videos.length) {
  fs.mkdirSync(path.join(MEDIA, 'VIDEOS'), { recursive: true });
  for (const f of videos) fs.copyFileSync(path.join(VID_SRC, f), path.join(MEDIA, 'VIDEOS', f));
}
console.log(`${videos.length ? '✓' : '·'} MEDIA/VIDEOS : ${videos.length} vidéo(s)`);
const missingMedia = media.filter((m) => m.missing);
console.log(`${missingMedia.length ? '!' : '✓'} MEDIA : ${media.length - missingMedia.length} PNG${missingMedia.length ? ` (manquants : ${missingMedia.map((m) => m.src).join(', ')})` : ''}`);

// CONTROLES/
fs.writeFileSync(path.join(CTRL, 'build.txt'), build.out);
fs.writeFileSync(path.join(CTRL, 'check-release.txt'), cr.out);
if (fs.existsSync(crJson)) fs.copyFileSync(crJson, path.join(CTRL, 'check-release.json'));
fs.writeFileSync(path.join(CTRL, 'vitest.txt'), vt.out);
const hudSrc = path.join(ROOT, 'captures/hud/report.json');
const hud = fs.existsSync(hudSrc) ? readJson(hudSrc) : null;
if (hud) fs.copyFileSync(hudSrc, path.join(CTRL, 'hud-report.json'));
fs.rmSync(tmp, { recursive: true, force: true });

// fiche du jeu et notice
const cfg = readJson(path.join(ROOT, 'public/game-math-config.json'));
const git = {
  sha: run('git', ['rev-parse', '--short', 'HEAD']).out.trim() || '?',
  dirty: run('git', ['status', '--porcelain']).out.split('\n').filter(Boolean).length,
};
fs.writeFileSync(path.join(dest, 'GAME-DETAILS-EN.txt'), gameDetails(cfg).replace(/\n/g, WIN ? '\r\n' : '\n'));
fs.writeFileSync(path.join(dest, 'LIRE-AVANT-IMPORT.md'), readme());

// SHA256SUMS (en dernier)
const sums = walk(dest)
  .filter((p) => path.basename(p) !== 'SHA256SUMS')
  .map((p) => `${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}  ${rel(dest, p)}`);
fs.writeFileSync(path.join(dest, 'SHA256SUMS'), `${sums.join('\n')}\n`);
const total = walk(dest).reduce((a, p) => a + fs.statSync(p).size, 0);
console.log(`✓ ${NAME}/ : ${sums.length + 1} fichiers, ${human(total)}${controlsOk && zipOk ? '' : ' — MARQUÉE ÉCHEC (voir LIRE-AVANT-IMPORT.md)'}`);
process.exit(controlsOk && zipOk ? 0 : 1);

// ---------- aides ----------

/** Zip de `dir` (fichiers à la racine) : lib JS si présente, sinon zip, python3 -m zipfile, PowerShell. */
async function makeZip(dir, out, list) {
  try {
    const { zipSync } = await import('fflate');
    const obj = {};
    for (const f of list) obj[f] = [new Uint8Array(fs.readFileSync(path.join(dir, f))), { level: 9 }];
    fs.writeFileSync(out, zipSync(obj));
    return 'fflate';
  } catch {
    /* pas de lib zip installée */
  }
  const tries = [
    ['zip', ['-r', '-X', '-q', out, '.']],
    ['python3', ['-m', 'zipfile', '-c', out, ...fs.readdirSync(dir)]],
    ['python', ['-m', 'zipfile', '-c', out, ...fs.readdirSync(dir)]],
  ];
  if (WIN) tries.push(['powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${dir}\\*' -DestinationPath '${out}'`]]);
  for (const [cmd, args] of tries) {
    const r = spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' });
    if (r.status === 0 && fs.existsSync(out)) return cmd === 'zip' ? 'zip' : `${cmd}${cmd === 'powershell' ? '' : ' -m zipfile'}`;
    fs.rmSync(out, { force: true });
  }
  throw new Error('aucun outil zip disponible (fflate, zip, python3, PowerShell)');
}

/** Noms des entrées d'un zip (lecture du répertoire central). */
function zipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let k = 0; k < count && buf.readUInt32LE(p) === 0x02014b50; k++) {
    const n = buf.readUInt16LE(p + 28);
    const x = buf.readUInt16LE(p + 30);
    const c = buf.readUInt16LE(p + 32);
    names.push(buf.toString('utf8', p + 46, p + 46 + n).replace(/^\.\//, ''));
    p += 46 + n + x + c;
  }
  return names;
}

function gameDetails(c) {
  const m = c.modes ?? {};
  const fsS = c.freeSpins?.standard ?? {};
  const fsP = c.freeSpins?.super ?? {};
  const tnt = c.tnt ?? {};
  const dim = (k, d) => (tnt[k] ? `${tnt[k].w}×${tnt[k].h}` : d);
  const x = (v) => `${Number(v).toLocaleString('en-US')}×`;
  const langs = fs.readdirSync(path.join(ROOT, 'src/i18n/locales')).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort();
  const DESC = {
    base: () => 'Base game spin',
    ante: (v) => `Ante bet DOUBLE FUSE (${v.bonusChanceFactor ?? '?'}× bonus chance)`,
    bonus: (v) => `Bonus buy: ${v.bonus === 'super' ? 'FLOODLIGHT SHIFT' : 'SUNDOWN SHIFT'}, ${v.spins ?? '?'} free spins`,
    feature: (v) => (v.feature === 'mega' ? 'Feature spin MEGA: one spin with a 4×4 keg charge' : 'Feature spin BLAST: one spin with 2+ chained charges'),
  };
  const rows = Object.entries(m).map(([k, v]) => `  ${k.padEnd(7)} ${x(v.cost).padStart(8)}   ${(DESC[v.kind] ?? (() => v.kind))(v)}`);
  const L = [
    'BOOMTOOTH - GAME DETAILS',
    '========================',
    '',
    `Game ............ BOOMTOOTH`,
    `Studio .......... Crownforge`,
    `Front-end build . v${version} (${new Date().toISOString().slice(0, 10)})`,
    `Math status ..... ${c.provisional === true ? 'PROVISIONAL - costs and values below are placeholders until the maths team delivers the final configuration' : 'final'}`,
    `Platforms ....... desktop, tablet, mobile portrait and landscape (HTML5, WebGL)`,
    `Languages ....... ${langs.join(', ')}; social mode (social=true) supported`,
    '',
    'GRID AND PAYS',
    '- 5×5 grid, 3,125 ways. Wins pay left to right from the leftmost reel, same symbol on 3 or more adjacent reels.',
    '- Tumbles: winning cells crumble, survivors fall and new symbols drop in. The sequence goes on as long as there is a win or a charge.',
    '- Symbols: 4 premium (Blaster raccoon, Burly moose, Surveyor otter, Driller woodpecker), 4 low (Hard hat, Pickaxe,',
    '  Storm lantern, Canteen), WILD (substitutes for every paying symbol, with its own values) and SCATTER (at most one',
    '  per reel, never destroyed by a blast).',
    '',
    'BLAST & CARVE',
    `- TNT charges blast before wins are counted, each clearing a square zone: stick ${dim('stick', '2×2')}, bundle ${dim('bundle', '3×3')}, keg ${dim('crate', '4×4')}.`,
    '- A charge caught in a blast zone goes off too. The whole chain is carved into ONE giant symbol (any paying symbol,',
    '  WILD included) filling the area, up to 5×5, that counts on every cell it covers.',
    '',
    'FREE SPINS',
    `- SUNDOWN SHIFT: ${fsS.scatters ?? 3} Scatters award ${fsS.spins ?? 10} free spins. Cornerstone multiplier: every carved cell adds +1;`,
    '  it applies to every bonus win and never goes down.',
    `  Retrigger: ${fsS.retrigger?.scatters ?? '?'} Scatters, +${fsS.retrigger?.spins ?? '?'} free spins.`,
    `- FLOODLIGHT SHIFT: ${fsP.scatters ?? 4} Scatters award ${fsP.spins ?? 12} free spins. All charges in a spin are wired together into one`,
    '  single blast; the Cornerstone multiplier grows the same way.',
    `  Retrigger: ${fsP.retrigger?.scatters ?? '?'} Scatters, +${fsP.retrigger?.spins ?? '?'} free spins.`,
    '',
    'FEATURES',
    `- BLAST (TNT SPIN): one spin with at least two charges that chain.`,
    `- MEGA (MEGA BLAST SPIN): one spin with a 4×4 keg charge that carves a premium symbol or a WILD.`,
    `- Ante DOUBLE FUSE: each spin costs ${m.ANTE?.cost ?? '?'}× the bet with ${m.ANTE?.bonusChanceFactor ?? '?'}× the chance to trigger a bonus.`,
    '  Bonus buys are not available while the Ante is on.',
    '',
    'MODES AND COSTS (game-math-config.json, cost in × base bet)',
    ...rows,
    '',
    `MAX WIN ......... ${x(c.maxWinX ?? 25000)} the bet (the round ends as soon as it is reached)`,
    `Win tiers ....... ${(c.celebrationTiersX ?? []).map(x).join(', ')}`,
    'RTP ............. provided by the maths team',
    '',
  ];
  return L.join('\n');
}

function readme() {
  const prov = cfg.provisional === true;
  const sec = (crReport?.sections ?? []).map((s) => `| check-release (${s.id}) ${s.title} | ${s.status.toUpperCase()} |`);
  const problems = (crReport?.sections ?? []).flatMap((s) => s.items.filter((i) => i.level !== 'info').map((i) => `- (${s.id}) ${i.level} : ${i.msg}`));
  const hudLine = hud
    ? `${hud.summary.ok}/${hud.summary.total} tailles OK — rapport du ${hud.generatedAt.slice(0, 16).replace('T', ' ')} sur ${hud.url} (build QA, pas forcément identique à cette build)`
    : 'non fourni (lancer `npm run hud-check` avant la livraison)';
  const hudFails = hud ? hud.results.filter((r) => !r.ok).map((r) => `- ${r.size} (${r.cls ?? '?'}) : ${r.failures.map((f) => `${f.type} [${f.elements.join(', ')}]`).join(', ')}`) : [];
  return `# BOOMTOOTH — livraison v${version}

Générée le ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC depuis le commit \`${git.sha}\`${git.dirty ? ` (${git.dirty} fichier(s) modifié(s) non commité(s) au moment de la build)` : ' (arbre propre)'}.

> **Contrôles : ${controlsOk && zipOk ? 'OK' : 'ÉCHEC — livraison créée avec --allow-fail, à ne pas transmettre en l’état'}**
> **Maths : ${prov ? 'PROVISOIRES (`provisional: true`) — NE PAS importer sur Stake' : 'définitives (`provisional: false`)'}**

## Contenu du dossier

| Élément | Description |
|---|---|
| \`FRONTEND/\` | build de production (copie de \`dist/\`, aucun outil de dev), à servir en statique |
| \`${zipName}\` | même contenu, \`index.html\` à la racine du zip (${inZip.length} fichiers) |
| \`MEDIA/\` | visuels PNG : ${media.filter((x) => !x.missing && path.posix.dirname(x.out) === 'MEDIA').map((x) => path.basename(x.out)).join(', ')} ; \`BG/\` décor de fond ; \`FG/\` premiers plans${videos.length ? ` ; \`VIDEOS/\` ${videos.join(', ')}` : ''} |
| \`CONTROLES/\` | \`check-release.txt\` / \`.json\`, \`vitest.txt\`, \`build.txt\`${hud ? ', `hud-report.json`' : ''} |
| \`GAME-DETAILS-EN.txt\` | fiche du jeu en anglais (modes et coûts lus dans \`game-math-config.json\`) |
| \`SHA256SUMS\` | empreintes SHA-256 de tous les fichiers (chemins relatifs) |

## Drapeau \`provisional\`

\`game-math-config.json\` : **provisional: ${prov}**.
${prov ? `Les coûts de modes, la table de paiement, le RTP et le gain max sont des valeurs provisoires fournies par l'équipe front.

Ce qu'il bloque :
- l'import et la publication sur Stake Engine (\`node tools/check-release.mjs --stake\` renvoie le code 2) ;
- toute communication de RTP, de coûts ou de gain max (la fiche anglaise indique « provided by the maths team ») ;
- la validation finale de la table de paiement et des books.

Ce qu'il ne bloque pas : revue visuelle, QA front, captures et vidéos.
Pour le lever : l'équipe maths fournit la configuration validée (\`provisional: false\`) et les books, puis nouvelle livraison avec un **nouveau numéro de version**.` : 'Aucun blocage lié aux maths côté front.'}

## Lancer

- Serveur statique local (jamais en \`file://\`) :
  - \`python3 -m http.server 5320 --bind 127.0.0.1 --directory FRONTEND\` puis http://127.0.0.1:5320/
  - ou, depuis le dépôt : \`npx vite preview --outDir "<chemin>/FRONTEND" --port 5320 --strictPort --host 127.0.0.1\`
- Dans le dépôt : \`LANCER-BOOMTOOTH.cmd\` (Windows) ou \`npm run serve-stable\` (build figée \`dist-stable/\`).
- Stake Engine : téléverser le contenu du zip (\`index.html\` à la racine).

## Contrôles passés

| Contrôle | Résultat |
|---|---|
| Build de production (\`npm run build\`) | OK (${build.s} s) |
${sec.join('\n')}
| Tests unitaires (\`npx vitest run\`) | ${vt.code === 0 ? 'OK' : 'ÉCHEC'} — ${vtLine} |
| Zip (contenu = FRONTEND) | ${zipOk ? 'OK' : 'ÉCHEC'} (${inZip.length}/${distFiles.length}) |
| HUD (\`npm run hud-check\`) | ${hudLine} |

${problems.length ? `### Points relevés par check-release\n\n${problems.join('\n')}\n` : ''}${hudFails.length ? `\n### Échecs HUD\n\n${hudFails.join('\n')}\n` : ''}
## Intégrité

\`sha256sum -c SHA256SUMS\` (Linux, macOS) ; Windows : \`Get-FileHash -Algorithm SHA256 <fichier>\`.
`;
}
