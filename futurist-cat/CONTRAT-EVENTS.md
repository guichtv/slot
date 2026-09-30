# CONTRAT-EVENTS - CYBER CAT (v1)

Pour l'équipe maths. Le front **ne calcule jamais** : il lit un book Stake Engine et le met en scène.
Schéma exécutable : `src/contract/events.ts` (zod). Contrôles : `src/contract/validate.ts`, lancés par `npm run fixtures:check`.

## Conventions

| sujet | règle |
|---|---|
| coordonnées | `[colonne, ligne]`, coin haut-gauche, à partir de 0 ; 5 colonnes × 4 lignes |
| grille | `board[colonne][ligne]` (4 symboles par colonne, sans padding ; padding facultatif à part) |
| montants des books | entiers en **centièmes de la mise de base** (100 = ×1), y compris pour les modes achetés |
| API RGS | entiers en 10^6 (1 000 000 = 1 unité) ; une seule couche de conversion côté front (`src/contract/money.ts`) |
| symboles | `L1 L2 L3 L4` (glyphes), `H1` canette, `H2` pelote, `H3` poisson, `H4` souris-drone, `W` Wild, `S` Scatter |
| échelle de surcadençage | `L1 → L2 → L3 → L4 → H1 → H2 → H3 → H4` ; H4 ne monte plus ; W et S ne sont jamais touchés |
| index | chaque événement porte `index`, consécutif à partir de 0 |

## Book

```json
{ "id": 7, "mode": "BASE", "payoutMultiplier": 160, "costMultiplier": 1, "events": [ ... ] }
```

`mode` ∈ `BASE`, `ANTE`, `SCAN`, `DOUBLE_SCAN`, `BONUS`, `SUPER`. `payoutMultiplier` = `finalWin.amount`.

## Événements

| type | champs | quand |
|---|---|---|
| `featureStart` | `feature: "scan"\|"doubleScan"`, `dots: 1\|2` | premier événement des modes SCAN / DOUBLE_SCAN |
| `reveal` | `board`, `gameType: "basegame"\|"freegame"`, `anticipation?: number[5]`, `padding?: {top[5], bottom[5]}` | arrêt des rouleaux ; `anticipation[c] > 0` = la colonne c ralentit (ordre croissant) ; jamais de W dans le padding |
| `chipUpgrade` | `upgrades: [{pos, from, to, level}]` | bonus, juste après `reveal` : chaque symbole (hors W/S/H4) posé sur une puce arrive monté de `level` crans |
| `laserDot` | `eye: "left"\|"right"`, `path: [[c,r]…]` (3-8 cases distinctes), `upgrades: [{pos, from, to}]` (une entrée par case du chemin, même ordre), `mult?: {pos, value 2-10}` (case d'arrivée), `chips?: [{pos, level}]` (bonus : niveau **après** ce passage) | un par point ; DOUBLE REGARD / DOUBLE SCAN : gauche puis droite |
| `overclock` | `chips: [{pos, level}]` | puces posées sans point (début de DOUBLE REGARD) |
| `winInfo` | `totalWin`, `wins: [{symbol, kind, ways, win, positions, meta: {baseWin, mult, multPositions?}}]` | un groupe par (symbole, multiplicateur appliqué) ; `win = baseWin × mult` |
| `setWin` | `amount`, `winLevel?` | gain du spin (0 si rien) ; toujours présent, une fois par spin |
| `setTotalWin` | `amount` | bonus : cumul de la manche après chaque spin |
| `freeSpinTrigger` | `totalFs`, `positions` (Scatters), `bonus: "nineLives"\|"doubleGaze"` | après le spin déclencheur |
| `updateFreeSpin` | `amount` (1 = premier spin), `total` | avant chaque `reveal` de bonus ; le front affiche « Spins restants : total − amount » |
| `freeSpinRetrigger` | `totalFs` (nouveau total), `added`, `positions` | après le spin qui redéclenche |
| `freeSpinEnd` | `amount` (gain des free spins) | fin du bonus |
| `wincap` | `amount` (= gain max × 100) | plafond atteint : plus aucun spin après |
| `updateGlobalMult` | `globalMult` | réservé (non utilisé par ce jeu) |
| `finalWin` | `amount` | dernier événement, égal à `payoutMultiplier` |

## Ordre

```
BASE / ANTE      reveal → [laserDot…] → [winInfo] → setWin → [freeSpinTrigger → (overclock) → spins de bonus → freeSpinEnd] → finalWin
SCAN / DOUBLE    featureStart → reveal → laserDot ×1|×2 → [winInfo] → setWin → finalWin
spin de bonus    updateFreeSpin → reveal → [chipUpgrade] → laserDot ×1|×2 → [winInfo] → setWin → setTotalWin → [freeSpinRetrigger]
plafond          … setWin → [setTotalWin] → wincap → [freeSpinEnd] → finalWin
```

## Ce que le front ne déduit jamais

- l'état après une montée (`upgrades[].to`, `chipUpgrade.upgrades[].to`) ;
- le niveau des puces (`chips[].level`) ;
- le multiplicateur appliqué à un groupe de ways, y compris quand deux multiplicateurs se croisent (`meta.mult`, `meta.multPositions`) ;
- le nombre de spins (`totalFs`, `added`) et le gain total (`freeSpinEnd.amount`, `finalWin.amount`).

Seule classification faite par le front : le **palier de célébration** = `setWin.amount / 100` comparé aux seuils de la config (×10, ×25, ×50, ×100, ×500), seuil inclus. MAX WIN = uniquement l'événement `wincap`.

## Contrôles du kit (`npm run fixtures:check`)

Forme (zod) ; index ; point jamais sur W/S ; cases distinctes ; `from` = symbole courant ; un cran exactement ; multiplicateur sur la case d'arrivée ; puces +1 par passage, max 3 ; `chipUpgrade` complet ; `win = baseWin × mult` ; colonnes contiguës ; `totalWin` = somme ; **aucune way gagnante non déclarée** ; `setWin`/`setTotalWin`/`freeSpinEnd`/`finalWin` cohérents ; compteurs de free spins ; rien après `wincap`. Un book invalide est signalé, jamais réparé.

## Exemples (fixtures locales)

### Point laser en jeu de base (F07)

```json
{"type":"reveal","board":[["L3","H1","L2","L4"],["L1","L3","H1","L4"],["H2","L2","L3","H4"],["L4","S","H2","L2"],["L2","L3","L1","H3"]],"gameType":"basegame","index":0}
{"type":"laserDot","eye":"left","path":[[0,0],[1,1],[2,2]],"upgrades":[{"pos":[0,0],"from":"L3","to":"L4"},{"pos":[1,1],"from":"L3","to":"L4"},{"pos":[2,2],"from":"L3","to":"L4"}],"mult":{"pos":[2,2],"value":2},"index":1}
{"type":"winInfo","totalWin":160,"wins":[{"symbol":"L4","kind":4,"ways":4,"win":160,"positions":[[0,0],[0,3],[1,1],[1,3],[2,2],[3,0]],"meta":{"baseWin":80,"mult":2,"multPositions":[[2,2]]}}],"index":2}
{"type":"setWin","amount":160,"index":3}
{"type":"finalWin","amount":160,"index":4}
```

### Spin de 9 VIES avec puces (F09)

```json
{"type":"updateFreeSpin","amount":2,"total":9,"index":9}
{"type":"reveal","board":[["L3","L3","L1","L2"],["L1","L1","L2","L3"],["L2","L1","L4","L3"],["L3","L4","L1","H1"],["L2","L2","H1","L1"]],"gameType":"freegame","index":10}
{"type":"chipUpgrade","upgrades":[{"pos":[2,0],"from":"L2","to":"L3","level":1},{"pos":[0,2],"from":"L1","to":"L2","level":1},{"pos":[1,0],"from":"L1","to":"L2","level":1},{"pos":[4,1],"from":"L2","to":"L3","level":1},{"pos":[3,0],"from":"L3","to":"L4","level":1},{"pos":[3,1],"from":"L4","to":"H1","level":1}],"index":11}
{"type":"laserDot","eye":"left","path":[[0,2],[4,3],[1,0],[4,1],[3,1]],"upgrades":[{"pos":[0,2],"from":"L2","to":"L3"},{"pos":[4,3],"from":"L1","to":"L2"},{"pos":[1,0],"from":"L2","to":"L3"},{"pos":[4,1],"from":"L3","to":"L4"},{"pos":[3,1],"from":"H1","to":"H2"}],"mult":{"pos":[3,1],"value":2},"chips":[{"pos":[0,2],"level":2},{"pos":[4,3],"level":1},{"pos":[1,0],"level":2},{"pos":[4,1],"level":2},{"pos":[3,1],"level":2}],"index":12}
{"type":"winInfo","totalWin":120,"wins":[{"symbol":"L3","kind":3,"ways":12,"win":120,"positions":[[0,0],[0,1],[0,2],[1,0],[1,3],[2,0],[2,3]],"meta":{"baseWin":120,"mult":1}}],"index":13}
{"type":"setWin","amount":120,"index":14}
{"type":"setTotalWin","amount":130,"index":15}
```

### Multiplicateurs croisés (F13, DOUBLE SCAN)

```json
{"type":"winInfo","totalWin":3080,"wins":[
  {"symbol":"H3","kind":5,"ways":1,"win":3000,"positions":[[0,0],[1,1],[2,0],[3,1],[4,0]],"meta":{"baseWin":200,"mult":15,"multPositions":[[1,1],[3,1]]}},
  {"symbol":"L4","kind":4,"ways":4,"win":80,"positions":[[0,2],[0,3],[1,2],[2,2],[2,3],[3,0]],"meta":{"baseWin":80,"mult":1}}]}
```

Le front affiche « 2,00 € → ×15 → 30,00 € » pour le premier groupe (mise 1 €).

## Config (`game-math-config.json`)

Paytable (× mise par way, pour 3/4/5 colonnes), prix des modes (`cost`), facteur Ante (`ANTE.cost`, `ANTE.scatterChanceX`), RTP par mode, gain max, spins et retriggers, seuils des paliers. `"provisional": true` tant que les maths ne l'ont pas remplacée : **le build Stake refuse de se construire** dans cet état.
