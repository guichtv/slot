# BOOMTOOTH — Architecture du front

Slot 2D **Vite 7 + TypeScript strict + PixiJS 8 + GSAP**, validation **zod**. Le front est un **lecteur d'événements** : il reçoit un « book » (Stake Engine ou fixture locale), le valide, puis le **met en scène événement par événement**. Il ne calcule jamais un gain (contrat : `docs/CONTRAT-EVENTS.md`).

État décrit : commit `eb1621c` + arbre de travail du 28/09 (d'autres modifications sont en cours dans `src/ui`, `src/audio`, `src/render`, `tools/`).

**Règles de conception**

- **Une seule horloge** pour l'image, les tweens, les attentes et les particules (`PresentationClock`).
- **Un état logique séparé de l'image** : chaque événement est appliqué **une fois** au modèle, puis présenté.
- **Tout passe** : chaque séquence peut être accélérée (turbo), passée (skip) ou annulée, et atteint alors son **état final exact**.
- **États explicites** (`Fsm`) : chaque état déclare ses transitions et les entrées qu'il accepte.
- **Mise en page en source unique** : la scène Pixi et le HUD HTML lisent les mêmes rectangles.
- **Aucune illustration dessinée en code** : les images viennent d'ImageGen (`docs/ASSETS.md`) ; seules les primitives d'effets sont en code.

---

## 1. Carte des modules

| Dossier | Fichiers | Rôle |
|---|---|---|
| `src/core` | `clock.ts` | horloge de présentation partagée (rAF ou horloge virtuelle QA), pilote GSAP et Pixi |
| | `beat.ts` | `Beat` (contexte d'une séquence : attendre, jouer, passer) et `CancelToken` |
| | `fsm.ts` | machine d'états du jeu (tables de transitions et d'entrées) |
| | `money.ts` | entiers monétaires (base 10⁶), `bookToMoney`, formatage des devises et des multiplicateurs |
| `src/contract` | `schema.ts` | schémas zod du book v1.1, `parseBook`, `checkBook`, constantes de grille et de charges |
| `src/config` | `math.ts` | chargement et schéma de `public/game-math-config.json` (`math()`, `modeCost()`, `payFor()`) |
| | `timings.ts` | réglages centralisés de mise en scène (`T` : délais, zooms, budgets de particules) |
| `src/provider` | `types.ts` | interface `RoundProvider`, `SessionInfo`, `PlayedRound` |
| | `DemoProvider.ts` | mode local : fixtures, playlist pondérée sans remise, solde simulé, pannes simulées |
| | `StakeProvider.ts` | session Stake Engine : authentification, pari, clôture, reprise |
| | `ReplayProvider.ts` | relecture d'une manche Stake (`/bet/replay`), sans pari |
| `src/stake` | `params.ts` | lecture des paramètres d'URL (session, replay, langue, DEV) |
| | `rgs.ts` | client HTTP du RGS (`RgsClient`, `fetchReplay`, `RgsError`) |
| `src/controller` | `game.ts` | `GameController` : commandes → fournisseur → lecteur ; solde, mise, turbo, autoplay, erreurs |
| | `model.ts` | `RoundModel` : état logique d'une manche |
| | `player.ts` | `RoundPlayer` : joue les événements un par un |
| | `presenter.ts` | `GamePresenter` : traduit chaque événement en mise en scène sur un `Stage` |
| `src/render` | `app.ts` | création de l'application Pixi (ticker coupé, piloté par l'horloge) |
| | `scene.ts` | racine de la scène : caméra, calques, voile, bannières ; recalcul de la mise en page |
| | `camera.ts` | caméra commune (zoom autour d'un point, secousse, parallaxe) |
| | `layout.ts` | classes d'écran et rectangles de mise en page |
| | `assets.ts` | manifeste, chargement réel des textures (progression vraie), `tex()` / `hasTex()` |
| | `decor.ts` | décor en calques (ciel, nuages, lointain, Mount Buckmore, projecteurs, oiseaux…), ambiances |
| | `grid/` | `GridView` (grille 5 × 5, gains, chutes, géants), `ReelColumn` (rouleau en anneau), `SymbolView` (symbole en pièces), `FrameView` (cadre recomposé), `symbolConfig.ts`, `partsLayout.json` |
| | `fx/` | `blast.ts` (piquets, fil, étincelle, mèche, explosion, sculpture), `particles.ts` (particules en pool), `textures.ts` (atlas des primitives d'effets) |
| | `rig/Rig.ts` | rig cut-out générique (pièces, pivots, variantes, poses) |
| | `mascot/Buck.ts` | Buck Boomtooth : repos, gestes, réactions, performances ; `buckRig.json` |
| | `cornerstone.ts` | THE CORNERSTONE : bloc du multiplicateur de bonus |
| | `logo.ts` | logo dans le décor (respiration, mèche, sursaut) |
| | `celebration.ts` | célébration des gros gains côté scène (geysers de pépites, détonations par palier) |
| `src/ui` | `hud.ts` | HUD HTML : SPIN, mise, gain, solde, turbo, autoplay, son, menu, BUY |
| | `overlays.ts` | compteur de free spins, « +N », intro / fin de bonus, célébrations (texte) |
| | `welcome.ts` | écran d'accueil (logo, trois cartes, gain max) |
| | `buy.ts`, `ante.ts`, `menu.ts`, `dialogs.ts`, `dom.ts` | catalogue BUY BONUS, interrupteur Ante, menu (règles, réglages, historique), dialogues techniques, micro-DOM |
| | `*.css` | thème et styles (peau du HUD = images ImageGen) |
| `src/i18n` | `index.ts`, `social.ts`, `locales/*.json` | traductions (17 langues déclarées, **`en` et `fr` présents**, repli anglais), mode social Stake |
| `src/audio` | `engine.ts`, `sfx.ts`, `music.ts`, `ambience.ts` | Web Audio 100 % synthétisé (bus, effets, musique, ambiances) ; voir `docs/AUDIO.md` |
| `src/dev` | `qa.ts` | hooks QA `window.__qa` (dev et QA uniquement) |
| | `mascotBench.ts` | banc de la mascotte (`mascot-bench.html`, dev uniquement) |
| `src` | `main.ts` | démarrage : chargement, scène, HUD, fournisseur, contrôleur, accueil |

Pages HTML à la racine : `index.html` (le jeu), `mascot-bench.html` (banc mascotte, dev), `directions.html` (galerie des directions artistiques).

## 2. Flux de données

```
  URL ──► parseLaunchParams()                    src/stake/params.ts
             │ local / stake / replay / invalid
             ▼
  ┌──────────────────────── RoundProvider ────────────────────────┐
  │ DemoProvider (fixtures.json) · StakeProvider (RGS) · ReplayProvider │
  └────────────────────────────────────────────────────────────────┘
     authenticate(lang) ──► SessionInfo { solde, devise, mises, juridiction, reprise }
     play(bet, mode)    ──► PlayedRound { id, mode, bet, book = parseBook(…), startAt, active } + solde serveur
     endRound(round)    ──► solde serveur
             │
             ▼
  GameController  (Fsm · HUD · solde serveur · autoplay · erreurs)     src/controller/game.ts
             │ player.play(round.id, round.book, { startAt, speed })
             ▼
  RoundPlayer   pour chaque événement e (index croissant, jamais en parallèle) :
             │    prev = model.clone() ; model.apply(e) ; await presenter.present(e, prev, model, beat)
             │    RoundModel = état logique (appliqué une fois)
             ▼
  GamePresenter ──► Stage { grid, blast, mascot, camera, decor, ui, sound }
             │
             ▼
  Scene Pixi (décor, grille, Buck, Cornerstone, effets)  +  HUD / Overlays HTML  +  audio
             ▲
  PresentationClock ── rAF ou __qa.step(ms) ──► gsap.updateRoot · app.ticker.update · Beat.wait
```

**Démarrage** (`src/main.ts`) : langue → config maths → manifeste → polices → **toutes les textures du manifeste** (progression réelle) → application Pixi → **envoi de toutes les textures au GPU** (`renderer.prepare`, arbre de travail : pas d'à-coup au premier bonus) → `Scene`, `Cornerstone`, `Buck` → fournisseur → `authenticate` → HUD, overlays, célébration → `GamePresenter` + `GameController` → hooks QA (si `__DEV_TOOLS__`) → `clock.start()` → FSM `welcome` → écran d'accueil (sauf `?skipIntro`, `?qa` ou préférence locale ; `?welcome` le force) → entrée thématique (Buck balaie la scène, recul caméra, logo) → `entering` → `ready`.

**Une manche** (`GameController.playRound`) :

1. `fsm.go('requesting')`, HUD en phase de spin. En spin normal, **les rouleaux partent au clic** (le résultat arrive pendant le défilement).
2. `provider.play(bet, mode)`. Erreur **incertaine** (timeout, réseau, 5xx sur un pari) → état `waiting`, dialogue, puis `reconcile()` : si une manche est ouverte côté serveur, elle est **reprise sans nouveau débit**. Jamais de re-pari automatique. Erreur certaine → `error`, « Réessayer » possible.
3. `fsm.go('spinning')`, puis `player.play(...)` joue tout le book (free spins compris, sans autoplay).
4. `provider.endRound(round)` (avec relance sur erreur) → **solde serveur**.
5. `returning` → `ready` ; autoplay éventuel (220 ms / vitesse).

Commandes pendant la manche : second clic ou Espace = **arrêt rapide** (`quickStop` : colonnes arrêtées, résultat inchangé) ; clic sur la grille = **passe la présentation en cours** (`skipCurrent`).

## 3. Horloge de présentation (`src/core/clock.ts`)

- **Une instance partagée** : `clock`. Elle est la **seule source de temps** de l'image, des tweens, des attentes et des particules.
- **GSAP** : à la construction, `gsap.ticker.remove(gsap.updateRoot)` et `lagSmoothing(0)`. À chaque pas, l'horloge appelle **`gsap.updateRoot(base + time / 1000)`** : le temps racine reste monotone.
- **Pixi** : le ticker de l'application est arrêté (`autoStart: false`, `app.ticker.stop()`) ; `clock.onFrame(t => app.ticker.update(t))` (`src/render/app.ts`).
- **Mode normal** : boucle `requestAnimationFrame`, delta plafonné à **50 ms** (jamais de rafale après un gel), facteur `rate` (ralenti de revue, par exemple 0,25).
- **Onglet masqué** : l'horloge se fige (`visibilitychange`), puis reprend sans saut.
- **Attentes** : `clock.wait(ms)` se résout sur le temps de présentation (**jamais `setTimeout`** pour une animation) ; `flushTimers()` résout tout.
- **Horloge virtuelle (QA)** : `?qa` (avec les outils DEV) appelle `clock.useVirtual()` : plus de rAF, le temps n'avance que par **`clock.step(ms, frame = 1000/60)`**, exposé en `__qa.step`. Les captures sont donc déterministes.

## 4. `Beat` et `CancelToken` (`src/core/beat.ts`)

`Beat` = contexte d'exécution d'une séquence de présentation.

| Méthode | Effet |
|---|---|
| `wait(ms)` | attend `ms / speed` sur l'horloge ; immédiat si la séquence est passée ou annulée |
| `play(anim)` | joue une timeline GSAP jusqu'au bout (vitesse appliquée par `timeScale`) ; si passée : `progress(1)` immédiat |
| `fire(anim)` | lance sans attendre (effet parallèle) ; un skip l'amène aussi à sa fin |
| `skip()` | `skipping = true`, **toutes les animations actives passent à `progress(1)`**, toutes les attentes se résolvent ; propagé aux sous-séquences (`child()`) |
| `fast` | vrai si passée ou annulée |
| `speed` | turbo : 1, 1,8 ou 3 (`GameController.speed`) |

`CancelToken` : `cancel(reason)` vide les animations et attentes du `Beat` ; la séquence lève ensuite `Cancelled` (`throwIfCancelled`). `RoundPlayer` attrape `Cancelled` et rend le modèle tel quel.

**Garantie** : passer une séquence mène à l'**état visuel final exact**, sans réappliquer l'état logique (déjà appliqué avant la présentation).

## 5. Modèle et lecteur

**`RoundModel.apply(e)`** (`src/controller/model.ts`) : applique un événement **une seule fois** (`index <= lastIndex` → ignoré). Il ne fait que **recopier** les valeurs du book : grille, charges, géants, gain du spin, total, total du bonus, multiplicateur, état des free spins, plafond, fin. Détail par événement : `docs/CONTRAT-EVENTS.md` § 5.

**`RoundPlayer.play(roundId, book, { startAt, speed, instant })`** (`src/controller/player.ts`) :

- Une seule manche à la fois (sinon erreur).
- **Reprise / seek** : les événements `index < startAt` sont appliqués **silencieusement**, puis `presenter.restore(model)` remet la scène directement dans cet état.
- Pour chaque événement suivant : clé `roundId#index` (**jamais deux fois**), `prev = model.clone()`, `model.apply(e)`, `present(e, prev, model, beat)`, `afterEvent?`, contrôle d'annulation.
- `skipCurrent()` passe l'événement en cours ; la vitesse normale revient à l'événement suivant. `skipRest()` passe toute la fin de la manche. `instant` passe tout (tests).
- **Plafond** : après un `wincap` présenté, le lecteur applique `finalWin` sans le présenter et **s'arrête**.

**`GamePresenter`** (`src/controller/presenter.ts`) reçoit un `Stage` injecté par `main.ts` : `grid`, `blast`, `mascot`, `camera`, `decor`, `ui`, `sound`, `reducedMotion`. Il ne lit que les valeurs du book (conversion monétaire seulement, `bookToMoney`).

## 6. Machine d'états (`src/core/fsm.ts`)

- `go(to)` : refuse toute transition absente de la table (exception « transition interdite »). Même état : rien.
- `own(dispose)` : ressource liée à l'état courant (timer, écouteur, tween, son), **libérée à la transition suivante**.
- `accepts(input)` : l'entrée est-elle autorisée dans l'état courant ?
- `inRound` : vrai dans `spinning`, `anticipation`, `resolving`, `feature`, `celebration`, `bonusIntro`, `bonus`, `bonusOutro`, `returning`.
- `history` : 200 derniers états au plus.

| État | Transitions autorisées | Entrées acceptées |
|---|---|---|
| `loading` | `welcome`, `error`, `replay` | — |
| `welcome` | `entering`, `error` | `dismiss` |
| `entering` | `ready`, `resume`, `error` | — |
| `ready` | `requesting`, `catalog`, `replay`, `error`, `waiting` | `spin`, `bet`, `buy`, `menu`, `autoplay`, `ante` |
| `requesting` | `spinning`, `ready`, `error`, `waiting` | — |
| `spinning` | `anticipation`, `resolving`, `bonusIntro`, `celebration`, `returning`, `error` | `quickStop`, `skip`, `menu` |
| `anticipation` | `resolving`, `bonusIntro`, `returning`, `error` | `quickStop`, `skip`, `menu` |
| `resolving` | `feature`, `celebration`, `bonusIntro`, `returning`, `spinning`, `anticipation`, `bonus`, `error` | `skip`, `menu` |
| `feature` | `resolving`, `celebration`, `returning`, `bonusIntro`, `spinning`, `bonus`, `error` | `skip`, `menu` |
| `celebration` | `returning`, `bonusIntro`, `bonus`, `bonusOutro`, `resolving`, `error` | `skip`, `dismiss` |
| `bonusIntro` | `bonus`, `error` | `dismiss` |
| `bonus` | `spinning`, `anticipation`, `resolving`, `feature`, `celebration`, `bonusOutro`, `error` | `skip`, `menu` |
| `bonusOutro` | `returning`, `celebration`, `error` | `dismiss`, `skip` |
| `returning` | `ready`, `requesting`, `error` | — |
| `catalog` | `confirm`, `ready`, `error` | `buy`, `dismiss`, `menu` |
| `confirm` | `catalog`, `requesting`, `ready`, `error` | `buy`, `dismiss` |
| `waiting` | `ready`, `requesting`, `error`, `spinning` | — |
| `error` | `ready`, `loading`, `resume`, `welcome`, `entering` | `dismiss` |
| `resume` | `spinning`, `bonus`, `bonusIntro`, `resolving`, `ready`, `error` | — |
| `replay` | `ready`, `loading`, `replay`, `error` | `skip`, `menu` |

Entrées possibles : `spin`, `quickStop`, `bet`, `buy`, `menu`, `autoplay`, `ante`, `skip`, `dismiss`.

**Usage actuel** : le contrôleur parcourt `loading → welcome → entering → ready → requesting → spinning → returning → ready`, plus `waiting` / `error` en cas de panne. Les états fins de la manche (`anticipation`, `resolving`, `bonus`…), `catalog`, `confirm`, `resume` et `replay` sont **déclarés mais pas encore pilotés** : pendant toute la lecture d'un book, la FSM reste en `spinning`.

## 7. Calques de rendu

Tout le monde (décor, grille, mascotte) est dans le **monde de la caméra** ; le voile et les célébrations sont hors caméra ; le HUD est en HTML au-dessus du canvas.

```
app.stage
├── camera.world                      (zoom, secousse ; ordre du fond vers l'avant)
│   ├── decor.back                    ciel jour · ciel nuit · nuages ·
│   │                                 [lointain miroir · lointain · Mount Buckmore 0-3 · tours de projecteurs ·
│   │                                  faisceaux · plan intermédiaire · chute d'eau (traits)] · oiseaux · poussières
│   ├── decor.ground                  sol
│   ├── logo.view                     logo BOOMTOOTH
│   ├── grid.view                     fond (cases ui.cell) · halos · rouleaux (masqués) · géants (masqués) ·
│   │                                 effets internes (poussière, éclats, étincelles) · masque · cadre · montants
│   ├── mascotLayer                   Cornerstone · Buck (ombre, rig, détonateur)
│   ├── blast.outer                   piquets et cordeau · fil · fumée · éclats · onde · flash · étincelles
│   └── decor.front                   premier plan (rondins, rocher)
└── overlay                           (hors caméra)
    ├── veil                          voile léger derrière les popups
    ├── banners
    └── celebration                   geysers de pépites, roches, poussière, éclairs

DOM : #app > #stage (canvas #scene) · #ui (overlays, HUD, dialogues) · #loader
```

- Symboles et halos restent **dans le masque de la grille** ; seuls les éclats et la poussière d'explosion en sortent.
- Le décor s'atténue pendant la lecture d'un gain (`setDim`) ; ambiances `base` / `bonus` / `super` par filtres de couleur et fondu du ciel de nuit.

## 8. Mise en page (`src/render/layout.ts`)

`computeLayout(vw, vh, grille, safeAreas)` rend un `SceneLayout` (pixels CSS) lu par la scène **et** par le HUD / les overlays (`data-layout` = classe) :

`cls`, `vw`, `vh`, `hud`, `stage`, `grid`, `cell`, `mascot { x, y, h, side, visible }`, `logo`, `ante`, `topBar`.

**Classes** (`classify`, dans cet ordre) :

| Classe | Condition | Composition |
|---|---|---|
| `mini` | largeur < 560 **et** hauteur < 560 | HUD en bas (26 % de la hauteur, 110–150 px), en-tête réduit, grille pleine largeur, **mascotte masquée** |
| `tablet` | ratio < 0,8 et largeur ≥ 700 | HUD en bas (20 %, 170–230 px), en-tête 26 % (logo à gauche, Buck à droite), grille pleine largeur |
| `portrait` | ratio < 0,8 | comme `tablet`, HUD 24 % (170–220 px) |
| `landscapeShort` | hauteur < 520 | téléphone paysage : colonne HUD à droite (15 %, 96–150 px), colonne gauche (logo, Ante), grille dans 66 % de la scène, Buck à droite s'il y a la place |
| `desktop` | largeur ≥ 1280 | bande HUD en bas (12 %, 88–118 px), grille centrale (≤ 50 % de la largeur), logo et Ante à gauche, Buck à droite |
| `laptop` | sinon | comme `desktop`, grille ≤ 54 % de la largeur |

- Marges de sécurité : variables CSS `--sat/--sar/--sab/--sal` (`env(safe-area-inset-*)`).
- Épaisseur du cadre : `FRAME_BORDER` = 0,6 case (+ 0,04).
- La scène se recalcule sur `resize` et `visualViewport.resize`.

## 9. Modes de build

| Mode | Commande | Sortie | `__DEV_TOOLS__` | Port |
|---|---|---|---|---|
| `development` | `npm run dev` | serveur Vite | `true` | **5301** (`127.0.0.1`, `strictPort`) |
| `qa` | `npm run build:qa` | `dist-qa/` | `true` | servi par `npm run preview` sur **5302** (`strictPort`) |
| `production` | `npm run build` | `dist/` | `false` | — |
| production figée (locale) | `node tools/serve-stable.mjs` | `dist-stable/` | `false` | **5320** (`vite preview`) |
| tests | `npm test` (vitest, environnement node) | — | `true` (`__BUILD_MODE__ = "test"`) | — |

`vite.config.ts` :

- `define` : **`__DEV_TOOLS__`** = `mode !== 'production'` ; **`__BUILD_MODE__`** = nom du mode (déclaré dans `src/env.d.ts`, **pas encore lu** dans `src/`).
- `base: './'` (chemins relatifs, hébergement CDN Stake) ; `target: es2020` ; aucun inline d'asset ; pas de sourcemap ; chunks séparés `pixi` et `gsap`.
- En production, `if (__DEV_TOOLS__) await import('./dev/qa')` disparaît : **aucun hook QA ni avertissement DEV** dans la build publique.
- Seul `index.html` est une entrée de build : `mascot-bench.html` et `directions.html` ne vivent que sur le serveur de dev.
- `npm run typecheck` : `tsc --noEmit` (strict, `noUncheckedIndexedAccess`).

Paramètres d'URL de développement (`params.dev`) : `?qa` (horloge virtuelle, seulement avec les outils DEV ; saute aussi l'accueil), `?skipIntro`, `?seed=n` (graine de la playlist locale), `?welcome` (force l'accueil). `?skipIntro`, `?seed` et l'effet « pas d'accueil » de `?qa` ne sont **pas filtrés par `__DEV_TOOLS__`** : ils agissent aussi en production. `?scenario`, `?variant` et `?mockRgs` sont lus mais **pas encore utilisés**.

## 10. Intégration Stake Engine

### 10.1 Paramètres de lancement (`src/stake/params.ts`)

| Cas | Paramètres | Résultat |
|---|---|---|
| **Session** | `sessionID`, `rgs_url` (+ `lang`, `device`, `social`) | `StakeProvider` |
| **Replay** | `replay=true`, `rgs_url`, `game`, `version`, `mode`, `event` (+ `currency`, `amount` entier, `lang`) | `ReplayProvider` |
| **Local** | aucun des deux | `DemoProvider` (fixtures) |
| **Invalide** | session ou replay incomplet | écran d'erreur ; **jamais de bascule silencieuse vers le local** |

- `rgs_url` n'est **jamais en dur** : normalisée (`https://` ajouté si absent, `/` final retiré).
- `lang` : deux lettres (`fr-FR` → `fr`), 17 langues reconnues, repli anglais. `social=true` : anglais imposé + vocabulaire social.
- Le `sessionID` n'est **jamais journalisé**.

### 10.2 Client RGS (`src/stake/rgs.ts`)

| Méthode | Requête | Délai | Rôle |
|---|---|---|---|
| `authenticate(language)` | `POST /wallet/authenticate` | 12 s | solde, config (`betLevels`, `defaultBetLevel`, min / max, juridiction), manche ouverte éventuelle |
| `play(amount, mode)` | `POST /wallet/play` | 20 s | pari : nouveau solde + manche (`round`) |
| `endRound()` | `POST /wallet/end-round` | 15 s | clôture : solde |
| `balance()` | `POST /wallet/balance` | 10 s | solde |
| `saveEvent(event)` | `POST /bet/event` | 8 s | enregistre l'index atteint (reprise) ; **échec non bloquant** |
| `fetchReplay(…)` | `GET /bet/replay/{game}/{version}/{mode}/{event}` | — | book d'une manche passée, sans session |

- Tous les `POST` envoient `sessionID` dans le corps.
- `RgsError { code, status, uncertain }`. Codes connus : `ERR_IS`, `ERR_IB`, `ERR_IPB`, `ERR_BR`, `ERR_OR`, `ERR_NR`, `ERR_TF`, `ERR_VAL`, `ERR_ATE`, `ERR_GLE`, `ERR_LOC`, `ERR_GEN`, `ERR_MAINTENANCE` ; plus `TIMEOUT`, `NETWORK`, `BAD_RESPONSE`.
- **Incertain** (`uncertain = true`) seulement sur un **pari** : timeout, réseau, réponse illisible, 5xx, `ERR_TF`, `ERR_GEN`.
- `normalizeConfig` filtre les mises par min / max et recale `defaultBetLevel` sur le palier autorisé le plus proche.
- `normalizeRound` lit `betID` / `betId` / `id` / `roundID`, les événements dans `state` / `state.events` / `events`, et `event` (dernier index enregistré).

### 10.3 Fournisseurs

| Fournisseur | `authenticate` | `play` | `endRound` | Particularités |
|---|---|---|---|---|
| `StakeProvider` | via RGS ; manche ouverte → `resume` (`startAt = event + 1`) | via RGS, book validé par `parseBook` | **une seule fois par manche** ; manche perdante (inactive) ou `ERR_NR` → relit le solde | `saveProgress(index)` → `/bet/event` ; `reconcile()` = nouvelle authentification |
| `ReplayProvider` | charge le book (`fetchReplay` ou source locale) ; solde 0 | rend la manche relue, **sans débit** | 0 | aucun appel wallet |
| `DemoProvider` | solde 1 000,00 €, 27 paliers de mise (0,10 € à 100 €), mise par défaut 1 € | débite `mise × coût`, tire une fixture du mode dans un **sac pondéré sans remise** (graine `?seed`) ; `forceNext(id)` | crédite `bookToMoney(payoutMultiplier, mise)` | latence simulée 180 ms (branchée sur l'horloge de présentation par `main.ts` dans l'arbre de travail : captures reproductibles) ; `failNext`, `uncertainNext`, `refill()` pour la QA |

**Pas encore branché** : la reprise d'une manche ouverte **au démarrage** (`session.resume` n'est pas joué par `main.ts`), l'appel de `saveProgress` (le présentateur n'implémente pas `afterEvent`) et le parcours de relecture dédié (état `replay`).

### 10.4 Mock RGS local (`tools/mock-rgs.mjs`)

Outil de développement uniquement. `node tools/mock-rgs.mjs [port]`, port par défaut **5310**. Il sert `public/fixtures/fixtures.json` sur les mêmes routes que le RGS (CORS ouvert).

- Lancer le jeu contre lui : `http://127.0.0.1:5302/?sessionID=mock-session&rgs_url=http://127.0.0.1:5310&lang=fr`.
- Pilotage : `POST /__mock/next` avec `{"error": "ERR_IB"}`, `{"delayMs": n}`, `{"timeout": true}` (pas de réponse au prochain `play`), `{"fixture": "F07"}`, `{"resume": true}` (manche BONUS ouverte, reprise à l'index 4) ; `GET /__mock/state`.
- Règles simulées : `sessionID` absent → `ERR_IS` ; `sessionID=expired` → 401 ; manche déjà ouverte → `ERR_BR` ; mise hors paliers → `ERR_OR` ; solde insuffisant → `ERR_IB` ; `end-round` sans manche → `ERR_NR`. Gain = `round(mise × payoutMultiplier / 100)` ; manche active seulement si gain > 0.

## 11. Hooks QA (`src/dev/qa.ts`)

Installés **seulement si `__DEV_TOOLS__`** (dev et build QA). `?qa` active l'horloge virtuelle.

| `window.__qa.…` | Effet |
|---|---|
| `ready` | `true` quand le jeu est prêt |
| `step(ms, frame?)` | avance l'horloge virtuelle de `ms` (pas de `frame`, 1/60 s par défaut) |
| `time()` | temps de présentation courant |
| `state()` | `{ fsm, balance, bet, layout, event }` |
| `play(id, mode?)` | force la fixture `id` et lance un spin dans son mode (retour immédiat) |
| `fixtures()` | liste `{ id, mode, tags }` |
| `refill()` | recharge le solde local |
| `skip()` / `quick()` | passer la présentation / arrêt rapide |
| `layout()` | `SceneLayout` courant |
| `flock()`, `ambience(a)`, `monument(n)` | vol d'oies, ambiance `base` / `bonus` / `super`, étape de sculpture |
| `deps` | accès aux objets internes (scène, contrôleur, fournisseur, horloge, config, timings, gsap) |

Aussi : `window.__qaPlay(id)` (version qu'on peut attendre) et `window.__qaBoot` (vide). Banc mascotte : `window.__bench` (`ready`, `play`, `step`, `head`, `heads`, `actions`, `hideBar`) dans `mascot-bench.html`.

## 12. Outils

| Outil | Usage | Rôle |
|---|---|---|
| `tools/shot.mjs` | `node tools/shot.mjs <nom> <L>x<H> [--query=…] [--wait=ms] [--play=F10] [--steps=ms,ms,…] [--mobile] [--dpr=n] [--frame=ms] [--dir=sous-dossier]` | capture réelle (canvas + HUD) de la build servie (`GAME_URL`, défaut `http://127.0.0.1:5302/`) en horloge virtuelle ; une image par valeur de `--steps` → `captures/…` |
| `tools/lib/browser.mjs` | importé | Chromium headless (playwright-core ; `CHROMIUM_PATH`, `PLAYWRIGHT_BROWSERS_PATH`, `/opt/pw-browsers`, ou Edge / Chrome sous Windows ; rendu SwiftShader) ; `openGame` (ajoute `?qa`, attend `__qa.ready`, collecte les erreurs), `step` (tranches de 500 ms), `tap`, `outDir` |
| `tools/bench-mascot.mjs` | `node tools/bench-mascot.mjs [--zoom=1] [--actions=a,b] [--times=…]` | planche du banc mascotte (serveur de dev 5301), fonds clair et sombre → `captures/bench/` + `docs/imagegen/checks/mascot-bench-<zoom>.png` |
| `tools/assets/process.mjs` | `npm run assets [-- --only=famille\|clé]` | pipeline d'assets (voir `docs/ASSETS.md`) |
| `tools/assets/compose_parts.py`, `compose_rig.py` | `python3 …` | planches de contrôle de l'assemblage des symboles en pièces et du rig de Buck |
| `tools/codex-queue.sh` | `tools/codex-queue.sh <1-3> docs/imagegen/<lot>.txt …` | file de génération ImageGen via Codex CLI (voir `docs/IMAGEGEN.md`) |
| `tools/fixtures/build.ts` | `npm run fixtures` | construit et valide les fixtures (voir `docs/CONTRAT-EVENTS.md`) |
| `tools/mock-rgs.mjs` | `node tools/mock-rgs.mjs [5310]` | faux RGS local (§ 10.4) |

Outils **ajoutés le 28/09 dans l'arbre de travail** (non commités au moment de la rédaction) :

| Outil | Usage | Rôle |
|---|---|---|
| `tools/check-release.mjs` | `node tools/check-release.mjs [--dir dist] [--stake] [--json=…] [--strict-urls]` | contrôle d'une build : (a) config maths — `provisional: true` **bloquant avec `--stake` (code 2)**, sinon avertissement ; (b) aucune trace d'outil DEV (`__qa`, `installQa`, `mascot-bench`, sourcemaps) ; (c) chaque entrée du manifeste présente ; (d) aucune URL externe ni police distante ; (e) mots interdits dans les locales et les JS (démo, fun, crédit, « Continuer »…) ; (f) mode social ; (g) poids. Codes : 2 bloquant Stake, 1 échec, 0 OK |
| `tools/package-delivery.mjs` | `node tools/package-delivery.mjs [--version=x.y.z] [--allow-fail]` | build de production, `check-release` (sans `--stake`), `vitest`, puis dossier `LIVRAISON-BOOMTOOTH-v<version>/` (zip, médias, contrôles, SHA256SUMS) ; ne réécrit jamais une livraison existante |
| `tools/serve-stable.mjs` | `node tools/serve-stable.mjs [--rebuild] [--open] [--dir=dist-stable] [--port=5320]` | build de production figée `dist-stable/` servie sur **5320** (équivalent de `LANCER-BOOMTOOTH.cmd`) |
| `tools/hud-check.mjs` | `node tools/hud-check.mjs [--sizes=…] [--query=…] [--out=captures/hud]` | chevauchements et débordements du HUD sur ~25 tailles, cibles tactiles ≥ 44 px, HUD hors de la grille ; captures annotées et rapport |
| `tools/record.mjs` | `node tools/record.mjs <fixture> <L>x<H> [--fps=30] …` | vidéo MP4 d'une fixture en horloge virtuelle (ffmpeg-static) |
| `tools/lib/cli.mjs` | importé | lecture des arguments, parcours de fichiers, JSON |

`captures/`, `dist/` et `dist-*/` sont ignorés par git.

## 13. Tests (`tests/`, vitest)

`fixtures` (contrat et books), `fsm`, `beat` (horloge, skip, turbo, annulation), `money`, `social`, `ui-ante`, `ui-buy`, `ui-dialogs`, `ui-i18n`, `ui-menu`, `audio-ambience`, `audio-music`, `audio-render`.

## 14. Points ouverts (état au 28/09)

- `main.ts` : les rappels HUD `buy`, `menu` et `ante` sont vides ; `sound.ambience` et `ui.scatterCount` aussi ; `music.ts` et `ambience.ts` ne sont pas encore importés. Les modules existent et sont testés (`src/ui/buy.ts`, `menu.ts`, `ante.ts`).
- FSM : les états fins de manche, `catalog`, `confirm`, `resume`, `replay` ne sont pas encore pilotés (§ 6).
- Reprise au démarrage, `saveProgress`, parcours replay : § 10.3.
- `tools/check-release.mjs` vient d'être ajouté (non commité) ; `package-delivery.mjs` l'appelle **sans `--stake`** : une livraison peut donc partir avec une config maths provisoire (simple avertissement).
- L'autoplay enchaîne par `window.setTimeout` (hors horloge de présentation).
- La graine cosmétique (`cosmeticSeed` dans `particles.ts`) n'est jamais appelée ; `?seed` ne règle que la playlist locale.
- Toutes les clés du manifeste sont chargées au démarrage, y compris des images hors jeu (visuels promotionnels) : voir `docs/ASSETS.md`.
