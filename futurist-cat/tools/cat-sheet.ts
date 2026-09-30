// Contact sheet for one clip (prompt section 4.8): 12 instants via mixer.setTime in a 4x3 grid,
// front + profile views at the game framing (the view frame IS the game canvas: anything outside
// is cut in game), red ground line, vertical axis, time; loops get first/last frames overlaid.
// Rendered headless by tools/cat-sheets.mjs (swiftshader) into docs/preuves/chat/<clip>.png.
import { loadThreeBundle, CatStage } from '../src/render/cat/cat-stage';
import { CatRig, LOOPING, type ClipId } from '../src/render/cat/cat-rig';

type SheetState = { done: boolean; error: string; dataURL: string; info: Record<string, unknown> };
const w = window as unknown as { __sheet: SheetState };
w.__sheet = { done: false, error: '', dataURL: '', info: {} };

const params = new URLSearchParams(location.search);
const clipId = (params.get('clip') ?? 'idle') as ClipId;
const glbUrl = params.get('glb') ?? '../public/assets/cat/cat.glb';
const label = params.get('label') ?? '';
const VW = 250, VH = 350; // one view = the game canvas aspect (w/h ~ 0.72)
const GAP = 14, HEAD = 64;

async function main(): Promise<void> {
  const b = await loadThreeBundle();
  const THREE = b.THREE;
  const stage = new CatStage(b, { width: VW, height: VH, pixelRatio: 1.5, antialias: true, preserveDrawingBuffer: true });
  const gltf = await stage.loadCat(glbUrl);
  const rig = new CatRig(stage, gltf);
  rig.lookEnabled = false;
  if (!rig.has(clipId)) throw new Error(`clip ${clipId} absent (clips: ${[...rig.clips.keys()].join(', ')})`);
  const clip = rig.clips.get(clipId)!;
  const dur = clip.duration;
  const loop = LOOPING.has(clipId);
  const action = rig.actions.get(clipId)!;
  rig.stopAll();
  action.reset().setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();

  const cols = 4, rows = 3;
  const cellW = VW * 2 + 6, cellH = VH + 22;
  const extra = loop ? cellH + GAP + 18 : 0;
  const sheet = document.getElementById('sheet') as HTMLCanvasElement;
  sheet.width = GAP + cols * (cellW + GAP);
  sheet.height = HEAD + rows * (cellH + GAP) + extra + GAP;
  const ctx = sheet.getContext('2d')!;
  ctx.fillStyle = '#1b1f27'; ctx.fillRect(0, 0, sheet.width, sheet.height);

  const front = stage.camera.clone();
  const side = stage.camera.clone();
  const hipsRest = rig.hips.getWorldPosition(new THREE.Vector3());
  const dist = front.position.z - hipsRest.z;
  const restY = rig.restHipsY;

  const pose = (t: number): number => {
    rig.mixer.setTime(Math.min(t, Math.max(0, dur - 1e-5)));
    stage.scene.updateMatrixWorld(true);
    const hy = rig.hips.getWorldPosition(new THREE.Vector3()).y;
    return hy;
  };
  const place = (hy: number): number => {
    const follow = hy > restY + 0.5 ? hy - restY : 0; // follow only when the hips leave the frame
    front.position.set(hipsRest.x, front.position.y, hipsRest.z + dist);
    front.position.y = rig.catHeight * 0.5 + follow;
    front.lookAt(hipsRest.x, rig.catHeight * 0.47 + follow, hipsRest.z);
    side.position.set(hipsRest.x + dist, rig.catHeight * 0.5 + follow, hipsRest.z);
    side.lookAt(hipsRest.x, rig.catHeight * 0.47 + follow, hipsRest.z);
    front.updateMatrixWorld(true); side.updateMatrixWorld(true);
    return follow;
  };
  const renderView = (cam: import('three').PerspectiveCamera, x: number, y: number, alpha = 1): void => {
    stage.renderer.render(stage.scene, cam);
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.drawImage(stage.canvas, x, y, VW, VH);
    ctx.restore();
  };
  const guides = (cam: import('three').PerspectiveCamera, x: number, y: number, axisWorld: import('three').Vector3): void => {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, VW - 1, VH - 1);
    const g = new THREE.Vector3(axisWorld.x, 0, axisWorld.z).project(cam);
    const gy = y + ((1 - g.y) / 2) * VH, gx = x + ((g.x + 1) / 2) * VW;
    ctx.strokeStyle = '#ff3b3b';
    if (gy >= y && gy <= y + VH) { ctx.beginPath(); ctx.moveTo(x, gy + 0.5); ctx.lineTo(x + VW, gy + 0.5); ctx.stroke(); }
    else { ctx.fillStyle = '#ff3b3b'; ctx.fillText(gy > y + VH ? 'sol v' : 'sol ^', x + 4, gy > y + VH ? y + VH - 6 : y + 14); }
    ctx.strokeStyle = 'rgba(90,220,255,0.55)'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(gx + 0.5, y); ctx.lineTo(gx + 0.5, y + VH); ctx.stroke(); ctx.setLineDash([]);
  };

  ctx.fillStyle = '#e8eef6'; ctx.font = 'bold 18px monospace';
  ctx.fillText(`${clipId}  ${dur.toFixed(3)} s  ${loop ? 'boucle' : 'une fois'}  ${label}`, GAP, 26);
  ctx.font = '12px monospace'; ctx.fillStyle = '#9fb0c6';
  ctx.fillText(`${glbUrl}  |  gauche : face  |  droite : profil  |  rouge : sol (y=0)  |  pointille : axe des hanches au repos  |  cadre = canvas du jeu`, GAP, 46);

  const info: Record<string, unknown> = { clip: clipId, duration: dur, frames: [] as unknown[] };
  for (let i = 0; i < cols * rows; i++) {
    const t = (i / (cols * rows - 1)) * dur;
    const hy = pose(t);
    const follow = place(hy);
    const cx = GAP + (i % cols) * (cellW + GAP), cy = HEAD + Math.floor(i / cols) * (cellH + GAP);
    renderView(front, cx, cy + 18); guides(front, cx, cy + 18, hipsRest);
    renderView(side, cx + VW + 6, cy + 18); guides(side, cx + VW + 6, cy + 18, hipsRest);
    ctx.fillStyle = '#e8eef6'; ctx.font = '13px monospace';
    ctx.fillText(`t=${t.toFixed(2)}s  f${Math.round(t * 30)}${follow ? `  hanches +${follow.toFixed(2)} m (camera suit)` : ''}`, cx, cy + 12);
    (info.frames as unknown[]).push({ t, hipsY: hy });
  }
  if (loop) {
    const cy = HEAD + rows * (cellH + GAP);
    ctx.fillStyle = '#e8eef6'; ctx.font = '13px monospace';
    ctx.fillText('boucle : premiere (t=0) et derniere frame superposees a 50 %', GAP, cy + 12);
    for (const [k, t] of [[0, 0], [1, dur]] as const) {
      const hy = pose(t); place(hy);
      renderView(front, GAP, cy + 18, k ? 0.5 : 1);
      renderView(side, GAP + VW + 6, cy + 18, k ? 0.5 : 1);
    }
    guides(front, GAP, cy + 18, hipsRest); guides(side, GAP + VW + 6, cy + 18, hipsRest);
  }
  info.drawCalls = stage.renderer.info.render.calls;
  info.textures = stage.renderer.info.memory.textures;
  info.gpuBytes = stage.estimateGpuBytes(0);
  w.__sheet = { done: true, error: '', dataURL: sheet.toDataURL('image/png'), info };
}

main().catch((e: unknown) => { w.__sheet = { done: true, error: String((e as Error)?.stack ?? e), dataURL: '', info: {} }; });
