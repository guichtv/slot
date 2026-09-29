/**
 * Banc de réglage de la mascotte (développement uniquement, jamais dans la build publique).
 * Montre les poses réellement jouées × expressions, zoom réglable (?zoom=3), fond clair ou sombre (?dark),
 * horloge virtuelle (?qa) pour capturer chaque instant : window.__bench.play(name, tier?), __bench.step(ms).
 */
import { Application } from 'pixi.js';
import { clock } from '../core/clock';
import { Beat } from '../core/beat';
import { keys, loadManifest, loadTextures } from '../render/assets';
import { gsap } from 'gsap';
import { Buck } from '../render/mascot/Buck';

const q = new URLSearchParams(location.search);
if (q.has('dark')) document.body.classList.add('dark');

async function main(): Promise<void> {
  await loadManifest();
  await loadTextures(keys('buck.'));
  const app = new Application();
  const host = document.getElementById('stage') as HTMLElement;
  await app.init({ resizeTo: host, backgroundAlpha: 0, antialias: true, autoStart: false, sharedTicker: false, resolution: 1 });
  app.ticker.stop();
  host.append(app.canvas);
  clock.onFrame((t) => app.ticker.update(t));
  const buck = new Buck();
  app.stage.addChild(buck.view);
  const zoom = Number(q.get('zoom') ?? 1);
  const layout = () => {
    const h = host.clientHeight * 0.78 * zoom;
    buck.layout({ mascot: { x: host.clientWidth * (Number(q.get('fx') ?? 0.5)), y: host.clientHeight * (0.92 + (zoom - 1) * Number(q.get('fy') ?? 0.33)), h, side: 'right', visible: true } } as never);
  };
  layout();
  window.addEventListener('resize', layout);
  const actions = [
    'rest', 'gesture0', 'gesture1', 'gesture2', 'gesture3',
    'strikeMatch', 'introSwipe', 'plunger', 'triggerCheer', 'cheer',
    'duck', 'chainWince', 'carve', 'proud', 'thump',
    'scatter', 'scatterExcited', 'anticipation', 'anticipationWin', 'anticipationLose',
    'smallWin', 'goodWin',
    'celebrate0', 'celebrate1', 'celebrate2', 'celebrate3', 'celebrate4', 'celebrate5',
  ];
  const target = () => ({ x: host.clientWidth * 0.1, y: host.clientHeight * 0.4 });
  const one = (name: string) => {
    const beat = new Beat();
    if (name === 'rest') return;
    if (name.startsWith('gesture')) (buck as unknown as { gesture(k: number): void }).gesture(Number(name.slice(7)));
    else if (name.startsWith('celebrate')) buck.celebrate(Number(name.slice(9)));
    else if (['strikeMatch', 'cheer', 'triggerCheer', 'introSwipe', 'plunger'].includes(name)) void buck.perform(name, beat, { target: target() });
    else buck.react(name, { target: target() });
  };
  // « a>b » : enchaîne b 0,9 s après a, sans remise au repos (transitions réelles du jeu)
  const play = (name: string) => {
    buck.reset();
    name.split('>').forEach((n, i) => (i === 0 ? one(n) : gsap.delayedCall(0.9 * i, () => one(n))));
  };
  const bar = document.getElementById('bar') as HTMLElement;
  for (const a of actions) {
    const b = document.createElement('button');
    b.textContent = a;
    b.onclick = () => play(a);
    bar.append(b);
  }
  const heads = ['rest', 'grin', 'shout', 'surprise', 'wink', 'focus', 'blink'];
  (window as unknown as { __bench: unknown }).__bench = {
    ready: true,
    play,
    step: (ms: number) => clock.step(ms),
    head: (h: string) => buck.rig.setAlt('head', h),
    heads,
    actions,
    hideBar: () => (bar.style.display = 'none'),
  };
  if (q.has('qa')) clock.useVirtual();
  else clock.start();
  clock.step(16);
}

void main();
