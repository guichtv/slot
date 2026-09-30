# REPRISE - CYBER CAT

## Phase

Tranche jouable complète (base, point laser, bonus, boutique, paliers, replay) sur remplaçants de dev ; preuves en cours. **Deux blocages externes** : le GLB Meshy et ImageGen ne sont pas disponibles dans le conteneur cloud de cette session.

## Fait

- Projet `futurist-cat/` (npm `cyber-cat-slot`), Vite + TS strict, `base: './'`, modes public / QA.
- 3D : `cat-prepare.mjs` (§4.2 complet), planches contact, preuve A2, poses de repli, FG ; runtime three (A2 + `preserveDrawingBuffer`), directeur à priorités, regard procédural, repli, perte de contexte. Validé sur un squelette de test synthétique.
- Concept, contrat v1 (zod), validateur sémantique, couche monétaire, config provisoire, 26 fixtures contrôlées.
- Moteur : horloge partagée (virtuelle en QA), jetons d'annulation, FSM, lecteur de manche (skip exact, reprise, anti-doublon), contrôleur (requête unique, end-round unique, réconciliation, reprise, replay, autoplay, Ante, durée minimale).
- Rendu : scène + caméra, décor vivant, rouleaux 9 vues recyclées, symboles (réactions, montées), point laser, puces + circuit, jetons ×N, connexions « base → ×N → final », paliers (une idée par palier), MAX WIN, bonus complet, +N FS.
- UI HTML : HUD 5 classes, popups clic-n'importe-où, boutique à devis figé, autoplay, menu Infos (règles, réglages, historique/replay), chargement réel, accueil, erreurs, replay, infos de session (juridiction).
- Stake : provider RGS, replay, drapeaux de juridiction, mode social, mock RGS (outil de dev).
- Son (sous-agent) : synthèse OGG + M4A, moteur WebAudio. i18n : FR/EN + 14 langues (sous-agent).
- ImageGen : bible, `_style.txt`, 16 briefs, lanceurs Codex (Git Bash), quota ; `npm run assets` testé sur images synthétiques.
- Outils de preuve : `shot`, `record` (horloge virtuelle), `hud-check`, `play-e2e`, `stake-e2e`, `check-release`, `package-delivery`, `serve-stable` + `LANCER-CYBERCAT.cmd`.

## Reste

1. Sur le PC : GLB → `npm run cat:prepare`, `cat:sheets`, `cat:poses` ; missions ImageGen → `npm run assets`.
2. Regarder les planches du vrai chat (sol, dérive, « C », matériau, yeux) et ajuster `cat-prepare` si besoin.
3. Juger toutes les vidéos sur les vraies images ; mesurer les fps sur GPU (`npm run cat:proof -- --gpu --headed`, chrome-devtools).
4. Remplacer la config provisoire par celle des maths ; build Stake (`node tools/package-delivery.mjs --stake`).

## Défauts connus

- Illustrations et chat réels absents : la build QA montre des remplaçants et le squelette de test (`?catglb=./dev/test-rig.glb`).
- fps réels non mesurés (rendu logiciel swiftshader dans le conteneur).
- Transitions CSS des popups en temps réel : abrégées dans les vidéos à horloge virtuelle.

## Commandes

| but | commande |
|---|---|
| installer | `npm ci` |
| dev | `npm run dev` → http://127.0.0.1:5340/ |
| tests | `npm test && npm run typecheck && npm run fixtures:check` |
| build QA / public | `npm run build:qa` / `npm run build` (refusé sans les vraies images) |
| build figée | `npm run serve-stable` ou `LANCER-CYBERCAT.cmd` → http://127.0.0.1:5344/?v=0.1.0 |
| chat | `npm run cat:prepare && npm run cat:sheets && npm run cat:poses` |
| images | `bash tools/imagegen/run-lot.sh ref` puis `bash tools/imagegen/run-all.sh` puis `npm run assets` |
| preuves | `node tools/play-e2e.mjs`, `node tools/stake-e2e.mjs`, `node tools/hud-check.mjs`, `node tools/record.mjs …` |
| livraison | `node tools/package-delivery.mjs [--stake]` |

## Ports

5340 dev · 5341 preview QA · 5342 preview public · 5343 outils 3D · 5344 build figée · 5345 mock RGS · 5346-5349 outils de capture.
