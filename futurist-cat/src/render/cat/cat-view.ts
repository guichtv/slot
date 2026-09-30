// Pixi side of the cat (A2). One Sprite shows the three.js canvas; one contact shadow; fallback
// still poses (WebP rendered from the GLB) hold the screen while three loads, and replace the 3D
// cat if WebGL2 is missing, the GLB fails or takes > 8 s, the game stays < 40 fps for 3 s, or
// the context is lost and not restored. Update order inside one tick:
//   director.update(dt) -> mixer.update(dt) -> three render -> texture.source.update() -> Pixi render.
import { Container, Sprite, Texture, Graphics, CanvasSource, Assets, Point } from 'pixi.js';
import type { CatStage, ThreeBundle } from './cat-stage';
import type { CatRig } from './cat-rig';
import type { CatDirector, CatMoment, Background } from './cat-director';

export type CatMode = 'none' | 'still' | '3d';
export type StillPose = 'rest' | 'alert' | 'win' | 'bigwin';

export interface StillsManifest {
  /** anchor = feet (ground) in image px; eyes = headfront in image px; heightPx = cat height in image px */
  poses: Record<StillPose, { file: string; anchor: [number, number]; eyes: [number, number] }>;
  heightPx: number;
}

export interface CatViewOptions {
  /** cat zone in world units (the three canvas covers exactly this box around the cat) */
  zoneW: number;
  zoneH: number;
  /** cat height (feet to ears) in world units at rest */
  catHeight: number;
  glbUrl: string;
  stillsUrl: string | null;
  mobile: boolean;
  rand: () => number;
}

export class CatView {
  readonly root = new Container({ label: 'cat' });
  private readonly shadow = new Graphics();
  private readonly sprite = new Sprite();
  private readonly still = new Sprite();
  private stills: StillsManifest | null = null;
  private stillTextures = new Map<StillPose, Texture>();
  mode: CatMode = 'none';
  stage: CatStage | null = null;
  rig: CatRig | null = null;
  director: CatDirector | null = null;
  private source: CanvasSource | null = null;
  private renderScale = 1;
  private readonly t0 = performance.now();
  /** ms spent in mixer + three render + upload, last frame */
  lastCatMs = 0;
  private lowFpsFor = 0;
  failedReason = '';
  private breathe = 0;
  private stillPose: StillPose = 'rest';
  private stillFade = 1;

  constructor(private readonly o: CatViewOptions) {
    this.root.addChild(this.shadow, this.still, this.sprite);
    this.sprite.visible = false;
    this.still.visible = false;
    this.drawShadow(1);
  }

  /** contact shadow: a soft ellipse under the feet (effect primitive, tinted by the neon rim) */
  private drawShadow(k: number): void {
    const w = this.o.catHeight * 0.52 * k, h = this.o.catHeight * 0.075 * k;
    this.shadow.clear();
    for (let i = 6; i >= 1; i--) {
      const f = i / 6;
      this.shadow.ellipse(0, 0, w * f, h * f).fill({ color: 0x02060c, alpha: 0.11 * (1.15 - f) });
    }
    this.shadow.ellipse(w * 0.08, 0, w * 0.55, h * 0.45).fill({ color: 0x00d8ff, alpha: 0.05 });
  }

  async loadStills(): Promise<boolean> {
    if (!this.o.stillsUrl) return false;
    try {
      const res = await fetch(this.o.stillsUrl);
      if (!res.ok) return false;
      const m = (await res.json()) as StillsManifest;
      const base = this.o.stillsUrl.replace(/[^/]+$/, '');
      for (const [k, p] of Object.entries(m.poses) as [StillPose, StillsManifest['poses'][StillPose]][]) {
        this.stillTextures.set(k, await Assets.load<Texture>(base + p.file));
      }
      this.stills = m;
      this.showStill('rest');
      return true;
    } catch { return false; }
  }

  showStill(p: StillPose): void {
    if (!this.stills) return;
    const tex = this.stillTextures.get(p) ?? this.stillTextures.get('rest');
    if (!tex) return;
    const def = this.stills.poses[p] ?? this.stills.poses.rest;
    this.stillPose = p;
    this.still.texture = tex;
    const s = this.o.catHeight / this.stills.heightPx;
    this.still.scale.set(s);
    this.still.pivot.set(def.anchor[0], def.anchor[1]);
    if (this.mode !== '3d') { this.mode = 'still'; this.still.visible = true; }
  }

  /** Called once three.js + the GLB are ready. */
  async init3d(bundle: ThreeBundle, screenScale: number, pixelRatio: number, timeoutMs = 8000): Promise<boolean> {
    try {
      const probe = document.createElement('canvas');
      if (!probe.getContext('webgl2')) throw new Error('WebGL2 absent');
      const { CatStage } = await import('./cat-stage');
      const { CatRig } = await import('./cat-rig');
      const { CatDirector } = await import('./cat-director');
      this.renderScale = screenScale;
      const stage = new CatStage(bundle, {
        width: Math.round(this.o.zoneW * screenScale), height: Math.round(this.o.zoneH * screenScale),
        pixelRatio, antialias: (window.devicePixelRatio || 1) < 2,
        // required: Chrome copies the presented buffer of an off-DOM canvas, which is empty without it
        preserveDrawingBuffer: true,
      });
      const gltf = await Promise.race([
        stage.loadCat(this.o.glbUrl),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('GLB > 8 s')), timeoutMs)),
      ]);
      const rig = new CatRig(stage, gltf);
      this.stage = stage; this.rig = rig;
      this.director = new CatDirector(rig, this.o.rand);
      this.director.onStill = (p) => this.showStill(p);
      stage.onContextLost = () => { this.fallbackTo('rest', 'contexte WebGL perdu'); };
      stage.onContextRestored = () => { if (this.stage) { this.useSource(); this.mode = '3d'; this.sprite.visible = true; this.still.visible = false; } };
      this.useSource();
      return true;
    } catch (e) {
      this.failedReason = String((e as Error).message ?? e);
      return false;
    }
  }

  private useSource(): void {
    if (!this.stage) return;
    this.source?.destroy();
    this.source = new CanvasSource({ resource: this.stage.canvas, resolution: this.stage.pixelRatio * this.renderScale, alphaMode: 'premultiply-alpha-on-upload' });
    this.sprite.texture = new Texture({ source: this.source });
  }

  /** Switch from the still pose to the live 3D cat (cross-fade handled by the caller if wanted). */
  go3d(bg: Background = 'idle'): void {
    if (!this.rig || !this.director) return;
    this.director.start(bg);
    this.mode = '3d';
    this.sprite.visible = true;
    this.still.visible = false;
  }

  fallbackTo(p: StillPose, reason: string): void {
    this.failedReason = reason;
    this.mode = this.stills ? 'still' : 'none';
    this.sprite.visible = false;
    this.showStill(p);
    this.still.visible = !!this.stills;
  }

  request(m: CatMoment): void {
    if (this.mode === '3d') this.director?.request(m);
    else if (this.stills) {
      const pose: StillPose | null = m === 'smallWin' ? 'win' : (m === 'tier1' || m === 'tierHigh' || m === 'maxWin') ? 'bigwin'
        : (m === 'laser' || m === 'anticipation' || m === 'scatterLand') ? 'alert' : (m === 'winEnd' || m === 'nothing') ? 'rest' : null;
      if (pose) this.showStill(pose);
    }
  }

  setTurbo(on: boolean): void { if (this.director) this.director.turbo = on; }
  setReduced(on: boolean): void {
    if (!this.director) return;
    this.director.reduced = on;
    if (on) this.director.toBackground(0.3);
  }
  setBackground(bg: Background): void { this.director?.setBackground(bg); }

  /** Resize the three canvas when the screen scale changes (never every frame). */
  resize(screenScale: number, pixelRatio: number): void {
    if (!this.stage) return;
    if (Math.abs(screenScale - this.renderScale) < 0.02 && pixelRatio === this.stage.pixelRatio) return;
    this.renderScale = screenScale;
    this.stage.resize(Math.round(this.o.zoneW * screenScale), Math.round(this.o.zoneH * screenScale), pixelRatio);
    this.rig?.frame();
    this.director?.start(this.director.background, { randomStart: true });
    this.useSource();
  }

  /** Global point of the eyes (headfront), for FX (laser origin, eye flash). */
  eyesGlobal(out = new Point()): Point {
    if (this.mode === '3d' && this.rig) {
      const p = this.rig.headfrontPx();
      if (p) return this.sprite.toGlobal(new Point(p.x / this.renderScale, p.y / this.renderScale), out);
    }
    if (this.stills) {
      const d = this.stills.poses[this.stillPose] ?? this.stills.poses.rest;
      return this.still.toGlobal(new Point(d.eyes[0], d.eyes[1]), out);
    }
    return this.root.toGlobal(new Point(0, -this.o.catHeight * 0.85), out);
  }

  /** Make the head follow a global point (grid, laser dot, scatter). null = free. */
  lookAtGlobal(p: Point | null): void {
    if (!this.rig) return;
    if (!p) { this.rig.clearLook(); return; }
    const local = this.sprite.toLocal(p);
    this.rig.lookAtCanvasPx(local.x * this.renderScale, local.y * this.renderScale);
  }
  set lookEnabled(v: boolean) { if (this.rig) this.rig.lookEnabled = v; }

  /** One tick: dt from the game clock (seconds, already clamped). fps = measured game fps. */
  update(dt: number, fps: number): void {
    if (this.mode === '3d' && this.stage && this.rig && this.director && !this.stage.contextLost) {
      const a = performance.now();
      this.director.update(dt);
      this.rig.update(dt);
      this.stage.render();
      this.source?.update();
      this.lastCatMs = performance.now() - a;
      // sprite placement: ground stays at the container origin whatever the camera follow
      const k = 1 / this.renderScale;
      this.sprite.position.set(-this.rig.groundPx.x * k, -(this.rig.groundPx.y + this.rig.follow * this.rig.pxPerMeter) * k);
      const lift = Math.max(0, this.rig.follow);
      const sk = Math.max(0.35, 1 - lift / 3);
      this.shadow.scale.set(sk); this.shadow.alpha = Math.max(0.2, 1 - lift / 4);
      // low fps guard (only after the first seconds)
      if (performance.now() - this.t0 > 5000) {
        this.lowFpsFor = fps < 40 ? this.lowFpsFor + dt : 0;
        if (this.lowFpsFor > 3) this.fallbackTo('rest', 'fps < 40 pendant 3 s');
      }
    } else if (this.mode === 'still') {
      // still pose alive by tweens: breathing + small settle when the pose changes
      this.breathe += dt;
      const s = 1 + Math.sin(this.breathe * 1.7) * 0.008;
      this.still.scale.y = (this.o.catHeight / (this.stills?.heightPx ?? 1)) * s;
      this.stillFade = Math.min(1, this.stillFade + dt * 4);
    }
  }

  gpuEstimateBytes(): number { return this.stage?.estimateGpuBytes(1) ?? 0; }
}
