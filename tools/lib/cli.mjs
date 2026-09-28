// Aide CLI partagée par les outils QA / livraison.
// Arguments : positionnels, --clé=valeur (coupé au premier « = », donc --query=lang=fr fonctionne),
// --clé valeur (sauf pour les drapeaux booléens déclarés) et --drapeau.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Racine du dépôt (tools/lib/../..). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function parseArgs(argv = process.argv.slice(2), { booleans = [] } = {}) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      pos.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    if (eq >= 0) {
      opt[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!booleans.includes(key) && next !== undefined && !next.startsWith('--')) {
      opt[key] = next;
      i++;
    } else opt[key] = true;
  }
  return { pos, opt };
}

/** « 390x844 » → { w, h } ; null si invalide. */
export function parseSize(s) {
  const m = /^(\d+)x(\d+)$/i.exec(String(s ?? '').trim());
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function pkgVersion() {
  return readJson(path.join(ROOT, 'package.json')).version;
}

/** Liste récursive des fichiers (chemins absolus), triée. */
export function walk(dir) {
  const out = [];
  const rec = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p);
      else if (e.isFile()) out.push(p);
    }
  };
  rec(dir);
  return out.sort();
}

/** Chemin relatif avec des « / » (rapports, SHA256SUMS, zip). */
export const rel = (from, p) => path.relative(from, p).split(path.sep).join('/');

export function human(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(2)} Mo`;
}
