/**
 * Hooks QA (build de dev et build QA uniquement, jamais dans la build publique) :
 * window.__qa = { ready, step(ms), play(id), state(), shot helpers… }
 * ?qa active l'horloge virtuelle : l'animation n'avance que par __qa.step(ms).
 */
import type { Scene } from '../render/scene';
import type { GameController } from '../controller/game';
import type { RoundProvider } from '../provider/types';
import type { GamePresenter } from '../controller/presenter';
import type { PresentationClock } from '../core/clock';
import type { LaunchParams } from '../stake/params';
import { DemoProvider } from '../provider/DemoProvider';

export interface QaDeps {
  scene: Scene;
  game: GameController;
  provider: RoundProvider;
  presenter: GamePresenter;
  clock: PresentationClock;
  params: LaunchParams;
  math: unknown;
  T: unknown;
  gsap: unknown;
}

declare global {
  interface Window {
    __qa: Record<string, unknown> & { ready: boolean };
    __qaBoot: () => void;
    __qaPlay: (id: string) => Promise<void>;
  }
}

export function installQa(d: QaDeps): void {
  const { clock, game, provider, scene } = d;
  if (d.params.dev.qa) clock.useVirtual();
  const play = async (id: string, mode?: string) => {
    if (provider instanceof DemoProvider) {
      const f = provider.fixtureById(id);
      if (!f) throw new Error(`fixture inconnue ${id}`);
      provider.forceNext(id);
      await game.spin(mode ?? f.mode);
    }
  };
  window.__qa = {
    ready: true,
    step: (ms: number, frame?: number) => clock.step(ms, frame),
    time: () => clock.time,
    state: () => ({ fsm: game.fsm.state, balance: game.balance, bet: game.bet, layout: scene.layout.cls, event: game.player.currentIndex }),
    play: (id: string, mode?: string) => {
      void play(id, mode);
      return true;
    },
    fixtures: () => (provider instanceof DemoProvider ? provider.list().map((f) => ({ id: f.id, mode: f.mode, tags: f.tags })) : []),
    refill: () => provider instanceof DemoProvider && provider.refill(),
    skip: () => game.skipPresentation(),
    quick: () => game.quickStop(),
    layout: () => scene.layout,
    flock: () => void scene.decor.launchFlock(),
    ambience: (a: 'base' | 'bonus' | 'super') => void scene.decor.setAmbience(a, 0).progress(1),
    monument: (n: number) => void scene.decor.setMonument(n, false),
    deps: d,
  };
  window.__qaBoot = () => undefined;
  window.__qaPlay = (id: string) => play(id);
}
