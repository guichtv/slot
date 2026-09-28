# BOOMTOOTH — Contrat des books (v1.1)

Document de référence pour l'**équipe maths**. Il décrit exactement ce que le front accepte, comment il le lit et comment il le met en scène.

> **Principe** : le front est un **lecteur d'événements**. Il **ne calcule jamais un gain**, ne le déduit pas et ne le corrige pas. Il valide la forme et la cohérence déclarée, puis il joue les événements dans l'ordre. Un book invalide est **refusé** (`ContractError`), jamais réparé.

Sources de vérité (lues pour rédiger ce document) :

| Fichier | Rôle |
|---|---|
| `src/contract/schema.ts` | schémas zod, `parseBook()`, `checkBook()`, `CONTRACT_VERSION = '1.1.0'` |
| `src/controller/model.ts` | `RoundModel.apply()` : effet de chaque événement sur l'état logique |
| `src/controller/player.ts` | `RoundPlayer` : lecture séquentielle, passer, reprise, arrêt au plafond |
| `src/controller/presenter.ts` | `GamePresenter` : mise en scène de chaque événement |
| `src/core/money.ts` | `bookToMoney()` : seule conversion book → monnaie |
| `public/game-math-config.json`, `src/config/math.ts` | règles fournies par les maths (**provisoires**) |
| `tools/fixtures/kit.ts`, `validate.ts`, `scenarios.ts`, `build.ts` | kit d'auteur, validateur, 30 books de démonstration |
| `public/fixtures/fixtures.json` | books de démonstration générés (servis par le mode local et le mock RGS) |
| `tests/fixtures.test.ts` | 38 tests sur les fixtures |

---

## 1. Unités

| Grandeur | Unité | Exemple |
|---|---|---|
| **Montants des books** (`amount`, `win`, `totalWin`, `payoutMultiplier`…) | **entiers ≥ 0, centièmes de la mise de base** : `100` = ×1 | `1350` = ×13,50 la mise |
| Monnaie (API Stake, solde, mise) | **entiers, base 10⁶** (`MONEY_BASE = 1 000 000` = 1 unité de devise) | `1 000 000` = 1,00 € |
| Multiplicateur global (`globalMult`, `mult`) | **entier simple** (pas en centièmes), de 1 à 9 999 | `44` = ×44 |
| `costMultiplier` | nombre > 0 (facultatif, informatif) | `100` pour un achat BONUS |

- **Base des montants = mise de base**, pas le prix payé. Un achat BONUS coûte 100 × la mise ; s'il rend `28240`, le joueur reçoit **×282,40 la mise de base** (F16).
- **Une seule conversion** : `bookToMoney(bookAmount, baseBet)` dans `src/core/money.ts`. Calcul entier (`BigInt`) de `baseBet × bookAmount / 100`, arrondi au plus proche (moitié vers le haut). Exemple : mise 1,00 € (`1 000 000`) et `1350` → `13 500 000` = **13,50 €**.
- `bookToX(amount) = amount / 100` sert **uniquement à l'affichage** (choix du palier de célébration).
- Le solde affiché vient **toujours du serveur** (ou du fournisseur local qui l'imite). Le front n'additionne jamais les gains au solde.

## 2. Grille, coordonnées, paiement

- **Grille 5 × 5** (`COLS = 5`, `ROWS = 5`).
- **Coordonnées `[col, row]`**, **origine en haut à gauche**, index 0. `[0,0]` = rouleau 1, ligne du haut ; `[4,4]` = rouleau 5, ligne du bas.
- **`board[col][row]`** : le JSON d'une grille est un **tableau de 5 colonnes**, chacune de 5 objets `{ "name": … }` du haut vers le bas. Attention : ce ne sont **pas** des lignes.
- **Zone** (`Area`) : `{ col, row, w, h }`, `col,row` = **coin haut-gauche**, `w,h` en cases.
- **Paiement en ways** : **3 125 ways** (5⁵), de gauche à droite depuis le rouleau 1, sur **3 rouleaux adjacents ou plus**. Une connexion compte **toutes** les cases du symbole (ou WILD) sur ces rouleaux ; `ways` = produit du nombre de cases par rouleau.
- **Chutes (tumbles)** : les cases gagnantes s'effondrent, les survivants tombent, de nouveaux symboles entrent par le haut. La séquence continue tant qu'il y a un gain.
- **Géants** : un géant compte comme son symbole sur chaque case qu'il couvre. Après l'évaluation, un géant non gagnant se **fissure** en symboles simples du même type ; rien ne persiste d'un spin à l'autre.

## 3. Symboles et charges

| Id | Symbole | Paie | Remarques |
|---|---|---|---|
| `L1` | casque de chantier jaune | oui | bas |
| `L2` | pioche à manche bleu | oui | bas |
| `L3` | lanterne tempête verte | oui | bas |
| `L4` | gourde violette | oui | bas |
| `H1` | raton artificier | oui | haut (top) |
| `H2` | élan costaud | oui | haut |
| `H3` | loutre géomètre | oui | haut |
| `H4` | pic-vert foreur | oui | haut |
| `W` | **WILD** : caisse dorée pleine de dynamite | oui | remplace tous les symboles payants ; peut être un géant |
| `S` | **SCATTER** : détonateur à piston | non | **au plus un par rouleau** ; jamais détruit ni recouvert par une zone |
| `T` | **charge** | non | son type est donné à part, dans la liste `tnt` |

Symboles payants (`PAYING` dans le schéma) : `L1 L2 L3 L4 H1 H2 H3 H4 W`. Un géant (`carve.giant`) et une connexion (`WinLine.symbol`) sont toujours l'un de ces neuf.

**Charges** (`TNT_SIZE` dans le schéma) :

| `kind` | Objet | Zone | Asset affiché |
|---|---|---|---|
| `stick` | bâton de dynamite | **2 × 2** | `sym.T.stick` |
| `bundle` | fagot de trois bâtons | **3 × 3** | `sym.T.bundle` |
| `keg` | charge lourde (baril cerclé ; « bûche-charge » dans le concept) | **4 × 4** | `sym.T.keg` |

La zone d'une charge est **carrée**, **entièrement dans la grille**, **contient la charge**. Sa position est **choisie par les maths** (le front ne la déduit pas).

**Table de paiement provisoire** (`game-math-config.json`, centièmes de la mise **par way**) :

| Symbole | 3 rouleaux | 4 rouleaux | 5 rouleaux |
|---|---:|---:|---:|
| H1 | 50 | 150 | 500 |
| H2 | 40 | 100 | 300 |
| H3 | 30 | 75 | 200 |
| H4 | 25 | 60 | 150 |
| L1 | 10 | 25 | 60 |
| L2 | 10 | 20 | 50 |
| L3 | 5 | 15 | 40 |
| L4 | 5 | 10 | 30 |
| W | 50 | 150 | 500 |

Le front **n'utilise pas** cette table pour payer : elle sert au menu des règles. Les fixtures l'utilisent pour écrire des montants illustratifs (`win = table × ways × mult`).

## 4. Structure d'un book

```json
{ "id": "F10", "mode": "BASE", "payoutMultiplier": 1350, "costMultiplier": 25, "events": [ … ] }
```

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | chaîne ou nombre | oui | converti en chaîne |
| `mode` | chaîne | oui | nom du mode (§ 11) |
| `payoutMultiplier` | entier | oui | ≥ 0, centièmes de la mise de base ; **= `finalWin.amount`** ; ≤ 2 500 000 (plafond) |
| `costMultiplier` | nombre | non | > 0 ; informatif, jamais utilisé pour un calcul |
| `events` | tableau d'événements | oui | au moins 1 ; **le premier est `reveal`**, **le dernier est `finalWin`** |

- Chaque événement porte **`index`** (entier ≥ 0) et **`type`** (discriminant). Les `index` doivent être **strictement croissants** ; les fixtures utilisent 0…n−1 sans trou (recommandé : la reprise Stake compare `index` au dernier événement enregistré).
- Un `type` inconnu est refusé. Les **champs inconnus sont ignorés** (zod les retire).
- Transport Stake : le client lit les événements dans `round.state` (tableau), `round.state.events` ou `round.events` ; l'identifiant dans `betID`, `betId`, `id` ou `roundID` (`src/stake/rgs.ts`, `normalizeRound`).
- Le fichier `public/fixtures/fixtures.json` enveloppe chaque book de métadonnées de démonstration (`id`, `mode`, `weight`, `tags`, `note`, `book`). **Seul `book` fait partie du contrat.**

Type commun `Pos` : `[col, row]`, deux entiers de 0 à 4.

## 5. Les événements

Quinze types (`GameEvent` dans `schema.ts`). Pour chacun : champs, effet sur l'état logique (`RoundModel.apply`, appliqué **une seule fois**) et mise en scène (`GamePresenter`). Les délais cités viennent de `src/config/timings.ts` (ils sont divisés par la vitesse turbo).

### 5.1 `reveal` — révélation d'une grille

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `board` | 5 colonnes × 5 `{ name }` | oui | symboles de la liste § 3 |
| `anticipation` | 5 entiers | oui | ≥ 0 ; `0` = arrêt normal, `> 0` = rouleau ralenti ; **> 0 seulement si au moins 2 Scatters sont sur les rouleaux précédents** |
| `gameType` | `basegame` ou `freegame` | oui | non contrôlé ; ignoré par le front |
| `tnt` | liste de `{ pos, kind }` | non (défaut `[]`) | **une entrée par case `T` et aucune autre** |
| `padding` | `{ top: 5 symboles, bottom: 5 symboles }` | non | accepté, **ignoré** (le défilement utilise des symboles décoratifs) |
| `paddingPositions` | entiers | non | accepté, **ignoré** |

- **État** : la grille et les charges sont remplacées ; géants effacés ; gain du spin remis à 0.
- **Scène** : les rouleaux tournent (déjà lancés au clic en jeu de base), défilement minimal 520 ms, arrêts espacés de 110 ms. À chaque arrêt : son, et chaque Scatter réagit (compteur, son de plus en plus aigu, Buck s'excite). Sur le premier rouleau avec `anticipation > 0` : tension sonore, zoom caméra ×1,07, ralenti de **1,85 s par rouleau anticipé**. Fin : Buck se réjouit si 3 Scatters ou plus sont visibles, sinon il est déçu. Seule la condition `> 0` compte : la valeur exacte n'est pas lue.

### 5.2 `blast` — une charge explose

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `chain` | entier ≥ 0 | oui | identifiant de la chaîne dans l'étape |
| `link` | entier ≥ 0 | oui | **0, 1, 2… dans l'ordre** au sein de la chaîne |
| `tnt` | `{ pos, kind }` | oui | une charge **présente** à cette case, du même type |
| `area` | `{ col, row, w, h }` | oui | `w = h =` taille du type (2, 3, 4) ; dans la grille ; contient `tnt.pos` ; **aucun Scatter** |
| `from` | `Pos` | si `link > 0` et pas `wired` | position d'une charge **précédente de la même chaîne** dont la zone contient cette charge |
| `wired` | booléen | non | `true` = reliée par le fil de mise à feu ; **super bonus uniquement** |

- **État** : la charge est consommée. La zone devient des gravats (le géant naît au `carve`).
- **Scène, lien 0** : en super bonus, s'il existe des liens `wired` dans la même chaîne, le **fil rouge** est tendu entre toutes les charges. Le géomètre plante ses **piquets** et tend le **cordeau** autour de la zone. Buck **frotte l'allumette sur sa dent en or**, l'étincelle file jusqu'à la mèche (380 ms), la mèche crépite (240 ms), puis **explosion** : flash, onde, secousse proportionnelle à la taille, éclats, poussière. Buck se protège.
- **Scène, lien > 0** : piquets, son de chaîne, grimace de Buck, étincelle depuis la charge `from` (ou le long du fil, 360 ms), mèche 400 ms, explosion plus forte. Les autres charges prises dans une zone restent visibles jusqu'à leur propre explosion. Une `keg` a un son plus lourd.

### 5.3 `carve` — fin de chaîne, sculpture du géant

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `chain` | entier ≥ 0 | oui | une chaîne qui a au moins un `blast` |
| `area` | `{ col, row, w, h }` | oui | **rectangle englobant de toutes les zones de la chaîne** ; dans la grille ; aucun Scatter dessous ; plus aucune charge dessous |
| `giant` | symbole payant | oui | `L1`…`H4` ou `W` |
| `cells` | entier > 0 | oui | **= `w × h`** ; nourrit le Cornerstone en bonus |

- **État** : toutes les cases de la zone prennent le symbole du géant ; charges éventuelles retirées ; le géant est enregistré.
- **Scène** : le fil est retiré. Les cases du rectangle qui n'étaient dans aucune zone s'effritent. Le géant **émerge de la poussière** (apparition + rebond, trois coups de ciseau). Buck désigne le géant puis prend la pose.

### 5.4 `winInfo` — connexions de l'étape

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `totalWin` | montant | oui | **= somme des `wins[].win`** |
| `wins` | liste de `WinLine` | oui | au moins 1 |

`WinLine` :

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `symbol` | symbole payant | oui | `L1`…`H4` ou `W` |
| `kind` | `ways` | oui | seule valeur |
| `reels` | entier 3 à 5 | oui | nombre de rouleaux consécutifs depuis la gauche ; **= rouleaux visibles** |
| `ways` | entier > 0 | oui | **= produit des cases (symbole ou W) par rouleau** |
| `win` | montant | oui | gain final de la connexion, **multiplicateur compris** |
| `baseWin` | montant | si `mult > 1` | gain avant multiplicateur ; **`baseWin × mult = win`** |
| `mult` | entier > 0 | non | en bonus avec Cornerstone > 1 : **= multiplicateur courant** ; interdit (> 1) hors bonus |
| `positions` | liste de `Pos` | oui | au moins 3 ; **toutes** les cases du symbole ou de W sur les rouleaux 0…`reels−1`, et rien d'autre |

- Toutes les charges doivent avoir explosé **avant** un `winInfo`.
- **Toute connexion visible doit être déclarée** (3 rouleaux ou plus), avec le bon nombre de rouleaux.
- **État** : mémorise les connexions (réactions).
- **Scène** : le décor s'atténue. Pour chaque connexion, **dans l'ordre du tableau** : halo de la couleur du symbole, les vraies cases réagissent (un géant réagit une fois), les autres s'assombrissent, le montant s'affiche au centre du groupe (`base ×mult = gain` si `mult > 1`), 620 ms. **Au-delà de 3 connexions, seule la première est détaillée.**

### 5.5 `updateTumbleWin` — cumul du spin

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `amount` | montant | oui | **= somme des `totalWin` depuis le `reveal`** |

- **État** : gain du spin = `amount`. **Scène** : le HUD affiche ce montant converti.

### 5.6 `tumbleBoard` — chute

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `removed` | liste de `Pos` | oui | au moins 1 ; **exactement l'union des `positions` du dernier `winInfo`** |
| `newSymbols` | 5 listes de symboles | oui | par colonne, **du haut vers le bas** ; autant que de cases retirées dans la colonne ; **jamais de `S`** |
| `board` | 5 colonnes × 5 `{ name }` | oui | grille complète résultante : pour chaque colonne, `newSymbols[c]` puis les survivants dans leur ordre |
| `tnt` | liste de `{ pos, kind }` | non (défaut `[]`) | **toutes** les charges de la nouvelle grille (survivantes déplacées + nouvelles) |

- Une charge qui tombe **explose au début de l'étape suivante** (F11).
- **État** : grille et charges remplacées ; les géants restants redeviennent des symboles simples.
- **Scène** : les cases gagnantes s'effondrent (éclats, poussière) ; un géant entièrement retiré s'effondre, sinon il se fissure en symboles simples ; la chute démarre 170 ms après ; les survivants gardent leur identité. À la fin, la grille affichée est comparée au `board` déclaré (erreur visible en DEV en cas d'écart).

### 5.7 `updateGlobalMult` — Cornerstone (bonus)

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `globalMult` | entier | oui | **1 à 9 999** ; nouvelle valeur |
| `cause` | `carve` ou `start` | non (défaut `carve`) | `carve` : après une sculpture ; `start` : valeur de départ du bonus |
| `added` | entier ≥ 0 | si `cause = carve` | **= `cells` du dernier `carve`** |
| `chain` | entier ≥ 0 | non | si présent : **= chaîne du dernier `carve`** |

- **Bonus uniquement.** Avec `cause = carve` : `globalMult = min(9 999, valeur précédente + cells)`.
- **État** : multiplicateur global = `globalMult`.
- **Scène** (`carve`) : les éclats volent de la zone sculptée jusqu'au **Cornerstone**, Buck le frappe de la queue, la valeur est **regravée**. En bonus, la sculpture du Mount Buckmore avance d'un cran par palier (cosmétique, lu depuis la valeur).

### 5.8 `setWin` — gain du spin

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `amount` | montant | oui | **= somme des `totalWin` du spin** ; plus aucune charge sur la grille |

- **État** : gain du spin = `amount`.
- **Scène** : les géants se fissurent. Si `amount ≥` premier palier de célébration (×10) : **célébration** (paliers ×10, ×25, ×100, ×500, ×1 000). Sinon Buck réagit (petit gain, ou « bon gain » dès ×2). Hors bonus, le HUD affiche le gain.

### 5.9 `setTotalWin` — total cumulé

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `amount` | montant | oui | en base : **total de la manche** ; en bonus : **total du bonus** (gain du spin déclencheur compris) |

- **État** : total de manche = `amount` (et total du bonus pendant les free spins).
- **Scène** : en bonus, le HUD affiche « TOTAL » ; en base, rien de visible.

### 5.10 `freeSpinTrigger` — déclenchement du bonus

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `bonus` | `standard` ou `super` | oui | `standard` : **exactement 3 Scatters** (sauf mode `BONUS…`) ; `super` : **4 ou plus** |
| `totalFs` | entier > 0 | oui | tours attribués (10 ou 12, § 8) |
| `positions` | liste de `Pos` | oui | au moins 3 ; **tous les Scatters visibles, dans l'ordre colonne puis ligne** |

- **État** : bonus actif, tour 0 sur `totalFs`, **multiplicateur remis à 1**.
- **Scène** : les Scatters réagissent ensemble, Buck acclame puis enfonce le piston (transition en cours d'écriture dans l'arbre de travail), l'ambiance passe à la nuit, **écran d'introduction** (SUNDOWN SHIFT ou FLOODLIGHT SHIFT, nombre de tours, règle), compteur de tours, **Cornerstone ×1**.

### 5.11 `freeSpinRetrigger` — relance

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `extra` | entier > 0 | oui | tours ajoutés |
| `totalFs` | entier > 0 | oui | **nouveau total = ancien total + `extra`** |
| `positions` | liste de `Pos` | oui | au moins 2 ; au moins 2 Scatters visibles |

- Seulement **pendant** le bonus. **État** : total de tours mis à jour. **Scène** : son, Buck acclame, bannière « +N », compteur mis à jour.

### 5.12 `updateFreeSpin` — début d'un free spin

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `amount` | entier > 0 | oui | **numéro du tour, de 1 en 1** depuis 1 |
| `total` | entier > 0 | oui | **= total courant** (relances comprises) |

- **État** : tour courant et total. **Scène** : compteur « tours restants » = `total − amount`, pause de 260 ms.

### 5.13 `freeSpinEnd` — fin du bonus

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `amount` | montant | oui | **= total du bonus** ; tous les tours joués (`dernier amount = total`) |

- **État** : total du bonus = `amount`, bonus inactif.
- **Scène** : géants fissurés, **écran de gain total**, compteur et Cornerstone retirés, retour à l'ambiance du jour et à la sculpture de départ, HUD = `amount`.

### 5.14 `wincap` — plafond atteint (MAX WIN)

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `amount` | montant | oui | **= `maxWinX × 100` = 2 500 000** |

- **État** : manche plafonnée, total = `amount`.
- **Scène** : fin de la présentation des gains, **célébration MAX WIN (« BLOWN SKY-HIGH! »)**. Puis le lecteur **s'arrête** : il applique `finalWin` sans le présenter et ignore tout le reste.

### 5.15 `finalWin` — clôture

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `amount` | montant | oui | **= `payoutMultiplier`** ; **unique** ; **dernier événement** |

- **État** : total final, manche terminée. **Scène** : rien ; le contrôleur clôt la manche (`endRound`).

## 6. Ordre des événements

### 6.1 Grammaire

```
MANCHE        := SPIN_BASE [ BONUS ] finalWin
SPIN_BASE     := reveal(basegame) ÉTAPES setWin setTotalWin [ freeSpinTrigger ]
ÉTAPES        := ÉTAPE { winInfo updateTumbleWin tumbleBoard ÉTAPE }      (tant qu'il y a un gain)
ÉTAPE         := { CHAÎNE }                                               (toutes les charges posées, avant l'évaluation)
CHAÎNE        := blast(link 0) { blast(link 1..n) } carve [ updateGlobalMult(carve) ]   (mult : en bonus seulement)
BONUS         := [ updateGlobalMult(start) ] FREE_SPIN { FREE_SPIN } freeSpinEnd [ setTotalWin ]
FREE_SPIN     := updateFreeSpin reveal(freegame) ÉTAPES setWin setTotalWin [ freeSpinRetrigger ]

Plafond : à tout moment après un winInfo + updateTumbleWin qui franchit le plafond :
              … winInfo updateTumbleWin wincap finalWin                  (plus rien d'autre)
```

- `updateGlobalMult(start)` est **facultatif** : le front affiche ×1 tout seul au déclenchement. À fournir si le super bonus démarre au-dessus de ×1.
- `setTotalWin` après `freeSpinEnd` est **facultatif** (le kit ne l'émet pas ; le validateur l'accepte s'il vaut le total).
- Après `wincap` : **aucun** `tumbleBoard`, `setWin`, `setTotalWin` ni `freeSpinEnd`. Seul `finalWin` (même montant).

### 6.2 Tour de base avec géant (F10)

```
0 reveal · 1 blast (fagot, zone 3×3) · 2 carve (H1 3×3, 9 cases) · 3 winInfo (H1, 3 rouleaux, 27 ways)
4 updateTumbleWin · 5 tumbleBoard · 6 setWin · 7 setTotalWin · 8 finalWin
```

### 6.3 Charges multiples et charge qui tombe (F11)

```
0 reveal (2 bâtons) · 1 blast · 2 carve · 3 blast · 4 carve · 5 winInfo · 6 updateTumbleWin
7 tumbleBoard (un bâton tombe) · 8 blast · 9 carve · 10 winInfo · 11 updateTumbleWin · 12 tumbleBoard
13 setWin · 14 setTotalWin · 15 finalWin
```

Deux charges indépendantes = **deux chaînes** (`chain` 0 puis 1), chacune avec son `carve`. Après une chute, la numérotation des chaînes repart de 0.

### 6.4 Bonus (extrait de F14 : déclenchement, sculpture, relance)

```
0 reveal (3 S, anticipation) · 1 setWin · 2 setTotalWin · 3 freeSpinTrigger(standard, 10)
4 updateFreeSpin(1/10) · 5 reveal · 6 setWin · 7 setTotalWin
8 updateFreeSpin(2/10) · 9 reveal · 10 blast · 11 carve (4 cases) · 12 updateGlobalMult(×5, +4)
   13 winInfo (mult 5) · 14 updateTumbleWin · 15 tumbleBoard · 16 setWin · 17 setTotalWin
…
39 updateFreeSpin(6/10) · 40 reveal (3 S) · 41 setWin · 42 setTotalWin · 43 freeSpinRetrigger(+5 → 15)
44 updateFreeSpin(7/15) …
100 updateFreeSpin(15/15) · 101 reveal · 102 setWin · 103 setTotalWin · 104 freeSpinEnd · 105 finalWin
```

### 6.5 Plafond (fin de F26)

```
46 updateFreeSpin(7/12) · 47 reveal (keg) · 48 blast · 49 carve (H1 4×4, 16 cases)
50 updateGlobalMult(×44, +16) · 51 winInfo (H1 5 rouleaux, 1 024 ways, 512 000 × 44 = 22 528 000)
52 updateTumbleWin(22 528 000) · 53 wincap(2 500 000) · 54 finalWin(2 500 000)
```

Le `winInfo` et `updateTumbleWin` déclarent le **gain réel** (au-delà du plafond) ; `wincap` et `finalWin` portent le **montant plafonné**.

## 7. Chaînes et super bonus

- Une **chaîne** commence au lien 0. Un lien `k > 0` est une charge **prise dans la zone** d'une charge précédente de la même chaîne (`from`), ou **reliée par le fil** (`wired: true`, super bonus uniquement).
- Toute charge prise dans une zone **doit** exploser dans la chaîne avant le `carve` (sinon : « charges prises dans une zone mais non enchaînées »).
- Le `carve` couvre le **rectangle englobant** de toutes les zones de la chaîne (jusqu'au 5 × 5). Les cases du rectangle hors zones sont aussi sculptées.
- **FLOODLIGHT SHIFT** : **toutes les charges d'une étape sont reliées** et forment **une seule chaîne** (liens `wired`). Le front trace alors le fil entre toutes les charges. Le validateur vérifie seulement que `wired` n'apparaît qu'en super bonus ; l'unicité de la chaîne n'est pas contrôlée.

## 8. Bonus

| | **SUNDOWN SHIFT** (`standard`) | **FLOODLIGHT SHIFT** (`super`) |
|---|---|---|
| Déclenchement | **3 Scatters** | **4 Scatters ou plus** |
| Tours | **10** | **12** |
| Règle clé | chaque case sculptée : Cornerstone **+1** | **charges reliées** (une chaîne par étape) ; Cornerstone +1 par case |
| Multiplicateur de départ | ×1 | fourni par les maths (provisoire ×1, via `updateGlobalMult` `start`) |
| Relances (intention, `docs/CONCEPT.md`) | 2 Scatters : **+2** · 3 Scatters : **+5** | 2 : **+2** · 3 : **+5** · 4 et plus : **+8** |
| Achat | mode `BONUS` (100 ×) | mode `SUPER` (350 ×) |

- `game-math-config.json` ne décrit aujourd'hui qu'**un seul couple de relance** par bonus : `{ "scatters": 3, "spins": 5 }`. Le validateur ne contrôle que « au moins 2 Scatters visibles » et l'arithmétique `totalFs = ancien + extra`.
- Format prévu pour la table complète : `freeSpins.<standard|super>.retriggers = { "2": 2, "3": 5, "4": 8 }` (le dernier palier se lit « 4 ou plus »). Le menu des règles sait l'afficher (`retriggerTable` dans `src/ui/menu.ts`), **mais le schéma de `src/config/math.ts` ne déclare pas ce champ : zod le supprime au chargement**. Il faut étendre `MathConfigSchema` avant de livrer ce format.
- Le gain du spin déclencheur **fait partie du total du bonus** : `setTotalWin` pendant le bonus = gain de base + gains des free spins.
- Les fixtures n'utilisent **aucun bâton (`stick`) en super bonus** (fagots et `keg` seulement) ; c'est une règle des tests, à confirmer par les maths.

## 9. Multiplicateur — THE CORNERSTONE

- Bloc de granit gravé qui porte le multiplicateur **du bonus uniquement** (de ×1 à **×9 999**).
- **Remis à ×1** à chaque `freeSpinTrigger`.
- **Chaque case sculptée ajoute +1** : après chaque `carve` en bonus, un `updateGlobalMult` avec `cause: "carve"`, `added = cells`, `globalMult = min(9 999, précédent + cells)`. Exemple : fagot (9 cases) au premier tour → ×10.
- Il **ne redescend jamais** pendant le bonus et disparaît à `freeSpinEnd`.
- Il s'applique **à chaque connexion** au moment de son paiement : `win = baseWin × mult`, avec `mult` = valeur courante.
- `cause: "start"` : valeur de départ fournie par les maths (facultatif).
- Matière cosmétique côté front : granit, marbre ×25, cuivre ×100, bloc veiné d'or ×250, or en fusion ×1 000.

## 10. Plafond et gain final

- **MAX WIN : 25 000 × la mise** (`maxWinX`) → **2 500 000** en unités de book.
- Quand le cumul franchit le plafond : `wincap` (montant exact du plafond) puis `finalWin` (même montant). La manche s'arrête là.
- **`finalWin.amount = payoutMultiplier`**, toujours. `payoutMultiplier ≤ 2 500 000`.
- Le test des fixtures vérifie aussi que le plafond est **réellement atteint** (gains payés + gain du spin courant ≥ plafond).

## 11. Modes et coûts

D'après `public/game-math-config.json` (**valeurs provisoires**) :

| Mode | Nom joueur | Coût (× mise) | RTP | Type | Détail | Fixtures |
|---|---|---:|---:|---|---|---|
| `BASE` | jeu de base | 1 | 96,50 % | `base` | — | F01–F15, F20–F24, F27 |
| `ANTE` | DOUBLE FUSE | 1,5 | 96,50 % | `ante` | `bonusChanceFactor: 3` (« 3× BONUS CHANCE ») | F28–F30 |
| `BONUS` | achat SUNDOWN SHIFT | 100 | 96,60 % | `bonus` | `standard`, 10 tours | F16, F25 |
| `SUPER` | achat FLOODLIGHT SHIFT | 350 | 96,60 % | `bonus` | `super`, 12 tours | F17, F26 |
| `BLAST` | TNT SPIN | 25 | 96,55 % | `feature` | une révélation avec **au moins 2 charges** | F18 |
| `MEGA` | MEGA BLAST SPIN | 60 | 96,55 % | `feature` | une révélation avec **une charge 4 × 4** | F19 |

- Le mode est envoyé tel quel au RGS (`/wallet/play { amount, mode }`). Le débit (mise × coût) a lieu **côté serveur**.
- En jeu, l'Ante bascule le mode de base entre `BASE` et `ANTE`. **Les achats sont désactivés quand l'Ante est actif.**
- Books d'achat : `BONUS` commence par une révélation à **3 Scatters** puis `freeSpinTrigger(standard, 10)` ; `SUPER` par **4 Scatters** puis `freeSpinTrigger(super, 12)` ; `BLAST` et `MEGA` contiennent **exactement une révélation** et aucun déclenchement.
- `costMultiplier` : absent en `BASE`, égal au coût du mode ailleurs (règle des tests).

### Drapeau `provisional: true`

`game-math-config.json` porte `"provisional": true` : **ces valeurs sont celles du front, en attendant les maths**. **La build Stake est bloquée tant que ce drapeau vaut `true`** (commentaire du fichier et de `src/config/math.ts`).

Le blocage est porté par **`tools/check-release.mjs`** (ajouté le 28/09, pas encore commité) : `node tools/check-release.mjs --dir dist --stake` sort avec le **code 2 (« BLOQUANT pour Stake »)** si la config de la build est provisoire. **Sans `--stake`, ce n'est qu'un avertissement** ; `tools/package-delivery.mjs` l'appelle aujourd'hui sans `--stake`. Le jeu lui-même ne lit pas ce drapeau, et le menu des règles n'affiche jamais le statut « provisoire ».

Autres écarts à corriger : `contractVersion` vaut `"1.0.0"` dans la config, et `tools/fixtures/build.ts` écrit `"contract": "1.0.0"` dans `fixtures.json`, alors que le code est en **1.1.0** ; la charge 4 × 4 s'appelle `crate` dans la section `tnt` de la config au lieu de **`keg`**.

## 12. Invariants vérifiés

Trois niveaux, du plus strict au plus large. Un book de production doit passer **les deux premiers** ; le troisième vise les fixtures.

### 12.1 Schéma zod (`BookSchema`)

Types et bornes des tableaux du § 5, plus : `index` entier ≥ 0 ; `Pos` dans 0…4 ; `board` exactement 5 × 5 ; `anticipation` et `newSymbols` de longueur 5 ; `area.w`, `area.h` de 2 à 5 ; `reels` de 3 à 5 ; `positions` au moins 3 (au moins 2 pour une relance) ; `globalMult` de 1 à 9 999 ; montants entiers ≥ 0 ; `events` non vide.

### 12.2 `checkBook()` (appelé par `parseBook()`, donc à chaque lecture de book par le jeu)

1. `index` **strictement croissant**.
2. `winInfo` : `totalWin` = somme des `win`.
3. `WinLine` : `mult > 1` ⇒ `baseWin` présent.
4. `blast` : zone **dans la grille**.
5. `blast` : zone de la **taille du type** (2, 3 ou 4 de côté).
6. `blast` : la charge est **dans sa zone**.
7. `blast` : `link > 0` ⇒ `from` ou `wired`.
8. `carve` : zone **dans la grille**.
9. `carve` : `cells = w × h`.
10. `freeSpinRetrigger` **pendant** un bonus seulement.
11. `freeSpinRetrigger` : `totalFs` = total précédent + `extra`.
12. `updateFreeSpin` **pendant** un bonus seulement.
13. `updateFreeSpin` : `amount` = tour précédent + 1 (recommence à 1 après chaque déclenchement).
14. `updateFreeSpin` : `total` = total courant.
15. `freeSpinEnd` : tours joués = total.
16. **`finalWin` unique et en dernier**.
17. `finalWin.amount` = `payoutMultiplier`.
18. **Le premier événement est `reveal`**.

### 12.3 Validateur (`tools/fixtures/validate.ts`, `validateBook`)

Il appelle d'abord `parseBook()` : en cas d'échec, il s'arrête et rend ces erreurs. Sinon il rejoue le book et contrôle :

**`reveal`**
1. Si la grille précédente n'a pas été évaluée : aucune connexion visible non déclarée.
2. Case `T` ⇔ entrée dans `tnt` (et inversement).
3. **Au plus un Scatter par rouleau.**
4. `anticipation[c] > 0` ⇒ au moins **2 Scatters sur les rouleaux 0…c−1**.

**`blast`**
5. Une charge existe à `tnt.pos` et son type est le bon.
6. Zone de la taille du type.
7. `link` = nombre de liens déjà vus dans la chaîne (0, 1, 2…).
8. `wired` ⇒ **super bonus**.
9. Lien non `wired` : `from` est une charge précédente de la chaîne et la charge est **dans sa zone**.
10. La zone ne contient **aucun Scatter**.
11. Les autres charges de la zone deviennent des « liens en attente ».

**`carve`**
12. La chaîne a au moins un `blast`.
13. Zone = **rectangle englobant** des zones de la chaîne.
14. Aucun lien en attente (toute charge prise a explosé).
15. Le géant ne couvre **aucun Scatter**.
16. **Aucune charge** ne reste sous le géant.

**`updateGlobalMult`**
17. **En bonus seulement.**
18. `cause = carve` : `added` = `cells` du dernier `carve` ; `chain` (si présent) = sa chaîne ; `globalMult = min(9 999, précédent + cells)`.

**`winInfo`**
19. **Toutes les charges ont explosé.**
20. Chaque position contient le symbole ou W.
21. Chaque position est sur les rouleaux 0…`reels−1`.
22. Toutes les cases du symbole (ou W) sur ces rouleaux sont dans `positions`.
23. Rouleaux consécutifs : chaque rouleau 0…`reels−1` a au moins une case.
24. `ways` = produit des cases par rouleau.
25. En bonus avec multiplicateur > 1 : `mult` = multiplicateur courant.
26. `baseWin × mult = win`.
27. Hors bonus : aucun `mult > 1`.
28. **Aucune connexion visible non déclarée** ; rouleaux déclarés = rouleaux visibles.

**`updateTumbleWin`**
29. `amount` = cumul des `totalWin` du spin.

**`tumbleBoard`**
30. Suit un `winInfo` (« chute sans gain » sinon).
31. `removed` = union exacte des positions gagnantes.
32. Gravité : pour chaque colonne, `newSymbols` puis survivants = colonne déclarée.
33. Case `T` ⇔ entrée dans `tnt` sur la nouvelle grille.

**`setWin`**
34. Aucune connexion visible non déclarée (si la grille n'a pas été évaluée).
35. **Aucune charge** restante.
36. `amount` = gain du spin.

**`setTotalWin`**
37. `amount` = total du bonus (en bonus) ou total de la manche (en base).

**`freeSpinTrigger`**
38. `positions` = Scatters visibles, **ordre colonne puis ligne**.
39. `standard` : exactement 3 Scatters (sauf mode commençant par `BONUS`).
40. `super` : 4 Scatters ou plus.

**`freeSpinRetrigger`**
41. Au moins 2 Scatters visibles.

**`freeSpinEnd`**
42. `amount` = total du bonus.

**`wincap`**
43. `amount` = `maxWinX × 100`.

**`finalWin`**
44. `amount` = total de la manche.

**Fin du book**
45. Première révélation avec 3 Scatters ou plus ⇒ un `freeSpinTrigger` existe.
46. `payoutMultiplier ≤ maxWinX × 100`.

### 12.4 Tests des fixtures (`tests/fixtures.test.ts`, 38 tests)

- Chaque scénario se construit et le validateur ne signale rien.
- Ids F01…F28 présents (30 au total), uniques ; poids ≥ 1, tags et note non vides ; mode connu de la config.
- **Chaque connexion vaut table × ways** (× multiplicateur, avec `baseWin = table × ways`).
- Coûts et modes : § 11.
- Zones de `blast` consécutifs **disjointes** ; **pas de bâton en super bonus**.
- Au plus un Scatter par rouleau **sur toutes les grilles** (révélations et chutes) ; **aucun Scatter dans `newSymbols`** ; toute révélation à 3 Scatters ou plus est suivie d'un déclenchement ou d'une relance.
- Chaque grille révélée est **unique** dans tout le jeu de fixtures.
- Les vitrines montrent ce qu'elles annoncent (paliers ×10 à ×1 000, F26 au plafond, F27 à ×0,05…).
- Chaque `winInfo` est suivi d'un `tumbleBoard` ou d'un `wincap` ; `wincap` est suivi de `finalWin` ; le plafond est réellement atteint.

> **Attention** : la règle « zones disjointes » rejette toute **chaîne par contact** (`from`) : la charge prise est, par construction, dans sa zone et dans celle de la charge précédente. Aucune fixture ne montre de chaîne (`link > 0`) ni de charges reliées (`wired`). Le validateur, lui, les accepte.

### 12.5 Attendu mais non contrôlé automatiquement

- `gameType` cohérent (`basegame` hors bonus, `freegame` en bonus).
- **Au plus une charge par rouleau** (`docs/CONCEPT.md`).
- En bonus, **un `updateGlobalMult(carve)` après chaque `carve`**.
- Relance : `extra` conforme à la table 2 → +2, 3 → +5, 4+ → +8.
- Super bonus : une **seule** chaîne par étape.
- `chain` numérotées 0, 1, 2… dans l'étape (le kit le fait ; seul le lien entre `blast` et `carve` est vérifié).

## 13. Valider un book

| Commande | Effet |
|---|---|
| `npm run fixtures` | construit les 30 scénarios (`tools/fixtures/scenarios.ts`), valide chacun, **écrit** `public/fixtures/fixtures.json` et `docs/fixtures-ascii.txt` (grilles imprimées). Liste chaque scénario (✓ ou ✗ avec ses erreurs) et **sort en erreur (code 1) s'il en reste un seul invalide** ; rien n'est « réparé ». |
| `npx vitest run tests/fixtures.test.ts` | rejoue les 38 tests du § 12.4 (état au 28/09 : **38 réussis**). |
| `npm test` | tous les tests (`tests/*.test.ts`). |

Pour un **book externe** (livré par les maths), aucun script n'existe encore. Exemple minimal, à placer à la racine du dépôt et à lancer avec `npx tsx check-book.ts books.json` :

```ts
import fs from 'node:fs';
import { validateBook } from './tools/fixtures/validate';

const cfg = JSON.parse(fs.readFileSync('public/game-math-config.json', 'utf8'));
const raw = JSON.parse(fs.readFileSync(process.argv[2]!, 'utf8'));
let bad = 0;
for (const b of Array.isArray(raw) ? raw : [raw]) {
  const { issues } = validateBook(b, { maxWinX: cfg.maxWinX });
  if (issues.length) { bad++; console.log(`✗ ${b.id}\n  ${issues.join('\n  ')}`); } else console.log(`✓ ${b.id}`);
}
process.exit(bad ? 1 : 0);
```

Sortie typique d'un book faux : `✗ F10 / book incohérent / finalWin 1300 ≠ payoutMultiplier 1350`. Les erreurs de `checkBook` masquent les suivantes : corriger, puis relancer.

Pour **voir** un book dans le jeu : `npm run dev`, puis dans la console `__qa.play('F10')` (fixtures locales), ou le mock RGS (`node tools/mock-rgs.mjs`, voir `docs/ARCHITECTURE.md`).

## 14. Exemples complets

Books copiés de `public/fixtures/fixtures.json` (contenu exact ; mise en forme : un événement par ligne). Rappel : `board` est une liste de **colonnes**.

### 14.1 F10 — blast de base avec géant

Fixture : `BASE`, poids 2, tags `tnt bundle giant big-win`, note « fagot de TNT -> géant H1 3x3, 27 ways (x13,50) ».

Grilles (lignes à l'écran, extrait de `docs/fixtures-ascii.txt`) :

```
reveal                 carve -> H1 3×3         gains H1 ×3 rouleaux     après la chute
 L2  H3  L3  H2  L1     L2  H3  L3  H2  L1      L2  H3  L3  H2  L1       L1  H2  H2  H2  L1
 L1  L4  H2  L3  H3     H1  H1  H1  L3  H3     [H1][H1][H1] L3  H3       H3  L3  L1  L3  H3
 H2  T   L1  L4  H1     H1  H1  H1  L4  H1     [H1][H1][H1] L4  H1       L4  H2  H4  L4  H1
 L3  H4  L4  L1  L4     H1  H1  H1  L1  L4     [H1][H1][H1] L1  L4       L2  H3  L3  L1  L4
 H4  L2  S   H4  L3     H4  L2  S   H4  L3      H4  L2  S   H4  L3       H4  L2  S   H4  L3
```

Fagot en `[1,2]`, zone `{col 0, row 1, 3×3}` ; géant H1 ; 3 rouleaux × 3 cases = **27 ways × 50 = 1 350** (×13,50).

```json
{
  "id": "F10",
  "mode": "BASE",
  "payoutMultiplier": 1350,
  "events": [
    {"index":0,"type":"reveal","board":[[{"name":"L2"},{"name":"L1"},{"name":"H2"},{"name":"L3"},{"name":"H4"}],[{"name":"H3"},{"name":"L4"},{"name":"T"},{"name":"H4"},{"name":"L2"}],[{"name":"L3"},{"name":"H2"},{"name":"L1"},{"name":"L4"},{"name":"S"}],[{"name":"H2"},{"name":"L3"},{"name":"L4"},{"name":"L1"},{"name":"H4"}],[{"name":"L1"},{"name":"H3"},{"name":"H1"},{"name":"L4"},{"name":"L3"}]],"anticipation":[0,0,0,0,0],"gameType":"basegame","tnt":[{"pos":[1,2],"kind":"bundle"}]},
    {"index":1,"type":"blast","chain":0,"link":0,"tnt":{"pos":[1,2],"kind":"bundle"},"area":{"col":0,"row":1,"w":3,"h":3}},
    {"index":2,"type":"carve","chain":0,"area":{"col":0,"row":1,"w":3,"h":3},"giant":"H1","cells":9},
    {"index":3,"type":"winInfo","totalWin":1350,"wins":[{"symbol":"H1","kind":"ways","reels":3,"ways":27,"win":1350,"positions":[[0,1],[0,2],[0,3],[1,1],[1,2],[1,3],[2,1],[2,2],[2,3]]}]},
    {"index":4,"type":"updateTumbleWin","amount":1350},
    {"index":5,"type":"tumbleBoard","removed":[[0,1],[0,2],[0,3],[1,1],[1,2],[1,3],[2,1],[2,2],[2,3]],"newSymbols":[["L1","H3","L4"],["H2","L3","H2"],["H2","L1","H4"],[],[]],"board":[[{"name":"L1"},{"name":"H3"},{"name":"L4"},{"name":"L2"},{"name":"H4"}],[{"name":"H2"},{"name":"L3"},{"name":"H2"},{"name":"H3"},{"name":"L2"}],[{"name":"H2"},{"name":"L1"},{"name":"H4"},{"name":"L3"},{"name":"S"}],[{"name":"H2"},{"name":"L3"},{"name":"L4"},{"name":"L1"},{"name":"H4"}],[{"name":"L1"},{"name":"H3"},{"name":"H1"},{"name":"L4"},{"name":"L3"}]],"tnt":[]},
    {"index":6,"type":"setWin","amount":1350},
    {"index":7,"type":"setTotalWin","amount":1350},
    {"index":8,"type":"finalWin","amount":1350}
  ]
}
```

### 14.2 F16 — bonus acheté (SUNDOWN SHIFT, 10 tours)

Fixture : `BONUS` (coût 100), tags `buy bonus standard tnt multiplier`. 3 Scatters, 10 free spins complets, quatre sculptures (Cornerstone ×5 → ×14 → ×18 → ×22), total **28 240** (×282,40 la mise de base).

> La note de la fixture parle de « multiplicateur x5 » : elle date de l'ancienne règle (+1 par explosion). La valeur réelle suit la règle **+1 par case** (×22 à la fin).

<details>
<summary>Book F16 complet (79 événements)</summary>

```json
{
  "id": "F16",
  "mode": "BONUS",
  "payoutMultiplier": 28240,
  "costMultiplier": 100,
  "events": [
    {"index":0,"type":"reveal","board":[[{"name":"H2"},{"name":"L4"},{"name":"S"},{"name":"L1"},{"name":"H3"}],[{"name":"L3"},{"name":"H1"},{"name":"L2"},{"name":"H4"},{"name":"L3"}],[{"name":"S"},{"name":"L1"},{"name":"H4"},{"name":"L2"},{"name":"H2"}],[{"name":"L4"},{"name":"H3"},{"name":"L1"},{"name":"H1"},{"name":"S"}],[{"name":"H1"},{"name":"L2"},{"name":"H2"},{"name":"L3"},{"name":"L4"}]],"anticipation":[0,0,0,0,0],"gameType":"basegame","tnt":[]},
    {"index":1,"type":"setWin","amount":0},
    {"index":2,"type":"setTotalWin","amount":0},
    {"index":3,"type":"freeSpinTrigger","bonus":"standard","totalFs":10,"positions":[[0,2],[2,0],[3,4]]},
    {"index":4,"type":"updateFreeSpin","amount":1,"total":10},
    {"index":5,"type":"reveal","board":[[{"name":"H3"},{"name":"L2"},{"name":"H4"},{"name":"H2"},{"name":"L4"}],[{"name":"L1"},{"name":"L1"},{"name":"L1"},{"name":"S"},{"name":"H1"}],[{"name":"L4"},{"name":"L1"},{"name":"L1"},{"name":"L4"},{"name":"H3"}],[{"name":"H1"},{"name":"L4"},{"name":"L4"},{"name":"H2"},{"name":"L2"}],[{"name":"L2"},{"name":"L1"},{"name":"H3"},{"name":"L4"},{"name":"L1"}]],"anticipation":[0,0,0,0,0],"gameType":"freegame","tnt":[]},
    {"index":6,"type":"setWin","amount":0},
    {"index":7,"type":"setTotalWin","amount":0},
    {"index":8,"type":"updateFreeSpin","amount":2,"total":10},
    {"index":9,"type":"reveal","board":[[{"name":"L4"},{"name":"L2"},{"name":"H4"},{"name":"H1"},{"name":"H2"}],[{"name":"H1"},{"name":"H2"},{"name":"L3"},{"name":"H1"},{"name":"L3"}],[{"name":"L1"},{"name":"H3"},{"name":"H4"},{"name":"H2"},{"name":"L2"}],[{"name":"H1"},{"name":"H2"},{"name":"H2"},{"name":"L1"},{"name":"L4"}],[{"name":"L2"},{"name":"L1"},{"name":"L1"},{"name":"L4"},{"name":"H3"}]],"anticipation":[0,0,0,0,0],"gameType":"freegame","tnt":[]},
    {"index":10,"type":"winInfo","totalWin":200,"wins":[{"symbol":"H2","kind":"ways","reels":4,"ways":2,"win":200,"positions":[[0,4],[1,1],[2,3],[3,1],[3,2]]}]},
    {"index":11,"type":"updateTumbleWin","amount":200},
    {"index":12,"type":"tumbleBoard","removed":[[0,4],[1,1],[2,3],[3,1],[3,2]],"newSymbols":[["H2"],["H2"],["H3"],["L3","H2"],[]],"board":[[{"name":"H2"},{"name":"L4"},{"name":"L2"},{"name":"H4"},{"name":"H1"}],[{"name":"H2"},{"name":"H1"},{"name":"L3"},{"name":"H1"},{"name":"L3"}],[{"name":"H3"},{"name":"L1"},{"name":"H3"},{"name":"H4"},{"name":"L2"}],[{"name":"L3"},{"name":"H2"},{"name":"H1"},{"name":"L1"},{"name":"L4"}],[{"name":"L2"},{"name":"L1"},{"name":"L1"},{"name":"L4"},{"name":"H3"}]],"tnt":[]},
    {"index":13,"type":"setWin","amount":200},
    {"index":14,"type":"setTotalWin","amount":200},
    {"index":15,"type":"updateFreeSpin","amount":3,"total":10},
    {"index":16,"type":"reveal","board":[[{"name":"S"},{"name":"H4"},{"name":"L3"},{"name":"H1"},{"name":"L2"}],[{"name":"L3"},{"name":"L2"},{"name":"H2"},{"name":"L1"},{"name":"H4"}],[{"name":"T"},{"name":"H1"},{"name":"H2"},{"name":"L2"},{"name":"L3"}],[{"name":"L3"},{"name":"L1"},{"name":"H2"},{"name":"L1"},{"name":"L3"}],[{"name":"H3"},{"name":"L3"},{"name":"L4"},{"name":"L2"},{"name":"L1"}]],"anticipation":[0,0,0,0,0],"gameType":"freegame","tnt":[{"pos":[2,0],"kind":"stick"}]},
    {"index":17,"type":"blast","chain":0,"link":0,"tnt":{"pos":[2,0],"kind":"stick"},"area":{"col":1,"row":0,"w":2,"h":2}},
    {"index":18,"type":"carve","chain":0,"area":{"col":1,"row":0,"w":2,"h":2},"giant":"H4","cells":4},
    {"index":19,"type":"updateGlobalMult","globalMult":5,"added":4,"chain":0,"cause":"carve"},
    {"index":20,"type":"winInfo","totalWin":750,"wins":[{"symbol":"H4","kind":"ways","reels":3,"ways":6,"win":750,"mult":5,"baseWin":150,"positions":[[0,1],[1,0],[1,1],[1,4],[2,0],[2,1]]}]},
    {"index":21,"type":"updateTumbleWin","amount":750},
    {"index":22,"type":"tumbleBoard","removed":[[0,1],[1,0],[1,1],[1,4],[2,0],[2,1]],"newSymbols":[["H1"],["H4","L4","L1"],["H4","L2"],[],[]],"board":[[{"name":"H1"},{"name":"S"},{"name":"L3"},{"name":"H1"},{"name":"L2"}],[{"name":"H4"},{"name":"L4"},{"name":"L1"},{"name":"H2"},{"name":"L1"}],[{"name":"H4"},{"name":"L2"},{"name":"H2"},{"name":"L2"},{"name":"L3"}],[{"name":"L3"},{"name":"L1"},{"name":"H2"},{"name":"L1"},{"name":"L3"}],[{"name":"H3"},{"name":"L3"},{"name":"L4"},{"name":"L2"},{"name":"L1"}]],"tnt":[]},
    {"index":23,"type":"setWin","amount":750},
    {"index":24,"type":"setTotalWin","amount":950},
    {"index":25,"type":"updateFreeSpin","amount":4,"total":10},
    {"index":26,"type":"reveal","board":[[{"name":"H1"},{"name":"L1"},{"name":"H4"},{"name":"H1"},{"name":"L1"}],[{"name":"L4"},{"name":"L2"},{"name":"L3"},{"name":"H2"},{"name":"L3"}],[{"name":"H4"},{"name":"L2"},{"name":"L3"},{"name":"L4"},{"name":"H3"}],[{"name":"L3"},{"name":"L2"},{"name":"H1"},{"name":"L2"},{"name":"H3"}],[{"name":"L2"},{"name":"H3"},{"name":"L4"},{"name":"L2"},{"name":"H2"}]],"anticipation":[0,0,0,0,0],"gameType":"freegame","tnt":[]},
    {"index":27,"type":"setWin","amount":0},
    {"index":28,"type":"setTotalWin","amount":950},
    {"index":29,"type":"updateFreeSpin","amount":5,"total":10},
    {"index":30,"type":"reveal","board":[[{"name":"H3"},{"name":"H3"},{"name":"L1"},{"name":"H1"},{"name":"H1"}],[{"name":"L4"},{"name":"H1"},{"name":"H4"},{"name":"H4"},{"name":"L4"}],[{"name":"L1"},{"name":"H3"},{"name":"L1"},{"name":"H2"},{"name":"S"}],[{"name":"L4"},{"name":"H2"},{"name":"L3"},{"name":"H1"},{"name":"L4"}],[{"name":"L2"},{"name":"L1"},{"name":"L4"},{"name":"L1"},{"name":"H3"}]],"anticipation":[0,0,0,0,0],"gameType":"freegame","tnt":[]},
    {"index":31,"type":"setWin","amount":0},
    {"index":32,"type":"setTotalWin","amount":950},
    {"index":33,"type":"updateFreeSpin","amount":6,"total":10},
    {"index":34,"type":"reveal","board":[[{"name":"T"},{"name":"L3"},{"name":"L2"},{"name":"L4"},{"name":"H2"}],[{"name":"L4"},{"name":"H1"},{"name":"H3"},{"name":"H2"},{"name":"H2"}],[{"name":"H1"},{"name":"L4"},{"name":"L3"},{"name":"L1"},{"name":"L4"}],[{"name":"H2"},{"name":"L1"},{"name":"H3"},{"name":"H2"},{"name":"H4"}],[{"name":"H3"},{"name":"L3"},{"name":"L1"},{"name":"H2"},{"name":"L4"}]],"anticipation":[0,0,0,0,0],"gameType":"freegame","tnt":[{"pos":[0,0],"kind":"bundle"}]},
    {"index":35,"type":"blast","chain":0,"link":0,"tnt":{"pos":[0,0],"kind":"bundle"},"area":{"col":0,"row":0,"w":3,"h":3}},
    {"index":36,"type":"carve","chain":0,"area":{"col":0,"row":0,"w":3,"h":3},"giant":"H1","cells":9},
    {"index":37,"type":"updateGlobalMult","globalMult":14,"added":9,"chain":0,"cause":"carve"},
    {"index":38,"type":"winInfo","totalWin":18900,"wins":[{"symbol":"H1","kind":"ways","reels":3,"ways":27,"win":18900,"mult":14,"baseWin":1350,"positions":[[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]]}]},
    {"index":39,"type":"updateTumbleWin","amount":18900},
    {"index":40,"type":"tumbleBoard","removed":[[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]],"newSymbols":[["L1","L4","L2"],["H2","H3","H1"],["H3","H1","L2"],[],[]],"board":[[{"name":"L1"},{"name":"L4"},{"name":"L2"},{"name":"L4"},{"name":"H2"}],[{"name":"H2"},{"name":"H3"},{"name":"H1"},{"name":"H2"},{"name":"H2"}],[{"name":"H3"},{"name":"H1"},{"name":"L2"},{"name":"L1"},{"name":"L4"}],[{"name":"H2"},{"name":"L1"},{"name":"H3"},{"name":"H2"},{"name":"H4"}],[{"name":"H3"},{"name":"L3"},{"name":"L1"},{"name":"H2"},{"name":"L4"}]],"tnt":[]},
    {"index":41,"type":"setWin","amount":18900},
    {"index":42,"type":"setTotalWin","amount":19850},
    {"index":43,"type":"updateFreeSpin","amount":7,"total":10},
    {"index":44,"type":"reveal","board":[[{"name":"L1"},{"name":"H1"},{"name":"H3"},{"name":"H3"},{"name":"H2"}],[{"name":"L2"},{"name":"L3"},{"name":"L2"},{"name":"L3"},{"name":"L4"}],[{"name":"H1"},{"name":"L4"},{"name":"L4"},{"name":"L1"},{"name":"L1"}],[{"name":"L2"},{"name":"L2"},{"name":"L3"},{"name":"L3"},{"name":"L1"}],[{"name":"S"},{"name":"L4"},{"name":"L2"},{"name":"L4"},{"name":"H4"}]],"anticipation":[0,0,0,0,0],"gameType":"freegame","tnt":[]},
    {"index":45,"type":"setWin","amount":0},
    {"index":46,"type":"setTotalWin","amount":19850},
    {"index":47,"type":"updateFreeSpin","amount":8,"total":10},
    {"index":48,"type":"reveal","board":[[{"name":"L3"},{"name":"H3"},{"name":"L4"},{"name":"H2"},{"name":"L2"}],[{"name":"L2"},{"name":"H2"},{"name":"L4"},{"name":"L2"},{"name":"L3"}],[{"name":"H3"},{"name":"H1"},{"name":"L1"},{"name":"L4"},{"name":"L1"}],[{"name":"H1"},{"name":"L1"},{"name":"L2"},{"name":"L3"},{"name":"L2"}],[{"name":"L3"},{"name":"L3"},{"name":"L1"},{"name":"H1"},{"name":"L3"}]],"anticipation":[0,0,0,0,0],"gameType":"freegame","tnt":[]},
    {"index":49,"type":"winInfo","totalWin":70,"wins":[{"symbol":"L4","kind":"ways","reels":3,"ways":1,"win":70,"mult":14,"baseWin":5,"positions":[[0,2],[1,2],[2,3]]}]},
    {"index":50,"type":"updateTumbleWin","amount":70},
    {"index":51,"type":"tumbleBoard","removed":[[0,2],[1,2],[2,3]],"newSymbols":[["H3"],["H3"],["H4"],[],[]],"board":[[{"name":"H3"},{"name":"L3"},{"name":"H3"},{"name":"H2"},{"name":"L2"}],[{"name":"H3"},{"name":"L2"},{"name":"H2"},{"name":"L2"},{"name":"L3"}],[{"name":"H4"},{"name":"H3"},{"name":"H1"},{"name":"L1"},{"name":"L1"}],[{"name":"H1"},{"name":"L1"},{"name":"L2"},{"name":"L3"},{"name":"L2"}],[{"name":"L3"},{"name":"L3"},{"name":"L1"},{"name":"H1"},{"name":"L3"}]],"tnt":[]},
    {"index":52,"type":"winInfo","totalWin":840,"wins":[{"symbol":"H3","kind":"ways","reels":3,"ways":2,"win":840,"mult":14,"baseWin":60,"positions":[[0,0],[0,2],[1,0],[2,1]]}]},
    {"index":53,"type":"updateTumbleWin","amount":910},
    {"index":54,"type":"tumbleBoard","removed":[[0,0],[0,2],[1,0],[2,1]],"newSymbols":[["L4","L1"],["L4"],["H1"],[],[]],"board":[[{"name":"L4"},{"name":"L1"},{"name":"L3"},{"name":"H2"},{"name":"L2"}],[{"name":"L4"},{"name":"L2"},{"name":"H2"},{"name":"L2"},{"name":"L3"}],[{"name":"H1"},{"name":"H4"},{"name":"H1"},{"name":"L1"},{"name":"L1"}],[{"name":"H1"},{"name":"L1"},{"name":"L2"},{"name":"L3"},{"name":"L2"}],[{"name":"L3"},{"name":"L3"},{"name":"L1"},{"name":"H1"},{"name":"L3"}]],"tnt":[]},
    {"index":55,"type":"setWin","amount":910},
    {"index":56,"type":"setTotalWin","amount":20760},
    {"index":57,"type":"updateFreeSpin","amount":9,"total":10},
    {"index":58,"type":"reveal","board":[[{"name":"L2"},{"name":"H2"},{"name":"H1"},{"name":"T"},{"name":"L1"}],[{"name":"L2"},{"name":"T"},{"name":"H3"},{"name":"H2"},{"name":"H2"}],[{"name":"H4"},{"name":"L4"},{"name":"L3"},{"name":"L1"},{"name":"H2"}],[{"name":"H2"},{"name":"L3"},{"name":"H2"},{"name":"L1"},{"name":"H4"}],[{"name":"L4"},{"name":"L1"},{"name":"L3"},{"name":"H4"},{"name":"L3"}]],"anticipation":[0,0,0,0,0],"gameType":"freegame","tnt":[{"pos":[0,3],"kind":"stick"},{"pos":[1,1],"kind":"stick"}]},
    {"index":59,"type":"blast","chain":0,"link":0,"tnt":{"pos":[0,3],"kind":"stick"},"area":{"col":0,"row":3,"w":2,"h":2}},
    {"index":60,"type":"carve","chain":0,"area":{"col":0,"row":3,"w":2,"h":2},"giant":"L2","cells":4},
    {"index":61,"type":"updateGlobalMult","globalMult":18,"added":4,"chain":0,"cause":"carve"},
    {"index":62,"type":"blast","chain":1,"link":0,"tnt":{"pos":[1,1],"kind":"stick"},"area":{"col":1,"row":0,"w":2,"h":2}},
    {"index":63,"type":"carve","chain":1,"area":{"col":1,"row":0,"w":2,"h":2},"giant":"L2","cells":4},
    {"index":64,"type":"updateGlobalMult","globalMult":22,"added":4,"chain":1,"cause":"carve"},
    {"index":65,"type":"winInfo","totalWin":5280,"wins":[{"symbol":"L2","kind":"ways","reels":3,"ways":24,"win":5280,"mult":22,"baseWin":240,"positions":[[0,0],[0,3],[0,4],[1,0],[1,1],[1,3],[1,4],[2,0],[2,1]]}]},
    {"index":66,"type":"updateTumbleWin","amount":5280},
    {"index":67,"type":"tumbleBoard","removed":[[0,0],[0,3],[0,4],[1,0],[1,1],[1,3],[1,4],[2,0],[2,1]],"newSymbols":[["H2","L2","H1"],["L4","L1","L3","H4"],["H4","L4"],[],[]],"board":[[{"name":"H2"},{"name":"L2"},{"name":"H1"},{"name":"H2"},{"name":"H1"}],[{"name":"L4"},{"name":"L1"},{"name":"L3"},{"name":"H4"},{"name":"H3"}],[{"name":"H4"},{"name":"L4"},{"name":"L3"},{"name":"L1"},{"name":"H2"}],[{"name":"H2"},{"name":"L3"},{"name":"H2"},{"name":"L1"},{"name":"H4"}],[{"name":"L4"},{"name":"L1"},{"name":"L3"},{"name":"H4"},{"name":"L3"}]],"tnt":[]},
    {"index":68,"type":"setWin","amount":5280},
    {"index":69,"type":"setTotalWin","amount":26040},
    {"index":70,"type":"updateFreeSpin","amount":10,"total":10},
    {"index":71,"type":"reveal","board":[[{"name":"L3"},{"name":"H1"},{"name":"H1"},{"name":"L2"},{"name":"L4"}],[{"name":"L2"},{"name":"L2"},{"name":"L2"},{"name":"H1"},{"name":"L1"}],[{"name":"L3"},{"name":"L1"},{"name":"H2"},{"name":"H1"},{"name":"H4"}],[{"name":"L3"},{"name":"L3"},{"name":"H3"},{"name":"L3"},{"name":"S"}],[{"name":"H3"},{"name":"L1"},{"name":"H4"},{"name":"L2"},{"name":"L3"}]],"anticipation":[0,0,0,0,0],"gameType":"freegame","tnt":[]},
    {"index":72,"type":"winInfo","totalWin":2200,"wins":[{"symbol":"H1","kind":"ways","reels":3,"ways":2,"win":2200,"mult":22,"baseWin":100,"positions":[[0,1],[0,2],[1,3],[2,3]]}]},
    {"index":73,"type":"updateTumbleWin","amount":2200},
    {"index":74,"type":"tumbleBoard","removed":[[0,1],[0,2],[1,3],[2,3]],"newSymbols":[["L2","H1"],["H4"],["L4"],[],[]],"board":[[{"name":"L2"},{"name":"H1"},{"name":"L3"},{"name":"L2"},{"name":"L4"}],[{"name":"H4"},{"name":"L2"},{"name":"L2"},{"name":"L2"},{"name":"L1"}],[{"name":"L4"},{"name":"L3"},{"name":"L1"},{"name":"H2"},{"name":"H4"}],[{"name":"L3"},{"name":"L3"},{"name":"H3"},{"name":"L3"},{"name":"S"}],[{"name":"H3"},{"name":"L1"},{"name":"H4"},{"name":"L2"},{"name":"L3"}]],"tnt":[]},
    {"index":75,"type":"setWin","amount":2200},
    {"index":76,"type":"setTotalWin","amount":28240},
    {"index":77,"type":"freeSpinEnd","amount":28240},
    {"index":78,"type":"finalWin","amount":28240}
  ]
}
```

</details>

### 14.3 F26 — MAX WIN (FLOODLIGHT SHIFT acheté, plafond)

Fixture : `SUPER` (coût 350), tags `buy bonus super max-win wincap keg multiplier`. Au 7ᵉ tour, `keg` → géant H1 4 × 4 + 4 H1 au rouleau 5 : **1 024 ways × 500 × 44 = 22 528 000**, plafonné à **2 500 000** (×25 000).

```
7e free spin : reveal          carve -> H1 4×4          gains H1 ×5 rouleaux (plafond)
 L2  H3  L4  H2  S             L2  H3  L4  H2  S         L2  H3  L4  H2  S
 H4  L4  L1  L3  H1            H1  H1  H1  H1  H1       [H1][H1][H1][H1][H1]
 L1  T   H2  L1  H1            H1  H1  H1  H1  H1       [H1][H1][H1][H1][H1]
 L3  L2  L3  H4  H1            H1  H1  H1  H1  H1       [H1][H1][H1][H1][H1]
 H2  H4  H3  L4  H1            H1  H1  H1  H1  H1       [H1][H1][H1][H1][H1]
```

<details>
<summary>Book F26 complet (55 événements)</summary>

```json
{
  "id": "F26",
  "mode": "SUPER",
  "payoutMultiplier": 2500000,
  "costMultiplier": 350,
  "events": [
    {"index":0,"type":"reveal","board":[[{"name":"L4"},{"name":"H2"},{"name":"L1"},{"name":"H3"},{"name":"L2"}],[{"name":"H1"},{"name":"L3"},{"name":"S"},{"name":"H4"},{"name":"L3"}],[{"name":"S"},{"name":"L2"},{"name":"H4"},{"name":"L3"},{"name":"H1"}],[{"name":"H2"},{"name":"S"},{"name":"L4"},{"name":"H1"},{"name":"L3"}],[{"name":"L1"},{"name":"H3"},{"name":"L2"},{"name":"S"},{"name":"H4"}]],"anticipation":[0,0,0,0,0],"gameType":"basegame","tnt":[]},
    {"index":1,"type":"setWin","amount":0},
    {"index":2,"type":"setTotalWin","amount":0},
    {"index":3,"type":"freeSpinTrigger","bonus":"super","totalFs":12,"positions":[[1,2],[2,0],[3,1],[4,3]]},
    {"index":4,"type":"updateFreeSpin","amount":1,"total":12},
    {"index":5,"type":"reveal","board":[[{"name":"L1"},{"name":"H4"},{"name":"L2"},{"name":"L1"},{"name":"H1"}],[{"name":"L3"},{"name":"L2"},{"name":"T"},{"name":"L1"},{"name":"H3"}],[{"name":"H2"},{"name":"L3"},{"name":"L4"},{"name":"H2"},{"name":"L4"}],[{"name":"H1"},{"name":"L4"},{"name":"L3"},{"name":"L3"},{"name":"H2"}],[{"name":"L4"},{"name":"H2"},{"name":"L4"},{"name":"L1"},{"name":"L1"}]],"anticipation":[0,0,0,0,0],"gameType":"freegame","tnt":[{"pos":[1,2],"kind":"bundle"}]},
    {"index":6,"type":"blast","chain":0,"link":0,"tnt":{"pos":[1,2],"kind":"bundle"},"area":{"col":0,"row":2,"w":3,"h":3}},
    {"index":7,"type":"carve","chain":0,"area":{"col":0,"row":2,"w":3,"h":3},"giant":"L2","cells":9},
    {"index":8,"type":"updateGlobalMult","globalMult":10,"added":9,"chain":0,"cause":"carve"},
    {"index":9,"type":"winInfo","totalWin":3600,"wins":[{"symbol":"L2","kind":"ways","reels":3,"ways":36,"win":3600,"mult":10,"baseWin":360,"positions":[[0,2],[0,3],[0,4],[1,1],[1,2],[1,3],[1,4],[2,2],[2,3],[2,4]]}]},
    {"index":10,"type":"updateTumbleWin","amount":3600},
    {"index":11,"type":"tumbleBoard","removed":[[0,2],[0,3],[0,4],[1,1],[1,2],[1,3],[1,4],[2,2],[2,3],[2,4]],"newSymbols":[["L2","H4","L4"],["L4","L3","L4","L4"],["L2","H3","H2"],[],[]],"board":[[{"name":"L2"},{"name":"H4"},{"name":"L4"},{"name":"L1"},{"name":"H4"}],[{"name":"L4"},{"name":"L3"},{"name":"L4"},{"name":"L4"},{"name":"L3"}],[{"name":"L2"},{"name":"H3"},{"name":"H2"},{"name":"H2"},{"name":"L3"}],[{"name":"H1"},{"name":"L4"},{"name":"L3"},{"name":"L3"},{"name":"H2"}],[{"name":"L4"},{"name":"H2"},{"name":"L4"},{"name":"L1"},{"name":"L1"}]],"tnt":[]},
    {"index":12,"type":"setWin","amount":3600},
    {"index":13,"type":"setTotalWin","amount":3600},
    {"index":14,"type":"updateFreeSpin","amount":2,"total":12},
    {"index":15,"type":"reveal","board":[[{"name":"H1"},{"name":"L4"},{"name":"L2"},{"name":"L2"},{"name":"L3"}],[{"name":"S"},{"name":"L3"},{"name":"L3"},{"name":"L1"},{"name":"H3"}],[{"name":"L2"},{"name":"H2"},{"name":"L4"},{"name":"L2"},{"name":"H3"}],[{"name":"L3"},{"name":"L3"},{"name":"L3"},{"name":"L1"},{"name":"L1"}],[{"name":"L4"},{"name":"L3"},{"name":"H2"},{"name":"L3"},{"name":"L2"}]],"anticipation":[0,0,0,0,0],"gameType":"freegame","tnt":[]},
    {"index":16,"type":"setWin","amount":0},
    {"index":17,"type":"setTotalWin","amount":3600},
    {"index":18,"type":"updateFreeSpin","amount":3,"total":12},
    {"index":19,"type":"reveal","board":[[{"name":"H4"},{"name":"L3"},{"name":"L3"},{"name":"L1"},{"name":"L1"}],[{"name":"L2"},{"name":"H4"},{"name":"H3"},{"name":"H1"},{"name":"H1"}],[{"name":"L3"},{"name":"L3"},{"name":"L3"},{"name":"L4"},{"name":"H3"}],[{"name":"H1"},{"name":"T"},{"name":"L2"},{"name":"L4"},{"name":"L3"}],[{"name":"L3"},{"name":"L4"},{"name":"L4"},{"name":"L3"},{"name":"H2"}]],"anticipation":[0,0,0,0,0],"gameType":"freegame","tnt":[{"pos":[3,1],"kind":"bundle"}]},
    {"index":20,"type":"blast","chain":0,"link":0,"tnt":{"pos":[3,1],"kind":"bundle"},"area":{"col":2,"row":1,"w":3,"h":3}},
    {"index":21,"type":"carve","chain":0,"area":{"col":2,"row":1,"w":3,"h":3},"giant":"H3","cells":9},
    {"index":22,"type":"updateGlobalMult","globalMult":19,"added":9,"chain":0,"cause":"carve"},
    {"index":23,"type":"setWin","amount":0},
    {"index":24,"type":"setTotalWin","amount":3600},
    {"index":25,"type":"updateFreeSpin","amount":4,"total":12},
    {"index":26,"type":"reveal","board":[[{"name":"L3"},{"name":"L3"},{"name":"H1"},{"name":"L4"},{"name":"L2"}],[{"name":"H1"},{"name":"L3"},{"name":"L4"},{"name":"H3"},{"name":"H2"}],[{"name":"H2"},{"name":"L2"},{"name":"H3"},{"name":"L3"},{"name":"L2"}],[{"name":"L2"},{"name":"S"},{"name":"L4"},{"name":"L2"},{"name":"H4"}],[{"name":"L3"},{"name":"H3"},{"name":"L3"},{"name":"L4"},{"name":"H1"}]],"anticipation":[0,0,0,0,0],"gameType":"freegame","tnt":[]},
    {"index":27,"type":"winInfo","totalWin":190,"wins":[{"symbol":"L3","kind":"ways","reels":3,"ways":2,"win":190,"mult":19,"baseWin":10,"positions":[[0,0],[0,1],[1,1],[2,3]]}]},
    {"index":28,"type":"updateTumbleWin","amount":190},
    {"index":29,"type":"tumbleBoard","removed":[[0,0],[0,1],[1,1],[2,3]],"newSymbols":[["L2","L2"],["H3"],["L2"],[],[]],"board":[[{"name":"L2"},{"name":"L2"},{"name":"H1"},{"name":"L4"},{"name":"L2"}],[{"name":"H3"},{"name":"H1"},{"name":"L4"},{"name":"H3"},{"name":"H2"}],[{"name":"L2"},{"name":"H2"},{"name":"L2"},{"name":"H3"},{"name":"L2"}],[{"name":"L2"},{"name":"S"},{"name":"L4"},{"name":"L2"},{"name":"H4"}],[{"name":"L3"},{"name":"H3"},{"name":"L3"},{"name":"L4"},{"name":"H1"}]],"tnt":[]},
    {"index":30,"type":"setWin","amount":190},
    {"index":31,"type":"setTotalWin","amount":3790},
    {"index":32,"type":"updateFreeSpin","amount":5,"total":12},
    {"index":33,"type":"reveal","board":[[{"name":"L3"},{"name":"L4"},{"name":"L4"},{"name":"H4"},{"name":"H2"}],[{"name":"L1"},{"name":"H2"},{"name":"H2"},{"name":"H3"},{"name":"L1"}],[{"name":"T"},{"name":"H1"},{"name":"L1"},{"name":"H2"},{"name":"H1"}],[{"name":"L2"},{"name":"H2"},{"name":"L4"},{"name":"L2"},{"name":"L1"}],[{"name":"L2"},{"name":"L3"},{"name":"L4"},{"name":"L4"},{"name":"L1"}]],"anticipation":[0,0,0,0,0],"gameType":"freegame","tnt":[{"pos":[2,0],"kind":"bundle"}]},
    {"index":34,"type":"blast","chain":0,"link":0,"tnt":{"pos":[2,0],"kind":"bundle"},"area":{"col":1,"row":0,"w":3,"h":3}},
    {"index":35,"type":"carve","chain":0,"area":{"col":1,"row":0,"w":3,"h":3},"giant":"H4","cells":9},
    {"index":36,"type":"updateGlobalMult","globalMult":28,"added":9,"chain":0,"cause":"carve"},
    {"index":37,"type":"winInfo","totalWin":45360,"wins":[{"symbol":"H4","kind":"ways","reels":4,"ways":27,"win":45360,"mult":28,"baseWin":1620,"positions":[[0,3],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2],[3,0],[3,1],[3,2]]}]},
    {"index":38,"type":"updateTumbleWin","amount":45360},
    {"index":39,"type":"tumbleBoard","removed":[[0,3],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2],[3,0],[3,1],[3,2]],"newSymbols":[["H1"],["L4","L2","L4"],["L1","L3","H2"],["L1","H3","L2"],[]],"board":[[{"name":"H1"},{"name":"L3"},{"name":"L4"},{"name":"L4"},{"name":"H2"}],[{"name":"L4"},{"name":"L2"},{"name":"L4"},{"name":"H3"},{"name":"L1"}],[{"name":"L1"},{"name":"L3"},{"name":"H2"},{"name":"H2"},{"name":"H1"}],[{"name":"L1"},{"name":"H3"},{"name":"L2"},{"name":"L2"},{"name":"L1"}],[{"name":"L2"},{"name":"L3"},{"name":"L4"},{"name":"L4"},{"name":"L1"}]],"tnt":[]},
    {"index":40,"type":"setWin","amount":45360},
    {"index":41,"type":"setTotalWin","amount":49150},
    {"index":42,"type":"updateFreeSpin","amount":6,"total":12},
    {"index":43,"type":"reveal","board":[[{"name":"S"},{"name":"L3"},{"name":"H4"},{"name":"H1"},{"name":"L1"}],[{"name":"H3"},{"name":"H4"},{"name":"L2"},{"name":"L2"},{"name":"L2"}],[{"name":"L3"},{"name":"L4"},{"name":"H2"},{"name":"L2"},{"name":"H3"}],[{"name":"H4"},{"name":"H2"},{"name":"L4"},{"name":"L3"},{"name":"H3"}],[{"name":"H3"},{"name":"L1"},{"name":"H3"},{"name":"L1"},{"name":"H1"}]],"anticipation":[0,0,0,0,0],"gameType":"freegame","tnt":[]},
    {"index":44,"type":"setWin","amount":0},
    {"index":45,"type":"setTotalWin","amount":49150},
    {"index":46,"type":"updateFreeSpin","amount":7,"total":12},
    {"index":47,"type":"reveal","board":[[{"name":"L2"},{"name":"H4"},{"name":"L1"},{"name":"L3"},{"name":"H2"}],[{"name":"H3"},{"name":"L4"},{"name":"T"},{"name":"L2"},{"name":"H4"}],[{"name":"L4"},{"name":"L1"},{"name":"H2"},{"name":"L3"},{"name":"H3"}],[{"name":"H2"},{"name":"L3"},{"name":"L1"},{"name":"H4"},{"name":"L4"}],[{"name":"S"},{"name":"H1"},{"name":"H1"},{"name":"H1"},{"name":"H1"}]],"anticipation":[0,0,0,0,0],"gameType":"freegame","tnt":[{"pos":[1,2],"kind":"keg"}]},
    {"index":48,"type":"blast","chain":0,"link":0,"tnt":{"pos":[1,2],"kind":"keg"},"area":{"col":0,"row":1,"w":4,"h":4}},
    {"index":49,"type":"carve","chain":0,"area":{"col":0,"row":1,"w":4,"h":4},"giant":"H1","cells":16},
    {"index":50,"type":"updateGlobalMult","globalMult":44,"added":16,"chain":0,"cause":"carve"},
    {"index":51,"type":"winInfo","totalWin":22528000,"wins":[{"symbol":"H1","kind":"ways","reels":5,"ways":1024,"win":22528000,"mult":44,"baseWin":512000,"positions":[[0,1],[0,2],[0,3],[0,4],[1,1],[1,2],[1,3],[1,4],[2,1],[2,2],[2,3],[2,4],[3,1],[3,2],[3,3],[3,4],[4,1],[4,2],[4,3],[4,4]]}]},
    {"index":52,"type":"updateTumbleWin","amount":22528000},
    {"index":53,"type":"wincap","amount":2500000},
    {"index":54,"type":"finalWin","amount":2500000}
  ]
}
```

</details>

## 15. Ce que l'équipe maths doit livrer

1. **Les books de production** de chaque mode (`BASE`, `ANTE`, `BONUS`, `SUPER`, `BLAST`, `MEGA`) au format v1.1, qui passent **`parseBook` et `validateBook` sans aucune remarque**.
2. **`game-math-config.json` validé** : `provisional: false`, `contractVersion: "1.1.0"`, table de paiement **par way**, RTP et **coût** de chaque mode, facteur Ante (`bonusChanceFactor`), tours (10 / 12), seuils de célébration, `maxWinX`, tailles des charges avec la clé **`keg`** (pas `crate`).
3. **La table complète des relances** (2 → +2, 3 → +5, 4+ → +8 en super) dans `freeSpins.<bonus>.retriggers` (§ 8 ; le front doit d'abord étendre `MathConfigSchema`), et respectée dans `freeSpinRetrigger.extra`.
4. **La valeur de départ du Cornerstone** en super bonus : ×1, ou un `updateGlobalMult` `cause: "start"` juste après `freeSpinTrigger`.
5. **Des montants rapportés à la mise de base** (jamais au prix payé), entiers, en centièmes.
6. **Le respect des contraintes de présentation** : au plus un Scatter et une charge par rouleau ; aucun Scatter dans une zone, sous un géant ou dans `newSymbols` ; toute charge prise dans une zone enchaînée ; une seule chaîne par étape en super bonus (`wired`) ; zones dans la grille ; toutes les charges explosent avant l'évaluation ; toute connexion visible déclarée ; anticipation seulement après 2 Scatters.
7. **Le plafond** : `wincap` au montant exact dès que le cumul franchit ×25 000, puis `finalWin` seul.
8. **Des réponses aux points ouverts** : bâtons interdits en super bonus ? TNT SPIN = au moins 2 charges **enchaînées** ou simplement présentes (F18 en montre deux indépendantes) ? Forme exacte de la charge 4 × 4 (baril ou bûche-charge, simple question d'asset côté front).
