// tools/cat-prepare.mjs - single source of truth for the Cyber Cat GLB (prompt section 4.2).
//
//   node tools/cat-prepare.mjs                 (reads ./Meshy_AI_Cyber_Cat_All_Animations.glb)
//   node tools/cat-prepare.mjs --in other.glb --out public/assets/cat/cat.glb
//   node tools/cat-prepare.mjs --testrig       (dev: runs on tools/.work/test-rig.glb, writes into tools/.work/)
//
// The source GLB is never modified or moved. Every intermediate goes to tools/.work/.
// Output: public/assets/cat/cat.glb (meshopt + WebP 2048), public/assets/cat/cat.meta.json,
//         docs/preuves/chat/prepare-report.json + PREPARE.md (measurements before/after).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsEmissiveStrength } from '@gltf-transform/extensions';
import { prune, cloneDocument } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const TESTRIG = flag('testrig');
const WORK = resolve(ROOT, 'tools/.work');
const SRC = resolve(ROOT, opt('in', TESTRIG ? 'tools/.work/test-rig.glb' : 'Meshy_AI_Cyber_Cat_All_Animations.glb'));
const OUT = resolve(ROOT, opt('out', TESTRIG ? 'tools/.work/test-rig.prepared.glb' : 'public/assets/cat/cat.glb'));
const META = OUT.replace(/\.glb$/, '.meta.json');
const REPORT_DIR = resolve(ROOT, TESTRIG ? 'tools/.work/report' : 'docs/preuves/chat');
const FIXED = resolve(WORK, TESTRIG ? 'test-rig-fixed.glb' : 'cat-fixed.glb');
const FPS = 30;
const DIVE_START = Number(opt('dive-start', '0.30'));
const IDLE34_YAW = Number(opt('idle34-yaw', '32')); // deg, turns the 3/4 body toward the camera
const DOUBLE_SIDED = flag('double-sided');
const TEX_SIZE = 2048;
const MAX_TEX_BYTES = 800 * 1024;
const MAX_GLB_BYTES = 2.5 * 1024 * 1024;

if (!existsSync(SRC)) {
  console.error(`\n[cat-prepare] source introuvable : ${SRC}\n` +
    `Place Meshy_AI_Cyber_Cat_All_Animations.glb a la racine du projet (il n'est jamais modifie).\n`);
  process.exit(2);
}
mkdirSync(WORK, { recursive: true });
mkdirSync(REPORT_DIR, { recursive: true });
mkdirSync(dirname(OUT), { recursive: true });

const log = (...a) => console.log('[cat-prepare]', ...a);
const report = { source: relative(ROOT, SRC), sourceBytes: statSync(SRC).size, sourceSha256: '', steps: [], clips: {}, warnings: [] };
const warn = (m) => { report.warnings.push(m); console.warn('[cat-prepare] ATTENTION', m); };
report.sourceSha256 = createHash('sha256').update(readFileSync(SRC)).digest('hex');

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(SRC);
const root = doc.getRoot();

// ------------------------------------------------------------------------------------------
// 0. Inventory (expected: 23 joints, 5 609 triangles, one 4096 PNG, 30 fps, 10 clips)
// ------------------------------------------------------------------------------------------
const skins = root.listSkins();
const joints = skins[0]?.listJoints() ?? [];
const tris = root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const inv = {
  joints: joints.length, jointNames: joints.map((j) => j.getName()),
  triangles: tris, materials: root.listMaterials().length,
  textures: root.listTextures().map((t) => ({ name: t.getName(), mime: t.getMimeType(), size: t.getSize(), bytes: t.getImage()?.byteLength ?? 0 })),
  animations: root.listAnimations().map((a) => ({ name: a.getName(), duration: +animDuration(a).toFixed(3) })),
  rootScale: root.listScenes()[0].listChildren().map((n) => ({ name: n.getName(), scale: n.getScale(), rotation: n.getRotation() })),
};
report.inventory = inv;
log(`source: ${inv.joints} joints, ${inv.triangles} triangles, ${inv.textures.length} texture(s), ${inv.animations.length} clips`);
if (inv.joints !== 23) warn(`joints = ${inv.joints} (attendu 23)`);
if (!inv.jointNames.includes('headfront')) warn('os headfront absent : ancre FX a definir autrement');

function animDuration(a) {
  let d = 0;
  for (const s of a.listSamplers()) { const arr = s.getInput().getArray(); d = Math.max(d, arr[arr.length - 1] ?? 0); }
  return d;
}

// ------------------------------------------------------------------------------------------
// 1. Material: remove emissive=basecolor, specular x2, ior; metallic 0.1 / roughness 0.45;
//    emissive mask (eyes only) from the base colour; UV-island padding against seams.
// ------------------------------------------------------------------------------------------
const materials = root.listMaterials();
if (materials.length !== 1) warn(`${materials.length} materiaux (attendu 1) : tous recoivent le meme traitement`);
const baseTex = materials[0]?.getBaseColorTexture();
if (!baseTex) throw new Error('pas de texture de base');
const baseImg = baseTex.getImage();
const { data: rgba, info } = await sharp(Buffer.from(baseImg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
log(`texture de base ${W}x${H} ${baseTex.getMimeType()} ${(baseImg.byteLength / 1048576).toFixed(1)} Mo`);

// UV coverage (rasterise every triangle in UV space at texture resolution)
const coverage = new Uint8Array(W * H);
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const uvAcc = prim.getAttribute('TEXCOORD_0'); if (!uvAcc) continue;
  const idx = prim.getIndices();
  const n = idx ? idx.getCount() : uvAcc.getCount();
  const uv = [0, 0], a = [], b = [], c = [];
  for (let i = 0; i < n; i += 3) {
    for (const [k, dst] of [[0, a], [1, b], [2, c]]) {
      uvAcc.getElement(idx ? idx.getScalar(i + k) : i + k, uv);
      dst[0] = uv[0] * W - 0.5; dst[1] = uv[1] * H - 0.5;
    }
    rasterTri(a, b, c);
  }
}
function rasterTri(a, b, c) {
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])) - 1), maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])) + 1);
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])) - 1), maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])) + 1);
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(area) < 1e-12) { // degenerate: mark the pixels it touches
    for (const p of [a, b, c]) { const x = Math.round(p[0]), y = Math.round(p[1]); if (x >= 0 && y >= 0 && x < W && y < H) coverage[y * W + x] = 1; }
    return;
  }
  const s = Math.sign(area);
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const w0 = ((b[0] - x) * (c[1] - y) - (b[1] - y) * (c[0] - x)) * s;
    const w1 = ((c[0] - x) * (a[1] - y) - (c[1] - y) * (a[0] - x)) * s;
    const w2 = ((a[0] - x) * (b[1] - y) - (a[1] - y) * (b[0] - x)) * s;
    const tol = -Math.abs(area) * 0.02; // small tolerance on thin triangles; the padding pass covers the rest
    if (w0 >= tol && w1 >= tol && w2 >= tol) coverage[y * W + x] = 1;
  }
}
let covered = 0; for (let i = 0; i < coverage.length; i++) covered += coverage[i];
report.steps.push({ step: 'uv-coverage', coveredPct: +(100 * covered / coverage.length).toFixed(2) });

// Emissive mask: hue 170-200 deg, saturation > 0.5, value > 0.7, inside the UV islands only.
const MASK = 512, blk = Math.max(1, Math.round(W / MASK));
const maskFull = new Uint8Array(W * H);
let eyePx = 0;
for (let i = 0, p = 0; i < W * H; i++, p += 4) {
  if (!coverage[i]) continue;
  const r = rgba[p] / 255, g = rgba[p + 1] / 255, bb = rgba[p + 2] / 255;
  const mx = Math.max(r, g, bb), mn = Math.min(r, g, bb), d = mx - mn;
  if (mx <= 0.7 || d / mx <= 0.5) continue;
  let h = mx === r ? ((g - bb) / d) % 6 : mx === g ? (bb - r) / d + 2 : (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  if (h >= 170 && h <= 200) { maskFull[i] = 255; eyePx++; }
}
const eyePct = 100 * eyePx / (W * H);
report.steps.push({ step: 'emissive-mask', eyePixelsPct: +eyePct.toFixed(3), expectedPct: 0.1 });
log(`masque emissif : ${eyePct.toFixed(3)} % de la texture (attendu ~0,1 %)`);
if (eyePct < 0.01 || eyePct > 1.5) warn(`masque emissif a ${eyePct.toFixed(3)} % : verifier les seuils sur la planche`);
const mask512 = Buffer.alloc(MASK * MASK);
for (let y = 0; y < MASK; y++) for (let x = 0; x < MASK; x++) {
  let m = 0;
  for (let yy = y * blk; yy < Math.min(H, (y + 1) * blk) && !m; yy++) for (let xx = x * blk; xx < Math.min(W, (x + 1) * blk); xx++) if (maskFull[yy * W + xx]) { m = 255; break; }
  mask512[y * MASK + x] = m;
}
const maskPng = await sharp(mask512, { raw: { width: MASK, height: MASK, channels: 1 } }).blur(0.6).toColourspace('srgb').png().toBuffer();
writeFileSync(resolve(REPORT_DIR, 'emissive-mask.png'), maskPng);

// UV-island padding (breadth-first dilation, 16 px at 4096) so WebP + mipmaps never pull the
// black atlas background into the seams.
const PAD = Math.max(4, Math.round(16 * W / 4096));
{
  let frontier = [];
  const done = coverage.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (done[i]) continue;
    if ((x > 0 && done[i - 1]) || (x < W - 1 && done[i + 1]) || (y > 0 && done[i - W]) || (y < H - 1 && done[i + W])) frontier.push(i);
  }
  for (let step = 0; step < PAD && frontier.length; step++) {
    const next = [], fill = [];
    for (const i of frontier) {
      if (done[i]) continue;
      const x = i % W, y = (i / W) | 0;
      let r = 0, g = 0, b = 0, n = 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j >= 0 && done[j]) { r += rgba[j * 4]; g += rgba[j * 4 + 1]; b += rgba[j * 4 + 2]; n++; }
      }
      if (n) fill.push([i, r / n, g / n, b / n]);
    }
    for (const [i, r, g, b] of fill) {
      rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; done[i] = 1;
      const x = i % W, y = (i / W) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && !done[j]) next.push(j);
    }
    frontier = next;
  }
  report.steps.push({ step: 'uv-padding', px: PAD });
}
const basePng = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).removeAlpha()
  .resize(Math.min(W, TEX_SIZE), Math.min(H, TEX_SIZE), { kernel: 'lanczos3' }).png({ compressionLevel: 6 }).toBuffer();
baseTex.setImage(new Uint8Array(basePng)).setMimeType('image/png');

const maskTex = doc.createTexture('cat_emissive_mask').setImage(new Uint8Array(maskPng)).setMimeType('image/png').setURI('cat_emissive_mask.png');
const emissiveStrength = doc.createExtension(KHRMaterialsEmissiveStrength);
for (const mat of materials) {
  mat.setEmissiveTexture(null);
  mat.setExtension('KHR_materials_specular', null);
  mat.setExtension('KHR_materials_ior', null);
  mat.setMetallicFactor(0.1).setRoughnessFactor(0.45);
  mat.setEmissiveTexture(maskTex).setEmissiveFactor([0.35, 0.92, 1.0]);
  mat.setExtension('KHR_materials_emissive_strength', emissiveStrength.createEmissiveStrength().setEmissiveStrength(2.2));
  mat.setDoubleSided(DOUBLE_SIDED);
}
for (const ext of root.listExtensionsUsed()) {
  if (ext.extensionName === 'KHR_materials_specular' || ext.extensionName === 'KHR_materials_ior') ext.dispose();
}
report.steps.push({ step: 'material', metallic: 0.1, roughness: 0.45, emissive: 'mask 512 cyan x2.2', doubleSided: DOUBLE_SIDED, removed: ['emissive=basecolor', 'KHR_materials_specular', 'KHR_materials_ior'] });

// ------------------------------------------------------------------------------------------
// 2. Clips: drop the 3 useless ones, rename, sub-clips, hips lock, idle34 yaw.
// ------------------------------------------------------------------------------------------
const sourceDoc = cloneDocument(doc); // clips as delivered, measured later for the before/after drift
const bare = (n) => n.replace(/^.*\|(?=[^|]+$)/, '').replace(/\|.*$/, '');
const anims = root.listAnimations();
const originalName = new Map(anims.map((a) => [a, a.getName()]));
const byPattern = (re) => anims.find((a) => re.test(a.getName()));
const SRC_CLIPS = {
  idle: byPattern(/Long_Breathe_and_Look_Around/i),
  alert: anims.find((a) => /(^|\|)Alert$/i.test(a.getName()) || bare(a.getName()) === 'Alert'),
  idle34: byPattern(/Axe_Breathe_and_Look_Around/i),
  dance: byPattern(/Step_Hip_Hop_Dance/i),
  backflip: byPattern(/Backflip_and_Hooks/i),
  diveSrc: byPattern(/Dive_Down_and_Land_2/i),
  running: byPattern(/Running/i),
};
for (const [k, a] of Object.entries(SRC_CLIPS)) if (!a) throw new Error(`clip source introuvable pour ${k} (noms : ${anims.map((x) => x.getName()).join(', ')})`);
const REMOVE = anims.filter((a) => /Walking|Alert_Quick_Turn_Right|clip0|baselayer/i.test(a.getName()));
const known = new Set([...Object.values(SRC_CLIPS), ...REMOVE]);
for (const a of anims) if (!known.has(a)) { warn(`clip inattendu supprime : ${a.getName()}`); REMOVE.push(a); }

const hipsNode = root.listNodes().find((n) => n.getName() === 'mixamorig:Hips');
if (!hipsNode) throw new Error('mixamorig:Hips introuvable');
const hipsParentScaleY = worldScaleY(hipsNode.getParentNode());
function worldScaleY(node) { let s = 1; for (let n = node; n; n = n.getParentNode()) s *= n.getScale()[1]; return s; }

function channel(anim, node, path) { return anim.listChannels().find((c) => c.getTargetNode() === node && c.getTargetPath() === path); }
function sample(sampler, t, isRot) {
  const input = sampler.getInput().getArray(), output = sampler.getOutput().getArray();
  const k = sampler.getOutput().getElementSize();
  const interp = sampler.getInterpolation();
  const stride = interp === 'CUBICSPLINE' ? 3 * k : k, off = interp === 'CUBICSPLINE' ? k : 0;
  const at = (i) => Array.from(output.slice(i * stride + off, i * stride + off + k));
  if (input.length === 1 || t <= input[0]) return at(0);
  if (t >= input[input.length - 1]) return at(input.length - 1);
  let i = 0; while (i < input.length - 2 && input[i + 1] <= t) i++;
  const t0 = input[i], t1 = input[i + 1], u = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
  if (interp === 'STEP') return at(i);
  const a = at(i), b = at(i + 1);
  if (isRot) return new THREE.Quaternion(...a).slerp(new THREE.Quaternion(...b), u).toArray();
  return a.map((v, j) => v + (b[j] - v) * u); // CUBICSPLINE approximated linearly at the boundaries only
}
function subclip(src, name, t0, t1, { closeLoop = false } = {}) {
  const anim = doc.createAnimation(name);
  const inputs = new Map();
  for (const ch of src.listChannels()) {
    const s = ch.getSampler();
    const isRot = ch.getTargetPath() === 'rotation';
    const input = s.getInput().getArray();
    const k = s.getOutput().getElementSize();
    const times = [0], values = [...sample(s, t0, isRot)];
    const stride = s.getInterpolation() === 'CUBICSPLINE' ? 3 * k : k, off = s.getInterpolation() === 'CUBICSPLINE' ? k : 0;
    for (let i = 0; i < input.length; i++) {
      if (input[i] > t0 + 1e-4 && input[i] < t1 - 1e-4) { times.push(input[i] - t0); values.push(...s.getOutput().getArray().slice(i * stride + off, i * stride + off + k)); }
    }
    times.push(t1 - t0); values.push(...(closeLoop ? sample(s, t0, isRot) : sample(s, t1, isRot)));
    const key = s.getInput();
    let inAcc = inputs.get(key);
    if (!inAcc || inAcc.getCount() !== times.length) { inAcc = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(times)); inputs.set(key, inAcc); }
    const outAcc = doc.createAccessor().setType(s.getOutput().getType()).setArray(new Float32Array(values));
    const ns = doc.createAnimationSampler().setInput(inAcc).setOutput(outAcc).setInterpolation(s.getInterpolation() === 'STEP' ? 'STEP' : 'LINEAR');
    anim.addSampler(ns).addChannel(doc.createAnimationChannel().setTargetNode(ch.getTargetNode()).setTargetPath(ch.getTargetPath()).setSampler(ns));
  }
  return anim;
}
function ownOutput(sampler) { // never mutate an accessor shared with another sampler
  const acc = sampler.getOutput();
  if (acc.listParents().filter((p) => p.propertyType === 'AnimationSampler').length > 1) sampler.setOutput(acc.clone());
  return sampler.getOutput();
}

const idleHips0 = sample(channel(SRC_CLIPS.idle, hipsNode, 'translation').getSampler(), 0, false);
report.idleHipsFrame0 = { x: +idleHips0[0].toFixed(2), y: +idleHips0[1].toFixed(2), z: +idleHips0[2].toFixed(2), expected: { x: -1.8, z: 20.5 } };
log(`hanches idle frame 0 : X ${idleHips0[0].toFixed(2)}  Z ${idleHips0[2].toFixed(2)} (attendu X -1,8  Z 20,5)`);
if (!TESTRIG && (Math.abs(idleHips0[0] + 1.8) > 1 || Math.abs(idleHips0[2] - 20.5) > 1)) warn('hanches idle frame 0 differentes des mesures du prompt');

const runFreeze = measureFreeze(SRC_CLIPS.running);
report.steps.push({ step: 'run-freeze-source', ...runFreeze });

const clips = {};
clips.idle = SRC_CLIPS.idle.setName('idle');
clips.alert = SRC_CLIPS.alert.setName('alert');
clips.idle34 = SRC_CLIPS.idle34.setName('idle34');
clips.dance = SRC_CLIPS.dance.setName('dance');
clips.flip = subclip(SRC_CLIPS.backflip, 'flip', 0.45, Math.min(2.9, animDuration(SRC_CLIPS.backflip)));
clips.hooks = subclip(SRC_CLIPS.backflip, 'hooks', 2.75, Math.min(3.95, animDuration(SRC_CLIPS.backflip)));
const diveDur = animDuration(SRC_CLIPS.diveSrc);
clips.dive = subclip(SRC_CLIPS.diveSrc, 'dive', DIVE_START, diveDur);
clips.run = subclip(SRC_CLIPS.running, 'run', 1 / FPS, 21 / FPS, { closeLoop: true });
clips.hop = subclip(SRC_CLIPS.dance, 'hop', 0, 38 / FPS);
for (const a of [...REMOVE, SRC_CLIPS.backflip, SRC_CLIPS.diveSrc, SRC_CLIPS.running]) a.dispose();
report.steps.push({ step: 'clips', removed: REMOVE.map((a) => a.getName?.() ?? '?').length, subclips: { flip: [0.45, 2.9], hooks: [2.75, 3.95], dive: [DIVE_START, +diveDur.toFixed(3)], run: 'frames 1-21 (fin exclue) + cle de bouclage', hop: 'dance frames 0-39 (fin exclue)' } });

// Hips lock (X/Z = idle frame 0, Y kept) for clips that travel
for (const id of ['dance', 'hop', 'flip', 'hooks', 'dive']) {
  const ch = channel(clips[id], hipsNode, 'translation'); if (!ch) continue;
  const acc = ownOutput(ch.getSampler()); const arr = acc.getArray().slice();
  const k = ch.getSampler().getInterpolation() === 'CUBICSPLINE' ? 3 : 1;
  for (let i = 0; i < arr.length; i += 3 * k) { const o = k === 3 ? i + 3 : i; arr[o] = idleHips0[0]; arr[o + 2] = idleHips0[2]; }
  acc.setArray(arr);
}
// idle34: rotate the hips toward the camera (yaw about the parent's vertical axis)
{
  const ch = channel(clips.idle34, hipsNode, 'rotation');
  const acc = ownOutput(ch.getSampler()); const arr = acc.getArray().slice();
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), IDLE34_YAW * Math.PI / 180);
  const q = new THREE.Quaternion();
  for (let i = 0; i < arr.length; i += 4) { q.fromArray(arr, i); q.premultiply(qy).normalize(); q.toArray(arr, i); }
  acc.setArray(arr);
  report.steps.push({ step: 'idle34-yaw', deg: IDLE34_YAW });
}

function measureFreeze(anim) {
  // longest run of identical consecutive poses (all channels), in ms
  const inputs = anim.listSamplers()[0].getInput().getArray();
  let best = 0, cur = 0;
  for (let i = 1; i < inputs.length; i++) {
    const same = anim.listSamplers().every((s) => {
      const k = s.getOutput().getElementSize(), o = s.getOutput().getArray();
      if (s.getInput().getCount() !== inputs.length) return true;
      for (let j = 0; j < k; j++) if (Math.abs(o[i * k + j] - o[(i - 1) * k + j]) > 1e-4) return false;
      return true;
    });
    cur = same ? cur + (inputs[i] - inputs[i - 1]) : 0; best = Math.max(best, cur);
  }
  return { freezeMs: Math.round(best * 1000) };
}

// ------------------------------------------------------------------------------------------
// 3. Ground: measure with three.js exactly like the runtime, correct in the hips Y track.
// ------------------------------------------------------------------------------------------
const LOOPING = new Set(['idle', 'idle34', 'dance', 'run']);
async function loadThree(d = doc) {
  const copy = cloneDocument(d);
  for (const t of copy.getRoot().listTextures()) t.dispose();
  const bin = await new NodeIO().registerExtensions(ALL_EXTENSIONS).writeBinary(copy);
  const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  return new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
}
async function measureAll(d = doc) {
  const gltf = await loadThree(d);
  const scene = gltf.scene;
  const mesh = scene.getObjectByProperty('type', 'SkinnedMesh') ?? (() => { let m; scene.traverse((o) => { if (o.isSkinnedMesh) m = o; }); return m; })();
  const hips = scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName('mixamorig:Hips'));
  const head = scene.getObjectByName('headfront');
  const mixer = new THREE.AnimationMixer(scene);
  const pos = mesh.geometry.attributes.position;
  const skinIndex = mesh.geometry.attributes.skinIndex, skinWeight = mesh.geometry.attributes.skinWeight;
  const v = new THREE.Vector3(), hp = new THREE.Vector3(), fw = new THREE.Vector3(), q = new THREE.Quaternion();
  const out = {};
  for (const clip of gltf.animations) {
    mixer.stopAllAction();
    const action = mixer.clipAction(clip); action.reset().setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    const hipsTrack = clip.tracks.find((t) => t.name.endsWith('.position') && t.name.startsWith(hips.name));
    const times = Array.from(hipsTrack?.times ?? [0]);
    const frames = [];
    for (const t of times) {
      mixer.setTime(Math.min(t, clip.duration - 1e-6 > 0 ? clip.duration - 1e-6 : 0));
      scene.updateMatrixWorld(true);
      let minY = Infinity, minI = 0;
      for (let i = 0; i < pos.count; i++) {
        mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld);
        if (v.y < minY) { minY = v.y; minI = i; }
      }
      let bi = 0, bw = -1; for (let c = 0; c < 4; c++) { const w = skinWeight.getComponent(minI, c); if (w > bw) { bw = w; bi = skinIndex.getComponent(minI, c); } }
      hips.getWorldPosition(hp); hips.getWorldQuaternion(q);
      fw.set(0, 0, 1).applyQuaternion(q); const yaw = Math.atan2(fw.x, fw.z) * 180 / Math.PI;
      frames.push({ t, minY, low: mesh.skeleton.bones[bi]?.name ?? '?', hx: hp.x, hy: hp.y, hz: hp.z, yaw, head: head ? head.getWorldPosition(new THREE.Vector3()).toArray() : null });
    }
    out[clip.name] = { duration: clip.duration, frames };
  }
  return out;
}
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]; };
function summarise(m) {
  const minYs = m.frames.map((f) => f.minY);
  const lowest = m.frames.reduce((a, f) => (f.minY < a.minY ? f : a), m.frames[0]);
  const xs = m.frames.map((f) => f.hx), zs = m.frames.map((f) => f.hz);
  return {
    duration: +m.duration.toFixed(3), frames: m.frames.length,
    minYcm: +(Math.min(...minYs) * 100).toFixed(1), p25cm: +(pct(minYs, 0.25) * 100).toFixed(1), maxOfMinCm: +(Math.max(...minYs) * 100).toFixed(1),
    lowestAt: +lowest.t.toFixed(2), lowestBone: lowest.low,
    driftXcm: +((Math.max(...xs) - Math.min(...xs)) * 100).toFixed(1), driftZcm: +((Math.max(...zs) - Math.min(...zs)) * 100).toFixed(1),
    yawStart: +m.frames[0].yaw.toFixed(1), yawEnd: +m.frames[m.frames.length - 1].yaw.toFixed(1),
    hipsStartCm: [m.frames[0].hx, m.frames[0].hy, m.frames[0].hz].map((x) => +(x * 100).toFixed(1)),
  };
}

const SOURCE_OF = { idle: SRC_CLIPS.idle, alert: SRC_CLIPS.alert, idle34: SRC_CLIPS.idle34, dance: SRC_CLIPS.dance, hop: SRC_CLIPS.dance, flip: SRC_CLIPS.backflip, hooks: SRC_CLIPS.backflip, dive: SRC_CLIPS.diveSrc, run: SRC_CLIPS.running };
const sourceNames = Object.fromEntries(Object.entries(SOURCE_OF).map(([k, a]) => [k, originalName.get(a)]));
const source = await measureAll(sourceDoc);
const before = await measureAll();
for (const [name, m] of Object.entries(before)) {
  const src = source[sourceNames[name]];
  report.clips[name] = { sourceClip: sourceNames[name], source: src ? summarise(src) : null, before: summarise(m) };
}

function smoothLift(raw, loop) {
  const n = raw.length, r = 3;
  const at = (i) => (loop ? raw[((i % n) + n) % n] : raw[Math.max(0, Math.min(n - 1, i))]);
  const mx = raw.map((_, i) => { let m = 0; for (let k = -r; k <= r; k++) m = Math.max(m, at(i + k)); return m; });
  const at2 = (i) => (loop ? mx[((i % n) + n) % n] : mx[Math.max(0, Math.min(n - 1, i))]);
  return mx.map((_, i) => { let s = 0; for (let k = -r; k <= r; k++) s += at2(i + k); return s / (2 * r + 1); });
}
for (const [name, m] of Object.entries(before)) {
  const anim = root.listAnimations().find((a) => a.getName() === name);
  const ch = channel(anim, hipsNode, 'translation'); if (!ch) { warn(`${name} : pas de piste translation des hanches`); continue; }
  const minYs = m.frames.map((f) => f.minY);
  // constant: grounded clips stand on the floor (25th percentile of the lowest point); dive uses its landed end
  const tail = minYs.slice(Math.floor(minYs.length * 0.8));
  const c = name === 'dive' ? -pct(tail, 0.5) : -pct(minYs, 0.25);
  // dynamic lift against penetration (not for dive: the impact wave hides the fist, lifting would float the body)
  const lift = name === 'dive' ? minYs.map(() => 0) : smoothLift(minYs.map((y) => Math.max(0, -(y + c))), LOOPING.has(name));
  const acc = ownOutput(ch.getSampler()); const arr = acc.getArray().slice();
  const times = ch.getSampler().getInput().getArray();
  if (times.length !== m.frames.length) warn(`${name} : cles des hanches (${times.length}) != mesures (${m.frames.length})`);
  const k = ch.getSampler().getInterpolation() === 'CUBICSPLINE' ? 3 : 1;
  for (let i = 0; i < times.length; i++) {
    const o = (k === 3 ? i * 9 + 3 : i * 3) + 1;
    arr[o] += ((c + (lift[i] ?? 0)) / hipsParentScaleY);
  }
  acc.setArray(arr);
  report.clips[name].correction = { constantCm: +(c * 100).toFixed(1), maxLiftCm: +(Math.max(...lift) * 100).toFixed(1) };
}
const after = await measureAll();
for (const [name, m] of Object.entries(after)) report.clips[name].after = summarise(m);
for (const [name, c] of Object.entries(report.clips)) {
  if (name !== 'dive' && c.after.minYcm < -1) warn(`${name} : point le plus bas encore a ${c.after.minYcm} cm apres correction`);
  if (['idle', 'alert', 'idle34'].includes(name) && Math.abs(c.after.p25cm) > 1) warn(`${name} : pieds a ${c.after.p25cm} cm du sol`);
  if (['dance', 'hop', 'flip', 'hooks', 'dive'].includes(name) && Math.max(c.after.driftXcm, c.after.driftZcm) > 12) warn(`${name} : derive horizontale ${c.after.driftXcm}/${c.after.driftZcm} cm malgre le verrou (rotation des hanches)`);
}
// yaw gap to idle at clip end (> 25 deg => longer fade or correction, validated on the sheet)
const idleYaw = report.clips.idle.after.yawStart;
for (const [name, c] of Object.entries(report.clips)) {
  let gap = Math.abs(((c.after.yawEnd - idleYaw + 540) % 360) - 180);
  c.after.yawGapToIdle = +gap.toFixed(1);
  if (gap > 25 && !['run', 'alert'].includes(name)) report.warnings.push(`${name} : fin tournee de ${gap.toFixed(0)} deg par rapport a idle (fondu long prevu)`);
}

// ------------------------------------------------------------------------------------------
// 4. Write, optimise (meshopt + WebP 2048, no simplify/join/flatten/instance/palette), check.
// ------------------------------------------------------------------------------------------
await doc.transform(prune({ keepLeaves: true, keepAttributes: true }));
await io.write(FIXED, doc);
log(`fixe : ${relative(ROOT, FIXED)} (${(statSync(FIXED).size / 1048576).toFixed(2)} Mo)`);
const cli = resolve(ROOT, 'node_modules/@gltf-transform/cli/bin/cli.js');
execFileSync(process.execPath, [cli, 'optimize', FIXED, OUT, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', String(TEX_SIZE),
  '--simplify', 'false', '--join', 'false', '--flatten', 'false', '--instance', 'false', '--palette', 'false'], { stdio: 'inherit' });

// texture budget: re-encode the base colour with sharp until <= 800 KB
{
  const d2 = await io.read(OUT);
  let changed = false;
  for (const t of d2.getRoot().listTextures()) {
    const bytes = t.getImage().byteLength;
    if (bytes <= MAX_TEX_BYTES) continue;
    let q = 88, buf;
    do { buf = await sharp(Buffer.from(t.getImage())).webp({ quality: q, effort: 6 }).toBuffer(); q -= 4; } while (buf.byteLength > MAX_TEX_BYTES && q >= 50);
    t.setImage(new Uint8Array(buf)).setMimeType('image/webp'); changed = true;
    report.steps.push({ step: 'texture-reencode', name: t.getName(), from: bytes, to: buf.byteLength, quality: q + 4 });
  }
  if (changed) await io.write(OUT, d2);
  report.output = {
    glbBytes: statSync(OUT).size,
    textures: d2.getRoot().listTextures().map((t) => ({ name: t.getName(), mime: t.getMimeType(), size: t.getSize(), bytes: t.getImage().byteLength })),
    clips: d2.getRoot().listAnimations().map((a) => ({ name: a.getName(), duration: +animDuration(a).toFixed(3) })),
    extensions: d2.getRoot().listExtensionsUsed().map((e) => e.extensionName),
  };
}
const glbMB = report.output.glbBytes / 1048576;
log(`sortie : ${relative(ROOT, OUT)} ${glbMB.toFixed(2)} Mo ; textures ${report.output.textures.map((t) => `${t.name || '?'} ${t.size?.join('x')} ${(t.bytes / 1024).toFixed(0)} Ko`).join(', ')}`);
if (report.output.glbBytes > MAX_GLB_BYTES) warn(`GLB ${glbMB.toFixed(2)} Mo > 2,5 Mo`);
for (const t of report.output.textures) if (t.bytes > MAX_TEX_BYTES) warn(`texture ${t.name} ${(t.bytes / 1024).toFixed(0)} Ko > 800 Ko`);
try {
  const v = execFileSync(process.execPath, [cli, 'validate', OUT], { encoding: 'utf8' });
  const errors = /errors?\W+(\d+)/i.exec(v);
  report.validate = v.split('\n').filter((l) => /error|warning|info|hint/i.test(l)).slice(0, 20).join('\n');
  if (errors && Number(errors[1]) > 0) warn('gltf-transform validate signale des erreurs (voir le rapport)');
} catch (e) { report.validate = String(e.stdout ?? e.message).slice(0, 2000); warn('gltf-transform validate a echoue'); }
try { execFileSync(process.execPath, [cli, 'inspect', OUT, '--format', 'md'], { encoding: 'utf8' }); report.inspect = 'ok'; }
catch (e) { report.inspect = 'erreur'; warn('gltf-transform inspect a echoue'); }

// runtime metadata (clip table, loops, fades, anchors)
const meta = {
  version: 1, source: report.source, sourceSha256: report.sourceSha256.slice(0, 16), preparedAt: new Date().toISOString(),
  testRig: TESTRIG, fps: FPS, headfront: 'headfront', hips: THREE.PropertyBinding.sanitizeNodeName('mixamorig:Hips'), head: THREE.PropertyBinding.sanitizeNodeName('mixamorig:Head'),
  clips: Object.fromEntries(report.output.clips.map((c) => [c.name, { duration: c.duration, loop: LOOPING.has(c.name) }])),
  yaw: Object.fromEntries(Object.entries(report.clips).map(([n, c]) => [n, { start: c.after.yawStart, end: c.after.yawEnd }])),
  groundCm: Object.fromEntries(Object.entries(report.clips).map(([n, c]) => [n, c.after.minYcm])),
};
writeFileSync(META, JSON.stringify(meta, null, 2));
writeFileSync(resolve(REPORT_DIR, 'prepare-report.json'), JSON.stringify(report, null, 2));

// human summary
const rows = Object.entries(report.clips).map(([n, c]) => `| ${n} | ${c.after.duration} | ${c.before.minYcm} -> ${c.after.minYcm} | ${c.before.p25cm} -> ${c.after.p25cm} | ${c.after.lowestBone} @${c.after.lowestAt}s | ${c.source ? `${c.source.driftXcm}/${c.source.driftZcm}` : '?'} -> ${c.after.driftXcm}/${c.after.driftZcm} | ${c.after.yawStart} -> ${c.after.yawEnd} (${c.after.yawGapToIdle}) | ${c.correction ? `${c.correction.constantCm} / ${c.correction.maxLiftCm}` : '-'} |`);
const md = `# Preparation du GLB${TESTRIG ? ' (SQUELETTE DE TEST, pas le chat)' : ''}\n\n` +
  `Source : \`${report.source}\` (${(report.sourceBytes / 1048576).toFixed(1)} Mo, sha256 ${report.sourceSha256.slice(0, 16)}...)\n\n` +
  `Sortie : \`${relative(ROOT, OUT)}\` **${glbMB.toFixed(2)} Mo** ; textures : ${report.output.textures.map((t) => `${t.size?.join('x')} ${t.mime} ${(t.bytes / 1024).toFixed(0)} Ko`).join(' ; ')}\n\n` +
  `Masque emissif : ${eyePct.toFixed(3)} % de la texture. Hanches idle frame 0 : X ${report.idleHipsFrame0.x} Z ${report.idleHipsFrame0.z}. Gel de Running source : ${runFreeze.freezeMs} ms.\n\n` +
  `| clip | duree s | point bas cm (avant -> apres) | appui p25 cm | plus bas | derive X/Z cm (clip source -> final) | lacet debut -> fin (ecart idle) | correction cste / levee max cm |\n|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n\n` +
  `## Alertes\n\n${report.warnings.length ? report.warnings.map((w) => `- ${w}`).join('\n') : '- aucune'}\n`;
writeFileSync(resolve(REPORT_DIR, 'PREPARE.md'), md);
log(`rapport : ${relative(ROOT, resolve(REPORT_DIR, 'PREPARE.md'))} (${report.warnings.length} alerte(s))`);
