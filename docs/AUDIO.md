# BOOMTOOTH — Audio

Identité sonore, liste des sons, provenance, mixage et limites de vérification.
Code : `src/audio/engine.ts` (bus, activation, suspension, ducking, limiteur), `src/audio/music.ts`,
`src/audio/ambience.ts`, `src/audio/sfx.ts`. Tests : `tests/audio-*.test.ts`.

## 1. Identité sonore

Un camp de bûcherons du Grand Nord qui dynamite une montagne pour sculpter le monument d'un castor vaniteux.
Le son raconte la même chose que l'image : **bois, acier, mèche, granit**, et une musique folk de chantier
qui bascule dans la nuit quand les projecteurs s'allument.

- **Instruments signatures** : banjo en « rolls » (corde de bourdon en sol aigu, comme l'accord ouvert en sol),
  contrebasse pincée, pied qui tape sur une planche, wood-blocks accordés (ré et sol), shaker, sifflet de chantier
  et harmonica. En bonus : nappes chaudes, cordes étouffées, balais. En super bonus : taikos graves, cuivres, basse
  poussée.
- **Une seule tonalité** pour tout le jeu : sol majeur / mi mineur (même armure). Les gains, fanfares et tintements
  des effets sont accordés dans cette tonalité (pentatonique de sol), donc toujours consonants avec la musique.
- **Humour** : les sons restent mats et « bande dessinée » (clac du détonateur, bonk du bois, pff de la mèche
  qui s'éteint), jamais agressifs. Aucune voix, aucun texte parlé.

## 2. Musique procédurale (`music.ts`)

| Humeur | Moment | Tempo | Harmonie | Instrumentation |
|---|---|---|---|---|
| `base` | jeu de base, heure dorée | 104 BPM, léger shuffle | sol majeur : G C G D / G Em C D, pont Em C G D | banjo (rolls en croches), contrebasse (fondamentale/quinte, marches vers l'accord suivant), guitare étouffée sur 2 et 4, pied, wood-blocks, shaker, sifflet ou harmonica |
| `bonus` | SUNDOWN SHIFT, crépuscule | 92 BPM | mi mineur : Em Cmaj7 G Dsus4… | nappes (neuvièmes ajoutées), cordes étouffées en arpège, basse ronde, balais, toms feutrés ; beaucoup d'espace pour la tension |
| `super` | FLOODLIGHT SHIFT, nuit sous projecteurs | 112 BPM, droit | mi mineur avec sensible : Em C D Em / C D B7 Em | basse en croches (octaves), taikos, claquettes, shaker en doubles-croches, coups de cuivres, banjo en doubles-croches en fond |

**Forme** : sections A (thème), B (contraste), C (break) de 4 ou 8 mesures, enchaînées par un tirage pondéré
(jamais trois fois la même section de suite). La dernière mesure de chaque section est un **break** (roulement
de wood-blocks ou de taikos, descente de banjo, marche de basse). Chaque section tire ses variations (roll
principal et secondaire, notes fantômes, motif d'arpège, phrase soliste appel/réponse, instrument soliste).
Le compositeur est déterministe (graine) ; un test vérifie qu'aucune suite de **8 mesures** ne se répète sur
480 mesures, pour chaque humeur : la musique ne boucle jamais à l'identique sur plus de 16 mesures.

**Ordonnancement** : horloge de l'AudioContext, planificateur « lookahead » (`setInterval` 25 ms, 0,12 s
d'avance). Aucune note n'utilise `setTimeout`. Les temps sont calculés par multiplication depuis une ancre
(aucune dérive). Si le fil principal a pris plus de 0,25 s de retard, la piste saute à la mesure suivante au
lieu de rejouer toutes les notes d'un coup.

**Changements d'humeur** : fondu enchaîné d'égale puissance de **2 s**, calé sur le prochain temps de la piste
en cours. Chaque humeur garde son compositeur : revenir au jeu de base reprend la forme là où elle en était,
sur une nouvelle section A. Un aller-retour rapide (ou une relance pendant un arrêt en fondu) ramène la piste
encore en fondu au lieu d'en créer une seconde : deux pistes ne tirent jamais leurs mesures du même
compositeur. Un fondu demandé pendant un autre fondu repart de la valeur courante (pas de saut de niveau).

**Couche de tension** (anticipation, `music.setTension(on)`, aussi exposée par `tension()` de `sfx.ts`) :
le groove est filtré (passe-bas qui descend à 850 Hz), un bourdon de dents de scie (tonique, quinte, octave)
monte de deux demi-tons en 4,5 s derrière un filtre qui s'ouvre, et une pulsation de mèche (tic en croches,
battement sourd sur les temps) suit exactement le tempo de l'humeur en cours. Sortie sur le bus effets
(retour de jeu important même si la musique est baissée).

**API** (aucun appel ne lève d'exception : un incident audio est signalé une fois en console et le jeu continue)

```ts
music.start(mood?)          // attend l'activation audio si nécessaire ; déjà lancée : équivaut à setMood(mood)
music.setMood('base' | 'bonus' | 'super')
music.setTension(on)        // fonctionne aussi sans musique lancée ; jamais deux couches superposées
music.pause(p)              // pause musicale du jeu ; l'onglet masqué est géré par la suspension du moteur
music.stop(fadeMs = 1200)
```

Ne pas mettre la musique en pause à l'ouverture du menu : le joueur y règle les volumes et doit l'entendre.

## 3. Ambiances (`ambience.ts`, bus ambience)

| Humeur | Lit continu | Événements aléatoires planifiés |
|---|---|---|
| `base` | rivière et chute d'eau (grondement de bruit brun + chuintement rose, modulations lentes, stéréo décorrélée), vent léger en rafales | chants d'oiseaux (4 « espèces » : deux sifflets de mésange, trille de paruline, bruant, roulades de grive), réponses d'un second oiseau, tambourinage lointain d'un pic (22-55 s) |
| `bonus` | rivière lointaine, vent grave, insectes de nuit, grillons (3, porteuses sinus en impulsions, silences aléatoires) | hululement de chouette, plainte du huard (plongeon) sur le lac (25-60 s) |
| `super` | idem nuit + **groupe électrogène** lointain (ronflement 58 Hz, battement du moteur, légère dérive de régime) et grésillement des projecteurs | hululement |

Événements rares ponctuels (décor) : `ambience.event('distantBlast' | 'birds' | 'woodpecker' | 'sparks' | 'loon' | 'owl', dir?)`.
`distantBlast` : boum grave filtré, écho sur la montagne à 0,55 s, grondement, petits débris. `birds` accompagne
le **vol d'oies en V** du décor : 7 à 12 cris nasillards « ha-onk » de 3 à 5 individus (dent de scie, formant
vers 1,1 kHz, montée puis chute de hauteur), sur ~3 s, qui entrent du côté d'où vient le vol et traversent la
stéréo dans son sens (`dir` : 1 = vers la droite, -1 = vers la gauche). Crête -27 dBFS, soit ~4,5 dB au-dessus
du lit de rivière dans leur bande : audibles sans couvrir le jeu. Fondu de 2 s entre les lits.

API : `ambience.start(mood?)` (déjà lancées : équivaut à `setMood`), `setMood`, `event`, `pause`, `stop(fadeMs)` ;
aucun appel ne lève d'exception.

## 4. Effets (`sfx.ts`)

Tous les anciens noms fonctionnent toujours ; chaque répétition varie légèrement (`vary()` : hauteur ±3 %,
volume ±6 %, placement stéréo). Crête cible mesurée au maître, volumes par défaut.

| Nom | Rôle | Recette | Crête |
|---|---|---|---|
| `ui` | clic de bouton | tic de bois (triangle + clic filtré) | -22 dB |
| `toggle` | interrupteur (turbo, son, ante) | loquet d'acier : deux déclics, le second plus grave | -22 dB |
| `spinStart` | départ des rouleaux | cliquet en bois qui accélère, poulie, souffle | -18 dB |
| `reelStop` | arrêt d'un rouleau (panoramique par colonne) | bloc de bois frappé, mat | -16 dB |
| `scatter` | Scatter posé | clac de détonateur + cloche qui monte d'un degré pentatonique par Scatter (sol, la, si, ré, mi) | -12 dB |
| `anticipationLand` | l'anticipation paie | taiko, accord de cuivres, roulade de banjo, éclat | -8 dB |
| `anticipationMiss` | l'anticipation échoue | la mèche s'étouffe : grésillement, « pff », petite chute de hauteur | -18 dB |
| `win`, `winLow` | gain simple | trois notes de banjo pentatoniques | -14 / -15 dB |
| `winHigh` | gain d'un premium / WILD | roulade de banjo + sifflet | -12 dB |
| `match` | l'allumette sur la dent en or | grattement, « ting » doré, embrasement | -16 dB |
| `fuse` | mèche qui brûle | grésillement aigu + crépitements | -18 dB |
| `chain` | l'étincelle court d'une charge liée à l'autre | grésillement qui file d'un côté à l'autre de la stéréo, allumage | -16 dB |
| `blast` | explosion | claquement, corps, infra-basse, grondement, débris ; ducking court de la musique | -8 dB |
| `blastBig` | grosse charge | idem plus long, second infra, écho sur la montagne | -6 dB |
| `carve` | le géant est sculpté | coups de ciseau, pierre qui se cale, trois notes de banjo | -14 dB |
| `crack` | le géant se fissure en cases | crépitements de pierre, craquement | -15 dB |
| `tumble` | gravats qui retombent | grains de gravier, glissement | -19 dB |
| `collect` | éclats qui arrivent sur le Cornerstone | toc de pierre + tintement accordé | -20 dB |
| `thump` | Buck frappe le bloc de la queue | coup sourd + claque | -14 dB |
| `multUp` | nouvelle valeur du multiplicateur | coup, raclement, cloche accordée qui monte avec la valeur | -14 dB |
| `engrave` | les chiffres sont regravés | raclement de ciseau modulé, éclats métalliques | -18 dB |
| `plusFs` | tours supplémentaires | banjo + cloche | -13 dB |
| `trigger`, `retrigger` | déclenchement / relance du bonus | piston du détonateur, fanfare de cuivres, banjo, taikos | -6 / -7 dB |
| `bonusIntro` | entrée en bonus (coucher du soleil) | nappe qui gonfle, tambour, souffle, appel au sifflet | -8 dB |
| `bonusOutro` | fin du bonus | cadence ré → sol aux cuivres, banjo | -7 dB |
| `tier` | palier de célébration | accord de cuivres, roulement de taikos, cascade de banjo | -6 dB |
| `maxWin` | gain maximal | cadence do → ré → sol, taikos, montée de banjo, sifflet, boum | -3 dB |
| `countTick` | défilement du compteur | minuscule tic de bois | -26 dB |
| `coin` | pépite d'or | tintement à deux partiels | -22 dB |
| `whoosh` | transition | souffle filtré qui traverse la stéréo | -20 dB |
| `error` | erreur | double « bonk » en bois, doux | -20 dB |
| `buyOpen` | ouverture du panneau d'achat | panneau de bois qui pivote (grincement) et se cale | -18 dB |
| `buyConfirm` | achat confirmé | piston enfoncé, accord de banjo, étincelles | -13 dB |

Les fanfares (`trigger`, `retrigger`, `tier`, `maxWin`, `bonusIntro`, `bonusOutro`, `anticipationLand`) et les
explosions baissent la musique via `audio.duckMusic`.

## 5. Provenance

**100 % synthétisé dans le code, aucun son tiers, aucun fichier audio.** Techniques utilisées :

- cordes pincées (banjo, guitare, cordes étouffées, contrebasse) : **Karplus-Strong** calculé en JavaScript
  (bruit filtré, position d'attaque, ligne à retard moyennée, correction d'accord par `playbackRate`), une fois
  par note, puis joué depuis un tampon ;
- percussions (pied, wood-blocks, shaker, balais, taikos) et cuivres (trois dents de scie polyBLEP désaccordées,
  filtre passe-bas à enveloppe) : mêmes recettes que des graphes Web Audio, **rendues une fois en JavaScript**
  dans des tampons (trois variantes de bruit par percussion) ;
- nappes, sifflet (sinus, glissé d'attaque, vibrato, souffle filtré), harmonica (onde périodique à anches,
  trémolo), tension, tous les effets et toutes les ambiances : **oscillateurs et bruits filtrés Web Audio** en temps
  réel ;
- bruits blanc / rose (Paul Kellet) / brun générés par un générateur pseudo-aléatoire à graine, par tranches de
  32 768 échantillons pendant le temps libre du navigateur ; réverbération : réponse impulsionnelle synthétique
  du moteur (bruit à décroissance exponentielle).

## 6. Mixage

- **Bus** (moteur) : musique → ducking → maître ; ambiance → maître ; effets → maître ; maître → limiteur doux
  (-6 dB, ratio 12). Volumes par défaut : maître 0,8, musique 0,55, ambiance 0,6, effets 0,85 (courbe
  quadratique), mute global.
- **Réverbération** : chaque module a son propre retour de réverbération (même réponse impulsionnelle) **dans
  son bus** ; baisser un bus baisse aussi sa réverbération.
- **Musique** : groupes d'instruments avec égalisation, panoramique et envoi de réverbération propres à chaque
  humeur (plus d'espace au crépuscule). Chaque humeur a sa propre piste (gain de fondu, filtre de tension).
- **Cibles mesurées au maître** (volumes par défaut, rendu hors ligne) : musique base RMS -25,9 dBFS (crête
  -6,8), bonus -27,6 (crête -11,2), super -24,5 (crête -8,8) ; ambiances -33 à -35 dBFS RMS ; mix complet d'une
  manche (musique + ambiance + effets, explosion, palier, déclenchement, gain maximal) : crête -3,1 dBFS,
  **0 échantillon écrêté**. Étalonnage des effets : table `TRIM` de `sfx.ts`.
- **Coût du rendu audio** (rendu hors ligne Chromium, un cœur libre de ce conteneur) : musique base ≈ 4,5 % du
  temps réel, bonus et super ≈ 5,6 %, ambiance ≈ 4 %. Sur machine chargée, ces chiffres montent d'autant ; la
  revue a comparé l'ancien et le nouveau code sous la même charge : aucune différence. Mémoire des tampons
  pré-rendus : de l'ordre de 12 à 16 Mo au pire (cordes graves et cuivres à demi-fréquence d'échantillonnage).
- **Fil principal** : aucun calcul lourd dans le geste d'activation ni au moment d'un gros gain. Les
  réverbérations des modules (préparation de la convolution), les ~15 s de bruit des ambiances et les tampons
  des voix (percussions, cuivres du super bonus et des fanfares, banjo aigu) sont calculés un par un pendant le
  temps libre du navigateur (`whenIdle`, `prewarm` dans `music.ts`) ; le lit d'ambiance démarre dès que ses
  bruits sont prêts (moins d'une seconde). Mesures Chromium : `music.start` 10-23 ms → 1-2 ms, `ambience.start`
  60-100 ms → < 0,5 ms, premier gain maximal 110-170 ms → 2-3 ms. Restent ~30-90 ms dans `audio.unlock()`
  du moteur (réponse impulsionnelle calculée avec une puissance par échantillon, convolution préparée dans le
  geste) : à reporter sur le moteur de la même façon. Les rendus de cuivres et de percussions ont été
  optimisés (récurrences au lieu de puissances et d'exponentielles par échantillon ; couches arrêtées à -100 dB) :
  ~2 ms par note de cuivres au lieu de ~18, résultat identique (écart < 2·10⁻⁶).
- **Planificateurs** : aucune allocation par passage (tableaux réutilisés, pistes et lits terminés retirés sur
  place).
- **Activation / pause** : aucun son avant la première interaction ; un effet demandé avant n'est jamais rejoué.
  Onglet masqué ou pause du jeu : le moteur suspend le contexte, la musique reprend là où elle était. En
  sourdine, `sfx()` et `ambience.event()` ne créent aucun nœud ; l'intégration suspend en plus le contexte
  200 ms après la mise en sourdine (plus aucun calcul audio) et le relance au retour du son.
- **Réglages du menu** : le menu a trois curseurs (général, musique, effets) dont les valeurs par défaut
  (0,8 / 0,7 / 0,9) doivent tomber sur les volumes étalonnés du moteur (0,8 / 0,55 / 0,85) : l'intégration
  multiplie donc musique par 0,55/0,7 et effets par 0,85/0,9 ; l'ambiance suit le curseur des effets
  (0,6/0,9). Sans ce facteur, la musique serait ~4 dB plus forte que le mixage mesuré.

## 7. Vérifications effectuées

- `tests/audio-music.test.ts` : générateur à graine, positions des doubles-croches et swing, horloge sans dérive
  sur 5 000 mesures, reprise après pause, compositeur déterministe, sections de 4 à 8 mesures avec break,
  aucune répétition de 8 mesures sur 480, toutes les notes dans la tonalité (ré# seulement sur B7), instruments
  par humeur, tempos, marches de basse, Karplus-Strong (accord mesuré par autocorrélation, décroissance, bornes),
  percussions et cuivres pré-rendus.
- `tests/audio-ambience.test.ts` : chants d'oiseaux, cris d'oies, tambourinage, impulsions de grillons, couleurs
  de bruit (normalisation, spectre, bouclage sans clic, calcul par tranches identique au calcul d'un seul tenant).
- `tests/audio-music.test.ts` vérifie aussi que la liste de pré-calcul contient toutes les notes de cuivres que le
  super bonus peut jouer.
- `tests/audio-render.test.ts` : faux AudioContext qui applique les règles qui lèvent des exceptions dans les
  navigateurs (rampe exponentielle vers 0, start/stop invalides, valeurs non finies) : chaque effet, la musique
  (fenêtre d'avance respectée, fondus, tension, pause, arrêt, humeur changée pendant la pause) et les ambiances ;
  robustesse : `start(mood)` sur un moteur lancé, aller-retour d'humeur sans piste doublée, relance pendant
  l'arrêt, tension sans musique (jamais empilée, planificateur libéré), aucune exception transmise au jeu même
  si la création d'un nœud échoue, silence en sourdine, oies qui suivent le sens du vol, lit d'ambiance hors du
  geste d'activation, toutes les voix des fanfares pré-calculées (aucun tampon calculé au premier gain maximal).
- **Rendu réel hors ligne** (Chromium sans interface, `OfflineAudioContext`, moteur réel) : sonies et crêtes
  ci-dessus, absence de NaN et d'écrêtage, spectrogrammes inspectés (rolls de banjo, sifflet avec vibrato,
  battements de pied sur 1 et 3, fondus entre humeurs, couche de tension) ; hauteurs des Scatters mesurées :
  784, 880, 988, 1175, 1318 Hz (sol, la, si, ré, mi).

## 8. Non vérifié

**Aucune écoute humaine n'a été possible dans cet environnement.** Restent donc à valider à l'oreille :

- le caractère réel des timbres (le banjo « sonne-t-il banjo », les cuivres, le sifflet, le huard), le groove et
  le swing, la justesse perçue des mélanges ;
- l'équilibre subjectif musique / effets / ambiances (les cibles sont des mesures de crête et de RMS, pas une
  sonie perçue) et la fatigue d'écoute sur de longues sessions ;
- le rendu sur haut-parleurs de téléphone (les graves sous 150 Hz y disparaissent ; les sons ont une couche
  médium, mais non contrôlée sur appareil) ;
- Safari / iOS (activation, `webkitAudioContext`, reprise après interruption), Firefox, et le coût CPU réel sur
  mobile d'entrée de gamme (mesuré seulement ici, sur un cœur de serveur) ;
- la synchronisation fine des effets avec les animations (dépend des appels du présentateur) ;
- le caractère des cris d'oies (timbre nasillard synthétique) face au dessin du vol.
- Les effets à crépitements et bruits aléatoires (`crack`, `tumble`, `blast`, `multUp`, `buyOpen`) varient de
  1 à 4 dB d'un passage à l'autre (mesuré sur trois rendus) : la table `TRIM` a été réglée sur un seul tirage
  (`crack` mesuré entre -15,5 et -18 dB pour -15 visé ; les fanfares, elles, restent à 0,1 dB près).
