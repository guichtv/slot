// DEV TOOL ONLY - never shipped, never shown as the cat.
// Builds tools/.work/test-rig.glb: a blocky stand-in with the SAME structure as
// Meshy_AI_Cyber_Cat_All_Animations.glb (Blender glTF, Armature node at scale 0.01 without
// rotation, 22 mixamorig:* bones + headfront, one skinned mesh, one base-colour texture reused as
// emissive, KHR_materials_specular x2 + KHR_materials_ior, no metallic/roughness factors) and the
// same 10 clips with the defects measured on the real file (dance drifts 0.7 m, flip backs off
// 1.1 m, dive starts 8 m up with the fist 34 cm under the floor, run sinks 13 cm and freezes at
// the loop, idle34 hips at -42 deg, idle feet 2 cm above the floor...).
// Its only purpose: exercise tools/cat-prepare.mjs, the contact sheets and the runtime cat code
// before the real GLB is available in this workspace.
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRMaterialsSpecular, KHRMaterialsIOR } from '@gltf-transform/extensions';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'tools/.work/test-rig.glb');
const FPS = 30;
const TAU = Math.PI * 2;

// ---------- skeleton (cm, armature space, character faces +Z, left = +X) ----------
const BONES = [
  ['mixamorig:Hips', null, [0, 95, 0]],
  ['mixamorig:Spine', 'mixamorig:Hips', [0, 9, 0]],
  ['mixamorig:Spine1', 'mixamorig:Spine', [0, 11, 0]],
  ['mixamorig:Spine2', 'mixamorig:Spine1', [0, 12, 0]],
  ['mixamorig:Neck', 'mixamorig:Spine2', [0, 15, 0]],
  ['mixamorig:Head', 'mixamorig:Neck', [0, 8, 0]],
  ['headfront', 'mixamorig:Head', [0, 14, 18]],
  ['mixamorig:LeftShoulder', 'mixamorig:Spine2', [7, 11, 0]],
  ['mixamorig:LeftArm', 'mixamorig:LeftShoulder', [11, 0, 0]],
  ['mixamorig:LeftForeArm', 'mixamorig:LeftArm', [24, 0, 0]],
  ['mixamorig:LeftHand', 'mixamorig:LeftForeArm', [21, 0, 0]],
  ['mixamorig:RightShoulder', 'mixamorig:Spine2', [-7, 11, 0]],
  ['mixamorig:RightArm', 'mixamorig:RightShoulder', [-11, 0, 0]],
  ['mixamorig:RightForeArm', 'mixamorig:RightArm', [-24, 0, 0]],
  ['mixamorig:RightHand', 'mixamorig:RightForeArm', [-21, 0, 0]],
  ['mixamorig:LeftUpLeg', 'mixamorig:Hips', [9, -5, 0]],
  ['mixamorig:LeftLeg', 'mixamorig:LeftUpLeg', [0, -40, 0]],
  ['mixamorig:LeftFoot', 'mixamorig:LeftLeg', [0, -40, 0]],
  ['mixamorig:LeftToeBase', 'mixamorig:LeftFoot', [0, -6, 10]],
  ['mixamorig:RightUpLeg', 'mixamorig:Hips', [-9, -5, 0]],
  ['mixamorig:RightLeg', 'mixamorig:RightUpLeg', [0, -40, 0]],
  ['mixamorig:RightFoot', 'mixamorig:RightLeg', [0, -40, 0]],
  ['mixamorig:RightToeBase', 'mixamorig:RightFoot', [0, -6, 10]],
];
const boneIndex = new Map(BONES.map((b, i) => [b[0], i]));
const restGlobal = new Map();
for (const [name, parent, off] of BONES) {
  const p = parent ? restGlobal.get(parent) : [0, 0, 0];
  restGlobal.set(name, [p[0] + off[0], p[1] + off[1], p[2] + off[2]]);
}

// ---------- texture swatches (2048 atlas on black, like Meshy) ----------
const SW = {
  white: [236, 240, 246], blue: [38, 104, 214], cyan: [70, 232, 255], visor: [10, 12, 20],
  grey: [120, 130, 146], stripe: [30, 80, 190], logo: [30, 96, 210],
};
const swatchNames = Object.keys(SW);
const TEX = 2048;
const cell = 128;
function swatchRect(name) { // [u0, v0, u1, v1] inside the swatch, with a margin
  const i = swatchNames.indexOf(name);
  const x = 64 + (i % 8) * (cell + 64), y = 64 + Math.floor(i / 8) * (cell + 64);
  return [(x + 16) / TEX, (y + 16) / TEX, (x + cell - 16) / TEX, (y + cell - 16) / TEX];
}
async function makeTexture() {
  const buf = Buffer.alloc(TEX * TEX * 3, 0);
  swatchNames.forEach((n, i) => {
    const x0 = 64 + (i % 8) * (cell + 64), y0 = 64 + Math.floor(i / 8) * (cell + 64);
    for (let y = y0; y < y0 + cell; y++) for (let x = x0; x < x0 + cell; x++) {
      const o = (y * TEX + x) * 3; buf[o] = SW[n][0]; buf[o + 1] = SW[n][1]; buf[o + 2] = SW[n][2];
    }
  });
  return sharp(buf, { raw: { width: TEX, height: TEX, channels: 3 } }).png().toBuffer();
}

// ---------- geometry: rigid boxes per bone ----------
const positions = [], normals = [], uvs = [], joints = [], weights = [], indices = [];
function box(bone, center, size, swatch, basis = null) {
  const c = new Vector3(...center);
  const bx = basis ? basis[0] : new Vector3(1, 0, 0);
  const by = basis ? basis[1] : new Vector3(0, 1, 0);
  const bz = basis ? basis[2] : new Vector3(0, 0, 1);
  const [sx, sy, sz] = size.map((s) => s / 2);
  const faces = [
    [bx, by, bz, sx, sy, sz], [bx.clone().negate(), by, bz.clone().negate(), sx, sy, sz],
    [by, bz, bx, sy, sz, sx], [by.clone().negate(), bz, bx.clone().negate(), sy, sz, sx],
    [bz, bx, by, sz, sx, sy], [bz.clone().negate(), bx, by.clone().negate(), sz, sx, sy],
  ];
  const uv = swatchRect(swatch);
  const j = boneIndex.get(bone);
  for (const [n, u, v, dn, du, dv] of faces) {
    const base = positions.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = c.clone().addScaledVector(n, dn).addScaledVector(u, a * du).addScaledVector(v, b * dv);
      positions.push(p.x, p.y, p.z); normals.push(n.x, n.y, n.z); uvs.push(a < 0 ? uv[0] : uv[2], b < 0 ? uv[1] : uv[3]);
      joints.push(j, 0, 0, 0); weights.push(1, 0, 0, 0);
    }
    // winding so that (u x v) = n faces outward
    const cr = new Vector3().crossVectors(u, v).dot(n) > 0;
    if (cr) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
}
function segment(bone, child, width, depth, swatch) {
  const a = new Vector3(...restGlobal.get(bone));
  const b = new Vector3(...restGlobal.get(child));
  const d = b.clone().sub(a); const len = d.length(); const dir = d.clone().normalize();
  const ref = Math.abs(dir.y) > 0.9 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  const u = new Vector3().crossVectors(ref, dir).normalize();
  const w = new Vector3().crossVectors(dir, u).normalize();
  box(bone, a.clone().addScaledVector(dir, len / 2).toArray(), [width, len, depth], swatch, [u, dir, w]);
}
const g = (n) => restGlobal.get(n);
box('mixamorig:Hips', [0, 92, 0], [30, 16, 22], 'blue');
segment('mixamorig:Spine', 'mixamorig:Spine1', 30, 22, 'white');
segment('mixamorig:Spine1', 'mixamorig:Spine2', 34, 24, 'white');
box('mixamorig:Spine2', [0, g('mixamorig:Spine2')[1] + 8, 0], [38, 16, 26], 'white');
box('mixamorig:Spine2', [0, g('mixamorig:Spine2')[1] + 7, 13.5], [12, 10, 1.5], 'logo');
segment('mixamorig:Neck', 'mixamorig:Head', 10, 10, 'grey');
const hy = g('mixamorig:Head')[1];
box('mixamorig:Head', [0, hy + 15, 2], [40, 30, 32], 'white');
box('mixamorig:Head', [0, hy + 14, 18.5], [30, 14, 2], 'visor');
box('mixamorig:Head', [-7, hy + 15, 19.8], [6, 3, 1], 'cyan');
box('mixamorig:Head', [7, hy + 15, 19.8], [6, 3, 1], 'cyan');
box('mixamorig:Head', [-12, hy + 36, 0], [8, 14, 6], 'blue');
box('mixamorig:Head', [12, hy + 36, 0], [8, 14, 6], 'blue');
for (const s of ['Left', 'Right']) {
  segment(`mixamorig:${s}Shoulder`, `mixamorig:${s}Arm`, 10, 10, 'white');
  segment(`mixamorig:${s}Arm`, `mixamorig:${s}ForeArm`, 10, 10, 'white');
  segment(`mixamorig:${s}ForeArm`, `mixamorig:${s}Hand`, 9, 9, 'blue');
  const hnd = g(`mixamorig:${s}Hand`); const sign = s === 'Left' ? 1 : -1;
  box(`mixamorig:${s}Hand`, [hnd[0] + sign * 5, hnd[1], hnd[2]], [10, 8, 9], 'white');
  segment(`mixamorig:${s}UpLeg`, `mixamorig:${s}Leg`, 14, 14, 'white');
  segment(`mixamorig:${s}Leg`, `mixamorig:${s}Foot`, 11, 11, 'blue');
  const ft = g(`mixamorig:${s}Foot`); const tb = g(`mixamorig:${s}ToeBase`);
  box(`mixamorig:${s}Foot`, [ft[0], 6, 4], [12, 8, 14], 'white');
  box(`mixamorig:${s}ToeBase`, [tb[0], 4.5, tb[2] + 6], [11, 5, 12], 'blue');
}
// tail: no bone, rigid on the hips (like the Meshy model)
for (let i = 0; i < 5; i++) {
  box('mixamorig:Hips', [0, 88 + i * 6, -14 - i * 6], [5, 6, 7], i % 2 ? 'white' : 'stripe');
}

// ---------- animation helpers ----------
const q = (x = 0, y = 0, z = 0) => new Quaternion().setFromEuler(new Euler(x, y, z, 'YXZ'));
const IDLE_YAW = -14 * Math.PI / 180;
const armsDown = { 'mixamorig:LeftArm': [0, 0, -1.2], 'mixamorig:RightArm': [0, 0, 1.2] };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

const CLIPS = {
  'Long_Breathe_and_Look_Around': [11.33, (t) => {
    const b = Math.sin(TAU * t / (11.33 / 3));
    return { hips: [-1.8, 95 + 0.3 * b, 20.5], rot: {
      'mixamorig:Hips': [0, IDLE_YAW, 0], 'mixamorig:Spine': [0.02 * b, 0, 0],
      'mixamorig:Head': [0.05 * Math.sin(TAU * t / 11.33 * 2), 0.35 * Math.sin(TAU * t / 11.33), 0], ...armsDown } };
  }],
  'Alert': [4.04, (t) => {
    const yaw = t < 1 ? lerp(0, 0.9, smooth(t / 0.8)) : t < 2.6 ? lerp(0.9, -0.9, smooth((t - 1.2) / 1.2)) : lerp(-0.9, 0, smooth((t - 2.8) / 1.0));
    return { hips: [-1.8, 92, 20.5], rot: { 'mixamorig:Hips': [0, IDLE_YAW, 0], 'mixamorig:Head': [0, yaw, 0],
      'mixamorig:LeftUpLeg': [-0.2, 0, 0], 'mixamorig:LeftLeg': [0.4, 0, 0], 'mixamorig:LeftFoot': [-0.2, 0, 0],
      'mixamorig:RightUpLeg': [-0.2, 0, 0], 'mixamorig:RightLeg': [0.4, 0, 0], 'mixamorig:RightFoot': [-0.2, 0, 0], ...armsDown } };
  }],
  'Axe_Breathe_and_Look_Around': [11.33, (t) => {
    const b = Math.sin(TAU * t / (11.33 / 3));
    return { hips: [-11.8, 86.5 + 0.3 * b, 20.5], rot: { 'mixamorig:Hips': [0, -42 * Math.PI / 180, 0],
      'mixamorig:Head': [0, 0.3 * Math.sin(TAU * t / 11.33), 0],
      'mixamorig:LeftUpLeg': [-0.3, 0, 0], 'mixamorig:LeftLeg': [0.5, 0, 0], 'mixamorig:LeftFoot': [-0.2, 0, 0],
      'mixamorig:RightUpLeg': [-0.3, 0, 0], 'mixamorig:RightLeg': [0.5, 0, 0], 'mixamorig:RightFoot': [-0.2, 0, 0],
      'mixamorig:LeftArm': [0, -0.9, -0.7], 'mixamorig:RightArm': [0, 0.9, 0.7] } };
  }],
  'Step_Hip_Hop_Dance': [2.67, (t) => {
    const ph = TAU * t / (2.67 / 4);
    return { hips: [-1.8 + 3 * Math.sin(ph / 2), 95 + 4 * Math.abs(Math.sin(ph)), 20.5 + 70 * (t / 2.67)], rot: {
      'mixamorig:Hips': [0, IDLE_YAW + 0.2 * Math.sin(ph / 2), 0],
      'mixamorig:LeftFoot': [0.95 * Math.max(0, Math.sin(ph / 2)), 0, 0],
      'mixamorig:LeftArm': [0, 0, -1.2 + 0.5 * Math.sin(ph)], 'mixamorig:RightArm': [0, 0, 1.2 + 0.5 * Math.sin(ph)] } };
  }],
  'Backflip_and_Hooks': [5.88, (t) => {
    const guard = -46 * Math.PI / 180;
    const yaw = t < 0.9 ? lerp(guard, 0, smooth((t - 0.45) / 0.45)) : t > 3.95 ? lerp(0, guard, smooth((t - 4.2) / 1.2)) : 0;
    const flip = -TAU * smooth((t - 0.9) / 1.4);
    const air = t > 0.9 && t < 2.3 ? Math.sin(Math.PI * (t - 0.9) / 1.4) : 0;
    const crouch = t < 0.9 ? smooth((t - 0.5) / 0.4) : t < 2.3 ? 0 : 1 - smooth((t - 2.3) / 0.5);
    const z = 20.5 - 110 * smooth((t - 0.6) / 1.8);
    const punch = (t > 2.75 && t < 3.95) ? Math.max(0, Math.sin(TAU * (t - 2.75) / 0.6)) : 0;
    const punch2 = (t > 2.75 && t < 3.95) ? Math.max(0, -Math.sin(TAU * (t - 2.75) / 0.6)) : 0;
    return { hips: [-1.8, 90 - 22 * crouch + 60 * air, z], rot: {
      'mixamorig:Hips': [flip, yaw, 0],
      'mixamorig:LeftUpLeg': [-0.9 * crouch - 1.2 * air, 0, 0], 'mixamorig:LeftLeg': [1.6 * crouch + 1.6 * air, 0, 0],
      'mixamorig:RightUpLeg': [-0.9 * crouch - 1.2 * air, 0, 0], 'mixamorig:RightLeg': [1.6 * crouch + 1.6 * air, 0, 0],
      'mixamorig:LeftArm': [0, -1.4 * punch, -0.6], 'mixamorig:RightArm': [0, 1.4 * punch2, 0.6],
      'mixamorig:LeftForeArm': [0, -1.2 * (1 - punch), 0], 'mixamorig:RightForeArm': [0, 1.2 * (1 - punch2), 0] } };
  }],
  'Dive_Down_and_Land_2': [3.17, (t) => {
    const fall = clamp01(t / 0.58);
    const y = t < 0.58 ? 800 - 705 * fall * fall : 95 - 42 * (t < 0.9 ? smooth((t - 0.58) / 0.2) : 1 - smooth((t - 1.8) / 0.6));
    const x = lerp(30, -1.8, smooth(fall)); const z = lerp(-50, 20.5, smooth(fall));
    const over = t < 0.3 ? Math.PI * (1 - t / 0.3) : 0;
    const kneel = t < 0.58 ? 0 : t < 1.8 ? 1 : 1 - smooth((t - 1.8) / 0.6);
    const yaw = lerp(0, 15 * Math.PI / 180, smooth((t - 2.2) / 0.9));
    return { hips: [x, y, z], rot: { 'mixamorig:Hips': [over + 0.5 * kneel, yaw, 0],
      'mixamorig:RightArm': [0, 0, 1.2 + 0.2 * kneel], 'mixamorig:RightForeArm': [0, 0.0, 0.4 * kneel],
      'mixamorig:LeftArm': [0, 0, -1.2],
      'mixamorig:LeftUpLeg': [-1.3 * kneel, 0, 0], 'mixamorig:LeftLeg': [1.9 * kneel, 0, 0],
      'mixamorig:RightUpLeg': [-0.2 * kneel, 0, 0], 'mixamorig:RightLeg': [2.0 * kneel, 0, 0] } };
  }],
  'Running': [0.71, (t) => {
    const f = Math.min(21, Math.round(t * FPS));
    const c = f <= 1 ? 0 : f >= 21 ? 1 : (f - 1) / 20; // frame 0 duplicates frame 1: small freeze at loop
    const ph = TAU * c; const s = Math.sin(ph);
    return { hips: [-1.8, 95 - 13 + 3 * Math.abs(Math.cos(ph)), 20.5], rot: { 'mixamorig:Spine': [0.25, 0, 0],
      'mixamorig:LeftUpLeg': [-0.7 * s, 0, 0], 'mixamorig:RightUpLeg': [0.7 * s, 0, 0],
      'mixamorig:LeftLeg': [0.9 * Math.max(0, -s) + 0.2, 0, 0], 'mixamorig:RightLeg': [0.9 * Math.max(0, s) + 0.2, 0, 0],
      'mixamorig:LeftArm': [0, -0.8, -0.9], 'mixamorig:RightArm': [0, 0.8, 0.9],
      'mixamorig:LeftForeArm': [0, -1.4, 0], 'mixamorig:RightForeArm': [0, 1.4, 0] } };
  }],
  'Walking': [1.0, (t) => ({ hips: [-1.8, 95, 20.5 + 60 * t], rot: { 'mixamorig:LeftUpLeg': [-0.4 * Math.sin(TAU * t), 0, 0], 'mixamorig:RightUpLeg': [0.4 * Math.sin(TAU * t), 0, 0], ...armsDown } })],
  'Alert_Quick_Turn_Right': [2.0, (t) => ({ hips: [-1.8, 95, 20.5], rot: { 'mixamorig:Hips': [0, lerp(IDLE_YAW, Math.PI / 2, smooth(t / 0.5)), 0], ...armsDown } })],
  'Armature|clip0|baselayer': [0, () => ({ hips: [0, 95, 0], rot: {} })],
};

// ---------- document ----------
const doc = new Document();
doc.createBuffer();
const scene = doc.createScene('Scene');
const armature = doc.createNode('Armature').setScale([0.01, 0.01, 0.01]);
scene.addChild(armature);
const nodes = new Map();
for (const [name, parent, off] of BONES) {
  const n = doc.createNode(name).setTranslation(off);
  nodes.set(name, n);
  (parent ? nodes.get(parent) : armature).addChild(n);
}
const ibm = [];
for (const [name] of BONES) {
  const p = restGlobal.get(name);
  // armature-relative (like Blender): jointMatrix = globalJoint(incl. the 0.01 root scale) * IBM
  const m = new Matrix4().makeTranslation(p[0], p[1], p[2]).invert();
  ibm.push(...m.elements);
}
const skin = doc.createSkin('Armature').setSkeleton(nodes.get('mixamorig:Hips'))
  .setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(new Float32Array(ibm)));
for (const [name] of BONES) skin.addJoint(nodes.get(name));

const tex = doc.createTexture('Cyber_Cat_texture').setMimeType('image/png').setImage(await makeTexture()).setURI('texture.png');
const specExt = doc.createExtension(KHRMaterialsSpecular);
const iorExt = doc.createExtension(KHRMaterialsIOR);
const mat = doc.createMaterial('Material_0').setBaseColorTexture(tex).setEmissiveTexture(tex).setEmissiveFactor([1, 1, 1])
  .setDoubleSided(true)
  .setExtension('KHR_materials_specular', specExt.createSpecular().setSpecularFactor(1).setSpecularColorFactor([2, 2, 2]))
  .setExtension('KHR_materials_ior', iorExt.createIOR().setIOR(1.45));
const prim = doc.createPrimitive()
  .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)))
  .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(normals)))
  .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(uvs)))
  .setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(new Uint16Array(joints)))
  .setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(new Float32Array(weights)))
  .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices)))
  .setMaterial(mat);
const meshNode = doc.createNode('Cyber_Cat').setMesh(doc.createMesh('Cyber_Cat').addPrimitive(prim)).setSkin(skin);
armature.addChild(meshNode);

for (const [clipName, [dur, fn]] of Object.entries(CLIPS)) {
  const anim = doc.createAnimation(clipName);
  const n = Math.max(1, Math.round(dur * FPS) + 1);
  const times = new Float32Array(n);
  const perBone = new Map(BONES.map(([name]) => [name, new Float32Array(n * 4)]));
  const hipsT = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : Math.min(dur, i / FPS);
    times[i] = t;
    const pose = fn(t);
    hipsT.set(pose.hips, i * 3);
    for (const [name] of BONES) {
      const r = pose.rot[name] ?? [0, 0, 0];
      perBone.get(name).set(q(...r).toArray(), i * 4);
    }
  }
  const input = doc.createAccessor().setType('SCALAR').setArray(times);
  const addChannel = (node, path, arr, type) => {
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(doc.createAccessor().setType(type).setArray(arr)).setInterpolation('LINEAR');
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
  };
  addChannel(nodes.get('mixamorig:Hips'), 'translation', hipsT, 'VEC3');
  for (const [name] of BONES) addChannel(nodes.get(name), 'rotation', perBone.get(name), 'VEC4');
}

mkdirSync(dirname(OUT), { recursive: true });
const io = new NodeIO().registerExtensions([KHRMaterialsSpecular, KHRMaterialsIOR]);
await io.write(OUT, doc);
console.log(`test rig written: ${OUT} (${positions.length / 3} vertices, ${indices.length / 3} triangles, ${BONES.length} joints, ${Object.keys(CLIPS).length} clips)`);
