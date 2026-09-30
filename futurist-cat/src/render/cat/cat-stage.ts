// three.js side of the cat (technique A2: three renders into an off-DOM canvas limited to the
// cat zone; Pixi shows that canvas as a texture). Loaded with import() only, never in the
// initial bundle. The same stage (lights, environment, tone mapping, material tweaks) is used by
// the game, tools/cat-sheet.html and tools/cat-poses, so every render of the cat matches.
import type * as T from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Named imports only: three is tree-shaken to what the cat uses (budget: three + loaders <= 200 KB gzip).
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, PMREMGenerator, DirectionalLight, SRGBColorSpace, NeutralToneMapping,
  AnimationMixer, LoopOnce, LoopRepeat, Vector3, Quaternion, PropertyBinding,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const THREE_SUBSET = { WebGLRenderer, Scene, PerspectiveCamera, Group, PMREMGenerator, DirectionalLight, SRGBColorSpace, NeutralToneMapping, AnimationMixer, LoopOnce, LoopRepeat, Vector3, Quaternion, PropertyBinding };
export type ThreeMod = typeof THREE_SUBSET;
export const bundle = { THREE: THREE_SUBSET, GLTFLoader, MeshoptDecoder, RoomEnvironment };
export type ThreeBundle = typeof bundle;
/** kept for the tools pages */
export function loadThreeBundle(): Promise<ThreeBundle> { return Promise.resolve(bundle); }

export interface CatStageOptions {
  width: number; // CSS px of the cat zone
  height: number;
  pixelRatio: number;
  antialias: boolean;
  canvas?: HTMLCanvasElement;
  preserveDrawingBuffer?: boolean;
  envSize?: number;
}

/** Lighting described in every ImageGen brief: key top-left ~45 deg, cyan rim back-right, soft shadows. */
export const CAT_LIGHT = {
  key: { color: 0xfff6ec, intensity: 2.4, pos: [-2.6, 4.2, 3.4] as const },
  rim: { color: 0x4fe8ff, intensity: 3.2, pos: [2.8, 2.4, -3.2] as const },
  fill: { color: 0x8fb4ff, intensity: 0.35, pos: [2.5, 0.8, 3.0] as const },
  envIntensity: 0.75,
  exposure: 1.02,
};

export class CatStage {
  readonly THREE: ThreeMod;
  readonly canvas: HTMLCanvasElement;
  readonly renderer: T.WebGLRenderer;
  readonly scene: T.Scene;
  readonly camera: T.PerspectiveCamera;
  readonly root: T.Group; // cat container (never mirrored: the "C" logo must read correctly)
  private envTarget: T.WebGLRenderTarget | null = null;
  width: number;
  height: number;
  pixelRatio: number;
  readonly antialias: boolean;
  private lost = false;
  onContextLost: (() => void) | null = null;
  onContextRestored: (() => void) | null = null;

  constructor(private readonly b: ThreeBundle, opts: CatStageOptions) {
    const THREE = (this.THREE = b.THREE);
    this.canvas = opts.canvas ?? document.createElement('canvas');
    this.width = opts.width; this.height = opts.height; this.pixelRatio = opts.pixelRatio; this.antialias = opts.antialias;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, alpha: true, antialias: opts.antialias, premultipliedAlpha: true,
      powerPreference: 'high-performance', preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false, stencil: false,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(opts.pixelRatio);
    this.renderer.setSize(opts.width, opts.height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = CAT_LIGHT.exposure;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(24, opts.width / opts.height, 0.05, 60);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.buildLights(opts.envSize ?? 128);
    this.canvas.addEventListener('webglcontextlost', this.handleLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.handleRestored, false);
  }

  private buildLights(envSize: number): void {
    const THREE = this.THREE;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new this.b.RoomEnvironment();
    this.envTarget = pmrem.fromScene(room, 0.04, 0.1, 100, { size: envSize });
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = CAT_LIGHT.envIntensity;
    room.dispose?.();
    pmrem.dispose();
    for (const l of [CAT_LIGHT.key, CAT_LIGHT.rim, CAT_LIGHT.fill]) {
      const d = new THREE.DirectionalLight(l.color, l.intensity);
      d.position.set(l.pos[0], l.pos[1], l.pos[2]);
      this.scene.add(d);
    }
  }

  private handleLost = (e: Event): void => { e.preventDefault(); this.lost = true; this.onContextLost?.(); };
  private handleRestored = (): void => {
    this.lost = false;
    // three re-initialises its GL state on restore; the environment map is a render target and must be rebuilt
    this.envTarget?.dispose();
    this.buildLights(128);
    this.onContextRestored?.();
  };
  get contextLost(): boolean { return this.lost; }

  async loadCat(url: string, onProgress?: (p: number) => void): Promise<GLTF> {
    const loader = new this.b.GLTFLoader();
    loader.setMeshoptDecoder(this.b.MeshoptDecoder);
    const gltf = await loader.loadAsync(url, (ev) => { if (ev.lengthComputable && onProgress) onProgress(ev.loaded / ev.total); });
    gltf.scene.traverse((o) => {
      const m = o as T.SkinnedMesh;
      if (m.isMesh) {
        m.frustumCulled = false; // otherwise dive (starts far above its bind-pose box) disappears
        const mat = m.material as T.MeshStandardMaterial;
        if (mat && mat.isMeshStandardMaterial) {
          mat.envMapIntensity = 1.0;
          if (mat.map) mat.map.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
        }
      }
    });
    this.root.add(gltf.scene);
    return gltf;
  }

  resize(width: number, height: number, pixelRatio = this.pixelRatio): void {
    if (width === this.width && height === this.height && pixelRatio === this.pixelRatio) return;
    this.width = width; this.height = height; this.pixelRatio = pixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    if (this.lost) return;
    this.renderer.render(this.scene, this.camera);
  }

  /** Estimated GPU memory (bytes): textures x4 x1.33 (mips) + canvas buffers (x4 with MSAA) + env map. */
  estimateGpuBytes(extraCopies = 1): number {
    let tex = 0;
    this.scene.traverse((o) => {
      const m = (o as T.Mesh).material as T.MeshStandardMaterial | undefined;
      if (!m || !(o as T.Mesh).isMesh) return;
      for (const t of [m.map, m.emissiveMap, m.normalMap, m.roughnessMap, m.metalnessMap]) {
        const img = t?.image as { width?: number; height?: number } | undefined;
        if (img?.width && img.height) tex += img.width * img.height * 4 * 1.33;
      }
    });
    const env = this.envTarget ? this.envTarget.width * this.envTarget.height * 8 : 0; // half-float RGBA
    const px = this.canvas.width * this.canvas.height;
    const color = px * 4, depth = px * 4;
    const msaa = this.antialias ? 4 : 1;
    const pixiCopy = px * 4 * extraCopies;
    return Math.round(tex + env + (color + depth) * msaa + pixiCopy);
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.handleLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored);
    this.envTarget?.dispose();
    this.renderer.dispose();
  }
}
