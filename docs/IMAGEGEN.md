# BOOMTOOTH — Méthode ImageGen

Comment les 62 images sources de `assets/generated/` ont été produites, contrôlées et intégrées. Traitement et inventaire : `docs/ASSETS.md`. Direction artistique : `docs/ART-DIRECTION.md`.

## 1. Principe

| | |
|---|---|
| **Outil** | **Codex CLI** (`OpenAI Codex v0.158.0` d'après les journaux), en mode non interactif (`codex exec`) |
| **Compte** | l'**abonnement ChatGPT** de l'utilisateur, connecté par code d'appareil. **Jamais d'API payante**, aucune clé API |
| **Modèle** | **`gpt-6-astra`** (`CODEX_MODEL`), effort de raisonnement `none` |
| **Génération** | **outil natif `image_gen`** (compétence `$imagegen`), **un appel par image**. Interdits : script CLI / API de génération, SVG, code, liste de prompts à la place des images |
| **Bac à sable** | `--sandbox workspace-write` sur la racine du projet |
| **Livraison** | Codex copie l'image finale depuis `$CODEX_HOME/generated_images/…` vers le chemin demandé et écrit **`<nom>.prompt.txt`** (prompt exact retenu) à côté |
| **Périmètre** | images et rapport uniquement : **Codex ne modifie jamais le code du jeu** |

Aucun jeton, identifiant de compte ni fichier d'authentification n'est lu, copié ou versionné. Les journaux contiennent des identifiants de session Codex : **ne pas les recopier**.

## 2. Assemblage d'un brief

Chaque mission = concaténation de trois fichiers (UTF-8, jamais via un pipe PowerShell) :

```
docs/imagegen/_header.txt  +  STYLE_FILE  +  docs/imagegen/<lot>.txt   →   docs/imagegen/logs/<lot>.full.txt
```

### `_header.txt` — règles communes

- Utiliser `$imagegen` et l'outil **natif** `image_gen` ; ne toucher à aucun code.
- **Style maison Crownforge** : BD / cartoon 2D adulte, contours noirs épais légèrement irréguliers, cel-shading deux tons, reflets francs ; jamais photo-réaliste, jamais 3D lisse, jamais « image IA » (néon générique, dégradés par défaut, flou).
- **Transparence** : alpha réel, sans damier ni halo, sujet complet, **marge de 3 à 6 %**. Si l'outil ne donne pas d'alpha : **fond vert chroma `#00FF00` uni**, à signaler.
- **Aucun texte**, logo ou signature, sauf le texte exact demandé. Aucune copie d'un autre studio ou d'une marque.
- **Reprise** : un fichier cible qui existe déjà **avec** son `.prompt.txt` n'est pas régénéré (permet de relancer un lot interrompu).
- Procédure par image : générer → **inspecter → une seule reprise** si défaut évident → copier → écrire le prompt.
- Réponse finale : chemins, méthode réelle, dimensions, alpha oui / non, **défauts restants**.

### Bibles de style

| Fichier | Quand | Contenu |
|---|---|---|
| `_style-house.txt` | **phase directions** (`dir-d1`, `dir-d2-d5`) | style maison seul, aucune direction retenue : lisibilité en petit, encrage 4-7 px à 1536 px, cel-shading deux tons, couleurs saturées maîtrisées, matières dessinées, lumière dirigée ; interdits (photo, 3D, néon, dégradés, bokeh, polices système, emojis, cadres « dashboard ») |
| `_style.txt` | **tous les lots de production** | projet BOOMTOOTH ; **D1.png = référence obligatoire** (à charger avec `view_image`) : encrage épais irrégulier, cel-shading deux tons, lumière chaude de fin d'après-midi venant de la gauche, ombres bleu-violet ; palette (orange brûlé `#E8742A`, orange ciel `#F39A3C`, verts pin, granit `#6F7F92`/`#46526A`, rouge TNT `#D7332B`, or `#F2B233`, bois `#C98A45`/`#6B4526`, crème `#F4E6C8`, encre `#1B1410`) ; **D3.png = référence nuit** (aurore `#3FD6B8`, nuit `#14233A`, projecteurs `#FF9A3C`) |

## 3. La file `tools/codex-queue.sh`

```bash
tools/codex-queue.sh <parallélisme 1-3> docs/imagegen/<lot>.txt [docs/imagegen/<lot2>.txt …]
# phase directions :
STYLE_FILE=docs/imagegen/_style-house.txt tools/codex-queue.sh 1 docs/imagegen/dir-d1.txt
```

| Règle | Détail |
|---|---|
| **Parallélisme ≤ 3** | valeur plafonnée à 3 ; au-delà, la file attend qu'une mission se termine |
| **Départs espacés** | `STAGGER` secondes entre deux lancements (**40 s** par défaut ; plage visée 30-45 s) |
| **Relances sur 401** | si le journal contient `401 Unauthorized`, `token_revoked`, `Missing bearer` ou `codex-code-mode-host` : nouvelle tentative après `essai × 60 s`, jusqu'à `RETRIES` (**3**) relances ; le header évite de refaire les images déjà livrées |
| **Arrêt quota** | si le journal contient `usage limit`, `rate limit` ou `quota` : ligne ajoutée à **`docs/imagegen/logs/QUOTA.txt`** ; **tant que ce fichier existe, la file ne lance plus aucun brief** |
| Variables | `CODEX` (binaire ; sinon `codex` du PATH, sinon repli Windows), `CODEX_MODEL` (`gpt-6-astra`), `STAGGER` (40), `RETRIES` (3), `STYLE_FILE` (`_style.txt`) |
| Commande | `codex exec -m $MODEL --sandbox workspace-write --skip-git-repo-check -C <racine> -o logs/<lot>.last.md - < logs/<lot>.full.txt` |

Fichiers produits dans `docs/imagegen/logs/` :

| Fichier | Contenu | Versionné |
|---|---|---|
| `<lot>.full.txt` | brief complet envoyé | oui |
| `<lot>.log.<n>` | journal de l'essai n | oui |
| `<lot>.log` | copie du dernier essai | en général non : `*.log` est ignoré (la ligne de négation `!docs/imagegen/logs/*.log` la précède dans `.gitignore`, elle est donc sans effet) ; seul `dir-d1.log` est versionné |
| `<lot>.last.md` | **réponse finale de Codex** (résumé, défauts) | oui |
| `queue-*.out` | sortie console de la file (heures de départ et de fin, code) | oui |
| `QUOTA.txt` | marqueur d'arrêt | n'existe plus (retiré pour la reprise) |

## 4. Lots et briefs

| Brief (`docs/imagegen/`) | Lot | Images demandées → produites | Dossier | Contenu |
|---|---|---|---|---|
| `dir-d1.txt` | directions | 1 → 1 | `directions/` | **D1 « Carrière à l'heure dorée »** (maquette 1536 × 1024 : décor, grille 5 × 5, Buck, logo, HUD) |
| `dir-d2-d5.txt` | directions | 4 → 4 | `directions/` | D2 affiche pop, **D3 dynamitage de nuit**, D4 barrage à midi, D5 atelier dans le granit |
| `sym-lows-tnt.txt` | 1 | 7 → 7 | `symbols/` | L1-L4 ; charges `T-stick`, `T-bundle`, `T-keg` (baril) |
| `sym-premiums.txt` | 1 | 6 → 6 | `symbols/` | planches H1-H4, W, S : symbole à gauche **sans** sa pièce animée, pièce séparée à droite, même échelle |
| `decor-base.txt` | 1 | 7 → 7 | `decor/` | calques : `sky`, `clouds` (5), `far` (falaise vierge), `mid` (barrage, chute), `ground`, `night-sky`, `fg-props` (3) |
| `mascot-rig.txt` | 2 | 5 → **4** | `mascot/` | Buck cut-out : `buck-ref`, `buck-heads` (7 expressions), `buck-body` (6 pièces), `buck-arms` (10 pièces) ; **`buck-props` non produit (quota)** |
| `ui-frame-hud.txt` | 2 | 7 → **5** | `ui/` | `frame` (9-slice), `cell`, `spin`, `buttons` (5), `icons` (10) ; **`topbar` et `multiplier` non produits (quota)** |
| `identity.txt` | 2 | 5 → **3** | `identity/` | `logo`, `crownforge` (livré sur vert chroma), `card-blast` ; **`card-detonator` et `card-bonus` non produits (quota)** |
| `mechanics-ui.txt` | 3 | 6 → 6 | `ui/`, `symbols/`, `fx/` | **`cornerstone`**, **`cornerstone-gold`** (remplacent `multiplier`), `topbar` (reprise), `T-log` (bûche-charge 4 × 4), `fx-debris` (12 éclats), `fx-dust` (4 nuages) |
| `decor-extra.txt` | 3 | 7 → 7 | `decor/` | `sky-rich`, **Mount Buckmore** `monument-0` à `-3` (4 étapes superposables), `floodlight`, `birds` (3 poses) |
| `screens.txt` | 3 | 6 → 6 | `screens/` | `panel-sundown`, `panel-floodlight`, `panel-total`, `banner-tier`, `shop-board`, `card-frame` (centres vides pour le texte traduit) |
| `identity-media.txt` | 3 | 5 → 5 | `identity/`, `decor/` | `card-detonator` (Buck frappe le Cornerstone), `card-bonus`, `cover` 16:9, `tile` 3:4, `decor-portrait` |
| `buck-props.txt` | 4 | 1 → 1 | `mascot/` | reprise de `buck-props` seul (détonateur sans poignée, poignée en T, bâton, allumette) |

**Total : 62 PNG**, chacun avec son `.prompt.txt` (prompts rédigés en anglais par Codex). Directions : 5 ; lot 1 : 20 ; lot 2 : 12 sur 17 ; lot 3 : 24 ; lot 4 : 1.

Choix de direction : **D1 retenue**, **D3 pour l'ambiance des bonus** (`docs/ART-DIRECTION.md`).

## 5. Chronologie (28/09, d'après `logs/queue-*.out` et `logs/*.log.*`)

| Heure | Événement |
|---|---|
| 09:46 → 09:51 | `dir-d1` (style maison) |
| 09:51 → 10:05 | `dir-d2-d5` |
| **10:07 → 10:23** | **Lot 1** : `sym-lows-tnt`, `sym-premiums`, `decor-base` en parallèle (départs 10:07:43, 10:08:23, 10:09:03) ; tous terminés (code 0) |
| **10:23 → 10:32** | **Lot 2** : `mascot-rig`, `ui-frame-hud`, `identity` (départs espacés de 40 s) |
| 10:31:54 | **premier refus `HTTP 429 usage_limit_reached`** : quota du compte ChatGPT épuisé (l'outil propose d'attendre jusqu'au 4 octobre) |
| 10:32 | les trois missions s'arrêtent (code 1) ; « QUOTA atteint — arrêt de la génération » ; 12 images sur 17 livrées |
| 10:35 | commit `a138b98` (directions, lots 1-2, pipeline) |
| 10:32 → 11:16 | **l'utilisateur change de compte Codex** ; le marqueur `QUOTA.txt` est retiré ; les manques sont re-briefés (`multiplier` remplacé par le Cornerstone) |
| **11:16 → 11:42** | **Lot 3** : `mechanics-ui`, `decor-extra`, `screens`, puis `identity-media` (lancé à 11:29:31, 40 s après la fin de `mechanics-ui`) ; tous terminés (code 0) |
| **11:43 → 11:46** | **Lot 4** : `buck-props` ; la reprise corrective est **refusée par le filtre de sécurité** (motif `illicit`), la première image est gardée |
| 11:47 | commit `eb1621c` (lot 3 intégré) |
| 11:49 | `npm run assets` : 57 clés `ok`, `buck.props` traitée (arbre de travail) |

Aucune erreur 401 dans les journaux : toutes les missions sont au premier essai (`essai 1`).

## 6. Contrôles

1. **Par Codex** (pendant la mission) : inspection visuelle de chaque sortie, **une seule reprise** par image, lecture des dimensions et de l'alpha avec Pillow (lecture seule), puis **rapport**.
2. **Rapports de lot** dans `assets/generated/` :

   | Rapport | Lot |
   |---|---|
   | `directions/rapport-dir-d2-d5.md` | directions D2-D5 |
   | `symbols/sym-lows-tnt.report.md` | sym-lows-tnt |
   | `symbols/rapport-sym-premiums.md` | sym-premiums |
   | `decor/rapport-decor-base.md` | decor-base |
   | `mechanics-ui-report.md` | mechanics-ui |
   | `decor/decor-extra-report.md` | decor-extra |
   | `screens/rapport-screens.md` | screens |
   | `identity/identity-media-report.md` | identity-media |

   Les lots interrompus (`mascot-rig`, `ui-frame-hud`, `identity`) et `buck-props` n'ont **pas de rapport** : leurs défauts sont dans `logs/<lot>.log.1` et `logs/buck-props.last.md`. Les réponses finales de tous les lots terminés sont dans `logs/<lot>.last.md`.
3. **Pipeline** (`npm run assets`) : normalisation de l'alpha, clé chroma de secours, découpe, puis **planches de contrôle sur fond clair et sombre** `docs/imagegen/checks/<famille>.png` et `report.json`.
4. **Assemblage** : `compose_parts.py` (symboles en pièces), `compose_rig.py` (rig de Buck), `bench-mascot.mjs` (Buck animé dans le jeu) → `docs/imagegen/checks/`.

## 7. Écarts connus (signalés par les rapports)

| Lot | Écarts |
|---|---|
| Directions | D1 : nuances au-delà des deux tons, symboles parfois < 85 % de la case. D2-D5 : cases de D2 et D4 un peu rectangulaires, Buck varie légèrement d'une direction à l'autre, structures générales proches |
| sym-lows-tnt | **1254 × 1254** au lieu de 1024 × 1024 ; nuances progressives ; L2 (pioche) ≈ 78 % de la hauteur au lieu de 88 % ; T-stick incliné de 20° au lieu de 15° ; marges de T-stick et T-keg < 5 % ; mèches sombres peu contrastées en petit |
| sym-premiums | alpha max 254, franges semi-transparentes ; marges < 3 % (H2, H3, S) ; **ajustement exact des pièces non garanti** (bois de H2, huppe de H4 trop grande, couvercle de W trop petit, tige de S plus fine que l'orifice) ; plan de H3 trop détaillé et trop proche |
| decor-base | alpha max 254, transitions d'alpha aux contours ; espacements < 60-80 px (nuages, premier plan) ; marges latérales < 3 % ; forêt de `mid` plus haute que demandé ; `ground` plus mince |
| mascot-rig (journal, pas de rapport) | relevés pendant la mission, avant reprise : têtes trop serrées sur la planche (d'où la découpe par rectangles de `buck.heads`), manches du torse trop longues, marges insuffisantes. État final non documenté |
| ui-frame-hud (journal, pas de rapport) | formats imposés par l'outil ; cadre d'abord trop épais (reprise faite) ; planche de boutons avec fond et halos **après reprise** ; icônes simplifiées, sans fond vert de secours (d'où la découpe par rectangles de `ui.ico`) |
| identity (journal, pas de rapport) | logo avec un halo diffus **après reprise** ; emblème Crownforge **livré sur vert chroma** (détouré par le pipeline) |
| mechanics-ui | carrés en 1254 × 1254 ; Cornerstone : marge latérale ≈ 1,5 %, version or pas identique au pixel près ; enseigne ≈ 1343 × 435 au lieu de 1200 × 260 ; T-log avec une étincelle en trop ; éclats de 163 à 243 px (> 180) |
| decor-extra | monuments 1254 × 1254, **superposition exacte non obtenue** entre les 4 étapes ; ciel avec modulations douces ; oies ≈ 380-404 px au lieu de 300 ; marge haute du projecteur ≈ 2,5 % |
| screens | centres pas parfaitement unis ; alpha max 254 ; marges < 3 % (sundown, total, bannière, boutique) ; lanternes à la place de projecteurs (floodlight) ; décor ajouté sur `panel-total` ; bannière ≈ 1481 × 477 |
| identity-media | `cover` en 1672 × 941, `tile` en 1086 × 1448 (dimensions demandées non respectées) ; sens des éclats ambigu sur `card-detonator` ; cascade trop haute sur `decor-portrait` ; transitions lumineuses |
| buck-props | fils à 15 px du bord gauche, allumette trop grande, légers résidus d'alpha ; reprise refusée par le filtre de sécurité |

Écart de conception : `sym-lows-tnt` a produit un **baril de poudre** (`T-keg`) ; le concept a ensuite choisi une **bûche-charge** (`T-log`, lot 3), qui n'est pas encore affichée par le jeu (`docs/ASSETS.md` § 4).

## 8. Reproduire ou compléter

1. Écrire un brief `docs/imagegen/<lot>.txt` (dossier cible, format, fond, contenu de chaque image, textes exacts autorisés).
2. Lancer la file : `tools/codex-queue.sh 3 docs/imagegen/<lot>.txt` (au plus 3 missions, 40 s entre les départs).
3. En cas de quota : attendre ou changer de compte, **supprimer `docs/imagegen/logs/QUOTA.txt`**, relancer (les images déjà livrées avec leur `.prompt.txt` ne sont pas refaites), ou écrire un brief de reprise ciblé (comme `buck-props.txt`).
4. Lire `logs/<lot>.last.md` et le rapport du lot.
5. Déclarer les clés dans `tools/assets/assets.config.json`, lancer `npm run assets`, vérifier les planches claires et sombres et `report.json`.
