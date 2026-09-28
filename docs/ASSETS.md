# BOOMTOOTH — Assets graphiques

Inventaire des images du jeu, pipeline de traitement et règles. État : `tools/assets/assets.config.json` (57 clés), `public/assets/manifest.json` (**122 entrées**, généré le 28/09 à 11:49) et `docs/imagegen/checks/report.json` (57 `ok`, 0 manquant). La génération des sources est décrite dans `docs/IMAGEGEN.md`.

## 1. La règle

> **Aucune illustration n'est remplacée par du CSS, du SVG, un emoji ou un dessin en code.** Toute illustration (symbole, décor, mascotte, cadre, bouton, icône, panneau, carte) vient d'une image ImageGen traitée par le pipeline. **Seules les primitives d'effets sont en code** : halos, traits, particules, éclairs.

Ce qui est légitimement dessiné en code :

| Où | Primitive |
|---|---|
| `src/render/fx/textures.ts` | atlas unique dessiné au chargement : point, halo doux en paliers, étincelle, anneau, 3 éclats polygonaux, étoile d'impact |
| `src/render/fx/blast.ts` | flash en étoile, onde de choc, fil de mise à feu (trait), piquets et cordeau du géomètre, étincelles, fumée, éclats |
| `src/render/decor.ts` | traits de la chute d'eau, faisceaux des projecteurs, poussières dans la lumière |
| `src/render/grid/GridView.ts` | halos de connexion, fond de secours sous les cases |
| `src/render/celebration.ts`, `camera.ts` | éclair plein écran, secousse |

Quand une clé manque : `tex()` rend une texture vide et avertit en DEV (`asset manquant: …`), `hasTex()` permet de **ne rien afficher** ; les dialogues masquent l'image (`artImg`, « jamais de substitut dessiné »). Côté livraison, `tools/check-release.mjs` (ajouté le 28/09, non commité) **échoue si une entrée du manifeste n'a pas son fichier dans la build** et signale les fichiers d'assets hors manifeste. Il ne compare pas le manifeste à `assets.config.json` : une clé dont la **source** manque (absente du manifeste) se voit dans `report.json`, pas dans `check-release`.

## 2. Pipeline `tools/assets/process.mjs`

Commande : **`npm run assets`** (toutes les clés) ou `npm run assets -- --only=<famille|clé>`.

Entrées : `assets/generated/<famille>/*.png` + `tools/assets/assets.config.json`.
Sorties : `public/assets/<famille>/<clé>.webp`, `public/assets/manifest.json`, planches `docs/imagegen/checks/<famille>.png`, rapport `docs/imagegen/checks/report.json`.

Pour chaque clé de la config :

1. **Source absente** → `status: "missing"` dans le rapport, aucune sortie.
2. Lecture RGBA (`sharp().ensureAlpha()`), statistiques d'alpha avant traitement (histogramme 8 classes, coins opaques).
3. Si l'image n'est **pas** `opaque` :
   - **Clé chroma de secours** : si moins de 2 % des pixels ont un alpha < 16, le fond est supposé vert `#00FF00` (repli prévu par les briefs). Verdeur `g − max(r, b)` > 90 → transparent ; entre 40 et 90 → alpha dégressif et suppression du débordement vert ; au-dessous → léger dévertissement. Seule source concernée : **`id.crownforge`**.
   - **Normalisation de l'alpha** : alpha ≥ 250 → 255 ; alpha ≤ 3 → 0 (couleur mise à 0). ImageGen livre la plupart des sujets à **alpha 254** : cette étape les rend pleinement opaques.
   - **`solidInterior`** (panneaux) : remplissage depuis les bords sur les pixels d'alpha ≤ 24 ; tout pixel **non atteint** devient opaque. Corrige les centres de panneaux laissés à demi transparents (couleur conservée).
4. **Découpe**, selon la config :
   - **Image simple** : rognage sur la boîte des pixels d'alpha > 8, plus une **marge anti-fuite** (`margin`, 6 px par défaut) ; `opaque` ou `noTrim` : image entière. Le manifeste note `visibleFill` (part du sujet dans l'image rognée).
   - **Planche par composantes** (`split.names`) : masque alpha > 24, **dilaté** `dilate` fois (regroupe les petits éclats d'une même pièce), composantes connexes (8 voisins), rejet des composantes < `minArea` px ; tri en **ordre de lecture** (bandes horizontales puis gauche → droite) ; un nom par composante (ordre modifiable par `split.order`). Nombre de composantes ≠ nombre de noms → avertissement `warn`. Chaque pièce n'exporte **que ses propres pixels**, puis rognage + marge.
   - **Planche par rectangles** (`split.rects`, pour des éléments qui se touchent) : chaque rectangle est isolé ; on garde ses composantes d'au moins `keepMin` × la plus grande (4 % par défaut) ; rognage + marge.
5. **Redimensionnement** : `scale`, ou `min(1, maxSize / plus grand côté)`, noyau lanczos3.
6. **WebP** : `opaque` → sans alpha, qualité 86 par défaut ; sinon qualité 90 par défaut, alpha qualité 100, `smartSubsample`.
7. **Manifeste** : `url`, `w`, `h`, `source`, `sourceHash` (SHA-256 tronqué à 16 caractères), `frame` (rectangle dans la source), `scale`, `pivot`, `family` ; pour une image simple, aussi `nineSlice` et `visibleFill`. Clé d'une pièce : `<clé>.<nom>`.

Après toutes les clés :

8. **Planches de contrôle** `docs/imagegen/checks/<famille>.png` : chaque sortie en vignette 256 px, **deux fois** : sur fond clair (ivoire) et sur fond sombre (violet nuit). Un halo, une frange ou un trou se voient sur l'un des deux.
9. **Élagage du manifeste** : toute entrée dont le fichier `public/…` n'existe plus est supprimée. (Une entrée dont la source a disparu mais dont le WebP existe encore **reste** : supprimer aussi le WebP.)
10. Écriture de `manifest.json` (`generatedAt`) et de `report.json` ; résumé console `ok / manquants / avertissements`.

### Options de `assets.config.json`

| Option | Effet |
|---|---|
| `src` | image source (`assets/generated/…`) |
| `family` | dossier de sortie et planche de contrôle |
| `opaque` | pas d'alpha (fonds, cartes, visuels) |
| `maxSize`, `scale` | taille de sortie |
| `margin` | marge autour du rognage (px) |
| `quality` | qualité WebP |
| `noTrim` | pas de rognage |
| `solidInterior` | intérieur plein (panneaux) |
| `nineSlice` | bords `[gauche, haut, droite, bas]` en px de sortie (lu par `GridView` pour `ui.frame`) |
| `pivot` | point de pivot (image simple) |
| `split.names`, `split.minArea`, `split.dilate`, `split.order` | découpe par composantes |
| `split.rects`, `split.keepMin` | découpe par rectangles `[x, y, w, h]` (px de la source) |
| `split.pivots` | pivots par pièce |

Le rig de Buck ne lit **pas** les pivots du manifeste : ils sont dans `src/render/mascot/buckRig.json`. Les pièces des symboles sont posées d'après `src/render/grid/partsLayout.json`.

### Chargement dans le jeu (`src/render/assets.ts`)

- `loadManifest()` puis `loadTextures(keys())` : **toutes les entrées du manifeste** sont chargées et décodées au démarrage, 6 en parallèle, avec une progression **réelle**.
- Conséquence : les images hors jeu ou inutilisées (§ 4) sont aussi téléchargées.
- Le HTML (HUD, dialogues) utilise les URL du manifeste (`assetUrl`, `artUrl`) ou des `url()` CSS vers `public/assets/ui/…` (`theme.css`).

## 3. Inventaire

Toutes les sorties suivent `assets/<famille>/<clé>.webp` (URL relative à la racine publique). Pour une planche découpée, la colonne « Sortie » donne le suffixe de chaque pièce (`sym.H1` + `.body` → `sym.H1.body`). « Statut » : d'après `report.json` (nombre de sorties). Usages trouvés par recherche des clés dans `src/` et `index.html`.

### Famille `symbols`

| Clé | Source | Traitement | Sortie (manifeste, px) | Usage dans le code | Statut |
|---|---|---|---|---|---|
| `sym.L1` | `symbols/L1.png` | max 640, marge 8, q90 | `sym.L1` 640×495 | `symbolConfig.ts` (corps) → `SymbolView` ; `menu.ts` (table des gains) | présent (1) |
| `sym.L2` | `symbols/L2.png` | max 640, marge 8, q90 | `sym.L2` 590×640 | idem L1 | présent (1) |
| `sym.L3` | `symbols/L3.png` | max 640, marge 8, q90 | `sym.L3` 362×640 | idem L1 | présent (1) |
| `sym.L4` | `symbols/L4.png` | max 640, marge 8, q90 | `sym.L4` 426×640 | idem L1 | présent (1) |
| `sym.T.stick` | `symbols/T-stick.png` | max 640, marge 8, q90 | `sym.T.stick` 335×640 | `symbolConfig.ts` (`TNT_DEFS.stick`) ; `buy.ts` (carte BLAST) ; `menu.ts` (règles) | présent (1) |
| `sym.T.bundle` | `symbols/T-bundle.png` | max 640, marge 8, q90 | `sym.T.bundle` 640×556 | `symbolConfig.ts` (`TNT_DEFS.bundle`) ; `buy.ts` (carte BLAST) ; `menu.ts` | présent (1) |
| `sym.T.keg` | `symbols/T-keg.png` | max 640, marge 8, q90 | `sym.T.keg` 502×640 | `symbolConfig.ts` (`TNT_DEFS.keg`) ; `buy.ts` (carte MEGA) ; `menu.ts` | présent (1) |
| `sym.H1` | `symbols/H1.png` | max 1100, marge 8, composantes (minArea 3000, dilate 8), q90 | `.body` 941×945<br>`.prop` 159×584 | `.body` : `symbolConfig.ts` ; pièces : `partsLayout.json` → `SymbolView` ; `menu.ts` | présent (2) |
| `sym.H2` | `symbols/H2.png` | max 1100, marge 8, composantes (minArea 3000, dilate 8), q90 | `.body` 862×908<br>`.antlerL` 336×352<br>`.antlerR` 319×363 | idem H1 (bois gauche / droit animés séparément) | présent (3) |
| `sym.H3` | `symbols/H3.png` | max 1100, marge 8, composantes (minArea 3000, dilate 8), q90 | `.body` 815×906<br>`.prop` 739×659 | idem H1 (plan déroulé = accessoire) | présent (2) |
| `sym.H4` | `symbols/H4.png` | max 1100, marge 8, composantes (minArea 3000, dilate 8), q90 | `.body` 968×962<br>`.part` 343×398 | idem H1 (`part` = huppe rouge) | présent (2) |
| `sym.W` | `symbols/W.png` | max 1100, marge 8, composantes (minArea 3000, dilate 8), q90 | `.body` 764×851<br>`.part` 668×373 | idem H1 (`part` = couvercle) | présent (2) |
| `sym.S` | `symbols/S.png` | max 1100, marge 8, composantes (minArea 3000, dilate 8), q90 | `.body` 882×810<br>`.part` 572×749 | idem H1 (`part` = poignée) ; `sym.S.body` aussi dans `buy.ts` et `menu.ts` | présent (2) |
| `sym.T.log` | `symbols/T-log.png` | max 640, marge 8, q90 | `sym.T.log` 640×620 | **inutilisé** (la charge 4×4 est rendue avec `sym.T.keg`) | présent (1) |

### Famille `decor`

| Clé | Source | Traitement | Sortie (manifeste, px) | Usage dans le code | Statut |
|---|---|---|---|---|---|
| `decor.sky` | `decor/sky.png` | opaque, q86 | `decor.sky` 1536×1024 | `decor.ts` : repli si `decor.skyRich` manque | présent (1) |
| `decor.nightSky` | `decor/night-sky.png` | opaque, q86 | `decor.nightSky` 1536×1024 | `decor.ts` : ciel de nuit (bonus), fondu par `setAmbience` | présent (1) |
| `decor.clouds` | `decor/clouds.png` | max 1536, composantes (minArea 4000, dilate 6), q86 | `.0` 714×328<br>`.1` 706×316<br>`.2` 479×216<br>`.3` 485×192<br>`.4` 479×196 | `decor.ts` : 5 nuages qui dérivent | présent (5) |
| `decor.far` | `decor/far.png` | marge 2, q86 | `decor.far` 1470×895 | `decor.ts` : lointain + second massif (même image, miroir, teinte bleutée) | présent (1) |
| `decor.mid` | `decor/mid.png` | marge 2, q86 | `decor.mid` 1459×544 | `decor.ts` : plan intermédiaire (chute d'eau animée par des traits en code) | présent (1) |
| `decor.ground` | `decor/ground.png` | marge 2, q86 | `decor.ground` 1493×237 | `decor.ts` : sol | présent (1) |
| `decor.fg` | `decor/fg-props.png` | max 1536, composantes (minArea 8000, dilate 8), q86 | `.0` 494×735<br>`.1` 562×629<br>`.2` 428×610 | `decor.ts` : premier plan (`fg.0`, `fg.1` ; `fg.2` chargé mais masqué) | présent (3) |
| `decor.monument.0` | `decor/monument-0.png` | max 900, marge 4, q88 | `decor.monument.0` 900×834 | `decor.ts` : Mount Buckmore, étape 0 (`setMonument`) | présent (1) |
| `decor.monument.1` | `decor/monument-1.png` | max 900, marge 4, q88 | `decor.monument.1` 900×834 | `decor.ts` : étape 1 | présent (1) |
| `decor.monument.2` | `decor/monument-2.png` | max 900, marge 4, q88 | `decor.monument.2` 900×853 | `decor.ts` : étape 2 | présent (1) |
| `decor.monument.3` | `decor/monument-3.png` | max 900, marge 4, q88 | `decor.monument.3` 900×866 | `decor.ts` : étape 3 | présent (1) |
| `decor.floodlight` | `decor/floodlight.png` | max 900, marge 4, q88 | `decor.floodlight` 521×900 | `decor.ts` : 2 tours de projecteurs (une en miroir), visibles la nuit | présent (1) |
| `decor.birds` | `decor/birds.png` | max 1536, composantes (minArea 500, dilate 4), q86 | `.0` 396×330<br>`.1` 418×208<br>`.2` 393×258 | `decor.ts` : vol d'oies en V (3 poses d'ailes en boucle) | présent (3) |
| `decor.skyRich` | `decor/sky-rich.png` | opaque, q86 | `decor.skyRich` 1536×1024 | `decor.ts` : ciel de jour (prioritaire sur `decor.sky`) | présent (1) |
| `decor.portrait` | `decor/decor-portrait.png` | opaque, q86 | `decor.portrait` 1024×1536 | **inutilisé** (décor portrait prévu pour mobile) | présent (1) |

### Famille `ui`

| Clé | Source | Traitement | Sortie (manifeste, px) | Usage dans le code | Statut |
|---|---|---|---|---|---|
| `ui.frame` | `ui/frame.png` | marge 0, 9-slice [135,147,134,142], q92 | `ui.frame` 1127×1103 | `GridView` → `FrameView` (cadre recomposé en pièces, bords du manifeste) | présent (1) |
| `ui.cell` | `ui/cell.png` | max 256, marge 0, q92 | `ui.cell` 256×254 | `GridView` : fond de chacune des 25 cases | présent (1) |
| `ui.spin` | `ui/spin.png` | max 360, marge 4, q92 | `ui.spin` 360×358 | `theme.css` (`--spin-bg`) : gros bouton SPIN du HUD | présent (1) |
| `ui.btn` | `ui/buttons.png` | max 1400, composantes (minArea 3000, dilate 6), q92 | `.round` 274×273<br>`.step` 221×220<br>`.plaque` 652×214<br>`.buy` 604×407<br>`.bar` 1400×185 | `theme.css` (HUD : barre, boutons ronds, pas, BUY, plaque) ; `dialogs.ts` (variables `--cf-*`) ; `buy.ts` | présent (5) |
| `ui.ico` | `ui/icons.png` | max 1536, rects ×10, q92 | `.menu` 230×218<br>`.soundOn` 263×238<br>`.soundOff` 268×267<br>`.turbo` 208×319<br>`.auto` 264×275<br>`.info` 271×273<br>`.plus` 236×238<br>`.minus` 229×99<br>`.spin` 265×264<br>`.stop` 217×217 | `theme.css` (HUD) ; `dialogs.ts` (variables `--cf-ico-*`) ; `buy.ts` (plus) ; `menu.ts` (turbo) | présent (10) |
| `ui.topbar` | `ui/topbar.png` | max 900, marge 4, solidInterior, q92 | `ui.topbar` 900×296 | `overlays.ts` : planche du compteur de free spins | présent (1) |
| `ui.cornerstone` | `ui/cornerstone.png` | max 520, marge 6, q92 | `ui.cornerstone` 520×385 | `cornerstone.ts` : bloc du multiplicateur | présent (1) |
| `ui.cornerstoneGold` | `ui/cornerstone-gold.png` | max 520, marge 6, q92 | `ui.cornerstoneGold` 520×386 | `cornerstone.ts` : bloc veiné d'or à partir de ×250 | présent (1) |

### Famille `mascot`

| Clé | Source | Traitement | Sortie (manifeste, px) | Usage dans le code | Statut |
|---|---|---|---|---|---|
| `buck.ref` | `mascot/buck-ref.png` | max 1200, marge 6, q92 | `buck.ref` 813×1200 | aucun dans le jeu ; référence d'échelle pour `compose_rig.py` et le banc mascotte | présent (1) |
| `buck.heads` | `mascot/buck-heads.png` | marge 6, rects ×7, q92 | `.rest` 390×436<br>`.grin` 391×441<br>`.shout` 386×444<br>`.surprise` 380×438<br>`.wink` 389×436<br>`.focus` 401×439<br>`.blink` 399×435 | `buckRig.json` → `Rig` → `Buck.ts` (7 expressions) ; `menu.ts` (`buck.heads.grin`) | présent (7) |
| `buck.body` | `mascot/buck-body.png` | marge 6, composantes (minArea 4000, dilate 6), q92 | `.torso` 544×602<br>`.tail` 313×362<br>`.thighL` 250×335<br>`.thighR` 239×337<br>`.shinL` 302×391<br>`.shinR` 278×405 | `buckRig.json` → `Buck.ts` (torse, queue, cuisses, jambes) | présent (6) |
| `buck.arms` | `mascot/buck-arms.png` | marge 6, composantes (minArea 2000, dilate 6), q92 | `.upperL` 278×303<br>`.upperR` 281×310<br>`.foreL` 213×341<br>`.foreR` 208×341<br>`.handOpen` 265×336<br>`.handFist` 241×265<br>`.handGrip` 256×292<br>`.handThumb` 229×291<br>`.handPoint` 309×249<br>`.handMatch` 237×343 | `buckRig.json` → `Buck.ts` (bras, avant-bras, 6 mains) | présent (10) |
| `buck.props` | `mascot/buck-props.png` | marge 6, composantes (minArea 800, dilate 6), q92 | `.box` 674×768<br>`.handle` 406×742<br>`.stick` 226×436<br>`.match` 106×233 | `Buck.ts` : `box` + `handle` = détonateur à piston (arbre de travail, non commité) ; `stick` et `match` inutilisés | présent (4) |

### Famille `identity`

| Clé | Source | Traitement | Sortie (manifeste, px) | Usage dans le code | Statut |
|---|---|---|---|---|---|
| `id.logo` | `identity/logo.png` | max 1100, marge 6, q90 | `id.logo` 1100×449 | `logo.ts` (logo dans le décor) ; `welcome.ts` | présent (1) |
| `id.crownforge` | `identity/crownforge.png` | max 900, marge 6, q90 | `id.crownforge` 900×648 | `index.html` : écran de chargement (URL directe) | présent (1) |
| `id.card.blast` | `identity/card-blast.png` | opaque, max 720, marge 6, q90 | `id.card.blast` 480×720 | `welcome.ts` : carte d'accueil 1 | présent (1) |
| `id.card.detonator` | `identity/card-detonator.png` | opaque, max 720, marge 6, q90 | `id.card.detonator` 480×720 | `welcome.ts` : carte d'accueil 3 (super bonus) | présent (1) |
| `id.card.bonus` | `identity/card-bonus.png` | opaque, max 720, marge 6, q90 | `id.card.bonus` 480×720 | `welcome.ts` : carte d'accueil 2 (bonus) | présent (1) |
| `id.cover` | `identity/cover.png` | opaque, max 1536, q88 | `id.cover` 1536×864 | hors jeu : visuel promotionnel 16:9 | présent (1) |
| `id.tile` | `identity/tile.png` | opaque, max 1536, q88 | `id.tile` 1086×1448 | hors jeu : visuel promotionnel 3:4 | présent (1) |

### Famille `fx`

| Clé | Source | Traitement | Sortie (manifeste, px) | Usage dans le code | Statut |
|---|---|---|---|---|---|
| `fx.debris` | `fx/fx-debris.png` | max 1536, composantes (minArea 400, dilate 4), q90 | `.g0` 249×243<br>`.g1` 238×168<br>`.g2` 185×254<br>`.g3` 228×222<br>`.g4` 218×231<br>`.g5` 239×191<br>`.w0` 253×214<br>`.w1` 204×178<br>`.w2` 256×234<br>`.n0` 177×172<br>`.n1` 195×171<br>`.n2` 186×169 | `celebration.ts` : `g0-g5` (roches) et `n0-n2` (pépites) ; `w0-w2` (bois) **inutilisés** | présent (12) |
| `fx.dust` | `fx/fx-dust.png` | max 1536, composantes (minArea 2000, dilate 6), q90 | `.0` 370×237<br>`.1` 542×333<br>`.2` 609×379<br>`.3` 729×460 | `celebration.ts` : nuages de poussière | présent (4) |

### Famille `screens`

| Clé | Source | Traitement | Sortie (manifeste, px) | Usage dans le code | Statut |
|---|---|---|---|---|---|
| `scr.sundown` | `screens/panel-sundown.png` | max 1200, marge 4, solidInterior, q88 | `scr.sundown` 1200×804 | `main.ts` → `overlays.dialog('intro')` : intro SUNDOWN SHIFT | présent (1) |
| `scr.floodlight` | `screens/panel-floodlight.png` | max 1200, marge 4, solidInterior, q88 | `scr.floodlight` 1200×793 | `main.ts` → intro FLOODLIGHT SHIFT | présent (1) |
| `scr.total` | `screens/panel-total.png` | max 1200, marge 4, solidInterior, q88 | `scr.total` 1200×716 | `main.ts` → `overlays.dialog('outro')` : gain total du bonus | présent (1) |
| `scr.banner` | `screens/banner-tier.png` | max 1200, marge 4, solidInterior, q88 | `scr.banner` 1200×394 | `overlays.ts` : bannière des paliers de célébration | présent (1) |
| `scr.shop` | `screens/shop-board.png` | max 1200, marge 4, solidInterior, q88 | `scr.shop` 1200×747 | **inutilisé** (le catalogue BUY dessine son panneau en CSS `.cf-panel`) | présent (1) |
| `scr.card` | `screens/card-frame.png` | max 1200, marge 4, solidInterior, q88 | `scr.card` 802×1200 | **inutilisé** | présent (1) |

## 4. Clés manquantes, retirées, inutilisées

**Manquantes aujourd'hui : aucune** (57 / 57 `ok` dans `report.json` du 28/09, 11:49).

Historique des manques (`report.json` des commits précédents) :

| Clé | Rapport | Raison |
|---|---|---|
| `ui.multiplier` | `missing` (commits `a138b98` et `eb1621c`) | le lot 2 (`ui-frame-hud`) a buté sur le quota avant `multiplier.png`. Le « compteur du détonateur » a ensuite été **remplacé par THE CORNERSTONE** (`ui.cornerstone`, `ui.cornerstoneGold`, lot 3). La clé est retirée de la config ; `cornerstone.ts` garde un repli sur `ui.multiplier`. |
| `ui.topbar` | `missing` (`a138b98`) | même quota du lot 2 ; régénérée au lot 3 (`mechanics-ui`). |
| `buck.props` | `missing` (`eb1621c`) | quota du lot 2 (`mascot-rig`) ; **régénérée au lot 4** (`buck-props`), traitée ensuite (sorties présentes dans l'arbre de travail, pas encore commitées). |

**Présentes mais inutilisées par le jeu** (chargées quand même au démarrage) :

| Clé | Remarque |
|---|---|
| `sym.T.log` | « bûche-charge » 4 × 4 du concept ; le jeu affiche toujours `sym.T.keg` (baril). À trancher : remplacer `TNT_DEFS.keg.body` ou retirer la clé. |
| `decor.portrait` | décor complet pour mobile portrait, pas encore branché dans `decor.ts`. |
| `scr.shop`, `scr.card` | fond du catalogue BUY et cadre de carte d'offre ; le catalogue (`buy.ts`) utilise aujourd'hui un panneau CSS (`.cf-panel`). |
| `fx.debris.w0-w2` | copeaux de bois ; seules les roches et pépites servent (célébration). |
| `buck.props.stick`, `buck.props.match` | accessoires de main ; seul le détonateur (`box`, `handle`) est branché. |
| `decor.fg.2` | chargé puis masqué (`visible = false`). |
| `buck.ref` | référence d'échelle (outils), pas affichée. |
| `id.cover`, `id.tile` | visuels promotionnels, hors jeu. |

Hors pipeline : `assets/generated/directions/D1.png … D5.png` (maquettes de direction, galerie `directions.html`) ne passent pas par `process.mjs` et ne sont pas dans le manifeste.

## 5. Écarts à surveiller

- **Illustrations en CSS** : les panneaux `.cf-panel` des menus et du catalogue BUY sont des aplats CSS (bois foncé, anneau d'acier) alors que `scr.shop` et `scr.card` existent. C'est contraire à la règle du § 1.
- **Éclats d'explosion** : `blast.ts` et `GridView` utilisent les éclats polygonaux de l'atlas de primitives (`fx.chunk`) ; les éclats illustrés `fx.debris.g*` ne servent qu'à la célébration.
- **Piquets du géomètre** : dessinés en `Graphics` (bois, tête rouge, contour encre). Ce sont presque des objets illustrés : à garder minimaux ou à remplacer par une image.
- **Charge 4 × 4** : `docs/ART-DIRECTION.md` parle d'un **baril de poudre**, `docs/CONCEPT.md` et `docs/DECISIONS.md` d'une **bûche-charge** (le baril « faisait pirate »). Les deux images existent ; le jeu montre le baril.
- **Défauts connus des sources** (rapports ImageGen) : formats 1254 × 1254 au lieu de 1024 × 1024, marges parfois < 3 %, alpha max 254, franges semi-transparentes, monuments pas exactement superposables. Le pipeline corrige l'alpha et rogne ; le reste est listé dans `docs/IMAGEGEN.md`.

## 6. Contrôles

| Planche (`docs/imagegen/checks/`) | Produite par | Contenu |
|---|---|---|
| `symbols.png`, `decor.png`, `ui.png`, `mascot.png`, `identity.png`, `fx.png`, `screens.png` | `npm run assets` | toutes les sorties d'une famille, sur fond clair et sombre |
| `parts-H1.png` … `parts-H4.png`, `parts-W.png`, `parts-S.png` | `python3 tools/assets/compose_parts.py [SYM …]` | corps + pièces assemblés au repos et en réaction, clair et sombre |
| `rig-rest.png`, `rig-head-*.png`, `rig-heads-bench.png` | `python3 tools/assets/compose_rig.py …` | rig de Buck assemblé (poses, expressions) à côté de `buck.ref` |
| `mascot-bench-1.png` | `node tools/bench-mascot.mjs` | actions de Buck capturées dans le jeu, plusieurs instants, clair et sombre |
| `report.json` | `npm run assets` | statut par clé (`ok`, `missing`, `warn`, `empty`), nombre de sorties, histogrammes d'alpha avant / après, coins opaques |
