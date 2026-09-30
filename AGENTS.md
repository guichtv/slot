# BOOMTOOTH — consignes pour l'agent (Codex)

Slot 2D **BOOMTOOTH** (studio Crownforge), front de présentation pour Stake. **Le front ne calcule jamais un gain** : il joue les événements des books fournis par l'équipe maths. Version actuelle 0.9.0 → objectif **v0.9.1**. Tout rapport à l'utilisateur : **en français, court, l'essentiel en gras**.

## Démarrer

```
npm ci
npm run typecheck        # doit afficher 0 erreur
npm test                 # 299 tests, tous verts
npm run dev              # http://127.0.0.1:5301/  (banc de la mascotte : /mascot-bench.html)
npm run build:qa && npm run preview   # build QA figée sur 5302 (captures, e2e)
LANCER-BOOMTOOTH.cmd     # Windows : build de production figée sur 5320 (npm run serve-stable ailleurs)
```

Stack : Vite 7, TypeScript strict, PixiJS 8 (ticker manuel), GSAP piloté par l'horloge de présentation (`src/core/clock.ts`), zod, vitest, playwright-core (Chromium), sharp.

## Règles non négociables

- **Aucun calcul de gain dans le front** : montants lus dans le book, conversion unique `bookToMoney()`.
- **Aucune illustration en CSS, SVG, emoji ou dessin en code.** En code : textes dynamiques et primitives d'effets (halos, traits, particules) seulement. Toute image vient d'**ImageGen** : outil natif `image_gen` de Codex, file `tools/codex-queue.sh` + un brief dans `docs/imagegen/*.txt` (voir `docs/IMAGEGEN.md`). **Jamais d'API d'images payante.** Quota épuisé : arrêter, le dire, continuer le reste ; ne jamais remplacer une image par un faux.
- Ports **5300-5399**, toujours `--strictPort` (dev 5301, QA 5302, faux RGS 5310, build figée 5320).
- **Rien vers l'extérieur** (publication, upload, message à un tiers) sans demande explicite. Ne lire ni afficher aucun secret (`auth.json`, jetons).
- Pas de « démo », « fun », « crédit », pas de bouton « Continuer » (contrôlé par `tools/check-release.mjs`). Mode social : aucun terme d'argent ou de pari.
- 17 langues : toute nouvelle clé de texte dans les 17 fichiers `src/i18n/locales/*.json` (test `tests/i18n-locales.test.ts`).
- Mouvement réduit respecté (`reducedMotion`), turbo respecté (`speed`).
- Avant chaque commit : `npm run typecheck`, `npm test`, `npm run build`, `node tools/check-release.mjs --dir dist`.

## Où sont les choses

| Sujet | Fichiers |
|---|---|
| Contrat des books, fixtures F01-F33 | `docs/CONTRAT-EVENTS.md`, `src/contract/`, `tools/fixtures/`, `public/fixtures/fixtures.json` |
| Lecture des événements, mise en scène | `src/controller/presenter.ts`, `src/controller/game.ts`, machine à états `src/core/fsm.ts` |
| Rendu (grille, symboles, FX, décor, célébrations) | `src/render/**` |
| Mascotte Buck (rig 2D, IK des bras, jambes ancrées) | `src/render/mascot/Buck.ts`, `armIk.ts`, `buckRig.json` ; banc `src/dev/mascotBench.ts` |
| Interface (HUD, menus, achat, Ante, dialogues) | `src/ui/**` |
| Stake RGS, reprise, relecture | `src/stake/`, `src/provider/**`, faux RGS `tools/mock-rgs.mjs` |
| Chaîne d'assets | `assets/generated/**` (sources ImageGen) → `npm run assets` → `public/assets/**` + `manifest.json` |
| Décisions, avancement, vérifications | `docs/DECISIONS.md`, `docs/AVANCEMENT.md`, `docs/VERIFICATION.md`, `docs/ANIMATIONS.md`, `docs/UI-FLOWS.md` |

## Outils de vérification

- `node tools/shot.mjs <nom> 1440x900 --play=F10 --steps=500,500` : captures du jeu sous horloge virtuelle (`?qa`, `window.__qa`) ; `--from=<index d'événement>` démarre au milieu d'une fixture.
- `node tools/play-e2e.mjs 1440x900` : parcours joueur par vrais clics (14/14 attendu). `npm run stake-e2e` : session Stake contre le faux RGS.
- `node tools/hud-check.mjs` : HUD sur 25 tailles d'écran (25/25 attendu).
- `node tools/mascot-motion.mjs --actions=cheer,duck` : pellicules de la mascotte ; `node tools/mascot-still.mjs --shots=cheer@450 --zoom=1.7` : images fixes zoomées.
- `node tools/check-release.mjs --dir dist` : contrôle de livraison. `--stake` rend le code 2 tant que les maths sont provisoires.
- `npm run package` : dossier `LIVRAISON-BOOMTOOTH-v<version>/` (ne réécrit jamais une livraison existante).

## Reste à faire pour finir (v0.9.1)

1. **Mise en scène** : vérifier les captures des paliers ×1000 et MAX WIN (`tools/shot.mjs` sur les fixtures correspondantes) et corriger ce qui ne se lit pas.
2. **Robustesse** :
   - fermer le menu et le panneau d'achat avant une intro de bonus ou une célébration ;
   - rendre le HUD inerte pendant un dialogue bloquant (`onLock` de `src/ui/dialogs.ts`) ;
   - appliquer la durée minimale de manche de la juridiction (`minimumRoundDuration`, lu dans `src/stake/rgs.ts`, pas encore appliqué) ;
   - supprimer le blocage possible de `engine.unlock` (audio) ;
   - couper les boucles de repos des symboles en mouvement réduit.
3. **Vérifications** : capture de l'écran de chargement, clic « Revoir » de l'historique, dialogues session expirée / maintenance / connexion ; relancer tests, `hud-check`, `play-e2e`, `stake-e2e`.
4. **Mascotte** (petits défauts, visibles de très près) :
   - léger reflet violet sous les manches redessinées (`public/assets/mascot/buck.sleeves.upper*.webp`) ;
   - fin halo gris au poignet des textures de main.
5. **Livraison** : passer la version à 0.9.1 (`package.json`), mettre à jour `docs/AVANCEMENT.md` et `docs/VERIFICATION.md`, puis `npm run package`.
6. **Optionnel, piste 3D** : un modèle Buck fait sur Meshy (+ animations Mixamo) peut être déposé dans `assets/3d/buck/`. Le rendre en séquences d'images (style BD, contour noir) pour le jeu : Stake ne charge pas de 3D en ligne. Liste des animations voulues : `docs/MASCOTTE-ANIMATIONS.md`.

**Bloquant externe** : `public/game-math-config.json` est `provisional: true` ; l'import Stake reste bloqué jusqu'aux maths définitives de l'équipe maths. Ne pas inventer de valeurs.
