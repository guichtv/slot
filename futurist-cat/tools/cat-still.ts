// Renders one still pose of the cat with alpha, at the game lighting (CatStage). Returns a PNG
// data URL + the feet anchor and eyes (headfront) in image px. Used by tools/cat-poses.mjs for the
// 4 fallback poses, the ImageGen reference pose and the Stake FG media.
import { loadThreeBundle, CatStage } from '../src/render/cat/cat-stage';
import { CatRig, type ClipId } from '../src/render/cat/cat-rig';

type StillState = { done: boolean; error: string; png: string; anchor: [number, number]; eyes: [number, number]; heightPx: number };
const w = window as unknown as { __still: StillState };
w.__still = { done: false, error: '', png: '', anchor: [0, 0], eyes: [0, 0], heightPx: 0 };
const q = new URLSearchParams(location.search);
const clip = (q.get('clip') ?? 'idle') as ClipId;
const t = Number(q.get('t') ?? '0');
const H = Number(q.get('h') ?? '1400');
const glb = q.get('glb') ?? '/assets/cat/cat.glb';
const yawDeg = Number(q.get('yaw') ?? '0');

async function main(): Promise<void> {
  const b = await loadThreeBundle();
  const W = Math.round(H * 0.8);
  const stage = new CatStage(b, { width: W, height: H, pixelRatio: 1, antialias: true, preserveDrawingBuffer: true, envSize: 256 });
  const gltf = await stage.loadCat(glb);
  const rig = new CatRig(stage, gltf);
  rig.lookEnabled = false;
  stage.root.rotation.y = (yawDeg * Math.PI) / 180;
  const a = rig.actions.get(clip);
  if (!a) throw new Error(`clip ${clip} absent`);
  rig.stopAll();
  a.reset().setLoop(b.THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play();
  rig.mixer.setTime(Math.min(t, rig.duration(clip) - 1e-5));
  stage.scene.updateMatrixWorld(true);
  // frame the pose itself (not the idle box) so nothing is cut
  rig.mesh.computeBoundingBox();
  const box = rig.mesh.boundingBox!.clone().applyMatrix4(rig.mesh.matrixWorld);
  const cam = stage.camera;
  const hips = rig.hips.getWorldPosition(new b.THREE.Vector3());
  const top = Math.max(box.max.y, rig.catHeight), bottom = Math.min(0, box.min.y);
  const hgt = (top - bottom) / 0.86;
  const dist = hgt / (2 * Math.tan((cam.fov * Math.PI) / 360));
  const cy = (top + bottom) / 2;
  cam.position.set(hips.x, cy + 0.05 * hgt, hips.z + dist);
  cam.lookAt(hips.x, cy, hips.z);
  cam.updateMatrixWorld(true);
  stage.render();
  const proj = (v: import('three').Vector3): [number, number] => { const p = v.clone().project(cam); return [((p.x + 1) / 2) * W, ((1 - p.y) / 2) * H]; };
  const anchor = proj(new b.THREE.Vector3(hips.x, 0, hips.z));
  const eyes = rig.headfront ? proj(rig.headfront.getWorldPosition(new b.THREE.Vector3())) : [W / 2, H * 0.2] as [number, number];
  const heightPx = anchor[1] - proj(new b.THREE.Vector3(hips.x, rig.catHeight, hips.z))[1];
  w.__still = { done: true, error: '', png: stage.canvas.toDataURL('image/png'), anchor, eyes, heightPx };
}
main().catch((e: unknown) => { w.__still = { done: true, error: String((e as Error)?.stack ?? e), png: '', anchor: [0, 0], eyes: [0, 0], heightPx: 0 }; });
