// One AnimationMixer, actions created once, cross-fades, procedural head look, framing and
// projections (headfront -> screen, screen -> look target). No game logic here.
import type * as T from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CatStage } from './cat-stage';

export const CLIP_IDS = ['idle', 'alert', 'idle34', 'dance', 'hop', 'flip', 'hooks', 'dive', 'run'] as const;
export type ClipId = (typeof CLIP_IDS)[number];
export const LOOPING: ReadonlySet<ClipId> = new Set<ClipId>(['idle', 'idle34', 'dance', 'run']);

export interface PlayOptions {
  fade: number; // seconds
  timeScale?: number;
  startAt?: number; // seconds into the clip
}

const LOOK_LIMIT = (20 * Math.PI) / 180;

export class CatRig {
  readonly THREE: import('./cat-stage').ThreeMod;
  readonly mixer: T.AnimationMixer;
  readonly actions = new Map<ClipId, T.AnimationAction>();
  readonly clips = new Map<ClipId, T.AnimationClip>();
  current: ClipId | null = null;
  private currentAction: T.AnimationAction | null = null;
  readonly mesh: T.SkinnedMesh;
  readonly hips: T.Object3D;
  readonly head: T.Object3D | null;
  readonly headfront: T.Object3D | null;
  private readonly forwardLocal: T.Vector3;
  private readonly upLocal: T.Vector3;
  restHipsY = 0;
  catHeight = 1.5;
  /** canvas px of the ground point under the hips at rest, with camera follow applied */
  groundPx = { x: 0, y: 0 };
  /** vertical camera follow (m) applied this frame: the sprite must move by -follow * pxPerMeter */
  follow = 0;
  pxPerMeter = 1;
  private baseCamY = 0;
  private baseLookY = 0;
  private aimX = 0;
  private aimZ = 0;
  lookTarget: T.Vector3 | null = null;
  lookEnabled = true;
  private lookYaw = 0;
  private lookPitch = 0;
  private lookAmount = 0;
  private tmpV = { a: null as unknown as T.Vector3, b: null as unknown as T.Vector3, c: null as unknown as T.Vector3 };
  private tmpQ: T.Quaternion;
  private tmpQ2: T.Quaternion;

  constructor(private readonly stage: CatStage, gltf: GLTF) {
    const THREE = (this.THREE = stage.THREE);
    this.tmpV = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() };
    this.tmpQ = new THREE.Quaternion();
    this.tmpQ2 = new THREE.Quaternion();
    let mesh: T.SkinnedMesh | null = null;
    gltf.scene.traverse((o) => { if ((o as T.SkinnedMesh).isSkinnedMesh && !mesh) mesh = o as T.SkinnedMesh; });
    if (!mesh) throw new Error('cat: no skinned mesh');
    this.mesh = mesh;
    const byName = (n: string) => gltf.scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(n)) ?? null;
    const hips = byName('mixamorig:Hips');
    if (!hips) throw new Error('cat: mixamorigHips not found');
    this.hips = hips;
    this.head = byName('mixamorig:Head');
    this.headfront = byName('headfront');
    this.upLocal = new THREE.Vector3(0, 1, 0);
    this.forwardLocal = new THREE.Vector3(0, 0, 1);
    if (this.head && this.headfront && this.headfront.parent === this.head) {
      const f = this.headfront.position.clone(); f.y = 0;
      if (f.lengthSq() > 1e-6) this.forwardLocal.copy(f.normalize());
    }
    this.mixer = new THREE.AnimationMixer(gltf.scene);
    for (const clip of gltf.animations) {
      const id = clip.name as ClipId;
      if (!(CLIP_IDS as readonly string[]).includes(id)) continue;
      this.clips.set(id, clip);
      const a = this.mixer.clipAction(clip);
      if (LOOPING.has(id)) a.setLoop(THREE.LoopRepeat, Infinity);
      else { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions.set(id, a);
    }
    this.frame();
  }

  has(id: ClipId): boolean { return this.actions.has(id); }
  duration(id: ClipId): number { return this.clips.get(id)?.duration ?? 0; }

  /** Poses idle frame 0, measures the cat and places the fixed three camera (zooms happen in Pixi). */
  frame(): void {
    const THREE = this.THREE;
    const idle = this.actions.get('idle');
    this.mixer.stopAllAction();
    if (idle) { idle.reset().play(); this.mixer.setTime(0); }
    this.stage.scene.updateMatrixWorld(true);
    this.mesh.computeBoundingBox();
    const box = this.mesh.boundingBox!.clone().applyMatrix4(this.mesh.matrixWorld);
    this.catHeight = Math.max(0.3, box.max.y - Math.min(0, box.min.y));
    this.restHipsY = this.hips.getWorldPosition(this.tmpV.a).y;
    const hipsWorld = this.tmpV.a.clone();
    const cam = this.stage.camera;
    const fov = (cam.fov * Math.PI) / 180;
    const visibleH = this.catHeight / 0.62;
    const dist = visibleH / (2 * Math.tan(fov / 2));
    this.baseCamY = this.catHeight * 0.5;
    this.baseLookY = this.catHeight * 0.47;
    cam.position.set(hipsWorld.x, this.baseCamY, hipsWorld.z + dist);
    this.aimX = hipsWorld.x; this.aimZ = hipsWorld.z;
    cam.lookAt(hipsWorld.x, this.baseLookY, hipsWorld.z);
    cam.updateMatrixWorld(true);
    this.pxPerMeter = this.stage.height / visibleH; // CSS px per metre at the cat's depth
    const g = this.project(new THREE.Vector3(hipsWorld.x, 0, hipsWorld.z));
    this.groundPx = g;
    if (idle) idle.stop();
    this.current = null; this.currentAction = null;
  }

  /** current -> next cross-fade (section 4.6). */
  play(id: ClipId, o: PlayOptions): boolean {
    const next = this.actions.get(id);
    if (!next) return false;
    const prev = this.currentAction;
    if (prev === next && LOOPING.has(id)) { next.setEffectiveTimeScale(o.timeScale ?? 1); return true; }
    next.reset().setEffectiveTimeScale(o.timeScale ?? 1).setEffectiveWeight(1).play();
    if (o.startAt) next.time = o.startAt % Math.max(0.001, next.getClip().duration);
    if (prev && prev !== next && o.fade > 0) prev.crossFadeTo(next, o.fade, false);
    else if (prev && prev !== next) prev.stop();
    this.currentAction = next;
    this.current = id;
    return true;
  }

  stopAll(): void { this.mixer.stopAllAction(); this.current = null; this.currentAction = null; }

  update(dt: number): void {
    this.mixer.update(dt);
    this.stage.scene.updateMatrixWorld(true);
    this.applyLook(dt);
    // vertical camera follow: the cat stays inside its canvas whatever its height (dive, salto)
    const hy = this.hips.getWorldPosition(this.tmpV.a).y;
    this.follow = hy - this.restHipsY;
    const cam = this.stage.camera;
    cam.position.y = this.baseCamY + this.follow;
    cam.lookAt(this.aimX, this.baseLookY + this.follow, this.aimZ);
    cam.updateMatrixWorld(true);
  }

  private applyLook(dt: number): void {
    const head = this.head;
    if (!head) return;
    const want = this.lookEnabled && this.lookTarget ? 1 : 0;
    const k = 1 - Math.exp(-dt * 7);
    this.lookAmount += (want - this.lookAmount) * k;
    let yaw = 0, pitch = 0;
    if (this.lookTarget) {
      const d = head.worldToLocal(this.tmpV.b.copy(this.lookTarget)).normalize();
      const f = this.forwardLocal, up = this.upLocal;
      const right = this.tmpV.c.crossVectors(up, f).normalize();
      const x = d.dot(right), y = d.dot(up), z = d.dot(f);
      yaw = Math.max(-LOOK_LIMIT, Math.min(LOOK_LIMIT, Math.atan2(x, z)));
      pitch = Math.max(-LOOK_LIMIT, Math.min(LOOK_LIMIT, -Math.atan2(y, Math.hypot(x, z))));
    }
    this.lookYaw += (yaw - this.lookYaw) * k;
    this.lookPitch += (pitch - this.lookPitch) * k;
    if (this.lookAmount < 1e-3) return;
    const right = this.tmpV.c.crossVectors(this.upLocal, this.forwardLocal).normalize();
    this.tmpQ.setFromAxisAngle(this.upLocal, this.lookYaw * this.lookAmount);
    this.tmpQ2.setFromAxisAngle(right, this.lookPitch * this.lookAmount);
    head.quaternion.multiply(this.tmpQ).multiply(this.tmpQ2);
    head.updateMatrixWorld(true);
  }

  /** world -> canvas CSS px */
  project(v: T.Vector3): { x: number; y: number } {
    const p = v.clone().project(this.stage.camera);
    return { x: ((p.x + 1) / 2) * this.stage.width, y: ((1 - p.y) / 2) * this.stage.height };
  }

  /** headfront (eyes) in canvas CSS px, camera follow included */
  headfrontPx(): { x: number; y: number } | null {
    if (!this.headfront) return null;
    return this.project(this.headfront.getWorldPosition(this.tmpV.a));
  }

  /** canvas CSS px -> world point on the vertical plane through the head (for the look target) */
  lookAtCanvasPx(x: number, y: number): void {
    const THREE = this.THREE;
    const cam = this.stage.camera;
    const ndc = new THREE.Vector3((x / this.stage.width) * 2 - 1, 1 - (y / this.stage.height) * 2, 0.5).unproject(cam);
    const dir = ndc.sub(cam.position).normalize();
    const headZ = this.head ? this.head.getWorldPosition(this.tmpV.a).z : 0;
    const t = (headZ + 0.6 - cam.position.z) / dir.z; // plane slightly in front of the face
    this.lookTarget = cam.position.clone().addScaledVector(dir, t);
  }
  clearLook(): void { this.lookTarget = null; }
}
