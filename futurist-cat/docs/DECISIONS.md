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
