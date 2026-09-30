# ASSETS - CYBER CAT

## Sources et exports

| famille | source | export | outil |
|---|---|---|---|
| illustrations (64, dont 55 requises) | `assets/generated/<mission>/<id>.png` (ImageGen, Codex CLI) | `public/assets/<dossier>/<nom>.webp` + `public/assets/manifest.json` | `npm run assets` |
| chat 3D | `Meshy_AI_Cyber_Cat_All_Animations.glb` (racine, jamais modifié) | `public/assets/cat/cat.glb` (meshopt + WebP 2048) + `cat.meta.json` | `npm run cat:prepare` |
| poses de repli | rendues depuis `cat.glb` | `public/assets/cat/poses/{rest,alert,win,bigwin}.webp` + `poses.json` | `npm run cat:poses` |
| sons | synthèse (`tools/audio/`) | `public/audio/<id>.ogg` + `.m4a` + `manifest.json` | `node tools/audio/render.mjs` |
| polices | @fontsource (OFL) | bundle Vite | — |
| médias Stake | ImageGen (BG, logo, tuile, cover) + rendu GLB (FG) | `media/` | `node tools/media.mjs` |

Liste complète, sujets, tailles et 9-slice : `assets/plan.json` (source unique, lue par le jeu, le pipeline, les briefs et la porte de release). Plan des missions : `docs/imagegen/PLAN.md`. Provenance : `docs/IMAGEGEN.md` (écrit par `npm run assets`).

## Traitement (`tools/assets/process.mjs`)

1. Alpha attendu mais absent → détourage du fond chroma `#00FF00` avec suppression du débordement vert, **signalé** dans le rapport.
2. Alpha normalisé : ≤ 3 → 0, ≥ 252 → 255.
3. Contrôles : frange claire sur le bord, sujet qui touche le bord (coupé), image opaque inattendue.
4. Rognage avec 4 % de marge (sauf 9-slice, planches, décors plein cadre) ; symboles gardés carrés et centrés sur leur boîte alpha.
5. Redimensionnement (symboles 512, pièces 256/128, décors 1920, UI 1024, mécanique 256, cartes 600) puis WebP (q 88, alpha 100).
6. Manifeste : fichier, taille, **boîte alpha** (le jeu dimensionne les symboles à 90 % de la case sur les pixels visibles), 9-slice mis à l'échelle, grille de planche.
7. Planches `docs/preuves/assets/planche-claire.png` et `planche-sombre.png`, rapport JSON, provenance.

Testé par `tests/assets-pipeline.test.ts` sur des images synthétiques (le vrai lot n'existe pas encore).

## État dans ce dépôt

Aucune illustration ImageGen ni GLB : **la build QA affiche des remplaçants dessinés en code** (`src/dev/stand-ins.ts`) et, avec `?catglb=./dev/test-rig.glb`, le squelette de test à la place du chat. La build publique est refusée tant que les vraies images manquent.

## Budgets

GLB ≤ 2,5 Mo, texture ≤ 800 Ko ; three + chargeurs ≤ 200 Ko gzip hors bundle initial (172,8 Ko mesurés) ; BG + FG < 3 Mo ; sons < 6 Mo (OGG + M4A).
