import './ui/theme.css';
import './ui/hud.css';
import './ui/overlays.css';
import './ui/welcome.css';
import { gsap } from 'gsap';
import 'pixi.js/prepare';
import { clock } from './core/clock';
import { Beat } from './core/beat';
import { setMoneyFormat } from './core/money';
import { parseLaunchParams } from './stake/params';
import { intlLocale, resolveLang, setLang, t, getLang } from './i18n';
import { loadMathConfig, modeCost, math } from './config/math';
import { hasTex, keys, loadManifest, loadTextures, sceneKeys, tex } from './render/assets';
import { createApp } from './render/app';
import { Scene } from './render/scene';
import { Cornerstone } from './render/cornerstone';
import { Buck } from './render/mascot/Buck';
import { Hud } from './ui/hud';
import { Overlays, assetUrl } from './ui/overlays';
import { CelebrationFx } from './render/celebration';
import { showWelcome, welcomeSkipped } from './ui/welcome';
import { GameMenu, type HistoryItem } from './ui/menu';
import { BuyMenu } from './ui/buy';
import { AntePanel, anteFromConfig } from './ui/ante';
import { Dialogs, mapRgsError, warmArt } from './ui/dialogs';
import { RgsError } from './stake/rgs';
import { music } from './audio/music';
import { ambience } from './audio/ambience';
import type { PlayedRound } from './provider/types';
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

/** grille affichée avant le premier tour (colonnes de haut en bas) : aucun gain, aucune charge, aucun Scatter */
const START_BOARD = [
  ['L1', 'H2', 'L3', 'H4', 'L2'],
  ['L4', 'H1', 'L1', 'H3', 'H2'],
  ['L3', 'H4', 'L2', 'H1', 'L4'],
  ['H2', 'L1', 'H3', 'L3', 'L2'],
  ['H4', 'L4', 'H1', 'L2', 'H3'],
];

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
  await loadTextures(sceneKeys(), step(0.72));
  progress = 0.84;
  const quality = (localStorage.getItem('bt.quality') as 'high' | 'low' | null) ?? 'high';
  const host = await createApp($('#stage'), quality);
  // envoi de toutes les textures au GPU pendant le chargement : aucun à-coup au premier bonus ou à la première explosion
  host.app.renderer.prepare.add(sceneKeys().filter(hasTex).map((k) => tex(k)));
  await host.app.renderer.prepare.upload();
  setProgress(0.92);
  const scene = new Scene(host);
  const cornerstone = new Cornerstone();
  const buck = new Buck();
  buck.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  scene.logo.reducedMotion = buck.reducedMotion;
  // le Cornerstone passe devant Buck (il se tient derrière son bloc)
  scene.mascotLayer.addChild(buck.view, cornerstone.view);
  scene.onLayout((l) => {
    buck.layout(l);
    cornerstone.layout(l);
  });

  // fournisseur de manches
  let provider: RoundProvider;
  const m = params.mode;
  if (m.kind === 'stake') provider = new StakeProvider(m.rgsUrl, m.sessionID);
  else if (m.kind === 'replay') provider = new ReplayProvider({ kind: 'stake', rgsUrl: m.rgsUrl, game: m.game, version: m.version, mode: m.mode, event: m.event, ...(m.amount ? { amount: m.amount } : {}), ...(m.currency ? { currency: m.currency } : {}) });
  else {
    provider = new DemoProvider(await loadFixtures(), { modeCost, seed: params.dev.seed ? Number(params.dev.seed) : undefined });
  }
  const session = await provider.authenticate(getLang());
  // en local, la latence simulée suit l'horloge de présentation (horloge démarrée plus bas, avant tout tour)
  if (provider instanceof DemoProvider) provider.wait = (ms) => clock.wait(ms);
  setProgress(1);
  // juridiction : casino social imposé par la session (anglais + dictionnaire social)
  if (session.jurisdiction.socialCasino && !params.social) setLang(getLang(), true);
  setMoneyFormat({ currency: session.currency, locale: intlLocale() });

  // interface
  const ui = $('#ui');
  const overlays = new Overlays();
  let game!: GameController;
  let menu!: GameMenu;
  let buyMenu!: BuyMenu;
  const replayMode = provider.kind === 'replay';
  let replayRound: PlayedRound | null = null;

  // son : une seule source d'ambiance pour la musique et les nappes ; son coupé = contexte audio suspendu
  const setSoundMood = (a: 'base' | 'bonus' | 'super'): void => {
    music.setMood(a);
    ambience.setMood(a);
  };
  let muteTimer = 0;
  const setSound = (on: boolean): void => {
    audio.setMuted(!on);
    hud.setSound(on);
    window.clearTimeout(muteTimer);
    if (!on) muteTimer = window.setTimeout(() => audio.setPaused(true), 200);
    else {
      audio.setPaused(false);
      void audio.ctx?.resume().then(() => sfx('toggle'));
    }
  };

  const hud = new Hud({
    spin: () => {
      if (replayMode) {
        if (replayRound) void game.replayRound(replayRound);
        return;
      }
      void game.spin();
    },
    quickStop: () => game.quickStop(),
    betDelta: (d) => {
      game.changeBet(d);
      syncAnte();
    },
    buy: () => {
      if (game.fsm.state === 'ready' && game.flags.buy) {
        sfx('buyOpen');
        buyMenu.open();
      }
    },
    menu: (tab) => {
      if (game.fsm.accepts('menu') || game.fsm.state === 'ready') menu.open(tab);
    },
    sound: () => setSound(audio.isMuted),
    turbo: () => {
      sfx('toggle');
      menu.cycleTurbo();
    },
    autoplay: (n) => (n === null ? game.stopAuto() : game.startAuto(n)),
    ante: () => undefined,
  });

  const dialogs = new Dialogs({ balanceEl: () => hud.element('balanceBox') });
  const history: HistoryItem[] = [];
  menu = new GameMenu({
    getBet: () => game.bet,
    getHistory: () => history,
    canReplay: () => game.fsm.state === 'ready',
    buyAllowed: () => game.flags.buy,
    onReplay: (id) => {
      const r = game.history.find((x) => x.id === id);
      if (!r || game.fsm.state !== 'ready') return;
      menu.close();
      void game.replayRound(r);
    },
    // valeurs par défaut du menu (0,8 / 0,7 / 0,9) ramenées aux niveaux calibrés du moteur
    onVolume: (ch, v) => {
      if (ch === 'master') audio.setVolume('master', v);
      else if (ch === 'music') audio.setVolume('music', v * (0.55 / 0.7));
      else {
        audio.setVolume('sfx', v * (0.85 / 0.9));
        audio.setVolume('ambience', v * (0.6 / 0.9));
      }
    },
    onTurbo: (lv) => {
      game.turbo = lv;
      game.player.setSpeed(game.speed);
      buck.speed = game.speed;
      hud.setTurbo(lv);
    },
    onReducedMotion: (on) => {
      stage.reducedMotion = on;
      buck.reducedMotion = on;
      scene.logo.reducedMotion = on;
      scene.camera.reducedMotion = on;
      celebration.reducedMotion = on;
      scene.decor.reducedMotion = on;
      document.documentElement.dataset.motion = on ? 'reduced' : 'full';
    },
    onQuality: (q) => {
      const dpr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : 1.25);
      host.app.renderer.resolution = dpr;
      scene.resize();
    },
    onOpen: () => sfx('ui'),
    onClose: () => sfx('ui'),
  });

  let pendingBuy: ((ok: boolean) => void) | null = null;
  const settleBuy = (ok: boolean): void => {
    pendingBuy?.(ok);
    pendingBuy = null;
  };
  buyMenu = new BuyMenu({
    getBet: () => game.bet,
    getBalance: () => game.balance,
    isAnteOn: () => game.ante,
    reducedMotion: () => menu.settings.reducedMotion,
    onStep: (st) => {
      if (game.fsm.state !== st && game.fsm.can(st)) game.fsm.go(st);
    },
    onClose: (reason) => {
      if (reason === 'cancel' && (game.fsm.state === 'catalog' || game.fsm.state === 'confirm')) game.fsm.go('ready');
    },
    onConfirm: async (mode, quote) => {
      // devis périmé (mise changée, Ante actif) : aucun débit
      if (quote.bet !== game.bet || game.ante) return false;
      const ok = await new Promise<boolean>((resolve) => {
        pendingBuy = resolve;
        void game.buy(mode).then(settleBuy, () => settleBuy(false));
      });
      sfx(ok ? 'buyConfirm' : 'error');
      return ok;
    },
  });

  const ante = new AntePanel({
    onToggle: (on) => {
      sfx('toggle');
      if (game.fsm.state === 'ready' && game.fsm.accepts('ante')) {
        game.ante = on;
        buck.setAnte(on);
        game.refreshHud();
      }
      syncAnte();
    },
  });
  const syncAnte = (): void => {
    const v = anteFromConfig(math(), game.bet, game.ante);
    // pendant les free spins, l'Ante ne s'applique pas : l'encart laisse la place au bonus
    const inBonus = !!game?.player.model?.fs.active && game.fsm.inRound;
    if (!v || replayMode || inBonus) {
      ante.setHidden(true);
      return;
    }
    ante.setHidden(false);
    ante.setState({ on: game.ante, factor: v.factor, nextCost: v.nextCost, disabled: game.fsm.state !== 'ready' });
  };

  ui.append(ante.root, overlays.root, hud.root, menu.root, buyMenu.root, dialogs.root);
  // images d'interface décodées d'avance : menus et achat s'ouvrent déjà illustrés
  warmArt(keys().filter((k) => /^(sym|ui|scr|id\.card|decor\.(skyRich|nightSky|far|mid))/.test(k)));
  if (replayMode) hud.root.classList.add('is-replay');
  const celebration = new CelebrationFx(scene, buck);
  celebration.reducedMotion = buck.reducedMotion;
  scene.overlay.addChild(celebration.view);
  // éboulement, champignon de poussière, sommet qui saute : derrière la grille (dans le monde, sous la caméra)
  scene.camera.world.addChildAt(celebration.back, scene.camera.world.getChildIndex(scene.decor.ground) + 1);
  overlays.celebration = celebration;
  // une fanfare par palier, celle du MAX WIN sur le dernier
  let celebMax = false;
  let celebTop = 0;
  const fxTier = celebration.onTier.bind(celebration);
  celebration.onTier = (i, beat) => {
    sfx(celebMax && i === celebTop ? 'maxWin' : 'tier');
    fxTier(i, beat);
  };
  // géants qui se fendent en cases : son seulement s'il y a des géants
  const crackAll = scene.grid.crackAll.bind(scene.grid);
  scene.grid.crackAll = (instant = false) => {
    if (!instant && scene.grid.giants.length) sfx('crack');
    crackAll(instant);
  };
  scene.decor.onFlock = (dir) => ambience.event('birds', dir);
  scene.decor.onRareEvent = (k) => ambience.event(k === 1 ? 'distantBlast' : 'sparks');

  scene.onLayout((l) => {
    hud.layout(l);
    overlays.setLayout(l);
    ante.layout(l.ante);
    menu.setLayout(l);
    buyMenu.setLayout(l);
    dialogs.setLayout(l);
  });

  const mascot = {
    perform: (name: string, beat: Beat, arg?: unknown) => buck.perform(name, beat, arg as { target?: { x: number; y: number }; tier?: number; throw?: boolean }),
    react: (name: string, arg?: { target?: { x: number; y: number } }) => {
      if (name === 'anticipationWin') sfx('anticipationLand');
      else if (name === 'anticipationLose') sfx('anticipationMiss');
      buck.react(name, arg);
    },
    matchPoint: () => buck.matchPoint(),
  };
  const stage: Stage = {
    grid: scene.grid as unknown as Stage['grid'],
    blast: scene.blast as unknown as Stage['blast'],
    mascot,
    camera: scene.camera,
    // le décor fixe aussi l'ambiance sonore (y compris à la reprise d'un bonus)
    decor: {
      setDim: (v: number) => scene.decor.setDim(v),
      setAmbience: (a: 'base' | 'bonus' | 'super', d?: number) => {
        setSoundMood(a);
        return scene.decor.setAmbience(a, d);
      },
      setMonument: (st: number, anim?: boolean) => scene.decor.setMonument(st, anim),
    },
    ui: {
      setSpinWin: (amount, label) => hud.setWin(amount, label === 'total' ? t('hud.total') : undefined),
      setFs: (n) => {
        if (replayMode) {
          if (n === null) overlays.setBanner(t('replay.badge'));
          else overlays.setFs(n, t('replay.badge'));
        } else overlays.setFs(n);
      },
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
        } else if (beat) {
          sfx('engrave');
          await cornerstone.engrave(v, beat);
        }
        else cornerstone.setValue(v);
      },
      bonusIntro: async (kind, spins, beat) => {
        sfx('bonusIntro');
        const artKey = kind === 'super' ? 'scr.floodlight' : 'scr.sundown';
        await overlays.dialog('intro', { title: t(`bonus.${kind}.name`), spins: t('bonus.spins', { n: spins }), rule: t(`bonus.${kind}.rule`), variant: kind, art: assetUrl(artKey), artKey }, beat);
      },
      bonusOutro: async (total, beat) => {
        sfx('bonusOutro');
        const { formatMoney } = await import('./core/money');
        await overlays.dialog('outro', { title: t('bonus.end'), big: formatMoney(total), art: assetUrl('scr.total'), artKey: 'scr.total' }, beat);
      },
      celebrate: (amount, bet, beat, max) => {
        hud.setWin(null); // le compteur de la célébration fait foi ; le total revient après
        celebMax = max;
        celebTop = math().celebrationTiersX.reduce((top, mx, i) => (amount / bet >= mx ? i : top), 0);
        celebration.top = celebTop;
        return overlays.celebrate(amount, bet, beat, max); // la fanfare part de onTier(0)
      },
      scatterCount: () => undefined,
      collectChunks: (from, count, beat) => cornerstone.collect(from, count, beat),
    },
    sound: { play: (n, o) => sfx(n, o), tension, ambience: setSoundMood },
    reducedMotion: menu.settings.reducedMotion,
    turbo: 1,
    // prototypes de pistes (Annexe B) : builds de dev/QA seulement
    variant: __DEV_TOOLS__ ? params.dev.variant : null,
  };
  const presenter = new GamePresenter(stage);
  game = new GameController(provider, presenter, hud, {
    onError: async (e) => {
      console.error(e);
      sfx('error');
      const a = await dialogs.error(e);
      if (a === 'reload') location.reload();
      return a === 'retry' ? 'retry' : 'dismiss';
    },
    // serveur d'accord pour l'achat : la page d'achat se ferme
    onRoundStart: () => settleBuy(true),
    onRoundEnd: (round) => {
      history.unshift({ id: round.id, mode: round.mode, bet: round.bet, payout: round.book.payoutMultiplier, time: Date.now() });
      if (history.length > 20) history.length = 20;
    },
    message: (k) => (k === 'insufficient' ? void dialogs.insufficient() : overlays.announce(k)),
  });
  game.applySession(session);
  presenter.bet = game.bet;
  menu.setTurboAllowed({ turbo: game.flags.turbo, ultra: game.flags.turbo && !session.jurisdiction.disabledSuperTurbo });
  menu.applyAll();
  buck.speed = game.speed;
  buck.reducedMotion = menu.settings.reducedMotion;
  scene.logo.reducedMotion = buck.reducedMotion;
  celebration.reducedMotion = buck.reducedMotion;
  scene.camera.reducedMotion = buck.reducedMotion;
  scene.decor.reducedMotion = buck.reducedMotion;
  document.documentElement.dataset.motion = buck.reducedMotion ? 'reduced' : 'full';
  syncAnte();
  game.fsm.onChange((st, prev) => {
    syncAnte();
    if (st === 'waiting') dialogs.waiting(true); // requête incertaine : jeu verrouillé
    else if (st === 'requesting') dialogs.waiting(true, { delayMs: 1500, block: false }); // serveur lent seulement
    else dialogs.waiting(false);
    if (menu.isOpen && menu.tab === 'history' && (st === 'ready' || prev === 'ready')) menu.refresh();
  });
  // musique et nappes : démarrent au premier geste (déverrouillage audio), ambiance restaurée conservée
  music.start();
  ambience.start();

  // grille de départ neutre, identique dans tous les modes (local, Stake, relecture) : aucun symbole spécial
  scene.grid.setBoard(START_BOARD as never, new Map());

  // clavier : Espace lance / arrête (sauf dialogue ouvert)
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat || !game.flags.spacebar) return;
    if (dialogs.blocking || menu.isOpen || buyMenu.isOpen || replayMode) return;
    if ((e.target as HTMLElement)?.closest?.('button, input, [role="dialog"]')) return;
    e.preventDefault();
    if (game.fsm.state === 'ready') void game.spin();
    else if (game.fsm.inRound || game.fsm.state === 'requesting') game.quickStop();
  });
  // clic sur la grille pendant une connexion : passe au montant
  host.app.canvas.addEventListener('pointerdown', (e) => {
    const l = scene.layout;
    if (!l || !(game.fsm.inRound || game.fsm.state === 'replay')) return;
    if (e.clientX >= l.grid.x && e.clientX <= l.grid.x + l.grid.w && e.clientY >= l.grid.y && e.clientY <= l.grid.y + l.grid.h) game.skipPresentation();
  });

  if (__DEV_TOOLS__) {
    const dev = await import('./dev/qa');
    dev.installQa({ scene, game, provider, presenter, clock, params, math: math(), T, gsap });
  }
  clock.start();
  const loader = document.getElementById('loader');
  loader?.classList.add('done');
  window.setTimeout(() => loader?.remove(), 500);

  // accueil (cartes) puis entrée thématique : Buck balaie la scène, la caméra recule, le logo sursaute
  game.fsm.go('welcome');
  const forceWelcome = new URLSearchParams(location.search).has('welcome');
  const skipWelcome = !forceWelcome && (params.dev.skipIntro || params.dev.qa || replayMode || !!session.resume || welcomeSkipped());
  const enter = () => {
    const beat = new Beat();
    void buck.perform('introSwipe', beat);
    scene.logo.thump(1.2);
    if (!buck.reducedMotion) {
      const l = scene.layout;
      scene.camera.zoomTo(1.06, l.grid.x + l.grid.w / 2, l.grid.y + l.grid.h / 2, 0).progress(1);
      scene.camera.reset(0.9);
    }
  };
  if (!skipWelcome) await showWelcome(ui, { maxWinX: math().maxWinX, onDismissStart: enter });
  else enter();
  game.fsm.go('entering');

  // manche interrompue : reprise exacte à l'événement enregistré, sans nouveau débit
  if (session.resume) {
    game.fsm.go('resume');
    await dialogs.resume();
    await game.resumeRound(session.resume);
    return;
  }
  game.fsm.go('ready');

  // replay Stake : la manche relue se joue d'elle-même ; le SPIN la relance (aucun pari, aucun solde)
  if (replayMode) {
    replayRound = (await provider.play(game.bet, 'BASE')).round;
    overlays.setBanner(t('replay.badge'));
    await game.replayRound(replayRound);
  }
}

boot().catch((e) => {
  console.error(e);
  // session expirée, maintenance, juridiction… : le message du code RGS plutôt qu'un message générique
  const msg = e instanceof RgsError ? t(mapRgsError(e).messageKey) : t('loader.error');
  showLoadError(msg, () => location.reload());
});
