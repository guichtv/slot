// THE timing settings file (section 6). Seconds. Turbo multiplies by TURBO where it applies.
// Button < 100 ms; UI transition 100-250 ms; reaction 250-650 ms; amount read 250-500 ms;
// connection 450-900 ms; spin 1.2-2 s; scene transition 0.8-1.8 s.
export const T = {
  TURBO: 0.55,
  ui: { press: 0.08, panel: 0.2, popupIn: 0.24, popupOut: 0.18 },
  spin: {
    accel: 0.14, // reels start
    minSpin: 0.5, // before the first reel may stop
    reelGap: 0.13, // between reel stops
    land: 0.32, // landing tween per reel (with bounce)
    speed: 26, // cell pitches per second at full speed
    anticipationTotal1: 1.8, // one reel in tension
    anticipationTotal: 2.1, // several reels: shared (1.3 + 0.8, or 1.1 + 0.5 + 0.5), always within 1.6-2.2 s
    anticipationSpeed: 0.45, // speed factor on anticipated reels
    quickStopLand: 0.16,
  },
  laser: {
    eyeCharge: 0.34,
    beam: 0.14,
    hop: 0.2, // per hop
    upgrade: 0.3,
    multStamp: 0.42,
    hold: 0.25,
  },
  chips: { upgradeStagger: 0.07, place: 0.2, circuitIn: 0.5, offStagger: 0.09 },
  win: {
    connection: 0.75, // per win group (450-900 ms)
    connectionFast: 0.45, // when there are many groups
    amountIn: 0.3,
    multSteps: 0.34, // base -> xN -> final, per step
    spinTotalHold: 0.55,
    dimAlpha: 0.32,
  },
  tiers: { big: 3.0, super: 4.4, mega: 5.8, epic: 7.2, cyber: 8.6, max: 10.5, holdAtEnd: 3.6, holdAtEndTurbo: 2.2 },
  bonus: {
    triggerScatters: 1.1,
    introAuto: 0, // 0 = wait for the click
    tearToRun: 0.3, // the punch tears the popup <= 0.3 s after the click
    transition: 1.6, // <= 1.8 s
    fsBanner: 1.1,
    betweenSpins: 0.35,
    endChipsOff: 0.09,
    scatterDrop: 0.55, // bought bonus: scatters fall one by one
  },
  scene: { zoomIn: 0.45, zoomOut: 0.5, anticipationZoom: 1.06, celebrateZoom: 1.1 },
  idle: { symbolAccentMin: 5, symbolAccentMax: 12, droneMin: 18, droneMax: 34, trainMin: 16, trainMax: 30 },
} as const;

export const tscale = (turbo: boolean): number => (turbo ? T.TURBO : 1);
