// Section 4.3 proof: a stand-in grid (tool page only) + the cat in A2 (three canvas -> Pixi
// texture), idle loop. Measures frame times, cat cost (mixer + three + upload) and the
// canvas -> texture copy cost (with and without upload, gl.finish() to include GPU work).
// Results in window.__proof; tools/cat-proof.mjs drives it at 1440x900 and 390x844 DPR 3, CPU x4.
import { Application, Graphics, Container } from 'pixi.js';
import { loadThreeBundle } from '../src/render/cat/cat-stage';
import { CatView } from '../src/render/cat/cat-view';

type Proof = Record<string, unknown> & { done: boolean; error?: string };
const w = window as unknown as { __proof: Proof };
w.__proof = { done: false };
const params = new URLSearchParams(location.search);
const glb = params.get('glb') ?? '/assets/cat/cat.glb';
const seconds = Number(params.get('seconds') ?? '6');
const hud = document.getElementById('hud')!;

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)]! : 0; };
const p95 = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * 0.95)]! : 0; };

async function main(): Promise<void> {
  const app = new Application();
  const mobile = Math.min(innerWidth, innerHeight) < 600;
  await app.init({ resizeTo: window, antialias: false, background: 0x0b1220, preference: 'webgl', autoStart: false, resolution: Math.min(devicePixelRatio, mobile ? 1.5 : 2), autoDensity: true });
  document.body.appendChild(app.canvas);
  // design space 1920x1080 (desktop) / 1080x1920 (portrait)
  const portrait = innerHeight > innerWidth;
  const DW = portrait ? 1080 : 1920, DH = portrait ? 1920 : 1080;
  const scale = Math.min(innerWidth / DW, innerHeight / DH);
  const world = new Container();
  world.scale.set(scale);
  world.position.set((innerWidth - DW * scale) / 2, (innerHeight - DH * scale) / 2);
  app.stage.addChild(world);
  const grid = new Graphics();
  const gx = portrait ? 90 : 360, gy = portrait ? 260 : 140, cw = portrait ? 180 : 190, ch = portrait ? 180 : 190;
  for (let c = 0; c < 5; c++) for (let r = 0; r < 4; r++) grid.roundRect(gx + c * (cw + 8), gy + r * (ch + 8), cw, ch, 18).fill({ color: 0x14243a });
  world.addChild(grid);
  // light panel behind part of the cat: dark fringes on the alpha edge would show here
  const light = new Graphics().rect(portrait ? 600 : 1440, portrait ? 1100 : 380, 400, 420).fill({ color: 0xe9eef5 });
  world.addChild(light);
  const catH = portrait ? 560 : 640;
  const view = new CatView({ zoneW: catH * 0.8, zoneH: catH / 0.62, catHeight: catH, glbUrl: glb, stillsUrl: null, mobile, rand: Math.random });
  view.root.position.set(portrait ? 820 : 1640, portrait ? 1760 : 960);
  world.addChild(view.root);

  const t0 = performance.now();
  const bundle = await loadThreeBundle();
  const pr = Math.min(devicePixelRatio, mobile ? 1.5 : 2);
  const ok = await view.init3d(bundle, scale, pr);
  if (!ok) throw new Error(view.failedReason);
  const texAfterLoad = view.stage!.renderer.info.memory.textures;
  const loadMs = performance.now() - t0;
  view.go3d('idle');
  (window as unknown as { __view: CatView }).__view = view;
  const gl = (app.renderer as unknown as { gl: WebGL2RenderingContext }).gl;
  const tgl = view.stage!.renderer.getContext();

  // phase 1: copy cost (alternate with / without upload, synchronised)
  const withUp: number[] = [], without: number[] = [], threeMs: number[] = [], mixerMs: number[] = [];
  for (let i = 0; i < 90; i++) {
    const a0 = performance.now();
    view.rig!.update(1 / 60);
    const a1 = performance.now();
    view.stage!.render(); tgl.finish();
    const a2 = performance.now();
    mixerMs.push(a1 - a0); threeMs.push(a2 - a1);
    const up = i % 2 === 0;
    const b0 = performance.now();
    if (up) (view as unknown as { source: { update(): void } }).source.update();
    app.renderer.render(app.stage); gl.finish();
    (up ? withUp : without).push(performance.now() - b0);
    await new Promise((r) => requestAnimationFrame(r));
  }
  const copyMs = Math.max(0, median(withUp) - median(without));

  // phase 2: normal loop
  const frames: number[] = [], catMs: number[] = [];
  let last = performance.now();
  const end = last + seconds * 1000;
  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      frames.push(now - last); last = now;
      view.update(dt, frames.length > 5 ? 1000 / median(frames.slice(-30)) : 60);
      catMs.push(view.lastCatMs);
      app.renderer.render(app.stage);
      if (now < end) requestAnimationFrame(tick); else resolve();
      hud.textContent = `fps ${(1000 / median(frames.slice(-60))).toFixed(1)}  chat ${view.lastCatMs.toFixed(2)} ms`;
    };
    requestAnimationFrame(tick);
  });
  frames.shift();
  const info = view.stage!.renderer.info;
  const glDbg = tgl.getExtension('WEBGL_debug_renderer_info');
  w.__proof = {
    done: true, viewport: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
    gpu: glDbg ? tgl.getParameter(glDbg.UNMASKED_RENDERER_WEBGL) : 'n/a',
    loadMs: Math.round(loadMs),
    fpsMedian: +(1000 / median(frames)).toFixed(1), frameP95: +p95(frames).toFixed(1), frameMax: +Math.max(...frames).toFixed(1),
    over50ms: frames.filter((f) => f > 50).length, frames: frames.length,
    catMsMedian: +median(catMs).toFixed(2), catMsP95: +p95(catMs).toFixed(2),
    mixerMs: +median(mixerMs).toFixed(2), threeRenderMs: +median(threeMs).toFixed(2), copyMs: +copyMs.toFixed(2),
    drawCalls: info.render.calls, textures: info.memory.textures, texturesAfterLoad: texAfterLoad, geometries: info.memory.geometries,
    textureList: (() => { const l: string[] = []; view.stage!.scene.traverse((o) => { const m = (o as unknown as { material?: Record<string, { image?: { width: number; height: number } } | null> }).material; if (m) for (const k of ['map', 'emissiveMap', 'normalMap']) { const t = m[k]; if (t?.image) l.push(`${k} ${t.image.width}x${t.image.height}`); } }); const env = view.stage!.scene.environment as unknown as { image?: { width: number; height: number } } | null; if (env?.image) l.push(`env ${env.image.width}x${env.image.height}`); const sk = view.rig!.mesh.skeleton as unknown as { boneTexture?: { image: { width: number } } | null }; if (sk.boneTexture) l.push(`bones ${sk.boneTexture.image.width}px (interne three)`); return l; })(),
    gpuMB: +(view.gpuEstimateBytes() / 1048576).toFixed(1),
    canvas: `${view.stage!.canvas.width}x${view.stage!.canvas.height}`,
  };
}
main().catch((e: unknown) => { w.__proof = { done: true, error: String((e as Error)?.stack ?? e) }; });
