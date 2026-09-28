# Décisions (BOOMTOOTH)

Chaque champ vide de la fiche a été décidé ici. Les informations explicites de l'utilisateur priment.

## Fiche

| Champ | Décision | Raison |
|---|---|---|
| Thème | Démolition au castor dans une vallée du Grand Nord | Aucun recoupement avec les neuf slots précédentes ; les explosions offrent un spectacle fort pour la review (« Poor animations » a fait refuser IMPERIUM). |
| Nom | BOOMTOOTH | Court, lisible sur le logo, relie la mascotte (dent en or) à l'explosion. |
| Ambiance | Malicieuse, vaniteuse, slapstick | La vanité de Buck porte l'humour ; aucune violence. |
| Mascotte | Buck Boomtooth, castor chef de chantier | Silhouette forte, accessoires qui servent la mécanique (allumette sur la dent en or, queue qui frappe le Cornerstone). |
| Mécanique signature | BLAST & CARVE (voir CONCEPT.md) | Visuelle et compréhensible sans texte ; différente des mécaniques déjà utilisées. |
| Paiement / grille | Ways 3 125, 5 × 5, avec chutes | Les quatre slots Claude précédentes étaient en clusters 6×5 ; le carré sert le mobile portrait et les géants. |
| Bonus | SUNDOWN SHIFT (3 Scatters), FLOODLIGHT SHIFT (4 et plus) | La règle clé du super bonus (charges reliées) est une vraie règle, pas un réglage. |
| Features | TNT SPIN, MEGA BLAST SPIN | Une révélation chacune. |
| Ante | DOUBLE FUSE, facteurs lus dans la config maths | Libellé avec le vrai facteur et le coût du prochain spin. |
| Cible | Stake Engine (front prêt à brancher) + démo locale | |
| Langues | FR, EN et les 17 langues Engine | Traductions marquées « non relues par un natif ». |

## Processus

- **Concept** : panel de 4 concepteurs indépendants + 1 juge (workflow), 5 concepts notés. BOOMTOOTH l'emporte (67), devant TIMBERRR! (64), BANKSHOT TUSK (61), SPLIT HAPPENS (59) et HAMMERHEAD HUSTLE (58).
  - **Greffes retenues** : chaîne d'explosions fusionnant les zones, Cornerstone (+1 par case sculptée, éclats visibles, matière par palier), piquets et cordeau du géomètre, allumette frottée sur la dent en or, relances 2 → +2 et 3 → +5, noms des paliers de gain, bûche-charge à la place du baril de poudre (qui faisait pirate).
  - **Greffes écartées** :
    - « re-carve » en super bonus : des géants fixes pendant les chutes cassent la gravité et ressemblent à des éléments collants, déjà source de défauts ;
    - passage du standard au super en cours de bonus : trop d'états ;
    - accessoires détachables : la mascotte garde son allumette ;
    - maillet et ciseau : pas d'assets supplémentaires, Buck sculpte d'un coup de queue et d'un geste.
  - **Règle clé du super bonus** : charges reliées par le fil de mise à feu (une seule chaîne par étape).
- **Direction artistique** : cinq maquettes ImageGen ; D1 retenue, D3 pour l'ambiance de bonus (ART-DIRECTION.md).
- **Lisibilité des spéciaux** : les maquettes montraient trois objets rouges trop proches. Le Scatter devient un détonateur à piston, le WILD une caisse dorée, et les charges trois tailles croissantes.

## Environnement et outillage

- **ImageGen** : Codex CLI 0.158 installé dans le conteneur cloud et connecté au compte ChatGPT de l'utilisateur par code d'appareil (aucune clé API). Modèle gpt-6-astra, outil natif `image_gen`, skill `imagegen`. L'accès réseau complet a été ouvert par l'utilisateur.
- **Git** : dépôt cloud `guichtv/slot`, branche `claude/funny-lamport-2y5sp6`. Le masterprompt demandait un dépôt local sans push (contexte Windows) ; dans un conteneur éphémère, pousser sur la branche désignée est la seule manière de ne rien perdre. Aucun autre push, aucune PR.
- **Ports** : serveur de dev 5301, build figée servie sur 5302 (`--strictPort`), mock RGS 5310.
- **Laboratoire** : aucun (fiche : LABORATOIRE = NON). Les pistes de mise en scène des moments clés sont prototypées via `?variant=` en dev puis archivées.
- **Spline** : non utilisé. L'utilisateur a proposé Spline pour la mascotte (application ouverte sur son PC), mais cette session tourne dans un conteneur cloud qui ne peut pas joindre une application locale et aucun connecteur Spline n'existe. Buck reste un rig 2D articulé à partir de pièces ImageGen (IK à deux os, pieds ancrés). Si Spline est repris plus tard dans une session locale, seules des séquences d'images exportées sont compatibles avec la build Stake (une scène chargée depuis spline.design serait une dépendance externe).

## Unités et contrat

- Montants des books : entiers en centièmes de la mise de base (100 = ×1). Monnaie : entiers en base 10^6. Une seule conversion : `bookToMoney()`.
- Coordonnées : [colonne, ligne], origine en haut à gauche.


## Décisions de production (28/09)

- **Quota ImageGen** : épuisé en fin de lot 2 ; arrêt immédiat de la génération (aucune image remplacée par un faux), puis reprise après changement de compte Codex par l'utilisateur (nouvelle connexion par code d'appareil). Lots 3 et 4 générés ensuite ; seul `buck.props` a dû être relancé.
- **Charge 4×4** : la **bûche-charge** (`sym.T.log`, bûche creuse bourrée de dynamite, cerclée de fer) remplace le tonnelet à l'écran, conformément au choix du concept. Le nom technique du contrat reste `keg`.
- **Cadre de grille** : recomposé en 9 pièces (coins et platines à l'échelle, planches étirées) pour régler son épaisseur (0,6 case) et laisser la place au HUD.
- **HUD** : peau 100 % ImageGen (planche à embouts, bouton rouge, boutons de bois, icônes crème). Sur téléphone, la case « mise » ouvre un sélecteur −/valeur/+ (cibles ≥ 44 px) ; l'aide passe dans le menu ; les montants rétrécissent pour tenir au lieu d'être tronqués. Contrôle automatique sur 25 tailles (`tools/hud-check.mjs`) : 25/25.
- **Panneaux** : menu, achat, confirmation et dialogues utilisent le cadre `scr.card` en 9-slice ; l'Ante la planche `ui.btn.plaque` ; les cartes d'achat ont les vrais décors en fond ; les vignettes de symboles complets (corps + pièces) sont assemblées par `tools/assets/symbol_thumbs.py`. `scr.shop` reste en réserve.
- **Portrait** : décor peint plein cadre dédié (`decor.portrait`) au lieu des calques paysage.
- **Déclenchement du bonus** : Buck fait tomber un détonateur à piston (`buck.props`), empoigne la barre en T et l'enfonce ; les Scatters sautent et la nuit tombe dans le souffle, puis le panneau d'intro.
- **Célébrations** : décor assombri seul (grille et Buck restent éclairés), geysers de pépites d'or, détonation à chaque palier, Buck gradué, logo qui sursaute ; bandeau `scr.banner` pour le nom du palier. Les noms de paliers restent en anglais dans toutes les langues (jeux de mots).
- **Performance** : textures envoyées au GPU pendant le chargement (Pixi `prepare`), aucune création de texture au moment d'un impact ; pas de BlurFilter (flou de défilement par traînée), pas de ParticleContainer (sprites en pool), pas de filtre CSS `drop-shadow` sur les grands éléments (46 s par image en rendu logiciel mesurées pendant une intro) ; la latence simulée du mode local suit l'horloge de présentation (captures reproductibles).
- **Machine à états** : le présentateur signale les phases (anticipation, feature, résolution, célébration, intro/bonus/fin) ; le contrôleur ne les applique que si la transition est permise.
- **Correctif important** : la couche des surcouches (`.ovl`) captait tous les clics au-dessus du HUD (règle `#ui > *` trop forte) ; corrigé, et vérifié par des clics réels (`tools/ui-states.mjs`).
- **Reprise et relecture** : `GameController.resumeRound` rejoue une manche interrompue à l'événement enregistré, sans nouveau débit ; `replayRound` relit une manche d'historique (aucun appel serveur) ; `/bet/event` enregistre la progression après chaque événement d'une manche active.
- **Maths** : config provisoire alignée sur le contrat 1.1.0 (`keg`, table `retriggers` 2 → +2, 3 → +5, 4+ → +8 en super). `provisional: true` bloque toujours l'import Stake.
