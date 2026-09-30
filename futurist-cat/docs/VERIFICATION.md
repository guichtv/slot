# VERIFICATION - CYBER CAT

Ce qui est vérifié, comment, où ; et ce qui ne l'est pas. Aucune mention « vérifié », « fluide » ou « 60 fps » sans preuve. Rappel : des tests verts ne prouvent pas la qualité du mouvement.

**Contexte de cette session** : conteneur cloud Linux, sans GPU (rendu logiciel swiftshader), sans le GLB Meshy et sans Codex/ImageGen. Toutes les captures et vidéos montrent la **build QA servie** avec des **remplaçants dessinés en code** à la place des illustrations et le **squelette de test** à la place du chat (`?catglb=./dev/test-rig.glb`). Elles prouvent le déroulé, les durées, l'ordre et la mise en page, **pas** le rendu final.

## Code

| preuve | commande | résultat | où |
|---|---|---|---|
| typage strict | `npx tsc --noEmit -p .` | voir section « Résultats » | — |
| tests unitaires | `npx vitest run` | voir « Résultats » | `tests/` |
| fixtures (26) contrôlées sans calcul | `npm run fixtures:check` | voir « Résultats » | `docs/FIXTURES.md` |

## Chat 3D

| preuve | état |
|---|---|
| `cat-prepare` sur le vrai GLB | **non fait** : GLB absent du conteneur |
| `cat-prepare` sur squelette de test (même structure Mixamo, mêmes défauts) | fait : dérive dance 70 cm → 0, flip 110 cm → 0, sols corrigés, masque émissif, sous-clips (`tools/.work/report/PREPARE.md`, non versionné) |
| planches contact du vrai chat (§4.8) | **non faites** (GLB) ; outil prêt et validé sur le squelette de test |
| preuve A2 | faite sur swiftshader : chat 0,5 ms/frame desktop, 1,2 ms mobile ×4 CPU, copie canvas → texture 0,1 ms, 1 draw call, ~34 Mo GPU estimés ; **fps réels non mesurés (pas de GPU)** ; copie non mesurable pour Safari iOS |

## Build servie, vrais gestes

Voir « Résultats » : `tools/play-e2e.mjs` (local), `tools/stake-e2e.mjs` (mock RGS : **outil de dev, pas un test Engine**), `tools/hud-check.mjs` (6 tailles + Popout S, montants à 10 chiffres).

## Vidéos (regardées image par image en planches)

Voir « Résultats ».

## Non vérifié

- Rendu final (illustrations ImageGen, chat Meshy) : absents.
- fps réels sur GPU, trace chrome-devtools : impossible dans ce conteneur.
- Sons : générés et contrôlés par mesure (crête, DC, clics, bouclage) mais **jamais écoutés** par un humain.
- Vrai téléphone, Safari iOS, Firefox : non testés.
- Mock RGS ≠ Stake Engine : le flux réel est à vérifier sur l'environnement Engine.
- Traductions : non relues par des locuteurs natifs.

## Résultats

Session du 30/09/2026, conteneur cloud (4 cœurs, rendu logiciel). Chaque ligne dit ce qui a été lancé et ce qui en est sorti.

### Code

| preuve | résultat |
|---|---|
| `npx tsc --noEmit -p .` | 0 erreur |
| `npx vitest run` | **103 tests OK** / 6 fichiers : contrat 15, moteur 7, RGS 8, pipeline d'images 1, son 22, langues 50 (16 langues : mêmes clés et placeholders, mots interdits dans toutes les écritures, phrase de dysfonctionnement) |
| `npm run fixtures:check` | 26 fixtures valides (le validateur contrôle, ne corrige jamais) |
| `node tools/check-release.mjs --locales` | ok (16 langues) |
| `node tools/check-release.mjs --pre` | **bloquant, comme prévu** : illustrations ImageGen et chat absents → `npm run build` et la livraison refusent de produire le build public |
| scan du bundle public (`vite build --mode production` dans un dossier temporaire puis `check-release --post`) | ok : aucun outil de dev (`__qaPlay`, panneau DEV, remplaçants, squelette de test), aucun mot interdit dans les 16 langues ni dans le HTML, chemins relatifs. Une URL `jcgt.org` dans un commentaire de shader three.js (aucun appel). Contre-épreuve : un mot interdit en russe et un outil de dev injectés dans un faux bundle sont bien bloqués |

### Chat 3D (squelette de test, pas le chat)

Fichiers : `docs/preuves/chat-squelette-de-test/` (rapport `PREPARE.md`, planches idle / run / flip / dive, masque émissif, `proof.json`).

| mesure (swiftshader, non représentatif des fps réels) | desktop 1440×900 | mobile 390×844 DPR3, CPU ÷4 |
|---|---|---|
| chat par image (médiane / p95) | 0,5 / 0,7 ms | 1,2 / 2,3 ms |
| rendu three / mixer / copie canvas → texture | 0,3 / 0,1 / 0,1 ms | 0,6 / 0,1 / 0,1 ms |
| draw calls chat | 1 | 1 |
| mémoire GPU estimée | 34,3 Mo | 25,5 Mo |
| canvas du chat | 384×774 | 243×489 |

### Build servie, vrais gestes (souris : pointerdown + click), horloge virtuelle pilotée

`node tools/play-e2e.mjs` sur `dist-qa` servi, fournisseur local (fixtures), 1280×720 : **10/10 OK** (`docs/preuves/e2e/e2e.json`).

| scénario | résultat |
|---|---|
| spin_and_win | solde 1000 → 1000,30 ; gain affiché « 1,30 € » ; le clic d'accueil ne lance pas de spin (clic consommé) |
| quick_stop_same_result | arrêt rapide : même résultat (F07, +0,60 €), une seule requête |
| buy_bonus_single_request | devis figé « 100,00 € », double clic sur ACHETER → **une** requête ; bonus joué jusqu'au bout ; solde 1000 → 906,50 |
| buy_cancel_no_debit | boutique → carte → Annuler : aucune requête, solde inchangé |
| ante_cost | Ante actif, débit 1,25 € pour une mise de 1 € |
| refusal_consistent | refus ERR_IPB : « Solde insuffisant. », solde inchangé, retour au repos |
| uncertain_reconcile | requête incertaine → réconciliation → repos, solde inchangé |
| autoplay_counter_and_stop | compteur « 9 » après le 1er spin, arrêt demandé → arrêt après 2 spins |
| keyboard_space | Espace lance un spin (1 requête) |
| menu_rules | menu Infos : règles complètes (dysfonctionnement, 1024, WILD, SCATTER, ANTE, RTP), fermeture par Échap |

Défaut trouvé et corrigé en route : le pilote d'horloge en `setTimeout(0)` affamait le compositeur (la boutique ne recevait jamais sa classe d'entrée) → pilote cadencé par `requestAnimationFrame` (D42).

### Flux Stake contre le mock RGS (outil de dev, **pas** un test Engine)

`node tools/stake-e2e.mjs` : build QA servie + `tools/mock-rgs.mjs` (forme publique de l'API : `/wallet/authenticate`, `/wallet/play`, `/wallet/end-round`, `/bet/event`, `/bet/replay`) : **6/6 OK** (`docs/preuves/e2e/stake-e2e.json`).

| scénario | journal des appels / résultat |
|---|---|
| play_end_round_once | authenticate → play → **un seul** end-round |
| resume_active_round_no_new_debit | rechargement en plein bonus : reprise à l'événement 12, `/bet/event` à chaque étape, **aucun** `/wallet/play`, un end-round |
| insufficient_balance | « Solde insuffisant. » |
| invalid_session_no_local_fallback | « Votre session a expiré. Rechargez le jeu. », jamais de repli sur les fixtures locales |
| social_mode_no_dollar | solde « 1 000,00 SC », libellé « JEU », BUY BONUS et turbo masqués par la juridiction, aucun « $ » |
| replay_no_wallet | `/bet/replay/cyber-cat/1/base/7` seulement, aucun appel au portefeuille |

### HUD : 5 langues × 7 tailles, montants à 10 chiffres

`docs/preuves/hud/RESULTATS.md` et 35 captures (`docs/preuves/hud/<langue>/<taille>.jpg`) : **35/35 OK** en fr, ar (droite à gauche), ru, id, fi (les libellés les plus longs) sur 1920×1080, 1440×900, 960×720, tablette 1024×768 tactile, portrait 390×844 DPR3, court 844×390 DPR3, Popout S 400×300.

Défauts trouvés par ce test puis corrigés : à 960 px et sur tablette, boutons superposés et montants coupés (boutons système passés en haut à droite, montants dont la police se réduit) ; en 844×390 et Popout S, boutons hors écran (colonne élargie, SPIN au-dessus de turbo / auto) ; en portrait, texte de l'Ante coupé (vu sur capture en arabe, puis ajouté au test) ; en Popout S, Ante illisible (déplacé dans la colonne du HUD).

### Vidéos (horloge virtuelle, image par image ; regardées en planches contact à 0,25-1 s)

Toutes dans `docs/preuves/videos/` avec leur planche (`*-planche.jpg`, une image toutes les 0,5 s). Build QA servie, remplaçants de dev + squelette de test.

| vidéo | taille | durée | ce qui a été regardé / constaté |
|---|---|---|---|
| `testanim-desktop.mp4` | 1440×900, 30 i/s | 107,8 s | F07 laser ×2 → 1,60 € ; F25 souris « pleine » → 3,00 € ; F10 anticipation ratée (≈ 2,0 s, mesurée de 14,8 à 16,8 s) ; F13 DOUBLE SCAN : intro avant les rouleaux, déchirure, deux points, ×3 × ×5 croisés → 30,00 €, GROS → SUPER GAIN, 30,80 € exacts ; F12 SCAN ; F15 exactement ×10 → GROS GAIN (seuil inclus) ; F17 GROS → SUPER → MÉGA, 60,20 € ; F19 tous les paliers jusqu'à CYBER, 1 536,00 € exacts. Aucune erreur de page |
| `testanim-mobile.mp4` | 390×844 DPR3 (sortie 780 px), 15 i/s | 109,9 s | même enchaînement en portrait : grille en haut, chat dessous, BUY BONUS au-dessus du HUD, boutons système en haut à droite, texte tactile « TOUCHEZ N'IMPORTE OÙ », plaques de palier lisibles, chat lumineux pendant les célébrations. 15 i/s au lieu de 30 : en DPR3 le rendu logiciel dépasse la limite de 2 h par tâche du conteneur |
| `bonus-9vies.mp4` | 1280×720, 24 i/s | 97,0 s | anticipation ≈ 2 s, salto, intro 9 VIES (chat devant le voile), déchirure, mode scan, « Spins restants », puces, +3 FS, « 1,50 € → ×8 → 12,10 € », GROS GAIN en bonus (maintien 3,6 s), dernier spin, GAIN TOTAL qui roule jusqu'à 17,05 €, puces éteintes, plongeon retour, solde 1 016,05 € |

Les TEST ANIM rejouent les fixtures par le lecteur de replay (aucun appel au portefeuille) : le solde n'y bouge pas, c'est voulu ; débit et crédit sont prouvés par l'e2e et par `bonus-9vies.mp4` (solde final 1 016,05 €).

Défauts vus dans une première prise de TEST ANIM (122,8 s) et corrigés avant la prise retenue : anticipation à 3,0 s (atterrissages hors budget, D45), plaque de palier figée 9 s (D44), chat grisé par le voile (D43).

