# VERIFICATION - CYBER CAT

Ce qui est vérifié, comment, où ; et ce qui ne l'est pas. Aucune mention « vérifié », « fluide » ou « 60 fps » sans preuve. Rappel : des tests verts ne prouvent pas la qualité du mouvement.

**Contexte de cette session** : conteneur cloud Linux, sans GPU (rendu logiciel swiftshader), sans le GLB Meshy et sans Codex/ImageGen. Toutes les captures et vidéos montrent la **build QA servie** avec des **remplaçants dessinés en code** à la place des illustrations et le **squelette de test** à la place du chat (`?catglb=./dev/test-rig.glb`). Elles prouvent le déroulé, les durées, l'ordre et la mise en page, **pas** le rendu final.

## Code

| preuve | commande | résultat | où |
|---|---|---|---|
| typage strict | `npx tsc --noEmit -p .` | voir section « Résultats » | — |
| tests unitaires | `npx vitest run` | voir « Résultats » | `tests/` |
| fixtures (26) contrôlées sans calcul | `npm run fixtures:check` | voir « Résultats » | `docs/FIXTURES.md` |

## Chat 3D

| preuve | état |
|---|---|
| `cat-prepare` sur le vrai GLB | **non fait** : GLB absent du conteneur |
| `cat-prepare` sur squelette de test (même structure Mixamo, mêmes défauts) | fait : dérive dance 70 cm → 0, flip 110 cm → 0, sols corrigés, masque émissif, sous-clips (`tools/.work/report/PREPARE.md`, non versionné) |
| planches contact du vrai chat (§4.8) | **non faites** (GLB) ; outil prêt et validé sur le squelette de test |
| preuve A2 | faite sur swiftshader : chat 0,5 ms/frame desktop, 1,2 ms mobile ×4 CPU, copie canvas → texture 0,1 ms, 1 draw call, ~34 Mo GPU estimés ; **fps réels non mesurés (pas de GPU)** ; copie non mesurable pour Safari iOS |

## Build servie, vrais gestes

Voir « Résultats » : `tools/play-e2e.mjs` (local), `tools/stake-e2e.mjs` (mock RGS : **outil de dev, pas un test Engine**), `tools/hud-check.mjs` (6 tailles + Popout S, montants à 10 chiffres).

## Vidéos (regardées image par image en planches)

Voir « Résultats ».

## Non vérifié

- Rendu final (illustrations ImageGen, chat Meshy) : absents.
- fps réels sur GPU, trace chrome-devtools : impossible dans ce conteneur.
- Sons : générés et contrôlés par mesure (crête, DC, clics, bouclage) mais **jamais écoutés** par un humain.
- Vrai téléphone, Safari iOS, Firefox : non testés.
- Mock RGS ≠ Stake Engine : le flux réel est à vérifier sur l'environnement Engine.
- Traductions : non relues par des locuteurs natifs.

## Résultats
