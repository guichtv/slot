# PLAN ImageGen (Codex CLI) - CYBER CAT

Source : `assets/plan.json` (généré par `node tools/imagegen/make-briefs.mjs`). Style : `docs/imagegen/_style.txt`. Bible : `docs/ART-DIRECTION.md`.

## Avant de lancer (sur le PC, Git Bash, dans le dossier du projet)

1. `npm ci` puis déposer `Meshy_AI_Cyber_Cat_All_Animations.glb` à la racine du projet.
2. `npm run cat:prepare && npm run cat:poses` : écrit `docs/imagegen/ref/cat-pose-ref.png` (référence de palette et de matières, obligatoire pour la mission `ref`).
3. `bash tools/imagegen/run-lot.sh ref` puis regarder `assets/generated/ref/ref.screen.png` ; relancer en édition tant qu'elle ne raccorde pas avec le chat.
4. `bash tools/imagegen/run-all.sh` : toutes les missions restantes, 2 au plus en même temps, départs espacés de 40 s, seules les images absentes sont relancées.
5. `npm run assets` : alpha normalisé, rognage, WebP, manifeste, planches claires/sombres dans `docs/preuves/assets/`, provenance dans `docs/IMAGEGEN.md`.
6. `npm run build` : le build public refuse de se construire tant qu'une image requise manque.

Quota : `node tools/imagegen/quota.mjs` lit `used_percent` dans le dernier rollout de `~/.codex/sessions` (environ 1 % par mission de 5 à 7 images). Quota épuisé : s'arrêter, ne jamais remplacer une image par une image factice.

## Missions (1 à 7 images chacune)

| ordre | mission | contenu | n | images |
|---|---|---|---|---|
| 1 | `ref` | Image de reference de l'ecran (1536x1024) | 1 | `ref.screen` |
| 2 | `identity` | Logo, ecran Crownforge, cartes d'accueil | 5 | `logo`, `loading.crownforge`, `welcome.laser`, `welcome.ninelives`, `welcome.doublegaze` |
| 3 | `decor-a` | Decor desktop en calques (ciel, lointain, milieu, labo + sol) | 4 | `decor.sky`, `decor.far`, `decor.mid`, `decor.near` |
| 4 | `decor-b` | Elements animables du decor (train, drone, enseignes) | 5 | `decor.train`, `decor.drone`, `decor.sign1`, `decor.sign2`, `decor.sign1_off` |
| 5 | `decor-p` | Decor portrait + ambiances bonus | 4 | `decor.p.bg`, `decor.p.near`, `decor.scan`, `decor.scan2` |
| 6 | `grid` | Cadre de grille et fond de case | 2 | `grid.frame`, `grid.cell` |
| 7 | `sym-low` | Glyphes holographiques L1-L4 | 4 | `sym.L1`, `sym.L2`, `sym.L3`, `sym.L4` |
| 8 | `sym-high` | Premiums H1-H4 + pieces animees | 7 | `sym.H1`, `sym.H1.lid`, `sym.H2`, `sym.H3`, `sym.H3.tail`, `sym.H4`, `sym.H4.rotor` |
| 9 | `sym-special` | WILD et SCATTER + pieces | 4 | `sym.W`, `sym.W.ring`, `sym.S`, `sym.S.iris` |
| 10 | `mech` | Point laser, puces, jeton multiplicateur | 5 | `mech.dot`, `mech.chip1`, `mech.chip2`, `mech.chip3`, `mech.mult` |
| 11 | `ui-hud` | HUD : SPIN, BUY BONUS, boutons, panneau | 6 | `ui.spin`, `ui.spin_stop`, `ui.buy`, `ui.round`, `ui.panel`, `ui.icons` |
| 12 | `ui-pop-a` | Popup, fin de bonus, banniere +N FS, plaques de paliers | 5 | `ui.popup`, `ui.total`, `ui.banner.fs`, `ui.tier`, `ui.tier.max` |
| 13 | `ui-pop-b` | Illustrations d'intro des bonus et features | 4 | `ui.intro.ninelives`, `ui.intro.doublegaze`, `ui.intro.scan`, `ui.intro.doublescan` |
| 14 | `ui-shop` | Boutique : cartes d'offres | 4 | `shop.ninelives`, `shop.doublegaze`, `shop.scan`, `shop.doublescan` |
| 15 | `fx` | Planches de FX | 1 | `fx.sheet` |
| 16 | `media` | Medias Stake | 4 | `media.bg`, `media.crownforge`, `media.tile`, `media.cover` |
