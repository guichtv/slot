// Boot: params -> language -> loading (real progress: images decoded, fonts, critical audio,
// session) -> welcome (three.js starts downloading) -> entrance (logo to its place, decor, grid,
// HUD, the cat dives in) -> idle (or resume of an active round).
import '@fontsource/oxanium/700.css';
import '@fontsource/oxanium/800.css';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import './ui/ui.css';
import gsap from 'gsap';
import { GameClock } from './core/clock';
import { mulberry32, seedFromUrl } from './core/rng';
import { i18n, t, I18n } from './i18n/i18n';
import { loadGameConfig, type GameConfig } from './config/game-config';
import { formatMoney } from './contract/money';
import { AssetStore } from './render/assets';
import { GameApp } from './render/app';
import { computeLayout, type Layout } from './render/layout';
import { Scene } from './render/scene';
import { Celebration } from './render/celebrate';
import { GamePresenter, type SoundPort } from './render/presenter';
import { installFonts } from './render/texts';
import { CatView } from './render/cat/cat-view';
import { loadCatModules } from './render/cat/cat-loader';
import { Ui } from './ui/ui';
import { LoadingScreen, WelcomeScreen } from './ui/screens';
import { buildRules } from './ui/rules';
import { GameController } from './controller/game';
import { LocalProvider } from './provider/local';
import { RgsProvider, fetchReplay } from './provider/rgs';
import type { Provider, SessionInfo } from './provider/types';
import { ProviderError, DEFAULT_JURISDICTION } from './provider/types';
import { AudioEngine } from './audio/audio';
import { Book, type ModeId } from './contract/events';

const q = new URLSearchParams(location.search);
const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(location.hostname) || location.protocol === 'file:';

async function boot(): Promise<void> {
  i18n.social = q.get('social') === 'true';
  await i18n.load(I18n.normalise(q.get('lang') ?? navigator.language));
  const clock = new GameClock(__DEV_TOOLS__ && q.get('virtual') === '1');
  const rand = mulberry32(seedFromUrl());
  const gameRoot = document.getElementById('game')!;
  const loading = new LoadingScreen(document.body);
  const assets = new AssetStore('./assets/');
  await assets.loadManifest();
  loading.setLogo(assets.url('loading.crownforge'));

  const pFonts = loading.task('fonts', 1);
  const pImages = loading.task('images', 6);
  const pAudio = loading.task('audio', 2);
  const pSession = loading.task('session', 1);

  // ---------------- provider (never a silent fallback to local mode on a production host)
  const replay = q.get('replay') === 'true';
  const sessionID = q.get('sessionID');
  const rgsUrl = q.get('rgs_url');
  let cfg: GameConfig;
  let provider: Provider | null = null;
  try {
    cfg = await loadGameConfig();
  } catch (e) {
    loading.error(t('loading.error'), () => location.reload());
    throw e;
  }
  if (!replay) {
    if (sessionID && rgsUrl) provider = new RgsProvider({ sessionID, rgsUrl, lang: i18n.lang });
    else if (isLocalHost || __DEV_TOOLS__) provider = new LocalProvider(cfg, rand, './fixtures/', q.get('persist') !== '0');
    else { loading.error(t('err.session'), () => location.reload()); return; }
  }

  // ---------------- parallel loading
  const app = new GameApp({ clock, resolution: Math.min(devicePixelRatio || 1, 2), antialias: false });
  const audio = new AudioEngine({ baseUrl: './audio/', now: () => clock.time * 1000 });
  const holder: { session: SessionInfo | null } = { session: null };
  const tasks: Promise<unknown>[] = [
    (async () => {
      const fams = ['800 32px Oxanium', '700 32px Oxanium', '600 16px "Chakra Petch"', '500 16px "Chakra Petch"'];
      let n = 0;
      await Promise.all(fams.map((f) => document.fonts.load(f).then(() => pFonts(++n / fams.length))));
    })(),
    (async () => {
      await app.init(gameRoot);
      if (__DEV_TOOLS__) await assets.enableStandIns();
      await assets.preload(assets.ids(), (d, tot) => pImages(tot ? d / tot : 1));
      pImages(1);
    })(),
    (async () => { await audio.loadManifest(); await audio.loadCritical((d, tot) => pAudio(tot ? d / tot : 1)); pAudio(1); })().catch(() => pAudio(1)),
    (async () => {
      if (provider) { holder.session = await provider.authenticate(); }
      pSession(1);
    })(),
  ];
  try { await Promise.all(tasks); } catch (e) {
    const err = e as ProviderError;
    const msg = err instanceof ProviderError ? (err.code === 'SESSION' ? t('err.session') : t(`err.${err.code}`) !== `err.${err.code}` ? t(`err.${err.code}`) : t('loading.error')) : t('loading.error');
    loading.error(msg, () => location.reload());
    console.error(e);
    return;
  }
  const session = holder.session;
  if (session?.jurisdiction.socialCasino) i18n.social = true;
  installFonts();

  // ---------------- scene
  const renderer = app.app.renderer;
  const scene = new Scene(assets, renderer, rand, {
    sound: (id, o) => audio.play(id, { ...(o?.rate ? { rate: o.rate } : {}), variant: true }),
    quiet: () => false,
  });
  app.app.stage.addChild(scene.cam, scene.screen);
  let layout: Layout = computeLayout(innerWidth, innerHeight, matchMedia('(pointer: coarse)').matches);

  const ui = new Ui(document.body, {
    spin: () => { audio.play('ui_click', { variant: true }); game.press(); },
    betStep: (d) => game.betStep(d),
    openShop: () => { audio.play('ui_open'); openShop(); },
    buy: (m) => { audio.play('ui_buy_confirm'); game.buy(m as ModeId); },
    autoStart: (n) => game.startAuto(n),
    autoStop: () => game.stopAuto(),
    ante: (on) => game.setAnte(on),
    turbo: (on) => { game.turbo = on; ui.settings.turbo = on; cat?.setTurbo(on); audio.play('ui_toggle'); },
    sound: (on) => { audio.setMuted('master', !on); },
    settings: (s) => applySettings(s),
    replayRound: (id) => { const r = game.history.find((h) => h.id === id); if (r) void game.replay(r.book, r.betMicros); },
    fullscreen: () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => {}); },
  });
  const fmt = (micros: number) => formatMoney(micros, { currency: session?.currency ?? 'EUR', locale: i18n.locale });
  ui.setFormatter(fmt);
  // image URLs for the HTML UI (manifest; in dev/QA builds the stand-ins are extracted once)
  const urls: Record<string, string | null> = {};
  const htmlImages = ['ui.spin', 'ui.spin_stop', 'ui.buy', 'ui.round', 'ui.panel', 'ui.popup', 'ui.icons', 'ui.intro.ninelives', 'ui.intro.doublegaze', 'ui.intro.scan', 'ui.intro.doublescan', 'ui.total', 'logo',
    'welcome.laser', 'welcome.ninelives', 'welcome.doublegaze', 'shop.ninelives', 'shop.doublegaze', 'shop.scan', 'shop.doublescan',
    'sym.L1', 'sym.L2', 'sym.L3', 'sym.L4', 'sym.H1', 'sym.H2', 'sym.H3', 'sym.H4', 'sym.W', 'sym.S'];
  await Promise.all(htmlImages.map(async (id) => {
    urls[id] = assets.url(id);
    if (!urls[id] && __DEV_TOOLS__) { try { urls[id] = await renderer.extract.base64({ target: assets.tex(id, renderer), format: 'png' }); } catch { urls[id] = null; } }
  }));
  const imageUrl = (id: string): string | null => urls[id] ?? null;
  ui.setImages(Object.fromEntries(htmlImages.slice(0, 13).map((id) => [id, imageUrl(id)])));

  // ---------------- cat
  let cat: CatView | null = null;
  const catDef = layout.design.cat;
  cat = new CatView({ zoneW: catDef.height * 0.8, zoneH: catDef.height / 0.62, catHeight: catDef.height, glbUrl: __DEV_TOOLS__ && q.get('catglb') ? q.get('catglb')! : './assets/cat/cat.glb', stillsUrl: './assets/cat/poses/poses.json', mobile: layout.cls === 'portrait' || layout.cls === 'short', rand });
  scene.attachCat(cat);
  void cat.loadStills();

  const celebration = new Celebration(scene, assets, renderer, {
    format: fmt,
    sound: (id, o) => audio.play(id, o),
    loop: (id) => audio.loop(id),
    duck: (on) => audio.duck(on),
    cat: (m) => cat?.request(m),
    tierName: (id) => t(`tier.${id}`),
  });
  scene.celebrationLayer.addChild(celebration.root);
  celebration.buildTitles();

  const sound: SoundPort = {
    play: (id, o) => audio.play(id, o),
    loop: (id, o) => audio.loop(id, o),
    duck: (on) => audio.duck(on),
    music: (id, f) => audio.music(id, f),
    ambienceLayer: (id, f) => audio.ambienceLayer(id, f),
  };
  let game!: GameController;
  const presenter = new GamePresenter({
    scene, celebration, cat: () => cat, ui, sound, cfg,
    baseBet: () => game.bet, format: fmt, t,
    turbo: () => game.turbo, reduced: () => ui.settings.reduced, autoplaying: () => game.autoLeft !== null,
  });
  game = new GameController({ clock, provider: provider ?? new LocalProvider(cfg, rand), cfg, presenter, ui, format: fmt, onSound: (id) => audio.play(id) });
  game.fsm.go('loading');
  if (session) { game.init(session); ui.setJurisdiction(session.jurisdiction); }

  ui.setRulesBuilder(() => buildRules(cfg, {
    symbolUrl: (id) => imageUrl(id), money: (u) => fmt(Math.round(u)), bet: game.bet, version: __APP_VERSION__,
    showRtp: session?.jurisdiction.displayRTP ?? true, costs: session?.costs ?? {},
  }));

  function openShop(): void {
    const s = session;
    if (!game.idle || s?.jurisdiction.disabledBuyFeature) return;
    const offers = (['BONUS', 'SUPER', 'SCAN', 'DOUBLE_SCAN'] as ModeId[]).filter((m) => cfg.modes[m]).map((m) => {
      const price = game.costOf(m);
      const bonus = m === 'BONUS' ? 'nineLives' : m === 'SUPER' ? 'doubleGaze' : null;
      return {
        mode: m,
        name: m === 'BONUS' ? t('bonus.nineLives') : m === 'SUPER' ? t('bonus.doubleGaze') : m === 'SCAN' ? t('feature.scan') : t('feature.doubleScan'),
        spinsText: bonus ? t('buy.spins', { n: cfg.bonus[bonus].spins }) : t('buy.oneSpin'),
        priceText: fmt(price), enabled: price <= game.balance,
        art: imageUrl(m === 'BONUS' ? 'shop.ninelives' : m === 'SUPER' ? 'shop.doublegaze' : m === 'SCAN' ? 'shop.scan' : 'shop.doublescan'),
      };
    });
    ui.openShop(offers, fmt(game.bet));
  }

  // ---------------- settings
  function applySettings(s: Partial<typeof ui.settings>): void {
    Object.assign(ui.settings, s);
    const st = ui.settings;
    audio.setVolume('master', st.master); audio.setVolume('music', st.music); audio.setVolume('amb', st.music); audio.setVolume('sfx', st.sfx); audio.setVolume('ui', st.sfx);
    if (s.turbo !== undefined) { game.turbo = st.turbo; ui.setTurbo(st.turbo); cat?.setTurbo(st.turbo); }
    const reduced = st.reduced || matchMedia('(prefers-reduced-motion: reduce)').matches;
    scene.reduced = reduced;
    scene.decor.setQuality(st.quality === 'low', reduced);
    scene.particles.lowQuality = st.quality === 'low';
    scene.particles.reduced = reduced;
    ui.root.classList.toggle('reduced', reduced);
    cat?.setReduced(reduced);
    try { localStorage.setItem('cybercat.settings', JSON.stringify(st)); } catch { /* private mode */ }
  }
  try { const saved = localStorage.getItem('cybercat.settings'); if (saved) Object.assign(ui.settings, JSON.parse(saved)); } catch { /* ignore */ }
  if (q.get('turbo') === '1') ui.settings.turbo = true;
  if (q.get('reduced') === '1') ui.settings.reduced = true;
  if (session?.jurisdiction.disabledTurbo) ui.settings.turbo = false;

  // ---------------- layout + loop
  const relayout = () => {
    layout = computeLayout(innerWidth, innerHeight, matchMedia('(pointer: coarse)').matches);
    scene.layout(layout);
    ui.layout(layout);
    cat?.resize(layout.scale, Math.min(devicePixelRatio || 1, layout.cls === 'portrait' || layout.cls === 'short' ? 1.5 : 2));
  };
  relayout();
  let resizeT = 0;
  addEventListener('resize', () => { clearTimeout(resizeT); resizeT = window.setTimeout(relayout, 60); });
  scene.grid.setBoard(initialBoard());
  app.onBeforeRender.add((dt) => {
    scene.update(dt, game.fsm.is('idle'));
    cat?.update(dt, app.fps);
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') audio.suspend(); else audio.resume(); });
  app.start();
  applySettings({});

  // ---------------- keyboard: Space / Enter spin (or quick stop / skip), respecting the flags
  addEventListener('keydown', (e) => {
    if (e.repeat || ui.dialogOpen || ui.catcher.isArmed) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'BUTTON' || target.tagName === 'INPUT') && (e.key === 'Enter' || e.key === ' ')) return;
    if (e.key === ' ' && session?.jurisdiction.disabledSpacebar) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); game.press(); }
  });

  // ---------------- dev / QA
  if (__DEV_TOOLS__) { const dev = await import('./dev/qa'); dev.installQa({ app, clock, game, scene, presenter, ui, audio, provider: provider as Provider, cfg, cat: () => cat, celebration, relayout, fmt }); }

  // ---------------- replay mode (URL)
  if (replay) {
    ui.setPhase('locked');
    await loading.hide();
    await runReplayMode(game, ui, cfg);
    return;
  }

  // ---------------- welcome -> entrance
  void loadCatModules().catch(() => {});
  await loading.hide();
  ui.hide(true);
  scene.cam.alpha = 0.001;
  game.fsm.go('welcome');
  const welcome = new WelcomeScreen(document.body, urls['logo'] ?? null, [
    [urls['welcome.laser'] ?? null, t('welcome.card1')], [urls['welcome.ninelives'] ?? null, t('welcome.card2')], [urls['welcome.doublegaze'] ?? null, t('welcome.card3')],
  ]);
  gsap.to(scene.cam, { alpha: 0.35, duration: 0.6, overwrite: true });
  if (!(__DEV_TOOLS__ && q.get('skipWelcome') === '1')) await welcome.wait();
  await audio.unlock();
  audio.ambience('amb_city', 1.5);
  audio.music('music_base', 2);
  void welcome.hide();
  // entrance: decor, grid and HUD settle, the cat lands (dive) or fades in from its still pose
  gsap.to(scene.cam, { alpha: 1, duration: 0.5, overwrite: true });
  ui.hide(false);
  const reduced = ui.settings.reduced;
  const ok3d = cat ? await Promise.race([
    loadCatModules().then((m) => cat!.init3d(m.bundle, layout.scale, Math.min(devicePixelRatio || 1, layout.cls === 'portrait' || layout.cls === 'short' ? 1.5 : 2))),
    new Promise<boolean>((r) => setTimeout(() => r(false), 8000)),
  ]).catch(() => false) : false;
  if (ok3d && cat) {
    cat.setTurbo(game.turbo);
    cat.setReduced(reduced);
    cat.go3d('idle');
    if (!reduced) { cat.request('intro'); audio.play('dive_impact', { delay: 0.35 }); scene.shake(0.08, 7); }
  }
  // active round (reload in the middle of a bonus): resume without a new debit
  const active = session?.activeRound;
  game.fsm.go('entering');
  if (active) { await game.resume(active); }
  else { game.fsm.go('idle'); ui.setPhase('idle'); game.refreshHud(); }

  function initialBoard() {
    const r = mulberry32(7);
    const pool = ['L1', 'L2', 'L3', 'L4', 'H1', 'H2', 'H3', 'H4'] as const;
    return Array.from({ length: 5 }, () => Array.from({ length: 4 }, () => pool[Math.floor(r() * pool.length)]!));
  }
}

async function runReplayMode(game: GameController, ui: Ui, cfg: GameConfig): Promise<void> {
  const p = { rgsUrl: q.get('rgs_url') ?? '', game: q.get('game') ?? '', version: q.get('version') ?? '', mode: q.get('mode') ?? 'base', event: q.get('event') ?? '', amountMicros: Number(q.get('amount') ?? 1_000_000), currency: q.get('currency') ?? 'USD' };
  try {
    const r = await fetchReplay(p);
    const book = Book.parse(r.book);
    game.session = { balanceMicros: 0, currency: p.currency, betLevels: [p.amountMicros], defaultBetMicros: p.amountMicros, jurisdiction: { ...DEFAULT_JURISDICTION }, activeRound: null, costs: {} };
    game.betIndex = 0;
    game.fsm.go('welcome'); game.fsm.go('entering'); game.fsm.go('idle');
    ui.setPhase('idle');
    await game.replay(book, p.amountMicros);
  } catch (e) {
    console.error(e);
    ui.error(t('err.generic'), [{ label: t('err.reload'), run: () => location.reload(), primary: true }]);
  }
  void cfg;
}

boot().catch((e) => console.error('[boot]', e));
