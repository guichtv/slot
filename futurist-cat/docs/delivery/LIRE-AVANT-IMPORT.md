# LIRE AVANT IMPORT - CYBER CAT

## Ce que contient cette livraison

- `CONTRAT-EVENTS.md` : format exact des books attendus (v1), exemples, contrôles.
- `game-math-config.example.json` : config **provisoire** (paytable, prix, Ante, seuils, RTP) — à remplacer par l'équipe maths.
- `CONTROLES/` : vérifications, captures, vidéos, rapports.
- `MEDIA/` : médias Stake disponibles (voir ci-dessous).
- `FRONTEND/` et le zip : **seulement si la porte de release passe** ; sinon `FRONTEND-ABSENT.txt` dit exactement ce qui manque.

## Reste à faire côté maths

1. Produire les books au format `CONTRAT-EVENTS.md` pour les modes `base`, `ante`, `scan`, `double_scan`, `bonus`, `super` (noms en minuscules côté RGS).
2. Donner l'état **après** chaque montée (`laserDot.upgrades`, `chipUpgrade`), le niveau des puces, et le multiplicateur appliqué à chaque groupe de gain (`winInfo.wins[].meta.mult`, `multPositions`), y compris quand deux multiplicateurs se croisent.
3. Remplacer `game-math-config.json` (paytable, `cost` par mode, facteur Ante, RTP par mode, `maxWinX`, spins et retriggers) et passer `"provisional": false`.
4. Lancer `npm run fixtures:check -- <books>` : aucun book invalide n'est réparé par le front.

## Reste à faire côté Engine

1. Illustrations : lancer les missions ImageGen (`docs/imagegen/PLAN.md`) puis `npm run assets`.
2. Chat : déposer le GLB Meshy, `npm run cat:prepare && npm run cat:sheets && npm run cat:poses`.
3. `node tools/package-delivery.mjs --stake` : build public vérifié, zip avec `index.html` à la racine, sans fixtures locales.
4. Portail Engine : importer le zip du front, les books et la config ; vérifier sur l'environnement de test Engine (le mock RGS local n'est **pas** un test Engine).
5. Revérifier la liste des langues Engine en vigueur (16 fournies, traductions non relues par des locuteurs natifs).
6. Écouter les 75 sons (casque et haut-parleur de téléphone) : ils sont mesurés (`docs/AUDIO.md`) mais n'ont jamais été écoutés.
7. Faire relire les 16 langues (`docs/I18N.md` liste les termes à confirmer).
