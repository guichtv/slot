# BOOMTOOTH — Annexe B : inventaire des animations

> Chaque moment animé du jeu : cinq pistes, la piste **RETENUE**, la raison, la **durée réelle lue dans le code**, le comportement quand on **passe** et en **mouvement réduit**, et le code qui l'implémente.

État décrit : commit `c88a599` du **28/09** (phases de la FSM pilotées par le présentateur, Cornerstone devant Buck, Ante masqué en free spins, décor portrait plein cadre, bûche-charge `sym.T.log`). D'autres agents modifient encore le code en parallèle. Sources : `src/config/timings.ts`, `src/controller/presenter.ts`, `src/render/**`, `src/ui/**`, `src/main.ts`, captures `captures/qa/`.

**Statuts** : **Implémenté** (la piste retenue tourne telle quelle) · **Partiel** (une partie de la piste retenue manque, ou un écart notable existe) · **Absent** (piste retenue non codée).

---

## 0. Règles communes

### 0.1 Horloge, Beat et turbo

- Tout le temps de présentation passe par **une seule horloge** (`src/core/clock.ts`). Les séquences d'un événement tournent dans un **`Beat`** (`src/core/beat.ts`).
- **Turbo** = `Beat.speed` : **×1** (NON), **×1,8** (TURBO), **×3** (ULTRA) (`GameController.speed`).
- Le turbo divise **les attentes** (`beat.wait`) et accélère **les animations jouées par le Beat** (`beat.play`, `beat.fire`). Il **ne touche pas** ce qui est lancé hors Beat.

| Accéléré par le turbo | **Non accéléré** |
|---|---|
| attentes (`minSpin`, écarts d'arrêt, anticipation, mèche, étincelle, présentation des gains, pauses) | départ des rouleaux et vitesse de défilement (26 cases/s) |
| arrêts de colonnes, piquets, fil, flash, anneau, secousse, sculpture | **gestes de Buck** (seule l'attente associée est raccourcie) |
| chute (tumble), regravure du Cornerstone, « +N FS », entrée des panneaux de bonus | réactions de symboles, particules, vol des éclats vers le Cornerstone |
| retour au jour, maintien des célébrations | **compteur des célébrations**, sorties des panneaux, accueil, menus |

### 0.2 Passer (skip)

| Geste | Où | Effet |
|---|---|---|
| **Clic / toucher sur la grille** | pendant une manche (`fsm.inRound`) | `skipCurrent()` : l'événement en cours atteint **son état final exact** |
| **SPIN** (icône STOP) | phase HUD `spinning` | arrêt rapide **et** `skipCurrent()` |
| **Espace** | état `ready` : spin ; en manche : arrêt rapide | idem SPIN |
| **Toucher n'importe où / Entrée / Espace** | accueil, intro et fin de bonus, célébration | fermeture (ou état final pour la célébration) |

- Un skip vaut **pour un seul événement** : la vitesse normale revient à l'événement suivant (`RoundPlayer.play`).
- Au skip, les attentes se résolvent et les animations du Beat passent à `progress(1)`. Les **particules déjà émises continuent** de voler. Les gestes de Buck continuent (hors Beat).
- `skipRest()` (passer toute la manche) existe mais **n'est branché à aucune commande**.

### 0.3 Mouvement réduit

Réglage **« Animations réduites »** (menu RÉGLAGES), par défaut = `prefers-reduced-motion`. Il pose `html[data-motion]` et les drapeaux `reducedMotion` de la scène (`main.ts → onReducedMotion`).

| Coupé ou atténué | **Ignore le réglage** (écart) |
|---|---|
| zoom et secousses de caméra (`Camera`) | décor (nuages, chute d'eau, faisceaux, oiseaux) |
| respiration et sursaut du logo (`Logo`) | gestes de jeu de Buck (réactions, performances, célébrations : ils racontent l'événement) |
| Buck : respiration et gestes d'attente (`Buck.reducedMotion`) | |
| éclair de célébration 0,55 → 0,15, geysers à 8/s (`CelebrationFx`) | boucles de repos des symboles, étirement des rouleaux |
| glissements du BUY BONUS → fondus (`BuyMenu`) | accueil et entrées de panneaux (GSAP) |
| transitions CSS de l'Ante, du BUY, des dialogues (`data-motion`) | `overlays.css`, `welcome.css`, `hud.css` : **préférence système seulement** |

---

## 1. Synthèse

| ID | Moment | Durée normale (code) | Statut | Code principal |
|---|---|---|---|---|
| M01 | Chargement | réseau ; fondu 0,4 s | Implémenté | `main.ts` `setProgress` |
| M02 | Accueil | entrée 0,95 s ; sortie 0,6 s | Implémenté | `ui/welcome.ts` |
| M03 | Entrée dans le jeu | 0,9 s (non bloquant) | Implémenté | `main.ts` `enter()` |
| M04 | Repos — grille | boucles 5-12 s | Implémenté | `SymbolView.restartIdle` |
| M05 | Repos — décor | continu ; rare 14-30 s | **Partiel** | `Decor.update` |
| M06 | Repos — Buck | gestes 8-16 s | Implémenté | `Buck.startIdle` |
| M07 | Repos — logo | respiration 8,8 s | Implémenté | `Logo.tick` |
| M08 | Départ des rouleaux | 0,55 s | Implémenté | `ReelColumn.start` |
| M09 | Arrêt normal | ≈ 1,3 s après réponse | Implémenté | `GridView.land` |
| M10 | Arrêt rapide | 0,32 s ou instantané | Implémenté | `GameController.quickStop` |
| M11 | Anticipation | 1,85 s par rouleau | Implémenté | `presenter.reveal` |
| M12 | Atterrissage Scatter | 0,55 s | Implémenté | `SymbolView.react('S')` |
| M13 | Atterrissage TNT | 0,24 s + boucle | Implémenté | `GridView.tick` |
| M14 | Petit gain (< ×2) | 0,12 s | Implémenté | `presenter.setWin` |
| M15 | Gain moyen (×2 à < ×10) | 0,12 s | Implémenté | `presenter.setWin` |
| M16 | Présentation des ways | 0,62 s / connexion | **Partiel** | `GridView.presentWin` |
| M17 | Tumble | ≈ 0,5-0,9 s | Implémenté | `GridView.tumble` |
| M18 | Piquets et fil | 0,32 s / 0,45 s | Implémenté | `BlastFx.stakes` |
| M19 | Allumette et étincelle | 1,1 s | Implémenté | `Buck.perform('strikeMatch')` |
| M20 | Mèche | 0,24 s / 0,4 s | Implémenté | `BlastFx.fuse` |
| M21 | Explosion (par taille) | 0,23 s bloquant | Implémenté | `BlastFx.explode` |
| M22 | Chaîne | 0,89 s / maillon | Implémenté | `presenter.blast` |
| M23 | Taille du géant | 0,5 s | Implémenté | `BlastFx.carve` |
| M24 | Fissure / effritement | 0,3 s ou 0 s | **Partiel** | `GridView.crackGiant` |
| M25 | Multiplicateur Cornerstone | ≈ 0,9-1,3 s | **Partiel** | `Cornerstone.collect/engrave` |
| M26 | Monument | 0,6 s | Implémenté | `Decor.setMonument` |
| M27 | Déclenchement de bonus | 2,55 s | Implémenté | `presenter.fsTrigger` |
| M28 | Transition vers la nuit | 0,9 s | **Partiel** | `Decor.setAmbience` |
| M29 | Intro bonus | 0,47 s + toucher | Implémenté | `Overlays.dialog('intro')` |
| M30 | Compteur de free spins | 0,26 s / tour | Implémenté | `Overlays.setFs` |
| M31 | +N FS (relance) | 1,92 s | Implémenté | `Overlays.plusFs` |
| M32 | Fin de bonus | 0,47 s + toucher + 1,2 s | Implémenté | `presenter.fsEnd` |
| M33 | Célébrations par palier | ≈ 4 à 11 s | **Partiel** | `Overlays.celebrate`, `CelebrationFx` |
| M34 | MAX WIN | ≈ 15 s | **Partiel** | `presenter` (`wincap`) |
| M35 | Retour au jeu de base | immédiat | Implémenté | `GameController.finishRound` |
| M36 | Ante (DOUBLE FUSE) | 0,12 s | Implémenté | `ui/ante.ts`, `Buck.setAnte` |
| M37 | Achat (BUY BONUS) | 0,35 s | Implémenté | `ui/buy.ts` |
| M38 | Menus | instantané | Implémenté | `ui/menu.ts` |
| M39 | Erreurs et attente | 0,14 s | Implémenté | `ui/dialogs.ts` |
| M40 | Reprise | instantané | **Partiel** | `GamePresenter.restore` |
| M41 | Relecture | durée de la manche | **Partiel** | `GameController.replayRound` |
| M42 | Mouvement réduit | — | **Partiel** | `main.ts` `onReducedMotion` |
| M43 | Turbo | — | **Partiel** | `Beat`, `GameController.speed` |

---

## 2. Fiches — démarrage

### M01 · Chargement

| Piste | Idée |
|---|---|
| A | Barre neutre sous le logo Crownforge, sans décor. |
| **B — RETENUE** | Logo Crownforge, **barre bois/or remplie par la progression réelle**, une étincelle court au bout de la barre comme une mèche qui brûle vers le jeu ; fondu de sortie. |
| C | Buck creuse un tunnel qui avance avec le chargement. |
| D | Bâton de dynamite dont la mèche raccourcit ; explosion à 100 %. |
| E | Mount Buckmore sculpté tranche par tranche. |

| | |
|---|---|
| **Pourquoi B** | Progression **vraie** (aucun faux délai), rien de lourd à charger avant le jeu, lisible à toutes les tailles. D retarderait l'entrée d'une explosion. |
| **Durée** | Réseau. Paliers réels : config 4 %, manifeste 8 %, polices 12 %, textures 12 → 84 %, envoi GPU 84 → 92 %, session 100 %. Remplissage CSS 180 ms par pas ; **fondu 400 ms**, retrait à 500 ms. |
| **Turbo** | Sans effet. |
| **Passer** | Impossible (attente réelle). |
| **Mouvement réduit** | Pas de variante (transitions CSS courtes). |
| **Erreur** | Bloc « Le chargement a échoué… » + **Réessayer** (focus) → rechargement de la page. Paramètres d'URL invalides : même bloc, immédiatement. |
| **Code** | `index.html` (`#loader`), `src/ui/theme.css`, `src/main.ts` → `setProgress`, `showLoadError`, `boot` |
| **Statut** | Implémenté. L'étincelle est un point CSS (pas de particules). `aria-label="Loading"` figé en anglais dans `index.html`. |

### M02 · Accueil

| Piste | Idée |
|---|---|
| A | Écran statique avec bouton CONTINUER. |
| **B — RETENUE** | Voile léger ; le logo tombe en rebond ; **trois cartes illustrées** (BLAST & CARVE, SUNDOWN SHIFT, FLOODLIGHT SHIFT) montent en éventail ; gain max ; « Touchez n'importe où ». **Sortie : les cartes sont soufflées vers l'extérieur en tournoyant**, comme par une explosion au centre. |
| C | Buck présente les cartes une à une dans une bulle. |
| D | Affiches clouées sur la palissade du chantier, arrachées par Buck. |
| E | Carrousel à balayer du doigt. |

| | |
|---|---|
| **Pourquoi B** | Aucun bouton « Continuer » ; le geste est **consommé** (il ne lance pas de spin) ; sortie « explosive » dans le thème, en moins d'une seconde. |
| **Durée** | Entrée **≈ 0,95 s** (voile 0,3 s, logo 0,45 s, cartes 0,5 s décalées de 0,09 s, textes 0,3 s). Armement du toucher 300 ms. Sortie **≈ 0,6 s** (cartes 0,55 s, logo 0,4 s, voile 0,45 s). |
| **Turbo** | Sans effet (hors Beat). |
| **Passer** | Le toucher (ou Entrée / Espace) termine l'entrée puis lance la sortie. La case « Ne plus afficher » ne ferme pas. |
| **Mouvement réduit** | Animations GSAP identiques ; seul le clignotement de l'indice s'arrête, et seulement avec la préférence système. |
| **Code** | `src/ui/welcome.ts` → `showWelcome` ; `src/ui/dom.ts` → `anywhereToDismiss` ; conditions dans `main.ts` |
| **Statut** | Implémenté. |

### M03 · Entrée dans le jeu

| Piste | Idée |
|---|---|
| A | Simple fondu sur la scène. |
| **B — RETENUE** | Pendant que les cartes s'envolent, **Buck balaie la scène du bras et claque la queue**, la caméra recule de ×1,06 à ×1, le logo sursaute. |
| C | Buck arrive en courant depuis le bord. |
| D | La grille tombe du ciel et s'enfonce dans le sol. |
| E | Explosion d'ouverture qui dégage la grille. |

| | |
|---|---|
| **Pourquoi B** | Relie l'accueil au jeu par un geste de la mascotte, **sans retarder** le premier spin. |
| **Durée** | Geste de Buck ≈ 0,9 s ; caméra 0,9 s ; sursaut du logo ≈ 0,58 s. L'état passe à `ready` sans attendre. |
| **Turbo** | Sans effet. |
| **Passer** | Non bloquant : SPIN est disponible tout de suite. |
| **Mouvement réduit** | Pas de recul caméra, pas de sursaut du logo ; le geste de Buck reste. |
| **Code** | `src/main.ts` → `enter()` ; `Buck.perform('introSwipe')`, `Logo.thump`, `Camera.zoomTo/reset` |
| **Statut** | Implémenté. |

---

## 3. Fiches — repos

### M04 · Repos — grille

| Piste | Idée |
|---|---|
| A | Grille figée. |
| **B — RETENUE** | **Chaque symbole a sa boucle**, période 5-12 s, phase aléatoire : le raton hoche la tête, l'élan souffle (bois décalés), la loutre penche la tête, le pic-vert tapote, le couvercle du WILD se soulève, la poignée du Scatter tressaille, la charge tremble, les lows respirent. |
| C | Reflet lumineux qui balaie la grille toutes les 10 s. |
| D | Tous les symboles clignent des yeux ensemble. |
| E | Poussière qui tombe du cadre en poutres. |

| | |
|---|---|
| **Pourquoi B** | Vie discrète et **désynchronisée**, pièces animées déjà produites, aucune gêne pour la lecture. |
| **Durée** | Boucles 5-12 s ; mouvements 0,5 à 1,4 s. En pause pendant le défilement. |
| **Turbo / Passer** | Sans objet. |
| **Mouvement réduit** | **Aucune différence** (écart). |
| **Code** | `src/render/grid/SymbolView.ts` → `restartIdle`, `pauseIdle` |
| **Statut** | Implémenté. |

### M05 · Repos — décor

| Piste | Idée |
|---|---|
| A | Décor fixe. |
| **B — RETENUE** | Décor vivant en calques : **nuages** qui dérivent (4-11 px/s), **chute d'eau** (9 traits blancs qui défilent), **poussières dorées** dans la lumière rasante ; toutes les 14-30 s un événement rare : **vol d'oies en V** (3 poses d'ailes), explosion lointaine sur la montagne ou étincelles de chantier. |
| C | Cycle jour complet accéléré. |
| D | Ouvriers miniatures qui s'activent sur la montagne. |
| E | Grue en rondins qui pivote. |

| | |
|---|---|
| **Pourquoi B** | Sources de mouvement naturelles de la direction D1, coût faible, rien derrière la grille. |
| **Durée** | Continu. Premier événement rare à 9 s, puis 14-30 s. Traversée des oies ≈ 13-15 s. Pendant un gain : décor atténué en 0,35 s (luminosité −22 %). |
| **Portrait** | `portrait`, `tablet`, `mini` : un décor peint plein cadre (`decor.portrait`) remplace ciel, lointain, intermédiaire, sol et nuages ; la chute d'eau garde ses traits animés. |
| **Turbo / Passer** | Sans objet. |
| **Mouvement réduit** | **Aucune différence** (écart). |
| **Code** | `src/render/decor.ts` → `update`, `drawWaterfall`, `drawMotes`, `launchFlock`, `rareEvent`, `setDim` |
| **Statut** | **Partiel** : l'explosion lointaine et les étincelles de chantier n'ont **aucune image** (son d'ambiance seulement, `main.ts` → `onRareEvent`). |

### M06 · Repos — Buck

| Piste | Idée |
|---|---|
| A | Pose fixe. |
| **B — RETENUE** | **Respiration articulée** (torse, tête, épaules, bras), **clignement** toutes les 2,6-6 s, un **geste de vanité** toutes les 8-16 s : mâchonner l'allumette (la tête s'écrase, sans changer de dessin), taper le sol de la queue, lustrer la dent en or du poing (par-dessous, le visage reste visible), lever les yeux vers son monument puis un clin d'œil bref. |
| C | Buck lit le journal du chantier. |
| D | Buck donne des ordres à l'équipe hors champ, en bulles. |
| E | Buck s'endort et ronfle après une minute sans spin. |

| | |
|---|---|
| **Pourquoi B** | La vanité porte l'humour sans voler l'attention ; toute réaction interrompt le geste (priorités repos 0 < geste 1 < réaction 2 < performance 3 < célébration 4). |
| **Durée** | Respiration 1,5 s par demi-cycle ; clignement 0,11 s ; gestes 0,55-1,7 s. |
| **Turbo / Passer** | Sans objet. |
| **Mouvement réduit** | Pas de respiration visible, aucun geste d'attente (`Buck.reducedMotion`). |
| **Code** | `src/render/mascot/Buck.ts` → `startIdle`, `applyBreath`, `scheduleBlink`, `scheduleGesture`, `gesture` ; bras pilotés par la main (`armIk.ts`), jambes résolues à chaque image (pieds ancrés) |
| **Statut** | Implémenté. |

### M07 · Repos — logo

| Piste | Idée |
|---|---|
| A | Logo fixe. |
| **B — RETENUE** | Logo posé dans le décor : **respiration lente** (±1,2 %), léger balancement, **mèche qui crépite en continu**, sursaut élastique sur les impacts et les paliers. |
| C | Lettres qui sautent une à une. |
| D | Logo qui fume après chaque explosion. |
| E | Mèche qui se consume puis se rallume. |

| | |
|---|---|
| **Pourquoi B** | Rappel permanent de la dynamite, sans boucle distrayante. |
| **Durée** | Respiration ≈ 8,8 s ; balancement ≈ 14,4 s ; 2 étincelles toutes les 90 ms ; sursaut ≈ 0,58 s. |
| **Turbo / Passer** | Sans objet (boucle continue ; sursaut hors Beat). |
| **Mouvement réduit** | Respiration et sursaut coupés ; étincelles conservées. |
| **Code** | `src/render/logo.ts` → `tick`, `thump` |
| **Statut** | Implémenté. |

---

## 4. Fiches — spin

### M08 · Départ des rouleaux

| Piste | Idée |
|---|---|
| A | Départ simultané à pleine vitesse. |
| **B — RETENUE** | Au clic, chaque colonne **recule d'un huitième de case** puis accélère, avec 60 ms de décalage ; défilement à 26 cases/s avec **étirement cartoon** (pas de flou) ; symboles de défilement **décoratifs uniquement** (jamais de faux Scatter, WILD ou charge). |
| C | Les colonnes sautent vers le haut avant de tomber. |
| D | Flou de mouvement (filtre GPU). |
| E | Départ de droite à gauche. |

| | |
|---|---|
| **Pourquoi B** | Retour tactile immédiat : **les rouleaux partent au clic**, la réponse du serveur arrive pendant le défilement. Aucun filtre plein écran. |
| **Durée** | Recul 0,09 s + accélération 0,22 s par colonne ; dernière colonne lancée à 0,24 s → pleine vitesse à **≈ 0,55 s**. En free spin et après un achat, le départ se fait au `reveal`. |
| **Turbo** | Sans effet (ni le départ ni la vitesse). |
| **Passer / Mouvement réduit** | Sans objet / identique. |
| **Code** | `ReelColumn.start`, `tick`, `layoutRing` ; `GridView.spin` ; `GameController.playRound` |
| **Statut** | Implémenté. |

### M09 · Arrêt normal

| Piste | Idée |
|---|---|
| A | Arrêt sec simultané. |
| **B — RETENUE** | Arrêt **de gauche à droite**, 110 ms d'écart, **décélération continue** depuis la vitesse de défilement jusqu'à 0,14 case de dépassement, **rebond** de 0,16 s ; chaque symbole s'écrase puis se redresse (plus fort pour Scatter, WILD, charge) ; son d'arrêt un peu plus aigu à chaque colonne. |
| C | Gros rebond élastique. |
| D | Chaque colonne tombe comme un bloc de pierre, avec poussière. |
| E | « Clac » de verrou métallique visible sur le cadre. |

| | |
|---|---|
| **Pourquoi B** | Lecture gauche → droite des ways ; aucune cassure de vitesse ; aucun recul artificiel. |
| **Durée** | Défilement minimal 520 ms (**208 ms** si les rouleaux sont partis au clic), 4 × 110 ms, dernier arrêt ≈ 0,6 s, + 60 ms. **≈ 1,3 s après la réponse** (clic) / ≈ 1,6 s (free spin). Écrasement 0,24 s. |
| **Turbo** | ×1,8 : ≈ 0,73 s / 0,9 s · ×3 : ≈ 0,44 s / 0,54 s (écrasement non accéléré). |
| **Passer** | Voir M10. |
| **Mouvement réduit** | Identique. |
| **Code** | `presenter.reveal` ; `GridView.land` ; `ReelColumn.stop`, `finishLanding` ; `SymbolView.land` |
| **Statut** | Implémenté. |

### M10 · Arrêt rapide

| Piste | Idée |
|---|---|
| A | Désactivé : spin à durée fixe. |
| **B — RETENUE** | Second clic sur SPIN (icône STOP) ou Espace : si la réponse n'est pas encore là, **les cinq colonnes s'arrêtent ensemble** dès son arrivée ; si l'arrêt est commencé, **la grille se pose aussitôt**. Résultat inchangé. |
| C | Arrêt colonne par colonne en accéléré (30 ms). |
| D | Buck donne un coup de poing sur le cadre. |
| E | Toute la grille glisse d'un bloc vers le bas. |

| | |
|---|---|
| **Pourquoi B** | Attente classique des joueurs ; le résultat vient du book, jamais modifié. |
| **Durée** | 0,16 s de décélération + 0,16 s de rebond (turbo ÷1,8 / ÷3), ou instantané. |
| **Passer** | C'est un skip de l'événement `reveal`. |
| **Mouvement réduit** | Identique. |
| **Code** | `GameController.quickStop` ; `GamePresenter.quickStop` ; `GridView.land` (`quick`) ; `Hud.onSpin` ; Espace dans `main.ts` |
| **Statut** | Implémenté. Écarts : **Espace est inactif pendant `requesting`** (`fsm.inRound` faux) ; le drapeau de juridiction `disabledSlamstop` n'est pas lu ; STOP passe aussi n'importe quel autre événement en cours. |

### M11 · Anticipation (1,6-2,2 s)

| Piste | Idée |
|---|---|
| A | Simple ralenti des rouleaux restants. |
| **B — RETENUE** | Au premier rouleau marqué par le book : **tension musicale**, **zoom caméra ×1,07** centré sur ce rouleau, **ralenti à 7 cases/s**, **1,85 s par rouleau anticipé** ; les Scatters déjà posés réagissent ; Buck se penche, poings serrés, regard fixe. À la fin, Buck exulte (≥ 3 Scatters) ou s'affaisse ; la caméra revient. |
| C | Cadre du rouleau qui rougit, avec étincelles. |
| D | Toute la scène s'assombrit sauf le rouleau. |
| E | Une mèche géante court le long du rouleau. |

| | |
|---|---|
| **Pourquoi B** | Dans la fourchette visée, la caméra commune donne du relief sans toucher au HUD, Buck raconte l'enjeu. |
| **Durée** | **1 850 ms d'attente par rouleau anticipé** (`T.spin.antiMs`) ; ralenti 0,6 s ; arrêt du rouleau 0,9 s + 0,16 s ; zoom 1,4 s ; retour caméra 0,7 s. |
| **Turbo** | ×1,8 : **1,03 s** · ×3 : **0,62 s** (sous la fourchette). |
| **Passer** | Arrêt rapide ou clic : l'anticipation est abandonnée, la grille se pose. |
| **Mouvement réduit** | Pas de zoom ; ralenti et pose de Buck conservés. |
| **Code** | `presenter.reveal` (`onAnticipate`) ; `GridView.land` ; `ReelColumn.slowTo` ; `Buck.react('anticipation' / 'anticipationWin' / 'anticipationLose')` ; `tension()` |
| **Statut** | Implémenté. Pas de mise en évidence propre du rouleau anticipé (zoom et ralenti seulement). |

### M12 · Atterrissage d'un Scatter

| Piste | Idée |
|---|---|
| A | Un son, rien d'autre. |
| **B — RETENUE** | À l'arrêt de sa colonne, la **poignée du détonateur est arrachée puis claquée** (élastique), le symbole gonfle ; **son de plus en plus aigu** (+12 % par Scatter) ; Buck sursaute et le désigne, puis lève les poings dès le deuxième. |
| C | Le Scatter lance une étincelle vers un compteur. |
| D | Toute la colonne s'illumine. |
| E | Le détonateur tremble jusqu'à la fin du spin. |

| | |
|---|---|
| **Pourquoi B** | Réaction propre au symbole (pièce séparée), escalade sonore lisible, Buck comme témoin. |
| **Durée** | Réaction ≈ 0,55 s ; écrasement 0,24 s (force 1,4) ; Buck ≈ 1,15 s (1er) / 1,25 s (2e et +). |
| **Turbo / Passer** | Non accélérée, jouée même en cas de skip (hors Beat). |
| **Mouvement réduit** | Identique. |
| **Code** | `presenter.reveal` (`onColumnStop`) ; `SymbolView.react` (cas `S`) ; `Buck.react('scatter' / 'scatterExcited')` |
| **Statut** | Implémenté. Le compteur de Scatters prévu (`Stage.ui.scatterCount`) est **vide** dans `main.ts`. |

### M13 · Atterrissage d'une charge (TNT)

| Piste | Idée |
|---|---|
| A | Traitement d'un symbole ordinaire. |
| **B — RETENUE** | La charge **s'écrase plus fort** à l'arrivée, puis **tremble** régulièrement ; sa **mèche crache des étincelles** tant que la grille est posée. La taille se lit à l'objet (bâton, fagot, bûche-charge), sans texte. |
| C | Piquets plantés dès l'atterrissage. |
| D | Taille de zone (2×2…) écrite sur la charge. |
| E | Buck se frotte les mains à chaque charge. |

| | |
|---|---|
| **Pourquoi B** | La charge vit et annonce l'explosion sans masquer la grille ; la zone n'est montrée qu'au moment utile (M18). |
| **Durée** | Écrasement 0,24 s ; tremblement 0,42 s toutes les ≈ 2,8 s ; ≈ 11 gerbes d'étincelles par seconde. |
| **Turbo / Passer / Réduit** | Sans effet. |
| **Code** | `GridView.land` (force 1,4), `GridView.tick`, `refreshFuses` ; `SymbolView.restartIdle` (cas `T`) ; `TNT_DEFS.fuse` |
| **Statut** | Implémenté. Aucun son propre à l'arrivée d'une charge. |

---

## 5. Fiches — gains

### M14 · Petit gain (< ×2)

| Piste | Idée |
|---|---|
| A | Montant dans le HUD, rien d'autre. |
| **B — RETENUE** | Après les connexions, **Buck lève le pouce** ; le HUD affiche le gain ; aucune bannière. |
| C | Pluie de copeaux sur la grille. |
| D | Le logo sursaute. |
| E | Buck applaudit. |

| | |
|---|---|
| **Pourquoi B** | Proportion : un petit gain ne se célèbre pas. |
| **Durée** | 120 ms (180 ms en bonus) ; Buck ≈ 1,05 s, non bloquant. Turbo : 67 / 100 ms · 40 / 60 ms. |
| **Passer** | Attente passée ; Buck continue. |
| **Mouvement réduit** | Identique. |
| **Code** | `presenter.setWin` ; `Buck.react('smallWin')` |
| **Statut** | Implémenté. Le pouce est levé **même pour un gain inférieur à la mise**. `Hud.pulseWin()` existe mais n'est jamais appelé. |

### M15 · Gain moyen (×2 à < ×10)

| Piste | Idée |
|---|---|
| A | Même traitement que le petit gain. |
| **B — RETENUE** | **Buck serre le poing et pompe deux fois**, grand sourire ; le décor a déjà été atténué pendant les connexions. |
| C | Mini-bannière « NICE BLAST ». |
| D | Pépites qui tombent du haut de la grille. |
| E | L'équipe applaudit hors champ (son). |

| | |
|---|---|
| **Pourquoi B** | Gradation sans bannière avant le premier palier de la config (×10). |
| **Durée** | 120 ms (180 ms en bonus) ; Buck ≈ 1,05 s. Turbo : 67 / 100 ms · 40 / 60 ms (geste de Buck non accéléré). |
| **Passer / Réduit** | Attente passée, Buck continue / identique. |
| **Code** | `presenter.setWin` ; `Buck.react('goodWin')` |
| **Statut** | Implémenté (gradation portée par Buck seul). |

### M16 · Présentation des ways

| Piste | Idée |
|---|---|
| A | Lignes tracées entre les symboles. |
| **B — RETENUE** | Connexion par connexion : les autres cases s'**atténuent** (45 %), **halo** de la couleur du symbole derrière chaque case gagnante, **chaque case réagit** (réaction propre aux premiums, WILD, Scatter ; pulsation sobre pour les lows), étincelles, **montant exact** au barycentre (« base ×mult = gain » en bonus). Un géant réagit une seule fois. |
| C | Toutes les connexions ensemble, puis le total. |
| D | Cadre doré autour des rouleaux concernés. |
| E | Compteur « N WAYS » sur chaque connexion. |

| | |
|---|---|
| **Pourquoi B** | En ways, aucune ligne trompeuse : les gagnants réagissent eux-mêmes (CONCEPT § 2). |
| **Durée** | **620 ms par connexion** (montant tenu 420 ms). Turbo : 344 ms · 207 ms. Réactions 0,55-0,8 s (non accélérées). |
| **Passer** | Clic sur la grille : les connexions restantes passent à leur état final, fin immédiate. |
| **Mouvement réduit** | Identique. |
| **Code** | `presenter.winInfo` ; `GridView.presentWin`, `drawHalos`, `showAmount`, `endWinPresentation` ; `SymbolView.react`, `dim` |
| **Statut** | **Partiel** : **au-delà de 3 connexions, seule la première est présentée** (`if (many) break`), les autres ne sont jamais montrées. `T.win.between` (90 ms) n'est pas utilisé. À vérifier : glyphes des devises hors jeu de caractères de la police bitmap `WinDigits` (£, ¥, espaces fines). |

### M17 · Tumble (chute)

| Piste | Idée |
|---|---|
| A | Disparition instantanée ; nouveaux symboles en fondu. |
| **B — RETENUE** | Les cases gagnantes **se tassent puis s'effondrent en gravats** (éclats de granit et de bois, bouffées de poussière ocre) ; **la chute démarre dès que les cases sont libres** ; survivants et nouveaux symboles tombent avec gravité, décalés par colonne, et s'écrasent à l'arrivée. Aucun symbole ne réapparaît. |
| C | Les symboles explosent en confettis. |
| D | Aspiration vers le haut. |
| E | Fondu enchaîné. |

| | |
|---|---|
| **Pourquoi B** | Continuité physique avec la démolition ; les vues sont recyclées (identité conservée). |
| **Durée** | Effondrement ≈ 0,31 s ; départ de la chute à **170 ms** ; chute 0,28-0,55 s + décalages ≤ 0,16 s ; écrasement 0,24 s. **≈ 0,5-0,9 s**. Turbo ÷1,8 / ÷3 (sauf particules). |
| **Passer** | Grille finale immédiate ; les gravats finissent leur vol. |
| **Mouvement réduit** | Identique. |
| **Code** | `presenter` (`tumbleBoard`) ; `GridView.tumble` ; `SymbolView.crumble`, `land` |
| **Statut** | Implémenté (contrôle final : grille affichée = grille du book). |

---

## 6. Fiches — BLAST & CARVE

### M18 · Piquets et fil

| Piste | Idée |
|---|---|
| A | Contour lumineux de la zone. |
| **B — RETENUE** | Le géomètre plante **quatre piquets** (bois, tête rouge, contour encre) aux coins de la zone et tend un **cordeau crème** de piquet en piquet. En **super bonus**, un **fil de mise à feu rouge**, légèrement affaissé, relie d'abord toutes les charges de l'étape. |
| C | Zone assombrie avec un damier. |
| D | La loutre géomètre sort de sa case pour mesurer. |
| E | Ruban de chantier jaune et noir. |

| | |
|---|---|
| **Pourquoi B** | Montre **ce qui va sauter** avant l'explosion, sans texte (CONCEPT § 4). Primitive légère. |
| **Durée** | Cordeau 0,32 s ; fil 0,45 s (en parallèle). Turbo : 0,18 / 0,25 s · 0,11 / 0,15 s. |
| **Passer** | Tracé complet immédiat. |
| **Mouvement réduit** | Identique. |
| **Code** | `BlastFx.stakes`, `showWire`, `clearStakes`, `clearWire` ; `presenter.blast` |
| **Statut** | Implémenté. Le fil n'apparaît que si le book contient des liens `wired` (fixture F33). |

### M19 · Allumette et étincelle

| Piste | Idée |
|---|---|
| A | La charge s'allume seule. |
| **B — RETENUE** | La main arrive par le côté, coude dehors, et pince l'allumette au coin de la bouche ; il **la frotte sur sa dent en or** (contact, flamme), puis d'un coup de fouet le bras se tend vers la charge et lâche l'allumette ; **une traînée d'étincelles file en arc** jusqu'à la mèche. Ensuite, il reprend une allumette au coin de la bouche. |
| C | Buck lance l'allumette d'une pichenette. |
| D | Un petit détonateur à main par charge. |
| E | Le raton artificier allume la mèche. |

| | |
|---|---|
| **Pourquoi B** | Geste signature de la mascotte (DECISIONS) ; cause visible de l'explosion. |
| **Durée** | Geste bloquant **0,72 s** + étincelle **0,38 s** (arc 120 px) = **1,1 s**. Turbo : 0,61 s · 0,37 s. Retour au repos de Buck ≈ 0,7 s de plus, non bloquant. |
| **Passer** | Attentes passées ; le geste de Buck et les étincelles émises continuent. |
| **Mouvement réduit** | Identique. |
| **Code** | `Buck.perform('strikeMatch')`, `Buck.matchPoint` ; `BlastFx.spark` ; `presenter.blast` (lien 0) |
| **Statut** | Implémenté. Écarts : en turbo, **l'étincelle part avant que le bras soit tendu** (geste non accéléré) ; à 1440 × 900 **la main entre dans la grille** (capture `f10-1440x900-03`) alors que `reach()` doit l'éviter ; en disposition `mini`, Buck est masqué mais l'étincelle part de sa position. |

### M20 · Mèche

| Piste | Idée |
|---|---|
| A | Pas de mèche : explosion immédiate. |
| **B — RETENUE** | La charge **tremble** (±6°) et sa mèche **crache une gerbe** jaune-orange ; plus longue pour un maillon de chaîne (tension). |
| C | Mèche qui raccourcit visiblement. |
| D | Compte à rebours 3-2-1. |
| E | Fumée noire qui monte. |

| | |
|---|---|
| **Pourquoi B** | Temps de préparation court et lisible. |
| **Durée** | **240 ms** (lien 0) / **400 ms** (chaîne). Turbo : 133 / 222 ms · 80 / 133 ms. `T.blast.fuse` (520 ms) n'est qu'une valeur par défaut, non utilisée. |
| **Passer / Réduit** | Fin immédiate / identique. |
| **Code** | `BlastFx.fuse` |
| **Statut** | Implémenté. |

### M21 · Explosion (par taille)

| Piste | Idée |
|---|---|
| A | La même explosion pour toutes les tailles. |
| **B — RETENUE** | **Flash en étoile** blanc-jaune cerclé d'encre, **onde de choc** en anneau, **secousse de caméra proportionnelle**, éclats de granit et de bois qui **sortent du cadre**, poussière ocre ; Buck se couvre le casque ; son plus lourd pour la bûche-charge. |
| C | Champignon de fumée au-dessus de la grille. |
| D | Écran blanc plein cadre. |
| E | Explosion dessinée image par image (planche ImageGen). |

| Taille | Secousse | Éclats / étincelles / fumées | Son |
|---|---|---|---|
| Bâton 2×2 | 12 px | 36 / 48 / 10 | `blast` |
| Fagot 3×3 | 18 px | 54 / 72 / 15 | `blast` |
| Bûche-charge 4×4 | 24 px | 72 / 96 / 20 | `blastBig` |
| Maillon de chaîne | ×1,2 | idem taille | idem |

| | |
|---|---|
| **Pourquoi B** | Gradation lisible, primitives légères ; symboles et halos restent masqués dans la grille. |
| **Durée** | Flash 90 ms ; **attente bloquante 230 ms** ; anneau 0,44 s ; secousse 0,5 s ; éclats 0,7-1,1 s ; fumée 1-1,5 s. Turbo : 128 ms · 77 ms (particules non accélérées). |
| **Passer** | Flash, anneau, secousse à leur fin ; particules continuent. |
| **Mouvement réduit** | Pas de secousse ; flash, anneau et particules conservés. |
| **Code** | `BlastFx.explode` ; `Camera.shake` ; `Buck.react('duck')` |
| **Statut** | Implémenté. |

### M22 · Chaîne

| Piste | Idée |
|---|---|
| A | Toutes les charges sautent en même temps. |
| **B — RETENUE** | La charge prise dans une zone : piquets autour de **sa** zone, **grimace de Buck**, **étincelle courte depuis la charge qui l'a prise** (ou le long du fil en super bonus), mèche plus longue, explosion **20 % plus forte**. Les charges prises restent visibles jusqu'à leur propre explosion. |
| C | Réaction en chaîne à 100 ms d'intervalle. |
| D | Ralenti « bullet time » sur le deuxième maillon. |
| E | Compteur de chaîne ×2, ×3. |

| | |
|---|---|
| **Pourquoi B** | La cause (`from`) se lit ; le rythme accélère (1,57 s pour le premier maillon, 0,89 s ensuite). |
| **Durée** | Étincelle 260 ms (360 ms reliée, arc 30 px) + mèche 400 ms + 230 ms = **0,89 s** (0,99 s reliée). Turbo : 0,49 / 0,55 s · 0,30 / 0,33 s. |
| **Passer / Réduit** | Comme M21. |
| **Code** | `presenter.blast` (lien > 0) ; `Buck.react('chainWince')` |
| **Statut** | Implémenté (fixtures de chaîne F31-F33). |

### M23 · Taille du géant (sculpture)

| Piste | Idée |
|---|---|
| A | Le géant apparaît en fondu. |
| **B — RETENUE** | La poussière retombe, les cases restantes du rectangle s'effritent, **le géant émerge** à 82 % puis gonfle à 108 % et se pose ; **trois coups de ciseau invisibles** (éclairs en étoile et éclats aux trois points) ; Buck désigne le géant d'un clin d'œil, puis lève le pouce. |
| C | Buck saute dans la zone et sculpte à la queue. |
| D | Le géant est dessiné trait par trait. |
| E | Le géant tombe du ciel. |

| | |
|---|---|
| **Pourquoi B** | Court, sans nouvel asset (maillet et ciseau écartés dans DECISIONS), le géant reste le héros. |
| **Durée** | **0,5 s** (turbo 0,28 s · 0,17 s) ; Buck ≈ 1,25 s + 1,25 s, non bloquant. `T.blast.carve` (520 ms) n'est pas utilisé. |
| **Passer** | Géant posé immédiatement. |
| **Mouvement réduit** | Identique. |
| **Code** | `presenter.carve` ; `BlastFx.carve` ; `GridView.addGiant` ; `SymbolView.makeArt` ; `Buck.react('carve' / 'proud')` |
| **Statut** | Implémenté. Rectangle non carré : le géant est dessiné sur le plus petit côté, centré. |

### M24 · Fissure / effritement

| Piste | Idée |
|---|---|
| A | Le géant disparaît d'un coup. |
| **B — RETENUE** | Un géant qui ne gagne pas **se fissure** (craquelures) et se sépare en symboles simples du même type ; un géant entièrement gagnant **s'effrite en gravats**. |
| C | Le géant se dégonfle. |
| D | Le géant se découpe en carreaux qui pivotent. |
| E | Le géant reste entier jusqu'au spin suivant. |

| | |
|---|---|
| **Pourquoi B** | Règle du CONCEPT § 4.6, lisible sans texte. |
| **Code réel** | Effritement : tassement, retrait, 14 éclats par case de côté. Séparation pendant une chute : fondu du géant (0,14 s) et apparition des cases (0,14 s + écrasement 0,24 s). **Fin de spin** (`setWin`, `freeSpinEnd`, nouveau spin) : séparation **instantanée**, son `crack` seul. |
| **Durée** | ≈ 0,3 s (chute ; turbo ÷1,8 / ÷3) ; 0 s (fin de spin). |
| **Passer / Réduit** | État final immédiat / identique. |
| **Code** | `GridView.crackGiant`, `crumbleGiant`, `crackAll` ; son dans `main.ts` |
| **Statut** | **Partiel** : **aucune craquelure dessinée** ; séparation de fin de spin invisible. |

### M25 · Multiplicateur Cornerstone (éclats, regravure, coup de queue)

| Piste | Idée |
|---|---|
| A | Compteur ×N dans le HUD. |
| **B — RETENUE** | Les **éclats de la zone sculptée volent en arc** jusqu'au bloc de granit ; à leur arrivée, **Buck frappe le bloc de la queue** et les chiffres sont **regravés** (gonflement puis retour élastique, bloc secoué) ; la **matière change** avec la valeur (granit, marbre ×25, cuivre ×100, or ×250, or en fusion ×1 000). |
| C | Buck grave chaque chiffre au burin. |
| D | Compteur mécanique à rouleaux. |
| E | Multiplicateur affiché au-dessus de chaque gain. |

| | |
|---|---|
| **Pourquoi B** | Cause visible, objet de mécanique dans la scène (CONCEPT § 5). |
| **Durée** | Vol des éclats **0,52-0,94 s** (non accéléré) ; coup de queue ≈ 0,7 s (non bloquant) ; **regravure 0,4 s** (turbo 0,22 s · 0,13 s) ; apparition du bloc ×1 : 0,35 s ; disparition 0,3 s. |
| **Passer** | Avant le vol : éclats supprimés ; pendant le vol : le vol va à son terme ; regravure immédiate. |
| **Mouvement réduit** | Identique. |
| **Code** | `presenter` (`updateGlobalMult`) ; `Cornerstone.collect`, `engrave`, `show`, `setValue` ; `Buck.react('thump')` ; `main.ts` → `stage.ui.setMultiplier`. Bloc de 110 à 270 px, **devant les jambes de Buck**, côté grille ; sans mascotte (`mini`), sous l'Ante. |
| **Statut** | **Partiel** : pas de défilement « ancienne → nouvelle valeur » (la valeur change au sommet du gonflement) ; matières rendues par **teintes** (×25, ×100) et une texture veinée d'or dès ×250 ; l'« or en fusion » (×1 000) n'est qu'une teinte. |

### M26 · Monument (Mount Buckmore)

| Piste | Idée |
|---|---|
| A | Montagne fixe. |
| **B — RETENUE** | En bonus, **la sculpture avance d'un cran** par palier de multiplicateur (4 états illustrés, fondu enchaîné), puis **revient à l'état de base** à la fin du bonus. |
| C | Des ouvriers ajoutent des échafaudages. |
| D | Le monument brille quand Buck le regarde. |
| E | La dent en or du monument flashe à chaque gain. |

| | |
|---|---|
| **Pourquoi B** | Progression lisible dans le décor, cosmétique, lue depuis la valeur du book. |
| **Durée** | Fondu 0,6 s (turbo 0,33 s · 0,2 s). Crans à **×4, ×7, ×10** (codés en dur dans `presenter`, pas dans la config). |
| **Passer / Réduit** | Fin immédiate / identique. |
| **Code** | `presenter` (`updateGlobalMult` → `setMonument`) ; `Decor.setMonument` ; `presenter.fsEnd` (retour à 0) |
| **Statut** | Implémenté. La dent en or qui flashe (palier ×1 000 du CONCEPT § 8) est absente. |

---

## 7. Fiches — bonus

### M27 · Déclenchement de bonus

| Piste | Idée |
|---|---|
| A | Bannière « BONUS » sur la grille. |
| **B — RETENUE** | Les Scatters réagissent ensemble, **Buck acclame**, puis **un détonateur à piston tombe devant lui** : il empoigne la barre en T, prend son élan et **enfonce le piston** ; les Scatters sautent (petites explosions), la caméra tremble, **la nuit tombe dans le souffle**. |
| C | Les Scatters s'envolent vers le logo. |
| D | Coucher de soleil accéléré, sans geste de Buck. |
| E | Un fil rouge relie les Scatters au détonateur de Buck (voir § 9). |

| | |
|---|---|
| **Pourquoi B** | Le Scatter **est** un détonateur à piston : Buck « déclenche » le bonus de ses mains ; transition thématique vers la nuit. |
| **Durée** | Acclamation **0,8 s** + piston **0,85 s** + souffle **0,9 s** = **2,55 s** avant l'écran d'intro (turbo 1,42 s · 0,85 s). Le détonateur s'enfonce dans le sol ≈ 0,65 s après le coup (0,3 s). |
| **Passer** | Attentes et secousse passées ; gestes de Buck en cours. |
| **Mouvement réduit** | Pas de secousse (16 px, 0,55 s) ; flashs conservés. |
| **Code** | `presenter.fsTrigger` ; `Buck.perform('triggerCheer' / 'plunger')` ; `BlastFx.explode` ; `Decor.setAmbience` |
| **Statut** | Implémenté (captures `trig3-*`). Écart : **les Scatters restent invisibles** (cases vides) jusqu'au premier free spin, car `explode` met leur opacité à 0 (capture `trig3-1440x900-08`) ; le CONCEPT dit « jamais détruit par une explosion ». Sans les accessoires du détonateur, Buck acclame une seconde fois. |

### M28 · Transition vers la nuit

| Piste | Idée |
|---|---|
| A | Coupe franche. |
| **B — RETENUE** | Même vallée : **le ciel de nuit (aurore peinte) se fond sur l'heure dorée**, le paysage s'assombrit et bleuit, **les tours de projecteurs apparaissent** et leurs faisceaux orange balaient la montagne. FLOODLIGHT SHIFT : teinte violette, faisceaux dorés, saturation plus forte. Musique et nappes changent d'humeur. |
| C | Rideau de fumée qui masque le changement. |
| D | Soleil qui se couche en direct derrière la montagne. |
| E | La lampe frontale de Buck s'allume et révèle la nuit. |

| | |
|---|---|
| **Pourquoi B** | D3 comme ambiance de bonus (ART-DIRECTION) ; la grille ne change pas. |
| **Durée** | **0,9 s** à l'entrée (turbo 0,5 s · 0,3 s) ; tours 0,72 s ; retour au jour **1,2 s**. Luminosité −42 %. |
| **Passer / Réduit** | État final / identique (fondu). |
| **Code** | `Decor.setAmbience`, `applyGrade`, `drawBeams` ; `main.ts` → `setSoundMood` |
| **Statut** | **Partiel** : l'aurore est fixe (image) ; elle ne vire pas à l'or avec la valeur du multiplicateur (le doré dépend seulement du mode super). |

### M29 · Intro bonus

| Piste | Idée |
|---|---|
| A | Écran opaque plein cadre. |
| **B — RETENUE** | **Panneau illustré** (planche, lanternes, trois détonateurs) sur voile léger, la slot reste visible : nom du bonus, nombre de free spins, règle clé, « Touchez n'importe où » ; entrée en rebond. Puis le **Cornerstone ×1** apparaît. |
| C | Buck présente le bonus dans une bulle. |
| D | Titre gravé dans la montagne. |
| E | Intro qui se ferme seule après 3 s. |

| | |
|---|---|
| **Pourquoi B** | Règle clé lisible, pas de bouton « Continuer », décor de nuit visible derrière. |
| **Durée** | Entrée **0,47 s** (turbo 0,26 s · 0,16 s) ; **attente d'un toucher** (armée à 350 ms) ; sortie 0,22 s ; Cornerstone 0,35 s. |
| **Passer** | **Jamais fermée automatiquement** : un toucher est demandé même en skip, en turbo ou en autoplay. |
| **Mouvement réduit** | Identique (sauf clignotement de l'indice, préférence système). |
| **Code** | `presenter.fsTrigger` → `main.ts` → `stage.ui.bonusIntro` → `Overlays.dialog('intro')` |
| **Statut** | Implémenté. L'autoplay s'arrête ici jusqu'au toucher. |

### M30 · Compteur de free spins

| Piste | Idée |
|---|---|
| A | Texte dans le HUD. |
| **B — RETENUE** | **Planche de bois au-dessus de la grille** : « Spins restants : N », décrémentée au début de chaque tour ; la valeur saute quand un « +N » arrive. |
| C | Tas de bâtons de dynamite qui diminue. |
| D | Encoches gravées sur le Cornerstone. |
| E | Horloge de chantier. |

| | |
|---|---|
| **Pourquoi B** | Lisible, au-dessus de la grille, commun à toutes les dispositions. |
| **Durée** | Pause **260 ms** par tour (turbo 144 ms · 87 ms) ; saut 420 ms (CSS). |
| **Passer** | Pause passée ; la valeur est déjà à jour. |
| **Mouvement réduit** | Saut CSS coupé (préférence système seulement). |
| **Code** | `presenter` (`updateFreeSpin`) ; `Overlays.setFs` ; `.ovl-fs.bump` |
| **Statut** | Implémenté (`aria-live="polite"`). |

### M31 · +N FS (relance)

| Piste | Idée |
|---|---|
| A | Le compteur change seul. |
| **B — RETENUE** | Buck acclame ; **« +N FS » jaillit au centre** en rebond, tient un instant puis **file en rétrécissant vers le compteur**, qui saute. |
| C | Bâtons de dynamite lancés sur la planche. |
| D | Les Scatters crachent des jetons vers le compteur. |
| E | Bannière pleine largeur. |

| | |
|---|---|
| **Pourquoi B** | Le gain de tours a une cause et une destination visibles. |
| **Durée** | Acclamation 0,5 s + bannière 1,42 s = **1,92 s** (turbo 1,07 s · 0,64 s). `T.fs.plusBanner` (1 100 ms) n'est pas utilisé. |
| **Passer** | Bannière à sa fin (déjà dans le compteur) ; l'acclamation de Buck continue. |
| **Mouvement réduit** | Identique (seul le saut CSS du compteur est coupé, préférence système). |
| **Code** | `presenter` (`freeSpinRetrigger`) ; `Buck.perform('cheer')` ; `Overlays.plusFs` |
| **Statut** | Implémenté (`aria-live="assertive"`). |

### M32 · Fin de bonus

| Piste | Idée |
|---|---|
| A | Retour direct avec le montant dans le HUD. |
| **B — RETENUE** | Panneau **« GAIN TOTAL »** illustré avec le montant, fermé d'un toucher ; puis le compteur disparaît, **le Cornerstone s'efface**, la sculpture revient à l'état de base, **retour à l'heure dorée**. |
| C | Comptage animé du total avec paliers. |
| D | Buck compte les billets. |
| E | Feu d'artifice systématique. |

| | |
|---|---|
| **Pourquoi B** | Sobre et exact ; les paliers sont déjà célébrés spin par spin. |
| **Durée** | Entrée 0,47 s + toucher + sortie 0,22 s ; Cornerstone 0,3 s ; retour au jour **1,2 s** (turbo 0,67 s · 0,4 s). |
| **Passer** | Toucher obligatoire, comme M29. |
| **Mouvement réduit** | Identique (fondus). |
| **Code** | `presenter.fsEnd` ; `Overlays.dialog('outro')` ; `Decor.setAmbience`, `setMonument` |
| **Statut** | Implémenté. Aucun comptage ni palier sur le total du bonus (seuls les `setWin` de chaque tour déclenchent une célébration). |

---

## 8. Fiches — célébrations et fin de manche

### M33 · Célébrations par palier

| Piste | Idée |
|---|---|
| A | Bannière et compteur, sans scène. |
| **B — RETENUE « Le filon crève »** | Le décor s'assombrit, grille et Buck restent éclairés ; **deux geysers de pépites d'or** jaillissent des coins bas de la grille ; **bannière de chantier** (bâtons de dynamite) avec le nom du palier et un **compteur lent qui accélère avant chaque palier** ; chaque palier franchi = **une nouvelle détonation** au cœur de la grille (éclair, poussière, roches, étincelles, pépites, secousse), logo qui sursaute, **Buck qui monte d'un cran** (poings, danse dès ×100, pose de vanité dès ×1 000) ; pluie d'or dès ×100. |
| C | Une scène par palier (CONCEPT § 8) : allumette qui s'embrase ×10, champignon et oiseaux ×25, vannes du barrage ×100, éboulement ×500, dent du monument ×1 000. |
| D | Plein écran avec pièces en 3D. |
| E | Buck danse seul devant un rideau. |

| Palier (config) | Titre (anglais dans toutes les langues : jeux de mots) | Compteur (non accéléré) |
|---|---|---|
| ×10 | FIRE IN THE HOLE! | 2,2 s |
| ×25 | KA-BOOM! | 3,95 s |
| ×100 | DAM GOOD! | 5,7 s |
| ×500 | ROCKSLIDE! | 7,45 s |
| ×1 000 | MOUNT BUCKMORE! | 9,2 s |

| | |
|---|---|
| **Pourquoi B** | Une seule grammaire lisible et escaladable, faisable avec les sprites ImageGen existants (`celebration.ts`). |
| **Durée** | Compteur ci-dessus (2,2 s puis 0,25 s + 1,5 s par palier) + **maintien 1,6 s** (turbo 0,89 s · 0,53 s) + sortie 0,25 s. Détonation : éclair 0,45 s, secousse 0,35-0,59 s. |
| **Passer** | **1er toucher : état final exact** (montant, palier) ; 2e toucher : fermeture. Sans toucher : fermeture après le maintien. |
| **Mouvement réduit** | Éclair 0,15 au lieu de 0,55, pas de secousse, geysers à 8/s (au lieu de 30-86/s) ; animations CSS du titre coupées (préférence système seulement). |
| **Code** | `presenter.setWin` ; `main.ts` → `celebrate` ; `Overlays.celebrate` ; `CelebrationFx.onStart`, `onTier`, `detonate`, `tick`, `onEnd` ; `Buck.celebrate` ; `Logo.thump` |
| **Statut** | **Partiel** : B est implémentée, mais **le turbo n'accélère pas le compteur** ; `T.celebration.countBase` / `perTier` (2 600 / 1 600 ms) **ne sont pas lus** (2,2 s / 1,5 s en dur) ; **le HUD affiche déjà le gain final pendant le comptage** (capture `f23-1440x900-08` : 18,78 € à l'écran, 105,00 € dans le HUD). |

### M34 · MAX WIN

| Piste | Idée |
|---|---|
| A | La même célébration que ×1 000. |
| **B — RETENUE** | **BLOWN SKY-HIGH!** : le sommet du Mount Buckmore **explose en feu d'artifice de granit** et révèle un **visage doré qui cligne de l'œil** ; seulement sur l'événement `wincap`. |
| C | Écran figé « MAX WIN » en chiffres d'or. |
| D | Buck plante un drapeau au sommet. |
| E | Toute la grille se change en or. |

| | |
|---|---|
| **Pourquoi B** | Événement unique, lié au monument, lisible sans texte. |
| **Code réel** | Célébration « filon » jusqu'au dernier palier ; titre final **BLOWN SKY-HIGH!** ; dernier segment du compteur **+2,5 s** ; fanfare `maxWin` ; maintien **3,2 s**. Puis le lecteur s'arrête : `finalWin` est appliqué sans présentation. |
| **Durée** | Compteur ≈ **11,7 s** + maintien 3,2 s (turbo 1,78 s · 1,07 s) + 0,25 s. |
| **Passer** | Comme M33. |
| **Mouvement réduit** | Comme M33. |
| **Code** | `presenter` (`wincap`) ; `Overlays.celebrate(…, maxWin)` ; `RoundPlayer.play` (arrêt) ; `main.ts` (`celebMax`) |
| **Statut** | **Partiel** : **le sommet qui explose et le visage doré ne sont pas implémentés** ; `Buck.celebrate` plafonne au palier 4 (le commentaire « 5 : MAX WIN » n'est jamais utilisé). |

### M35 · Retour au jeu de base

| Piste | Idée |
|---|---|
| A | Rien. |
| **B — RETENUE** | Retour sobre : gain final dans le HUD, **SPIN redevient disponible**, commandes déverrouillées ; en autoplay, spin suivant après une courte pause. |
| C | Buck range son allumette derrière l'oreille. |
| D | Petit panneau « PRÊT ». |
| E | Coup de balai de poussière sur la grille. |

| | |
|---|---|
| **Pourquoi B** | Rythme : le joueur relance tout de suite. |
| **Durée** | Immédiat après la clôture serveur (`end-round`) ; autoplay **220 ms** (turbo 122 ms · 73 ms), via `window.setTimeout` (hors horloge). |
| **Passer / Réduit** | Sans objet / identique. |
| **Code** | `GameController.finishRound` ; `Hud.setPhase('idle')` |
| **Statut** | Implémenté. |

---

## 9. Fiches — interface

### M36 · Ante (DOUBLE FUSE)

| Piste | Idée |
|---|---|
| A | Case à cocher dans le menu. |
| **B — RETENUE** | **Grand interrupteur bois/acier sous le logo** (« MISE ANTE », « CHANCE DE BONUS ×3 », « PROCHAIN SPIN 1,50 € ») ; ON : **la lampe frontale de Buck passe au rouge** ; la mise affichée devient le coût réel. |
| C | Une deuxième mèche s'allume sur le logo. |
| D | Buck enfile un second casque. |
| E | La grille se cercle de rouge. |

| | |
|---|---|
| **Pourquoi B** | Facteur et coût réels visibles ; basculer n'est pas un achat (aucune animation de débit). |
| **Durée** | Bascule 120 ms (CSS) ; lampe instantanée. |
| **Turbo / Passer** | Sans objet (hors manche). |
| **Mouvement réduit** | Transitions coupées (réglage du jeu et préférence système). |
| **Code** | `src/ui/ante.ts` → `AntePanel` ; `main.ts` → `syncAnte` ; `Buck.setAnte` |
| **Statut** | Implémenté. Encart masqué pendant les free spins et en relecture. Le nom « DOUBLE FUSE » n'apparaît nulle part à l'écran (« MISE ANTE » / « ANTE BET ») ; lampe sans clignotement. |

### M37 · Achat (BUY BONUS)

| Piste | Idée |
|---|---|
| A | Liste de boutons. |
| **B — RETENUE** | **Enseigne suspendue qui descend du haut et se balance** ; cartes illustrées avec les vrais symboles ; confirmation au devis figé ; l'enseigne remonte (annulation) ou s'efface (achat accepté). |
| C | Caisse de chantier qui s'ouvre. |
| D | Buck tend un contrat à signer. |
| E | Page plein écran. |

| | |
|---|---|
| **Pourquoi B** | Objet du décor, rapide, la slot reste visible. |
| **Durée** | Ouverture 0,3-0,35 s (voile 0,2 s) ; confirmation 150 ms ; fermeture 0,24 s (annulation) / 0,16 s (achat). |
| **Turbo / Passer** | Sans effet / non passable (fermeture immédiate par X, Échap ou voile). |
| **Mouvement réduit** | Fondus 0,18 s / 0,16 s ; confirmation sans animation. |
| **Code** | `src/ui/buy.ts` → `BuyMenu.open`, `shut`, `showConfirm` |
| **Statut** | Implémenté. |

### M38 · Menus

| Piste | Idée |
|---|---|
| A | Page séparée. |
| **B — RETENUE** | Panneau à onglets arrondis sur voile léger, **ouverture instantanée**, la slot reste visible. |
| C | Carnet de chantier qui s'ouvre. |
| D | Panneau qui glisse depuis le côté. |
| E | Plans roulés que la loutre déroule. |

| | |
|---|---|
| **Pourquoi B** | Lecture immédiate des règles et réglages ; aucun délai. |
| **Durée** | Instantané ; pression des boutons 80-90 ms (CSS). |
| **Turbo / Passer / Réduit** | Sans objet. |
| **Code** | `src/ui/menu.ts` → `GameMenu.open`, `close` |
| **Statut** | Implémenté. |

### M39 · Erreurs et attente

| Piste | Idée |
|---|---|
| A | `alert()` du navigateur. |
| **B — RETENUE** | **Dialogues techniques sobres**, jamais cinématiques : panneau centré dans la zone de jeu, fondu court, icône qui tourne pour l'attente et la connexion, **solde qui clignote** en cas de solde insuffisant. |
| C | Buck se gratte la tête. |
| D | Panneau « CHANTIER FERMÉ ». |
| E | Message discret en bas d'écran. |

| | |
|---|---|
| **Pourquoi B** | Une erreur n'est pas un spectacle ; texte clair et actions exactes. |
| **Durée** | Fondu 140 ms ; indicateur d'attente après 250 ms (bloquant) ou 1,5 s (requête lente, non bloquant) ; clignotement du solde 3 × 0,9 s. |
| **Turbo / Passer** | Sans effet / fermeture par les boutons (ou Échap si fermable). |
| **Mouvement réduit** | Fondu et clignotement coupés ; icônes tournantes remplacées par une pulsation lente. |
| **Code** | `src/ui/dialogs.ts` → `Dialogs.render`, `waiting`, `showError` ; `dialogs.css` |
| **Statut** | Implémenté. |

### M40 · Reprise d'une manche

| Piste | Idée |
|---|---|
| A | Rejouer toute la manche depuis le début. |
| **B — RETENUE** | Dialogue **« Manche en cours »**, puis **la scène est remise directement** dans l'état enregistré (grille, nuit, compteur, Cornerstone, gain) et la présentation reprend à l'événement suivant. |
| C | Avance rapide visible jusqu'au point de reprise. |
| D | Résumé textuel sans animation. |
| E | Reprise silencieuse, sans dialogue. |

| | |
|---|---|
| **Pourquoi B** | Exact, sans nouveau débit, sans rejouer ce qui a déjà été vu. |
| **Durée** | Restauration instantanée ; la suite de la manche garde ses durées normales. |
| **Turbo / Passer / Réduit** | La suite suit le turbo, le skip et le réglage comme une manche normale. |
| **Code** | `main.ts` (`session.resume`) ; `Dialogs.resume` ; `GameController.resumeRound` ; `RoundPlayer.play(startAt)` ; `GamePresenter.restore` |
| **Statut** | **Partiel** : `restore()` ne remet pas le **monument** au bon cran ; à ×1, le **Cornerstone n'est pas affiché** (`globalMult > 1` exigé). |

### M41 · Relecture

| Piste | Idée |
|---|---|
| A | Vidéo pré-enregistrée. |
| **B — RETENUE** | La manche relue est **rejouée avec la mise en scène normale** ; badge **« RELECTURE »** sur la planche du haut ; HUD sans solde, sans mise modifiable ni achat ; SPIN relance la relecture. |
| C | Accéléré ×2 automatique. |
| D | Pas-à-pas événement par événement. |
| E | Filtre sépia « archives ». |

| | |
|---|---|
| **Pourquoi B** | Fidèle au jeu réel, aucun code de présentation dupliqué. |
| **Durée** | Celle de la manche. |
| **Turbo** | Appliqué (vitesse courante transmise au lecteur). |
| **Passer** | **Impossible** (voir statut) ; seuls les panneaux et célébrations se ferment au toucher. |
| **Mouvement réduit** | Comme en jeu. |
| **Code** | `main.ts` (`replayMode`, `overlays.setBanner`) ; `GameController.replayRound` ; `.hud.is-replay` ; historique : `GameMenu` → « REVOIR » |
| **Statut** | **Partiel** : **impossible de passer** pendant une relecture (état `replay` hors `inRound`, SPIN verrouillé) ; si la manche contient un bonus, **le compteur remplace le badge puis le masque** ; la relecture depuis l'historique n'a **pas de badge**. |

### M42 · Mouvement réduit

| Piste | Idée |
|---|---|
| A | Aucun traitement. |
| **B — RETENUE** | Un réglage (par défaut : préférence système) coupe **ce qui bouge la caméra ou clignote** : zoom, secousses, respiration et sursaut du logo, éclair atténué, geysers ralentis, fondus au lieu des glissements. La mécanique reste lisible. |
| C | Tout remplacer par des fondus. |
| D | Couper aussi toutes les boucles de repos. |
| E | Mode image fixe avec textes. |

| | |
|---|---|
| **Pourquoi B** | Confort vestibulaire sans perdre la lecture de BLAST & CARVE. |
| **Durée** | Aucune durée modifiée : les éléments coupés disparaissent, le reste garde ses temps. |
| **Turbo / Passer** | Cumulables avec le réglage. |
| **Code** | `main.ts` → `onReducedMotion` ; `Camera`, `Logo`, `CelebrationFx`, `presenter`, `BuyMenu` ; CSS `data-motion` |
| **Statut** | **Partiel** : voir § 0.3 (Buck, décor, symboles, accueil, entrées de panneaux, trois feuilles CSS ignorent le réglage). |

### M43 · Turbo

| Piste | Idée |
|---|---|
| A | Un seul niveau. |
| **B — RETENUE** | **Trois niveaux** (NON ×1, TURBO ×1,8, ULTRA ×3) : attentes et animations du Beat divisées ; **la séquence reste la même**, rien n'est supprimé. |
| C | Turbo = suppression des animations secondaires. |
| D | Turbo = saut direct au résultat. |
| E | Turbo qui augmente avec la durée de session. |

| | |
|---|---|
| **Pourquoi B** | Même histoire, plus vite ; exactitude garantie par le Beat. |
| **Durée** | Attentes ÷1,8 ou ÷3 (valeurs par moment dans chaque fiche). |
| **Passer / Réduit** | Cumulables avec le turbo. |
| **Code** | `GameController.speed` ; `Beat.wait/play/fire` ; `RoundPlayer.setSpeed` ; `GameMenu.cycleTurbo` ; `Hud.setTurbo` |
| **Statut** | **Partiel** : voir § 0.1 (départ des rouleaux, gestes de Buck, réactions, particules, éclats, compteur des célébrations non accélérés). Juridiction : bouton masqué (`disabledTurbo`) ou ULTRA sauté (`disabledSuperTurbo`). |

---

## 10. Écarts principaux (intention → code)

| # | Écart | Moments |
|---|---|---|
| 1 | Au-delà de 3 connexions, **une seule** est présentée | M16 |
| 2 | Le turbo n'accélère ni les gestes de Buck (désynchronisation de l'étincelle) ni le compteur des célébrations | M19, M33, M43 |
| 3 | MAX WIN sans le sommet qui explose ni le visage doré | M34 |
| 4 | Les Scatters disparaissent après le déclenchement jusqu'au premier free spin | M27 |
| 5 | Mouvement réduit ignoré par Buck, le décor, les symboles, l'accueil ; CSS de 3 feuilles sur la préférence système seulement | M42 |
| 6 | Pas de craquelures ; séparation instantanée en fin de spin | M24 |
| 7 | Le HUD affiche le gain final avant la fin du comptage | M33 |
| 8 | Relecture non passable ; badge écrasé par le compteur de bonus | M41 |
| 9 | Reprise : monument et Cornerstone ×1 non restaurés | M40 |
| 10 | Réglages `T` non lus : `T.win.between`, `T.blast.carve`, `T.fs.plusBanner`, `T.celebration.*`, `T.button.feedback`, `T.particles` | M16, M23, M31, M33 |
| 11 | Scènes propres à chaque palier (CONCEPT § 8) non réalisées ; explosion lointaine sans image | M33, M05 |

---

## 11. Prototypes des moments clés

Les captures sont réelles (build QA, horloge virtuelle, `tools/shot.mjs`, 1440 × 900, `lang=fr`).

**`?variant=` est branché** (builds de dev et QA seulement, jamais en production) : `Stage.variant` ← `params.dev.variant`. Deux pistes alternatives sont **prototypées** :

- `?variant=blast-throw` — **Allumette lancée** : Buck frotte l'allumette puis la lance d'une pichenette ; l'étincelle part en cloche (560 ms, arc 260 px) jusqu'à la mèche. Le bras ne vise plus la charge.
- `?variant=trigger-wire` — **Fil jusqu'aux Scatters** : au déclenchement du bonus, un fil rouge court du détonateur à chaque Scatter ; au coup de piston, l'étincelle parcourt le fil et chaque Scatter claque sa poignée, sans explosion.

Captures comparatives : `captures/qa/var-*`. **Pistes retenues inchangées** (étincelle tendue ; détonateur + souffle sur les Scatters, qui restent affichés). Les deux autres pistes (`celeb-dam`, `welcome-fence`) restent décrites, non prototypées.

| Moment | Captures | Ce qu'elles montrent | Piste alternative la plus sérieuse (`?variant=`) |
|---|---|---|---|
| **Explosion d'un fagot** (F10, jeu de base, ×13,5) | `f10-1440x900-00` … `06` | piquets et cordeau 3×3, Buck qui vise (sa main **entre dans la grille**, image 03), explosion, géant, célébration ×10 | **`?variant=blast-throw` — « Allumette lancée »** : Buck frotte l'allumette puis **la lance d'une pichenette** ; elle tournoie en arc jusqu'à la mèche. Même durée, bras hors de la grille, le geste ne dépend plus de la position de la charge. |
| **Gros gain** (F23, ×105, DAM GOOD!) | `f23-1440x900-00` … `08` | chutes, géant du fagot, bannière et compteur en cours (18,78 €), geysers de pépites, Buck qui pompe | **`?variant=celeb-dam` — « Les vannes cèdent »** : au passage de ×100, les vannes du barrage s'ouvrent, la chute d'eau double, des rondins dévalent au premier plan (idée du CONCEPT § 8, décor `mid` et `fg` existants). |
| **Déclenchement du bonus avec détonateur** (bonus SUNDOWN SHIFT acheté, 100 × la mise) | `trig3-1440x900-00` … `09` (itérations `trig-*`, `trig2-*`) | acclamation (04), détonateur et piston (06), Scatters soufflés et **cases vides** (08), nuit et panneau d'intro (09) | **`?variant=trigger-wire` — « Fil jusqu'aux Scatters »** : le fil rouge (`showWire`) court du détonateur de Buck à chaque Scatter ; au coup de piston, l'étincelle parcourt le fil et **chaque Scatter claque sa poignée** (réaction existante) au lieu d'exploser. Les Scatters restent visibles (règle « jamais détruit »). |
| **Accueil** | **aucune capture dans `captures/qa/`** au 28/09 | — (visible en dev avec `?welcome`) | **`?variant=welcome-fence` — « Palissade »** : les trois cartes sont des affiches clouées sur une palissade devant la grille ; au toucher, **Buck les arrache d'un coup de queue** (geste `introSwipe` existant). Accueil diégétique, même durée. |

Capture d'accueil à produire : `tools/shot.mjs` avec `--query=welcome&lang=fr` (le paramètre `welcome` force l'accueil malgré `?qa`).


## 12. Corrections apportées après l'inventaire (28/09, fin de journée)

| Écart relevé | Correction |
|---|---|
| Au-delà de 3 connexions, une seule présentée | Les **3 plus fortes** sont présentées une à une (plus fortes d'abord), puis le total |
| Le HUD montrait le montant final pendant le comptage d'une célébration | Le gain du HUD est **vidé** au début de la célébration ; il revient à la fin (le compteur fait foi) |
| Scatters soufflés laissant des cases vides au déclenchement | Explosion **sans destruction** (`keepSymbols`) : les Scatters restent affichés |
| Main de Buck qui entre dans la grille en visant | Allonge limitée à 66 % du bras (`reach`) pour viser, désigner, balayer |
| Mouvement réduit ignoré par Buck, le décor, l'accueil, 3 feuilles CSS | Buck sans gestes d'attente ni respiration ; décor sans vols d'oies, nuages ralentis ; accueil sans animation ; CSS suit aussi `:root[data-motion='reduced']` |
| Relecture impossible à passer ; badge écrasé par le compteur | Clic sur la grille passe aussi en relecture ; le compteur affiche « RELECTURE · Spins restants » |
| Reprise sans Cornerstone ×1 ni étape du monument | `restore()` rétablit le Cornerstone (×1 compris) et l'étape du Mount Buckmore |
| `?variant=` branché à rien | Deux prototypes branchés (§ 11) |

Reste tel quel (choix assumé) : en turbo, l'anticipation est raccourcie (1,03 s / 0,62 s) — le joueur a demandé la vitesse ; la cible 1,6-2,2 s vaut pour la vitesse normale (1,85 s).
