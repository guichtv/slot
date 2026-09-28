import { Application } from 'pixi.js';
import { clock } from '../core/clock';

/**
 * Application Pixi pilotée par l'horloge de présentation (pas de ticker autonome) :
 * une seule source de temps pour l'image, les compteurs et le son.
 */
export type Quality = 'high' | 'low';

export interface RenderHost {
  app: Application;
  quality: Quality;
  dpr: number;
}

export async function createApp(parent: HTMLElement, quality: Quality): Promise<RenderHost> {
  const app = new Application();
  const dpr = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.25);
  await app.init({
    resizeTo: parent,
    antialias: false,
    backgroundAlpha: 0,
    resolution: dpr,
    autoDensity: true,
    autoStart: false,
    sharedTicker: false,
    preference: 'webgl',
    powerPreference: 'high-performance',
  });
  app.ticker.stop();
  app.canvas.id = 'scene';
  app.canvas.setAttribute('aria-hidden', 'true');
  parent.prepend(app.canvas);
  clock.onFrame((t) => {
    app.ticker.update(t);
  });
  return { app, quality, dpr };
}
