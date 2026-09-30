// QA builds only: copies the dev test rig (never the cat) so ?catglb=./dev/test-rig.glb can
// exercise the 3D integration before the real GLB exists. Never used for the public build.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(ROOT, process.argv[2] ?? 'dist-qa');
const rig = resolve(ROOT, 'tools/.work/test-rig.prepared.glb');
if (existsSync(rig)) { mkdirSync(resolve(dist, 'dev'), { recursive: true }); copyFileSync(rig, resolve(dist, 'dev/test-rig.glb')); console.log('[qa-extras] dev/test-rig.glb'); }
