# BOOMTOOTH — livraison v0.9.0

Générée le 2026-09-28 13:36 UTC depuis le commit `24d4ddd` (1 fichier(s) modifié(s) non commité(s) au moment de la build).

> **Contrôles : OK**
> **Maths : PROVISOIRES (`provisional: true`) — NE PAS importer sur Stake**

## Contenu du dossier

| Élément | Description |
|---|---|
| `FRONTEND/` | build de production (copie de `dist/`, aucun outil de dev), à servir en statique |
| `BOOMTOOTH-frontend-v0.9.0.zip` | même contenu, `index.html` à la racine du zip (237 fichiers) |
| `MEDIA/` | visuels PNG : id.cover.png, id.tile.png, id.logo.png ; `BG/` décor de fond ; `FG/` premiers plans ; `VIDEOS/` F10-1280x720.mp4, F23-1280x720.mp4, F32-1280x720.mp4 |
| `CONTROLES/` | `check-release.txt` / `.json`, `vitest.txt`, `build.txt`, `hud-report.json` |
| `GAME-DETAILS-EN.txt` | fiche du jeu en anglais (modes et coûts lus dans `game-math-config.json`) |
| `SHA256SUMS` | empreintes SHA-256 de tous les fichiers (chemins relatifs) |

## Drapeau `provisional`

`game-math-config.json` : **provisional: true**.
Les coûts de modes, la table de paiement, le RTP et le gain max sont des valeurs provisoires fournies par l'équipe front.

Ce qu'il bloque :
- l'import et la publication sur Stake Engine (`node tools/check-release.mjs --stake` renvoie le code 2) ;
- toute communication de RTP, de coûts ou de gain max (la fiche anglaise indique « provided by the maths team ») ;
- la validation finale de la table de paiement et des books.

Ce qu'il ne bloque pas : revue visuelle, QA front, captures et vidéos.
Pour le lever : l'équipe maths fournit la configuration validée (`provisional: false`) et les books, puis nouvelle livraison avec un **nouveau numéro de version**.

## Lancer

- Serveur statique local (jamais en `file://`) :
  - `python3 -m http.server 5320 --bind 127.0.0.1 --directory FRONTEND` puis http://127.0.0.1:5320/
  - ou, depuis le dépôt : `npx vite preview --outDir "<chemin>/FRONTEND" --port 5320 --strictPort --host 127.0.0.1`
- Dans le dépôt : `LANCER-BOOMTOOTH.cmd` (Windows) ou `npm run serve-stable` (build figée `dist-stable/`).
- Stake Engine : téléverser le contenu du zip (`index.html` à la racine).

## Contrôles passés

| Contrôle | Résultat |
|---|---|
| Build de production (`npm run build`) | OK (6 s) |
| check-release (a) Config maths (game-math-config.json) | AVERTISSEMENT |
| check-release (b) Traces d'outils de dev | OK |
| check-release (c) Manifeste des assets | OK |
| check-release (d) URL externes et polices | AVERTISSEMENT |
| check-release (e) Mots interdits (locales et JS livrés) | OK |
| check-release (f) Mode social (dictionnaire de social.ts sur en.json) | OK |
| check-release (g) Poids de la build | OK |
| Tests unitaires (`npx vitest run`) | OK — 294 passed (294) |
| Zip (contenu = FRONTEND) | OK (237/237) |
| HUD (`npm run hud-check`) | 25/25 tailles OK — rapport du 2026-09-28 13:25 sur http://127.0.0.1:5302/ (build QA, pas forcément identique à cette build) |

### Points relevés par check-release

- (a) avertissement : BLOQUANT pour Stake : provisional=true (valeurs de maths provisoires) — relancer avec --stake pour en faire une erreur
- (d) avertissement : assets/gsap-xgxdCp6f.js : https://gsap.com — tolérée (message d'avertissement GSAP), aucune requête
- (d) avertissement : assets/pixi-C3lUAt3c.js : http://www.pixijs.com/ ×2 — tolérée (bannière console PixiJS), aucune requête

## Intégrité

`sha256sum -c SHA256SUMS` (Linux, macOS) ; Windows : `Get-FileHash -Algorithm SHA256 <fichier>`.
