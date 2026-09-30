# ARCHITECTURE - CYBER CAT

Vite + TypeScript strict, `base: './'`, PixiJS v8 (WebGL), three.js en différé (chat), GSAP piloté par l'horloge du jeu, HUD en HTML/CSS accessible, zod, vitest, playwright-core, ffmpeg-static, polices locales (@fontsource).

## Couches

| couche | dossier | rôle |
|---|---|---|
| config | `src/config/` | `game-config.ts` (schéma de `game-math-config.json`, paliers), `timings.ts` (LE fichier des durées) |
| contract | `src/contract/` | schémas zod v1 des books, validateur sémantique (contrôle, ne répare jamais), couche monétaire unique, symboles et échelle |
| provider | `src/provider/` | `local.ts` (fixtures, playlist pondérée, erreurs simulées, reprise), `rgs.ts` (Stake Engine RGS + replay), `types.ts` |
| controller | `src/controller/` | `fsm.ts` (états explicites + nettoyages), `state.ts` (état logique appliqué une fois), `round-player.ts` (événement par événement, skip, annulation, reprise, anti-doublon), `game.ts` (spin, achat, Ante, autoplay, fin de manche, réconciliation, replay) |
| render | `src/render/` | `app.ts` (boucle unique), `layout.ts` (5 classes), `scene.ts` (caméra de scène), `decor.ts`, `grid.ts` + `symbol.ts`, `mechanic.ts` (point laser, puces, jetons), `fx.ts`, `celebrate.ts`, `presenter.ts` (book → mise en scène), `cat/` (three A2) |
| ui | `src/ui/` | HUD, popups « clic n'importe où », boutique, menu Infos, écrans de chargement et d'accueil, CSS |
| audio | `src/audio/` | moteur WebAudio (bus, ducking, variantes), sons synthétisés par `tools/audio/` |
| i18n | `src/i18n/` | dictionnaires, variantes sociales `clé@social`, chiffres latins |
| dev | `src/dev/` | remplaçants dessinés en code, crochets QA, panneau DEV, TEST ANIM — **absents du build public** (`__DEV_TOOLS__`) |

## Une frame

`clock.step(dt réel, borné à 0,05 s)` → `gsap.updateRoot(clock.time)` → `scene.update` (décor, rouleaux, particules) → `cat.update` : `director.update(dt)` → `mixer.update(dt)` → `renderer3.render()` → `texture.source.update()` → `pixi.render()`.
Onglet caché : la boucle s'arrête, l'audio est suspendu ; à la reprise, `dt` est borné, sans rattrapage. QA : `?virtual=1` fige l'horloge, `window.__qaStep(ms)` avance image par image (vidéos exactes).

## Une manche

`press()` → `presenter.startSpin()` (réponse < 100 ms) → `provider.play(mode, mise de base)` (une seule requête ; le coût `mise × costMultiplier` est appliqué par le serveur) → validation du book (zod + sémantique ; invalide = signalé, jamais réparé) → `RoundPlayer.play()` : pour chaque événement, état logique appliqué une fois puis mise en scène (skip = fin exacte par `progress(1)`) → `endRound()` une seule fois si la manche est active → solde du serveur → `idle` (durée minimale de manche respectée) → autoplay éventuel.
Requête incertaine (délai dépassé, réseau coupé après envoi) : état `reconcile`, `authenticate` à nouveau ; manche active → reprise sans nouveau débit ; sinon solde rafraîchi.

## Chat 3D (technique A2)

three.js rend dans un canvas hors DOM limité à la zone du chat ; Pixi affiche ce canvas comme texture (`CanvasSource`, `alphaMode: premultiply-alpha-on-upload`). `preserveDrawingBuffer: true` est **obligatoire** : sans lui, Chrome copie le tampon « présenté » d'un canvas hors DOM, vide (constaté en preuve). Caméra three fixe ; les zooms passent par la caméra de scène Pixi. La caméra three suit verticalement les hanches et le sprite compense : le chat n'est jamais coupé par son canvas (dive depuis 8 m, salto).
Directeur à priorités (0 fond, 1 tension, 2 petits gestes, 3 grands moments), fondus du §4.6, turbo, mouvements réduits, regard procédural additif sur `mixamorigHead` (±20°, lissé). Repli sur poses fixes WebP (chargement, WebGL2 absent, GLB en échec ou > 8 s, < 40 fps pendant 3 s, contexte perdu).

## Build

- `npm run build:qa` → `dist-qa/` (outils de dev inclus ; copie le squelette de test en `dev/test-rig.glb`).
- `npm run build` → `dist-public/` : `tools/check-release.mjs --pre` refuse la build tant qu'une illustration requise, le GLB préparé, les poses ou les sons manquent ; `--stake` refuse aussi une config `provisional`. `--post` cherche outils de dev, mots interdits, chemins absolus, appels externes.
- `npm run serve-stable` / `LANCER-CYBERCAT.cmd` → build figée `dist-stable/` sur http://127.0.0.1:5344/?v=<version>.

## Ports

5340 dev · 5341 preview QA · 5342 preview public · 5343 outils 3D · 5344 build figée · 5345 mock RGS · 5346-5349 outils de capture.
