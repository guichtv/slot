# VÉRIFICATION — BOOMTOOTH (front)

État au 29/09/2026. Chaque ligne dit **ce qui a été vérifié, comment, et le résultat réel**. Ce qui n'a pas pu l'être est listé à la fin, sans maquillage.

## 1. Contrôles automatiques

| Contrôle | Commande | Résultat |
|---|---|---|
| Typage strict | `npx tsc --noEmit -p .` | **OK** (0 erreur) |
| Tests unitaires | `npx vitest run` | **299 / 299 OK** (17 fichiers : argent, social, beat, FSM, fixtures, audio ×3, UI ×5, i18n ×2, IK des bras, …) |
| Books de test | `npm run fixtures` | **33 fixtures, 0 invalide** (F01-F33 : pertes, gains, tumbles, charges 2×2/3×3/4×4, chaînes, charges reliées, bonus, super bonus, relances, paliers ×10 → ×1000, MAX WIN, Ante, sous-centime) |
| Validateur de contrat | `tools/fixtures/validate.ts` | Totaux, zones, géants = rectangle englobant, multiplicateur +1 par case taillée, compteurs FS, relances selon la table, finalWin = payoutMultiplier |
| HUD sans chevauchement | `node tools/hud-check.mjs` | **25 / 25 tailles OK** (2560×1440 → 320×568, paysage court, carré 500×500 ; tactile ≥ 44 px, rien hors écran, aucune valeur tronquée, rien sur la grille) — `captures/hud/sheet.png` |
| Contrôle de livraison | `node tools/check-release.mjs --dir <build prod>` | **OK, 0 échec** ; avertissements : maths provisoires (bloquant Stake), mentions d'URL dans les bibliothèques (aucune requête) |
| Contrôle Stake | `node tools/check-release.mjs --stake` | **Code 2 attendu** tant que `provisional: true` |
| Pas d'outils de dev en production | check-release [b] | **OK** : ni `__qa`, ni banc de mascotte, ni sourcemap dans `dist/` |
| Mode social | check-release [f] + `tests/social.test.ts` + `tests/ui-i18n.test.ts` | **OK** : aucun terme de pari/achat/argent résiduel en anglais social |
| Langues | `tests/i18n-locales.test.ts` | **17 langues**, mêmes clés que `en.json`, mêmes paramètres, aucun mot interdit, polices couvrant chaque caractère |

## 2. Contrôles visuels (build figée, horloge virtuelle)

Captures réelles de la page (canvas + HTML) avec `tools/shot.mjs` sur la build QA servie sans rechargement à chaud (`?qa` : l'animation n'avance que par pas de l'horloge virtuelle).

| Moment | Fixture | Captures | Vérifié |
|---|---|---|---|
| Explosion 3×3 + géant + gain + tumble | F10 | `captures/qa/f10-*` | piquets de zone, allumette, étincelle, explosion, géant sculpté, montant, chute |
| Gros gain ×100 | F23 | `captures/qa/f23-*` | décor assombri, bandeau illustré, geysers d'or, Buck qui célèbre, compteur |
| Déclenchement du bonus | F16 | `captures/qa/trig3-*` | acclamation, détonateur à piston, Scatters qui sautent, nuit, panneau SUNDOWN SHIFT |
| Super bonus, charges reliées | F33 | `captures/qa/f33*` | FLOODLIGHT SHIFT, compteur « Spins restants », fil de mise à feu, géant, Cornerstone ×1 devant Buck |
| Accueil | — | `captures/qa/welcome-*` | 3 cartes, gain maximal localisé, « Ne plus afficher » |
| Portrait / tablette | — | `captures/qa/port-*` | décor portrait peint, HUD compact |
| Achat, menu, dialogues | — | `captures/ui/*` (clics réels) | catalogue illustré, confirmation, règles / réglages / historique, solde insuffisant |

Défauts trouvés **et corrigés** grâce à ces captures : couche des surcouches qui avalait les clics du HUD ; filtre CSS `drop-shadow` qui figeait le rendu (46 s par image en logiciel) ; textures envoyées au GPU au premier usage (à-coup au premier bonus) → envoi pendant le chargement ; Cornerstone caché derrière Buck ; monument caché par l'encart Ante ; bras de Buck qui entrait dans la grille ; cadre trop épais qui débordait sur le HUD.

## 2 bis. Mascotte (bras et mouvements)

| Contrôle | Commande | Résultat |
|---|---|---|
| IK des bras | `tests/arm-ik.test.ts` (5 tests) | poignet et point de la main posés exactement ; repos du rig retrouvé ; coude toujours dehors ; trajectoires continues |
| Pellicules des 28 actions | `node tools/mascot-motion.mjs` (16 images à 90 ms) | `captures/mascot/*.png` |
| Images fixes zoomées | `node tools/mascot-still.mjs --shots=duck@200,…` | raccords épaule, coude, poignet |
| Audit indépendant | 5 relecteurs + probes 60 images/s (`captures/mascot-verify/`) | 70 défauts signalés (coude du mauvais côté au retour des poings levés, queue écrasée par la respiration, poignée hors de portée, allumette loin de la dent…), **tous corrigés** puis revérifiés |
| Dans le jeu | `tools/shot.mjs --play=F10 --from=1` / `--play=F16 --from=3` | allumette frottée puis tenue au bord du cadre (hors grille) ; acclamation puis détonateur |

## 3. Règles non négociables (§3) — état

| Règle | État |
|---|---|
| Le front ne calcule aucun gain | **Respecté** : lecture d'événements ; montants lus dans le book, conversion unique `bookToMoney` |
| Aucune police système, aucun emoji, aucune illustration en CSS/SVG | **Respecté** : polices OFL locales ; panneaux, boutons, icônes, cadres = images ImageGen ; en code : textes, halos, traits, particules, éclairs, flèche du sélecteur |
| Pas de « démo », « fun », « crédit », pas de bouton « Continuer » | **Respecté** (check-release [e]) ; reprise = « REPRENDRE LA PARTIE » |
| Clic n'importe où pour fermer, clic consommé | **Respecté** (`anywhereToDismiss`) |
| Symboles 85-95 % de la case | Réglé par symbole (`symbolConfig.ts`, `visibleFill` du manifeste) |
| Anticipation 1,6-2,2 s | **1,85 s** par colonne (`T.spin.antiMs`, timings.ts), zoom 1,07, tension sonore |
| Gros gain dès ×10, 50+ poses | Paliers ×10/×25/×100/×500/×1000 + MAX WIN ; célébrations graduées de Buck, détonations, geysers |
| Mascotte : articulations invisibles, pieds ancrés | Rig cut-out, IK à deux os, pieds ancrés (`Buck.ts`) |
| Décor vivant, transitions thématiques | Nuages, chute d'eau, poussières, oies, projecteurs de nuit, monument ; détonateur → nuit ; souffle de l'accueil |
| Pas de gel, pas de retour en arrière | Horloge unique, Beat annulable ; textures préchargées ; relecture exacte |

## 4. Non vérifié ici (limites honnêtes)

- **Images par seconde réelles** : le conteneur n'a qu'un rendu WebGL logiciel (swiftshader), des dizaines de fois plus lent qu'un GPU. Aucune mesure de FPS n'y a de sens ; les captures avancent par pas de 100 ms virtuels. **À mesurer sur un vrai téléphone.**
- **Écoute** : musique, ambiances et bruitages sont synthétisés en code et mesurés (niveaux, crêtes, pas de saturation) mais **personne ne les a écoutés**.
- **Traductions** : 15 langues produites sans relecture par un natif.
- **Windows** : `LANCER-BOOMTOOTH.cmd` n'a pas pu être exécuté (pas de Windows ici) ; sa commande de serveur est celle testée par `tools/serve-stable.mjs`.
- **Maths** : valeurs provisoires ; RTP, fréquences et gains réels dépendent de l'équipe maths.
- **Intégration Stake réelle** : testée contre le faux RGS local uniquement (voir § 5).

## 5. Intégration Stake (faux RGS local)

| Contrôle | Commande | Résultat |
|---|---|---|
| Client RGS | `tests/rgs-client.test.ts` (28 tests) | authenticate, play, end-round seulement si manche active, `/bet/event`, erreurs (ERR_IPB, ERR_IS, 5xx, délai → incertain), montants base 10^6, devises sociales, relecture |
| Fournisseur Stake | `tests/rgs-provider.test.ts` (20 tests) | reprise à l'index enregistré, réconciliation après pari incertain, progression séquentielle jamais en arrière, arrêt à la clôture |
| **Session réelle par clics** | `npm run stake-e2e` (build de production + faux RGS) | **OK** : solde affiché, spin gagnant (débit, `/bet/event`, un seul end-round), spin perdant (pas d'end-round, solde relu) |
| **Reprise d'une manche ouverte** | idem | **OK** : dialogue « REPRENDRE LA PARTIE », aucun nouveau débit, reprise après l'événement enregistré, end-round |
| **Relecture** | idem (`?replay=true…`) | **OK** : seul `/bet/replay/…` est appelé, la manche se joue, badge RELECTURE |

Corrigés pendant la campagne : `rgs_url` local forcé en https (faux RGS injoignable), réauthentification en anglais lors d'une réconciliation, envois `/bet/event` parallèles (index qui reculait, envois après clôture), délai qui ne couvrait pas la lecture de la réponse, `active:"false"` lu comme vrai, grille vide avant le premier tour en session Stake, message générique pour une erreur RGS au démarrage, manche restée ouverte (ERR_BR) sans réconciliation.

## 6. Parcours joueur par clics réels (mode local)

`node tools/play-e2e.mjs <l>x<h>` : SPIN, turbo, mise, Ante, autoplay et son arrêt, achat → confirmation → bonus complet → retour.

| Taille | Résultat |
|---|---|
| 1440 × 900 | **14 / 14 OK** (bonus acheté joué jusqu'au bout en 100 s virtuelles) |
| 390 × 844 tactile | **14 / 14 OK** (sélecteur de mise compact compris) |
