# CONCEPT - CYBER CAT

## Identité

**CYBER CAT.** Sur le toit-labo vitré d'une tour, au-dessus d'une ville néon sous une pluie fine, un chat-robot blanc et bleu surveille la grille. Les chats chassent le point laser ; celui-ci en est la source : ses yeux tirent un point cyan qui saute de case en case et **surcadence** tout ce qu'il touche.

Une phrase : *le chat tire un point laser de ses yeux ; chaque case touchée monte d'un cran, la dernière reçoit un multiplicateur.*

Le nom de travail est gardé (D20) : il est le nom du personnage, le « C » du front et de la poitrine est déjà le Wild, et il se lit dans toutes les langues.

## Grille, paiement

- 5 colonnes × 4 lignes, **1024 ways**, de gauche à droite, 3 colonnes minimum, sans cascade.
- Wild (emblème « C ») sur les colonnes 2 à 5, remplace tout sauf le Scatter.
- Scatter (portail en œil de chat) partout ; 3 → **9 VIES**, 4 ou plus → **DOUBLE REGARD**.
- Coordonnées : `[colonne, ligne]` depuis le coin haut-gauche, à partir de 0.

## Symboles et échelle de surcadençage

| id | objet | famille | monte vers |
|---|---|---|---|
| L1 | glyphe holo triangle | low | L2 |
| L2 | glyphe holo anneau | low | L3 |
| L3 | glyphe holo losange | low | L4 |
| L4 | glyphe holo hexagone | low | H1 |
| H1 | canette de nano-pâtée | premium | H2 |
| H2 | pelote de fibre optique | premium | H3 |
| H3 | poisson-robot chromé | premium | H4 |
| H4 | souris-drone | premium (haut) | ne monte plus |
| W | emblème « C » (WILD) | spécial | jamais touché |
| S | portail œil de chat (SCATTER) | spécial | jamais touché |

Les lows se distinguent par la **forme** (triangle, anneau, losange, hexagone), jamais par la seule couleur.

## Mécanique : POINT LASER

1. **Tir** : quand le book l'annonce (`laserDot`), les yeux du chat s'allument (éclat sur l'os `headfront`), un trait part vers la grille.
2. **Sauts** : le point saute de case en case, 3 à 8 fois, sur le chemin du book. Le chat le suit du regard (rotation additive de la tête).
3. **Montée** : chaque case visitée monte d'un cran (ancien symbole → impulsion → nouveau symbole). H4 ne monte plus (étincelle « plein »). Le point ne touche jamais W ni S, ne crée jamais de Wild.
4. **Multiplicateur** : la case d'arrivée reçoit un jeton ×2 à ×10 (valeur du book), qui s'applique aux ways qui la traversent.
5. **Lecture sans texte** : yeux → trajet → cases qui changent → valeur inscrite sur le jeton.

## Bonus

### 9 VIES (3 Scatters)

- 9 free spins ; les 9 vies **sont** le compteur (« Spins restants : N », aucun second compteur).
- Un point laser par spin.
- **Puces** : chaque case visitée garde une puce jusqu'à la fin du bonus, niveau +1 à +3 (chaque nouveau passage ajoute +1). Tout symbole qui atterrit sur une puce arrive monté du niveau de la puce (`chipUpgrade`). W et S ignorent la puce. Le niveau se lit à la **forme** (1, 2 ou 3 chevrons) et au **chiffre**, pas à la couleur.
- La grille s'allume comme un circuit (traces entre puces) ; tout s'éteint proprement à la fin, puce par puce.
- Retrigger : « +N FS » (valeur du book) au centre, puis vers le compteur.

### DOUBLE REGARD (4+ Scatters)

- Deux points par spin, un par œil (gauche puis droite), et des puces posées dès le départ (`overclock`).
- Quand deux multiplicateurs se croisent, le book donne le multiplicateur appliqué à chaque way (`winInfo.wins[].meta.mult`).

## Features (achat)

| mode | nom | contenu | annonce |
|---|---|---|---|
| SCAN | SCAN | 1 spin, 1 point garanti | « 1 spin » |
| DOUBLE_SCAN | DOUBLE SCAN | 1 spin, 2 points | « 1 spin » |
| BONUS | 9 VIES | déclenche 9 VIES | 9 spins |
| SUPER | DOUBLE REGARD | déclenche DOUBLE REGARD | 9 spins |

Ante (mode ANTE) : pas un achat ; plus de Scatters ; coût du prochain spin = mise × facteur lu dans la config.

## Boucle d'un tour (ordre exact des événements)

Base / Ante :
`reveal → [laserDot] → [winInfo] → setWin → [freeSpinTrigger → bonus] → finalWin`

SCAN / DOUBLE SCAN : `featureStart → reveal → laserDot ×1|×2 → [winInfo] → setWin → finalWin`

Un spin de bonus :
`updateFreeSpin → reveal → [chipUpgrade] → laserDot ×1|×2 → [winInfo] → setWin → setTotalWin → [freeSpinRetrigger]`

Fin de bonus : `freeSpinEnd → finalWin`. Plafond : `wincap` arrête la suite, puis `freeSpinEnd`/`finalWin`.

Début de DOUBLE REGARD : `freeSpinTrigger → overclock → updateFreeSpin …`

## Persistance et réinitialisation

| élément | vit | remis à zéro |
|---|---|---|
| symboles montés, jetons multiplicateurs | le spin | au départ du spin suivant (les rouleaux emportent tout) |
| puces (niveau 1-3) | le bonus | à la fin du bonus, extinction puce par puce, après le GAIN TOTAL |
| « Spins restants », total du bonus, ambiance « mode scan » | le bonus | à la sortie (GAIN TOTAL fermé) |
| gain du spin (HUD) | jusqu'au spin suivant | au départ du spin suivant |
| Ante actif | jusqu'à ce que le joueur le coupe | jamais pendant un spin |

## Paliers de gain (gain du spin / mise de base)

| palier | seuil | idée de mise en scène |
|---|---|---|
| — | < ×10 | pas de cinématique : réaction des symboles, hop du chat |
| BIG WIN | ≥ ×10 (inclus) | la ville s'allume district par district |
| SUPER WIN | ≥ ×25 | pluie de jetons holographiques |
| MEGA WIN | ≥ ×50 | essaim de drones qui dessine le « C » |
| EPIC WIN | ≥ ×100 | le train aérien passe, les enseignes affichent le chat |
| CYBER WIN | ≥ ×500 | surcharge : la ville entière passe au cyan, grille laser dans le ciel |
| MAX WIN | événement `wincap` (25 000× en présentation) | les yeux du chat emplissent le ciel ; la manche s'arrête |

Le palier dépend du gain **du spin** rapporté à la **mise de base**, jamais du cumul du bonus ni du prix d'achat.

## Attentes envers les maths

- Books conformes à `CONTRAT-EVENTS.md` (v1), avec l'état **après** chaque montée : aucun calcul côté front.
- `winInfo.wins[]` groupé par (symbole, multiplicateur) : `baseWin`, `mult`, `win`, `ways`, `positions`.
- Config : paytable, prix des modes, facteur Ante, seuils, RTP par mode, gain max, nombre de spins et retriggers (pour les règles).
- Garanties : un point ne visite jamais W/S ; 3-8 cases distinctes ; multiplicateur 2-10 sur la dernière case ; niveau de puce 1-3.
