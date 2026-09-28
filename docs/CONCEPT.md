# BOOMTOOTH — Concept

> **Allume, fais sauter, sculpte.** Chaque charge que Buck fait exploser se reforme en UN symbole géant, et chaque éclat de granit nourrit le multiplicateur de son monument.

Studio Crownforge · slot 2D BD adulte · front-end « lecteur d'événements » (les maths sont produites par une autre équipe, voir `CONTRAT-EVENTS.md`).

Processus de décision : un panel de quatre concepteurs indépendants plus un juge a noté cinq concepts (dont celui-ci) sur la cohérence, la lisibilité, le potentiel d'animation, l'originalité, le mobile, la faisabilité et la profondeur. BOOMTOOTH l'emporte avec 67 points. Les greffes retenues et écartées sont listées dans `DECISIONS.md`.

## 1. Identité

| | |
|---|---|
| **Nom** | BOOMTOOTH |
| **Promesse** | Les explosions sculptent des symboles géants ; en bonus, chaque éclat grave le multiplicateur dans la pierre. |
| **Univers** | Vallée de pins et de granit du Grand Nord à l'heure dorée. Un barrage en rondins, une chute d'eau, et une montagne que Buck sculpte à sa propre effigie, « Mount Buckmore ». Son équipe fait le vrai travail. |
| **Ton** | Malicieux, vaniteux, slapstick. Visages noircis de suie, jamais de blessure. Ni western, ni wagonnet, ni saloon, ni tête de mort, ni baril de poudre. |
| **Mascotte** | **Buck Boomtooth**, castor chef de chantier trapu : casque orange à lampe frontale, dent de devant en or, flanelle à carreaux rouge et noir, bretelles, ceinture à outils, allumette au coin de la bouche, queue plate écailleuse. |
| **Palette de départ** | orange brûlé #E8742A · or #F2B233 · rouge TNT #D7332B · vert pin #2F5D46 · granit #6F7F92 · bois #C98A45 · crème #F4E6C8 · encre #1B1410 ; nuit du bonus #14233A / aurore #3FD6B8 |
| **Direction artistique** | D1 « Carrière à l'heure dorée », avec D3 « Dynamitage de nuit » pour les bonus (`ART-DIRECTION.md`) |

## 2. Grille et paiement

- **Grille** : **5 colonnes** × **5 lignes** (carrée : desktop comme portrait mobile).
- **Paiement** : **ways**, 3 125 combinaisons, de gauche à droite depuis le rouleau 1, sur 3 rouleaux adjacents ou plus. Un groupe gagnant compte toutes les cases du symbole (ou WILD) sur ces rouleaux.
- **Chutes (crumble)** : les cases gagnantes s'effondrent en gravats, les survivants tombent et de nouveaux symboles arrivent par le haut. La séquence continue tant qu'il y a un gain ou une charge.
- Aucune ligne n'est tracée ; les gagnants réagissent eux-mêmes. En ways, il n'y a jamais une ligne unique trompeuse.

## 3. Symboles

| Id | Symbole | Réaction de connexion (pièce animée séparée) |
|---|---|---|
| L1 | Casque de chantier jaune | pulsation sobre |
| L2 | Pioche à manche bleu | pulsation sobre |
| L3 | Lanterne tempête verte | pulsation sobre |
| L4 | Gourde violette | pulsation sobre |
| H1 | **Raton artificier** (top) | brandit un bâton allumé à côté de sa joue (accessoire séparé) et ricane |
| H2 | **Élan costaud** | secoue la tête, ses deux bois battent chacun à leur rythme (pièces séparées) |
| H3 | **Loutre géomètre** | déroule son plan de chantier devant elle (accessoire séparé) |
| H4 | **Pic-vert foreur** | rafale de coups de bec, huppe rouge dressée (pièce séparée) |
| W | **WILD** : caisse dorée pleine de dynamite | le couvercle saute puis retombe de travers (pièce séparée) ; remplace tous les symboles payants |
| S | **SCATTER** : détonateur à piston | la poignée est arrachée puis claquée (pièce séparée) ; au plus un par rouleau ; jamais détruit par une explosion |
| T | **Charges** (spéciales, ne paient pas) | trois tailles d'objets sans texte : **bâton** (zone 2×2), **fagot** (zone 3×3), **bûche-charge** cerclée de fer (zone 4×4) |

## 4. Mécanique signature — BLAST & CARVE

Une charge qui explose dégage sa zone, puis les gravats sont **sculptés en un seul symbole géant** qui remplit toute la zone.

1. **Zone** : chaque charge a une zone carrée de sa taille (2, 3 ou 4 cases de côté), entièrement dans la grille, qui contient la charge. Sa position est choisie par les maths, et une zone ne contient jamais de Scatter.
2. **Moment** : au début de chaque étape (juste après la révélation, ou après une chute), toutes les charges posées explosent **avant** l'évaluation des gains.
3. **Chaîne** : si la zone d'une charge contient une autre charge, la mèche de celle-ci prend et elle explose juste après, dans la même chaîne. En **super bonus**, toutes les charges de la grille sont **reliées par le fil de mise à feu** et forment une seule chaîne, même éloignées.
4. **Sculpture** : à la fin d'une chaîne, les gravats deviennent **un géant** qui remplit le rectangle englobant de toutes les zones de la chaîne (jusqu'au 5×5). C'est un des 9 symboles payants, WILD compris, tiré par les maths.
5. **Paiement** : un géant compte comme son symbole sur chaque case qu'il couvre. Un géant de 3×3 sur les rouleaux 1-3 fait déjà 27 ways.
6. **Après l'évaluation** : les cases gagnantes s'effondrent. Les cases d'un géant qui ne gagnent pas se fissurent et redeviennent des symboles simples, du même type, pour la suite de la séquence. Rien ne persiste d'un spin à l'autre.
7. Une charge qui tombe pendant une chute explose au début de l'étape suivante.

**Lecture sans texte** : le géomètre plante ses piquets et tend un cordeau autour de la zone avant l'explosion. Buck frotte son allumette sur sa dent en or, et l'étincelle vole jusqu'à la mèche. Pendant une chaîne, la mèche suivante crépite. Après la poussière, le géant apparaît, sculpté dans la pierre.

## 5. Mécanique secondaire (bonus uniquement) — THE CORNERSTONE

- Buck se tient sur un **bloc de granit gravé** qui porte le multiplicateur du bonus (de ×1 à ×9 999, sur 4 chiffres).
- **Chaque case sculptée ajoute +1** : les éclats volent physiquement de la zone sculptée jusqu'au bloc, puis Buck frappe le bloc de la queue et les chiffres sont regravés, de l'ancienne valeur à la nouvelle.
- Le multiplicateur s'applique à tous les gains du bonus au moment de leur paiement. Il ne redescend jamais pendant le bonus et disparaît proprement à la fin.
- La matière change avec la valeur : granit, marbre à ×25, veines de cuivre à ×100, veines d'or à ×250, chiffres d'or en fusion à ×1 000. C'est cosmétique ; les seuils sont dans la config de présentation.
- La montagne gagne un trait sculpté à chaque palier de multiplicateur (4 étapes), puis la sculpture revient à l'état de base à la fin du bonus.

## 6. Bonus et modes

| | Standard — **SUNDOWN SHIFT** | Supérieur — **FLOODLIGHT SHIFT** |
|---|---|---|
| Déclenchement | 3 Scatters | 4 Scatters ou plus |
| Tours | 10 | 12 |
| Règle clé | chaque case sculptée : Cornerstone +1 | **toutes les charges sont reliées** : une seule chaîne par étape, donc des géants plus grands ; Cornerstone +1 par case |
| Départ du multiplicateur | ×1 | valeur de départ fournie par les maths (provisoire ×1) |
| Ambiance | crépuscule, lampes de chantier | nuit, projecteurs, aurore (qui devient or à haute valeur) |
| Relances | 2 Scatters : +2 tours · 3 Scatters : +5 tours | 2 Scatters : +2 · 3 : +5 · 4 et plus : +8 |

- **Features d'un spin** (achat) : **TNT SPIN** (une révélation contenant au moins deux charges qui s'enchaînent) et **MEGA BLAST SPIN** (une révélation avec une bûche-charge 4×4 qui sculpte un premium ou un WILD). Chacune est exactement une révélation et toute sa résolution.
- **Achat des bonus** : SUNDOWN SHIFT et FLOODLIGHT SHIFT, depuis la même page BUY BONUS. Les prix viennent de la config maths.
- **Ante — DOUBLE FUSE** : mise × facteur de coût, chance de bonus × facteur, les deux lus dans la config maths (par exemple « 3× BONUS CHANCE »). Dans la scène, la lampe frontale de Buck passe au rouge. Les achats sont désactivés quand l'Ante est actif (règle affichée).

## 7. Ordre exact des événements d'un spin

```
[bonus] updateFreeSpin
reveal
boucle d'étape :
    pour chaque chaîne : blast(link 0) → blast(link 1..n) → carve → [bonus] updateGlobalMult (+cases)
    si gain : winInfo → updateTumbleWin → tumbleBoard → (étape suivante)
    sinon : fin de boucle
setWin → setTotalWin
[déclenchement] freeSpinTrigger / freeSpinRetrigger
… free spins …
freeSpinEnd → setTotalWin
[plafond] wincap (arrête la manche)
finalWin
```

## 8. Paliers de célébration (gain du spin rapporté à la mise de base)

| Seuil | Nom | Idée de mise en scène |
|---|---|---|
| ×10 | **FIRE IN THE HOLE!** | l'allumette de Buck s'embrase, l'équipe applaudit depuis l'échafaudage |
| ×25 | **KA-BOOM!** | champignon de poussière derrière la grille, oiseaux qui s'envolent |
| ×100 | **DAM GOOD!** | les vannes du barrage s'ouvrent, la chute double, des rondins dévalent |
| ×500 | **ROCKSLIDE!** | des rochers dévalent derrière le cadre ; Buck se couvre puis prend la pose |
| ×1 000 | **MOUNT BUCKMORE!** | la dent en or du monument flashe, Buck salue sa propre effigie |
| MAX WIN (25 000×) | **BLOWN SKY-HIGH!** | le sommet explose en feu d'artifice de granit et révèle un visage doré qui cligne de l'œil ; uniquement sur l'événement `wincap` |

Les seuils viennent de `game-math-config.json`. Les titres sont du texte traduit posé sur une bannière illustrée, sans montant peint.

## 9. Attentes envers les maths

Elles doivent fournir : les books au format du contrat (`CONTRAT-EVENTS.md`, v1.1), `game-math-config.json` validé (table des paiements par way, RTP par mode, coûts des modes, facteur Ante, tours et relances, seuils de célébration, gain max) et le respect des contraintes de présentation (au plus un Scatter et une charge par rouleau, zones sans Scatter, zones de chaînes distinctes sans chevauchement, zone 5×5 au maximum).
