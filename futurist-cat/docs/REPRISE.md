# REPRISE - CYBER CAT

## Phase

2 · GLB et preuve 3D (outillage écrit et validé sur squelette de test ; GLB réel absent du conteneur).

## Fait

- Projet `futurist-cat/` (npm `cyber-cat-slot`), Vite + TS strict, `base: './'`, modes `production` (public) et `qa`.
- `tools/cat-prepare.mjs` complet (§4.2) ; `tools/test-rig/make-test-rig.mjs` (dev seulement).

## Reste

Voir la liste des tâches dans le rapport final ; ordre : concept + contrat → tranche jouable → mécanique, bonus, boutique → moments → son → responsive/perf → Stake → preuves/livraison.

## Défauts connus

- GLB réel absent : `npm run cat:prepare` à lancer dès qu'il est déposé à la racine de `futurist-cat/`.
- ImageGen indisponible dans le conteneur : lots prêts pour le PC (voir `docs/imagegen/PLAN.md`).

## Commandes

| but | commande |
|---|---|
| installer | `npm ci` |
| préparer le chat | `npm run cat:prepare` (source : `Meshy_AI_Cyber_Cat_All_Animations.glb` à la racine) |
| squelette de test (dev) | `npm run cat:testrig && node tools/cat-prepare.mjs --testrig` |
| dev | `npm run dev` → http://127.0.0.1:5340/ |

## Ports

5340 dev · 5341 preview QA · 5342 preview public · 5343 outils 3D · 5344 build figée · 5345 mock RGS.
