import './ui/theme.css';
import './ui/hud.css';
import './ui/overlays.css';
import { gsap } from 'gsap';
import { clock } from './core/clock';
import { Beat } from './core/beat';
import { setMoneyFormat } from './core/money';
import { parseLaunchParams } from './stake/params';
import { intlLocale, resolveLang, setLang, t, getLang } from './i18n';
import { loadMathConfig, modeCost, math } from './config/math';
import { keys, loadManifest, loadTextures } from './render/assets';
import { createApp } from './render/app';
import { Scene } from './render/scene';
import { Cornerstone } from './render/cornerstone';
import { Hud } from './ui/hud';
import { Overlays } from './ui/overlays';
import { GamePresenter, type Stage } from './controller/presenter';
import { GameController } from './controller/game';
import { DemoProvider, type Fixture } from './provider/DemoProvider';
import { StakeProvider } from './provider/StakeProvider';
import { ReplayProvider } from './provider/ReplayProvider';
import type { RoundProvider } from './provider/types';
import { audio } from './audio/engine';
import { sfx, tension } from './audio/sfx';
import { $ } from './ui/dom';
import { T } from './config/timings';

/**
 * Démarrage : chargement réel (config maths, manifeste, polices, images décodées, session),
 * écran Crownforge, accueil, entrée dans le jeu. Le parcours est le même en local et en session Stake.
 */
const params = parseLaunchParams();

function setProgress(f: number): void {
  const pct = Math.round(Math.max(0, Math.min(1, f)) * 100);
  const loader = document.getElementById('loader');
  loader?.setAttribute('aria-valuenow', String(pct));
  const fill = loader?.querySelector<HTMLElement>('.loader-fill');
  const spark = loader?.querySelector<HTMLElement>('.loader-spark');
  if (fill) fill.style.width = `${pct}%`;
  if (spark) spark.style.left = `${pct}%`;
}

function showLoadError(msg: string, retry: () => void): void {
  const box = document.querySelector<HTMLElement>('.loader-error');
  if (!box) return;
  box.hidden = false;
  (box.querySelector('.loader-msg') as HTMLElement).textContent = msg;
  const b = box.querySelector('.loader-retry') as HTMLButtonElement;
  b.textContent = t('loader.retry');
  b.onclick = () => {
    box.hidden = true;
    retry();
  };
  b.focus();
}

async function loadFixtures(): Promise<Fixture[]> {
  const res = await fetch('fixtures/fixtures.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`fixtures ${res.status}`);
  return ((await res.json()) as { fixtures: Fixture[] }).fixtures;
}

async function boot(): Promise<void> {
  setLang(resolveLang(params.lang || navigator.language?.slice(0, 2)), params.social);
  if (params.mode.kind === 'invalid') {
    showLoadError(t('loader.error'), () => location.reload());
    return;
  }
  let progress = 0;
  const step = (w: number) => (f: number) => setProgress(progress + w * f);
  await loadMathConfig();
  progress = 0.04;
  setProgress(progress);
  await loadManifest();
  progress = 0.08;
  await Promise.all([document.fonts.load('40px "Lilita One"'), document.fonts.load('700 20px "Baloo 2"')]).catch(() => undefined);
  progress = 0.12;
  await loadTextures(keys(), step(0.72));
  progress = 0.84;
  const quality = (localStorage.getItem('bt.quality') as 'high' | 'low' | null) ?? 'high';
  const host = await createApp($('#stage'), quality);
  const scene = new Scene(host);
  const cornerstone = new Cornerstone();
  scene.mascotLayer.addChild(cornerstone.view);
  scene.onLayout((l) => cornerstone.layout(l));

  // fournisseur de manches
  let provider: RoundProvider;
  const m = params.mode;
  if (m.kind === 'stake') provider = new StakeProvider(m.rgsUrl, m.sessionID);
  else if (m.kind === 'replay') provider = new ReplayProvider({ kind: 'stake', rgsUrl: m.rgsUrl, game: m.game, version: m.version, mode: m.mode, event: m.event, ...(m.amount ? { amount: m.amount } : {}), ...(m.currency ? { currency: m.currency } : {}) });
  else provider = new DemoProvider(await loadFixtures(), { modeCost, seed: params.dev.seed ? Number(params.dev.seed) : undefined });
  const session = await provider.authenticate(getLang());
  setProgress(1);
  setMoneyFormat({ currency: session.currency, locale: intlLocale() });

  // interface
  const ui = $('#ui');
  const overlays = new Overlays();
  let game!: GameController;
  const hud = new Hud({
    spin: () => void game.spin(),
    quickStop: () => game.quickStop(),
    betDelta: (d) => game.changeBet(d),
    buy: () => undefined,
    menu: () => undefined,
    sound: () => {
      audio.setMuted(!audio.isMuted);
      hud.setSound(!audio.isMuted);
    },
    turbo: () => game.cycleTurbo(),
    autoplay: (n) => (n === null ? game.stopAuto() : game.startAuto(n)),
    ante: () => undefined,
  });
  ui.append(overlays.root, hud.root);
  scene.onLayout((l) => {
    hud.layout(l);
    overlays.setLayout(l);
  });

  const mascot = {
    perform: async (_name: string, beat: Beat) => beat.wait(200),
    react: (_name: string) => undefined,
  };
  const stage: Stage = {
    grid: scene.grid as unknown as Stage['grid'],
    blast: scene.blast as unknown as Stage['blast'],
    mascot,
    camera: scene.camera,
    decor: scene.decor as unknown as Stage['decor'],
    ui: {
      setSpinWin: (amount, label) => hud.setWin(amount, label === 'total' ? t('hud.total') : undefined),
      setFs: (n) => overlays.setFs(n),
      plusFs: (n, beat) => {
        sfx('plusFs');
        return overlays.plusFs(n, beat);
      },
      setMultiplier: async (v, beat) => {
        if (v === null) {
          if (beat) await beat.play(cornerstone.show(false));
          else cornerstone.show(false).progress(1);
          cornerstone.setValue(0);
          return;
        }
        if (!cornerstone.visibleState) {
          cornerstone.setValue(v);
          if (beat) await beat.play(cornerstone.show(true));
          else cornerstone.show(true).progress(1);
        } else if (beat) await cornerstone.engrave(v, beat);
        else cornerstone.setValue(v);
      },
      bonusIntro: async (kind, spins, beat) => {
        await overlays.dialog('intro', { title: t(`bonus.${kind}.name`), spins: t('bonus.spins', { n: spins }), rule: t(`bonus.${kind}.rule`), variant: kind }, beat);
      },
      bonusOutro: async (total, beat) => {
        const { formatMoney } = await import('./core/money');
        await overlays.dialog('outro', { title: t('bonus.end'), big: formatMoney(total) }, beat);
      },
      celebrate: (amount, bet, beat, max) => {
        sfx('tier');
        return overlays.celebrate(amount, bet, beat, max);
      },
      scatterCount: () => undefined,
    },
    sound: { play: (n, o) => sfx(n, o), tension, ambience: () => undefined },
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    turbo: 1,
  };
  const presenter = new GamePresenter(stage);
  game = new GameController(provider, presenter, hud, {
    onError: async (e) => {
      console.error(e);
      sfx('error');
      return 'dismiss';
    },
    message: (k) => overlays.announce(k),
  });
  game.applySession(session);
  presenter.bet = game.bet;

  // grille initiale : première révélation d'une perte de la playlist (aucun symbole spécial)
  if (provider instanceof DemoProvider) {
    const first = provider.list().find((f) => f.tags.includes('loss'));
    const reveal = (first?.book as { events: Array<{ type: string; board?: Array<Array<{ name: string }>> }> })?.events?.[0];
    if (reveal?.board) scene.grid.setBoard(reveal.board.map((c) => c.map((s) => s.name)) as never, new Map());
  }

  // clavier : Espace lance / arrête (sauf dialogue ouvert)
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat || !game.flags.spacebar) return;
    if ((e.target as HTMLElement)?.closest?.('button, input, [role="dialog"]')) return;
    e.preventDefault();
    if (game.fsm.state === 'ready') void game.spin();
    else if (game.fsm.inRound) game.quickStop();
  });
  // clic sur la grille pendant une connexion : passe au montant
  host.app.canvas.addEventListener('pointerdown', (e) => {
    const l = scene.layout;
    if (!l || !game.fsm.inRound) return;
    if (e.clientX >= l.grid.x && e.clientX <= l.grid.x + l.grid.w && e.clientY >= l.grid.y && e.clientY <= l.grid.y + l.grid.h) game.skipPresentation();
  });

  game.fsm.go('welcome');
  game.fsm.go('entering');
  game.fsm.go('ready');
  const loader = document.getElementById('loader');
  loader?.classList.add('done');
  window.setTimeout(() => loader?.remove(), 500);

  if (__DEV_TOOLS__) {
    const dev = await import('./dev/qa');
    dev.installQa({ scene, game, provider, presenter, clock, params, math: math(), T, gsap });
  }
  clock.start();
}

boot().catch((e) => {
  console.error(e);
  showLoadError(t('loader.error'), () => location.reload());
});
