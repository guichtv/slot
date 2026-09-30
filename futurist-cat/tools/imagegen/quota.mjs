// Reads `used_percent` in the latest Codex rollout (~/.codex/sessions). Never reads auth.json.
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const root = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'sessions');
if (!existsSync(root)) { console.log('aucune session Codex trouvee'); process.exit(0); }
let latest = null;
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); const s = statSync(p); if (s.isDirectory()) walk(p); else if (n.endsWith('.jsonl') && (!latest || s.mtimeMs > latest.t)) latest = { p, t: s.mtimeMs }; } };
walk(root);
if (!latest) { console.log('aucun rollout'); process.exit(0); }
const lines = readFileSync(latest.p, 'utf8').split('\n').filter((l) => l.includes('used_percent'));
const last = lines.at(-1);
const m = last && /"used_percent"\s*:\s*([\d.]+)/.exec(last);
console.log(m ? `quota utilise : ${m[1]} % (${latest.p})` : 'used_percent absent du dernier rollout');
