# DECISIONS - CYBER CAT

Chaque doute reçoit un défaut, noté ici en deux lignes (quoi / pourquoi). Repris dans le rapport final.

## Environnement

- **D01 · Dossier `futurist-cat/` dans le dépôt `guichtv/slot`, branche `claude/clever-meitner-1691i3`.** La session tourne dans un conteneur cloud Linux, pas sur `C:/Users/maxim/Desktop/SLOTS CLAUDE/futurist cat/` ; le dépôt contient déjà BOOMTOOTH à la racine, donc le projet vit dans son propre dossier et ne touche à rien d'autre.
- **D02 · Git versionné et poussé sur la branche désignée** (au lieu de « git local sans remote ») : c'est la seule façon de rendre le travail d'une session cloud. Rien d'autre ne sort (pas d'artefact publié, pas de PR).
- **D03 · Le GLB `Meshy_AI_Cyber_Cat_All_Animations.glb` est absent du conteneur** (ni dans le dépôt ni dans son historique). Défaut : tout l'outillage 3D est écrit selon le §4.2 et validé sur un squelette de test synthétique de même structure (`tools/test-rig/`, outil de dev jamais livré) ; il suffit de déposer le GLB à la racine de `futurist-cat/` et de lancer `npm run cat:prepare`.
- **D04 · Codex CLI / ImageGen indisponible dans ce conteneur Linux** (pas de binaire, pas de session ChatGPT). Défaut : aucune image factice ; les lots sont écrits (`docs/imagegen/`) avec un lanceur Git Bash pour ton PC, et le build public refuse de se construire tant qu'une illustration du manifeste manque.
- **D05 · Masterprompt `../MASTERPROMPT-SLOT-CLAUDE-v2.md` et références GRIMMM/barnstorm-billy/... absents.** Défaut : ce prompt fait foi ; formats Stake Engine repris de la doc publique (types OpenAPI du client RGS : `/wallet/authenticate|play|end-round|balance`, `/bet/event`, `/bet/replay/{game}/{version}/{mode}/{event}`, 10^6 en API, 100 = ×1 dans les books).
- **D06 · BOOMTOOTH (racine du dépôt) n'est ni lu ni réutilisé** : « n'ouvre aucun autre projet », et il ne fait pas partie des quatre projets dont l'outillage est autorisé.
- **D07 · Ports 5340-5349** : dev 5340, preview QA 5341, preview public 5342, outils 3D 5343, build figée 5344, mock RGS 5345.

## 3D

- **D10 · Sous-clips créés dans `cat-prepare` (flip, hooks, dive, run, hop), pas au runtime** : une seule source de vérité, et la correction de sol s'applique au clip réellement joué.
- **D11 · run = frames 1-21 (21 exclue) + clé de bouclage égale à la frame 1** à 20/30 s : même découpe que `subclip(clip,'run',1,21,30)`, mais le passage 20 → 1 garde l'intervalle d'une frame au lieu d'un saut.
- **D12 · Sol : décalage constant = 25e centile du point le plus bas (clips posés) + levée dynamique lissée contre la pénétration**, dans la piste Y de mixamorig:Hips. Exception dive : fin posée au sol, poing sous le sol laissé à l'onde d'impact (lever le corps le ferait flotter).
- **D13 · idle34 tourné de +32° (lacet des hanches)**, milieu de la plage 30-35° demandée ; réglable par `--idle34-yaw`.
- **D14 · Rembourrage des îlots UV (16 px à 4096)** avant WebP : l'atlas Meshy est morcelé sur fond noir, sans rembourrage les coutures noircissent en WebP et en mipmaps.
- **D15 · Masque émissif : cyan (0.35, 0.92, 1.0) × KHR_materials_emissive_strength 2,2**, pour que les yeux restent la seule source émissive visible après le tone mapping Neutral.

## Jeu

- **D20 · Nom gardé : CYBER CAT.** C'est le nom du personnage, le « C » du front est déjà le Wild, et il se lit dans toutes les langues ; aucun nom plus fort ne justifiait de perdre ce lien.
- **D21 · Mécanique POINT LASER gardée telle quelle.** Elle se lit sans texte (yeux → trajet → cases qui changent → valeur) et ne recoupe aucune mécanique interdite.
- **D22 · SPIN et BUY BONUS en texte dynamique traduit** sur des boutons illustrés sans texte (règle « textes peints : seulement le logo et WILD / SCATTER » ; « BUY BONUS » reste la même chaîne en FR, traduite en mode social).
- **D23 · Paliers : BIG (×10) · SUPER (×25) · MEGA (×50) · EPIC (×100) · CYBER (×500) · MAX (wincap)**, noms traduits ; seuils dans la config pour que les maths puissent les ajuster.
- **D24 · DOUBLE REGARD dure aussi 9 spins** (les « vies » restent le compteur) ; sa valeur vient des deux points et des puces de départ. Valeur lue dans la config pour les règles, dans le book pour le jeu.
- **D25 · Gains groupés par (symbole, multiplicateur appliqué)** dans `winInfo` : c'est la seule forme qui permet d'afficher « base → ×N → final » sans calcul côté front.
- **D26 · SCAN / DOUBLE SCAN : l'intro passe avant le défilement** (les rouleaux ne tournent pas derrière la popup) ; même finition qu'un bonus (coup de poing, déchirure).
- **D27 · Bait d'achat (A15c) non appliqué** : aucune incitation à l'achat pendant un tour payant.
- **D28 · Ante : coût et chance des Scatters lus dans la config** (`ANTE.cost`, `ANTE.scatterChanceX`), affichés sur le bouton ; aucun débit au clic.

## Technique

- **D30 · Chat en A2 avec `preserveDrawingBuffer: true`.** Sans lui, Chrome copie le tampon présenté d'un canvas hors DOM (vide) : constaté sur la preuve (48 940 pixels dans le canvas three, texture Pixi vide). Coût de la copie mesuré 0,1 ms (swiftshader) ≪ 2 ms, donc pas d'A1.
- **D31 · La caméra three suit les hanches verticalement et le sprite compense** : le chat n'est jamais coupé par son canvas (dive de 8 m, salto) sans agrandir le canvas.
- **D32 · three en imports nommés, chargé en un bloc différé** (`cat-loader.ts`) : 172,8 Ko gzip avec les chargeurs, sous le budget de 200 Ko (l'import par espace de noms donnait 213 Ko).
- **D33 · Remplaçants dessinés en code seulement dans la build QA** (`src/dev/stand-ins.ts`, derrière `__DEV_TOOLS__`) pour construire et juger le mouvement sans les illustrations ; la build publique refuse de se construire sans les vraies images.
- **D34 · Mode local seulement sur localhost / fichier / build QA** ; sur un autre hôte sans session : erreur propre, jamais de bascule silencieuse.
- **D35 · Noms de modes du contrat en MAJUSCULES** (`BASE`, `ANTE`, `SCAN`, `DOUBLE_SCAN`, `BONUS`, `SUPER`) ; le provider RGS envoie le mode en minuscules et normalise la réponse.
- **D36 · Fixtures écrites par un outil d'auteur (paytable provisoire)** puis contrôlées par le validateur : l'outil calcule, le front jamais.
- **D37 · Images séparées en WebP au lieu d'un atlas** pour cette version : ~60 images décodées une fois au chargement ; l'atlas n'apporte rien tant qu'elles ne sont pas livrées (à reconsidérer avec les vraies images).
- **D38 · Sons en OGG + M4A (AAC)** : OGG demandé, M4A en repli pour Safari.
- **D39 · 16 langues Engine** (ar, de, en, es, fi, fr, hi, id, ja, ko, pl, pt, ru, tr, vi, zh), chiffres latins partout, polices locales par écriture ; la 17e langue de la référence GRIMMM est à revérifier dans la doc Engine.
- **D40 · Vidéos sur horloge virtuelle** (`?virtual=1`, `__qaStep`) : chaque image est rendue à t = n/30 s quelle que soit la lenteur du rendu logiciel du conteneur ; les transitions CSS (popups) restent en temps réel et peuvent paraître abrégées dans ces vidéos.
- **D41 · Musiques gardées en Vorbis q4 / AAC 128 kb/s** : les deux formats ensemble font 6,56 Mo (cible indicative 6 Mo), mais un joueur n'en télécharge qu'un, soit ~3,3 Mo dont 0,35 Mo critiques avant le jeu. La qualité des boucles musicales passe avant 0,45 Mo sur le dépôt ; un réglage (`encSettings()` de `tools/audio/render.mjs`) suffit pour revenir sous 6 Mo si l'intégration l'exige.
- **D42 · Pilote d'horloge des tests e2e cadencé par `requestAnimationFrame`** : une chaîne de `setTimeout(0)` affamait le compositeur (aucune image, captures impossibles, dialogues sans leur classe d'entrée).
- **D43 · Le chat passe au-dessus du voile pendant les célébrations et les intros** (`RenderLayer` Pixi, transformation inchangée) : constaté en vidéo, le voile le grisait alors qu'il danse.
- **D44 · Plaque de palier : fermeture seule après 5,4 s en jeu manuel** (3,6 s en autoplay / bonus, 2,2 s en turbo), le clic ferme toujours avant ; 9 s constatées en vidéo, trop long.
- **D45 · L'anticipation compte l'atterrissage des rouleaux dans son budget** (1,8 s pour un rouleau, 2,1 s partagées) : mesurée à 3,0 s sur trois rouleaux dans la vidéo TEST ANIM.
- **D46 · Popout S (fenêtre < 340 px de haut) : bouton Ante dans la colonne du HUD**, turbo / SPIN / auto sur une ligne ; ailleurs l'Ante reste sous le logo et sa police se réduit pour tenir.
