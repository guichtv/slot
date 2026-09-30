# CYBER CAT (Crownforge)

Slot web 5×4, 1024 ways. Un chat-robot tire un point laser de ses yeux : chaque case touchée monte d'un cran, la dernière reçoit un multiplicateur. Front seulement (lecteur de books Stake Engine) ; les maths viendront d'une autre équipe.

## Démarrer

```bash
npm ci
npm run fixtures && npm run fixtures:check   # books locaux (26 scénarios)
npm run dev                                  # http://127.0.0.1:5340/
npm test && npm run typecheck
```

Windows : double-clic sur `LANCER-CYBERCAT.cmd` (build figée sur http://127.0.0.1:5344/?v=<version>).

## Chat 3D

Déposer `Meshy_AI_Cyber_Cat_All_Animations.glb` à la racine de ce dossier (jamais modifié), puis :

```bash
npm run cat:prepare   # public/assets/cat/cat.glb + rapport docs/preuves/chat/PREPARE.md
npm run cat:sheets    # planches contact par clip -> docs/preuves/chat/<clip>.png
npm run cat:poses     # poses de repli + référence ImageGen + média FG
npm run cat:proof     # preuve A2 (ajouter -- --gpu --headed sur un PC pour des fps réels)
```

## Illustrations (ImageGen via Codex CLI, sur le PC)

Voir `docs/imagegen/PLAN.md` : `bash tools/imagegen/run-lot.sh ref`, puis `bash tools/imagegen/run-all.sh`, puis `npm run assets`.

## Builds

| commande | sortie | contenu |
|---|---|---|
| `npm run build:qa` | `dist-qa/` | jeu + outils de dev (panneau DEV, TEST ANIM, `__qa*`), remplaçants pour les illustrations manquantes |
| `npm run build` | `dist-public/` | jeu seul ; refusé tant qu'une illustration requise, le GLB, les poses ou les sons manquent |
| `npm run serve-stable` | `dist-stable/` | build figée servie sur 5344 |

## Preuves

`npm run e2e`, `node tools/stake-e2e.mjs`, `npm run hud-check`, `node tools/record.mjs …` (vidéos sur horloge virtuelle). Voir `docs/VERIFICATION.md`.

## Docs

`docs/CONCEPT.md` · `CONTRAT-EVENTS.md` · `docs/ARCHITECTURE.md` · `docs/ANIMATIONS.md` · `docs/UI-FLOWS.md` · `docs/ART-DIRECTION.md` · `docs/AUDIO.md` · `docs/ASSETS.md` · `docs/DECISIONS.md` · `docs/REPRISE.md` · `docs/VERIFICATION.md`.
