# Buck — liste d'animations souhaitées

Base de travail pour un Buck de face (rig 2D refait ou modèle 3D). Chaque animation part de la pose de repos et y revient.
**✓** = existe déjà en 2D (`src/render/mascot/Buck.ts`), à refaire de face ; **★** = nouvelle. Durées à vitesse normale (le turbo les accélère).

## Priorité 1 — le cœur du jeu (12)

| # | Animation | Quand | Ce qu'il fait | Durée | Type |
|---|---|---|---|---|---|
| 1 | **Repos** ✓ | tout le temps | respiration, poids qui bascule doucement, clignements, queue qui ondule | 3 s | boucle |
| 2 | **Allumette** ✓ | chaque explosion | prend l'allumette au coin de la bouche, la frotte sur la dent en or, flamme, la lance vers la charge | 1,1 s | unique |
| 3 | **Se protège** ✓ | impact d'explosion | rentre la tête, mains sur le casque, genoux fléchis | 0,6 s | unique |
| 4 | **Grimace de chaîne** ✓ | explosions en chaîne | épaules rentrées, poings serrés, un œil fermé | 0,5 s | unique |
| 5 | **Désigne le géant** ✓ | symbole géant sculpté | index tendu vers la grille, clin d'œil | 1 s | unique |
| 6 | **Coup de queue** ✓ | Cornerstone | lève la queue et frappe le sol, tout le corps encaisse | 0,5 s | unique |
| 7 | **Scatter !** ✓ | 1er Scatter | sursaut, désigne la case | 0,9 s | unique |
| 8 | **Anticipation** ✓ | dernière colonne lente | penché vers les rouleaux, poings sur les hanches, tremble | tenue | boucle |
| 9 | **Anticipation réussie / ratée** ✓ | fin de l'anticipation | bondit poings levés / s'affaisse puis se reprend | 1 s | unique |
| 10 | **Petit gain / bon gain** ✓ | gain simple | pouce levé / poing qui pompe deux fois | 0,8 s | unique |
| 11 | **Détonateur** ✓ | déclenchement du bonus | le détonateur tombe, il empoigne la barre, élan, enfonce le piston | 1,8 s | unique |
| 12 | **Célébration** ✓ | gros gains ×10 → ×1000 | poings levés, pompes, danse de plus en plus forte selon le palier | 1,5 à 4 s | unique |

## Priorité 2 — la personnalité (vanité, humour)

| # | Animation | Quand | Ce qu'il fait | Durée |
|---|---|---|---|---|
| 13 | **Mâchonne l'allumette** ✓ | repos, toutes les 8-16 s | l'allumette passe d'un coin de la bouche à l'autre | 0,9 s |
| 14 | **Lustre sa dent en or** ✓ | repos | souffle dessus, la frotte du revers de la manche, sourire éclatant | 1,4 s |
| 15 | **Admire son monument** ✓ | repos | lève les yeux, bombe le torse, clin d'œil | 1,7 s |
| 16 | **Ennui** ★ | 30 s sans spin | bâille, s'adosse à la caisse de TNT, tapote le casque | 3 s, boucle |
| 17 | **MAX WIN** ✓ (à enrichir) | gain maximal | grand saut, atterrit, pose de statue (comme son monument), clin d'œil doré | 4 s |
| 18 | **Retour du gros gain** ★ | après une célébration | essuie son front, remet son casque droit, souffle | 1 s |

## Priorité 3 — le bonus et l'interface

| # | Animation | Quand | Ce qu'il fait | Durée |
|---|---|---|---|---|
| 19 | **Entrée en jeu** ✓ | après l'accueil | balaye la scène du bras, coup de queue | 0,9 s |
| 20 | **Intro du bonus** ★ | panneau SUNDOWN SHIFT | allume sa lampe frontale, salue d'un doigt au casque | 1,2 s |
| 21 | **Relance +N spins** ★ | relance en bonus | surpris, compte sur ses doigts, poing levé | 1,4 s |
| 22 | **Fin du bonus** ★ | panneau de fin | s'étire, éteint sa lampe, pouce levé | 1,5 s |
| 23 | **Ante activé** ★ | bouton DOUBLE FUSE | allume la lampe frontale, coup d'épaule « on y va » | 0,8 s |
| 24 | **Achat du bonus** ★ | confirmation d'achat | se frotte les mains, craque ses doigts | 1 s |
| 25 | **Attente réseau** ★ | réponse serveur lente | regarde sa montre, tapote du pied | boucle |
| 26 | **Reprise d'une partie** ★ | manche retrouvée | se gratte le casque, « ah oui ! », pouce | 1,2 s |

## Pour la 3D (Meshy)

- Les **préréglages** de Meshy (repos, marche, saut, acclamation, danse) couvrent n°1, 9, 12, 17.
- Tout ce qui touche un accessoire ou un point précis (**allumette, dent en or, détonateur, casque, queue**) demande une animation faite à la main : n°2, 3, 6, 11, 13, 14.
- Le jeu Stake ne peut pas charger de 3D en ligne : chaque animation serait **rendue en séquence d'images** dans le style de la référence.
