# ANIMATIONS - CYBER CAT

Une ligne par moment (Annexe B), par premium, par palier et par offre. Phrase d'action : préparation → action → impact → maintien → retour. Durées dans `src/config/timings.ts` (turbo ×0,55 là où il s'applique).

**Statut** — `vidéo` : vu en mouvement dans une vidéo de la build servie (horloge virtuelle, 30 fps exacts) ; `code` : écrit et typé, pas encore vu en vidéo ; `bloqué art` : la mise en scène existe mais se juge sur les vraies illustrations ImageGen / le vrai GLB (non disponibles dans ce conteneur : les vidéos montrent des remplaçants de dev et le squelette de test).

| id | moment | mise en scène | durée | statut |
|---|---|---|---|---|
| A01 | Chargement | écran Crownforge seul, barre réelle (images décodées, polices, sons critiques, session), « Réessayer » | réel | vidéo (capture) |
| A02 | Accueil | logo + 3 cartes, décor à 35 %, chat en pose fixe, three.js se charge | — | capture ; pose fixe bloqué art (GLB) |
| A03 | Entrée | le logo vole à sa place, décor/grille/HUD s'installent, le chat plonge (traînée depuis le haut, onde cyan + poussière qui cachent le poing sous le sol, secousse 80 ms, ombre qui grossit) | 0,5-1,2 s | code ; dive jugé sur le squelette de test |
| A04 | Repos | pluie sur 2 profondeurs, train aérien (16-30 s), drone rare (18-34 s), enseignes qui vacillent, idle du chat à un temps aléatoire | boucle | vidéo |
| A05 | Repos des symboles | accent par symbole toutes les 5-12 s, décalé par case (glyphes : scintillement ; canette : oscillation ; pelote : lueur ; poisson : battement ; souris : flottement ; W : lueur ; S : pulsation) | 0,4-1,2 s | vidéo |
| A06 | Chat au repos | idle, regard libre ; visière / yeux émissifs (masque) | boucle | bloqué art (GLB) |
| A07 | Boutons | survol +12 % luminosité, appui 0,93, désactivé 45 % ; réponse < 100 ms (spin : rouleaux au clic, avant la réponse serveur) | 80 ms | vidéo |
| A08 | Catalogue | holo-panneau centré, 4 cartes, prix réel = mise × coût, grisé si solde insuffisant | 0,22 s | e2e |
| A09 | Confirmation | devis figé (fonction, mise, coût, devise), double clic bloqué, une requête | 0,22 s | e2e |
| A10 | Achat accepté | les Scatters tombent un par un avec anticipation (clic = passer), intro, clic, free spins | 0,55 s / Scatter | code |
| A11 | Achat refusé / erreur | message, rouleaux ramenés sur la dernière grille, solde serveur | 0,2 s | e2e |
| A12 | Ante | bouton lumineux ACTIF, facteur + coût du prochain spin ; aucun effet de débit | 0,18 s | e2e + capture |
| A13 | Spin | départ décalé par rouleau (petit recul puis vitesse), symboles étirés, arrêt aligné net + rebond (back.out), son par arrêt (3 variantes) | 1,2-1,6 s | vidéo |
| A14 | Scatter qui tombe | réaction du portail, son montant (1, 2, 3), le chat le regarde, alert si tension | 0,5 s | vidéo |
| A15a | Anticipation réussie | derniers rouleaux ralentis (1,8 s pour un rouleau ; 2,1 s partagées pour plusieurs, atterrissages compris), contour cyan, Scatters déjà posés qui réagissent, boucle de tension + montée, alert ×1,15, zoom de scène 1,06 (HUD fixe) | 1,8-2,1 s | vidéo : 6 s constatées (F09), puis 3,0 s (TEST ANIM, atterrissages en plus) → corrigé (D45) |
| A15b | Anticipation ratée | idem puis « scatter_fail », le chat revient au fond, zoom remis | — | code (F10) |
| A15c | Bait d'achat | non applicable : le jeu ne fait jamais miroiter l'achat pendant l'anticipation (choix : pas d'incitation pendant un tour payant) | — | n/a |
| A16 | Intros | popup 9 VIES / DOUBLE REGARD / SCAN / DOUBLE SCAN : nom, nombre réel de spins, règle clé, illustration | — | vidéo (F09) |
| A17 | Clic pour démarrer | le coup de poing (sous-clip hooks) déchire la popup en deux moitiés dentelées ≤ 0,3 s après le clic, course sur place + ville en parallaxe, passage en mode scan (calque filaire, balayage, teinte), musique du bonus | ≤ 1,8 s | vidéo (déchirure : CSS en temps réel) |
| A18 | Connexions | cases perdantes atténuées (32 %), réaction des symboles de la connexion, montant près de la connexion | 0,75 s (0,45 s si > 3) | vidéo |
| A19 | Cascades | non applicable (pas de cascade) | — | n/a |
| A20 | Point laser | yeux qui chargent (éclat sur headfront), faisceau yeux → 1re case, sauts en arc (0,2 s), anneau + étincelles à chaque case, montée (ancien → éclair → nouveau, une seule représentation), H4 « plein », le chat suit le point du regard | 0,3 s + 0,2 s/saut | vidéo |
| A21 | Multiplicateurs | jeton ×N frappé sur la case d'arrivée (2,2 → 1 + onde) ; au gain : « base → ×N → final », le jeton envoie un trait vers le montant ; croisés : ×3 × ×5 affiché ×15 (valeur du book) | 0,34 s / étape | vidéo (F07, F13) |
| A22 | +N FS | bannière au centre puis vole vers le compteur, compteur qui pulse | 1,1 s | vidéo (F09) |
| A23 | Petit gain < ×10 | réaction des symboles + hop du chat (supprimé en turbo), rien de cinématique | 0,6-1,3 s | vidéo |
| A24 | Paliers | voile léger (le chat reste devant, D43), zoom de scène ×1,1 dans le décor, plaque + titre, compteur à chiffres fixes qui accélère avant chaque seuil et converge exactement ; 1er clic état final, 2e fermeture, sinon fermeture seule après 5,4 s (D44) | voir paliers | vidéo (TEST ANIM : GROS → SUPER → MÉGA → ÉPIQUE → CYBER, décimales fixes, convergence exacte 30,80 / 60,20 / 1 536,00) ; défauts vus et corrigés : maintien 9 s, chat grisé par le voile |
| A25 | Montée de palier | titre qui change (pop), son de palier, secousse, nouvelle idée de décor | 0,35 s | code |
| A26 | MAX WIN | uniquement sur `wincap` ; les yeux du chat emplissent le ciel, la manche s'arrête | 10,5 s | code (F20) |
| A27 | Fin de bonus | GAIN TOTAL seul, centré (montant qui roule puis exact), clic → puces qui s'éteignent une à une, fin du mode scan | 0,6-2,2 s | vidéo (F09) |
| A28 | Retour | le chat replonge (dive → idle), idle34 → idle | 0,6 s | code |
| A29 | États techniques | réconciliation (HUD verrouillé, message), erreurs sobres, perte de contexte 3D → pose fixe | — | e2e |
| A30 | Replay | barre REPLAY : mise, gain, pause (horloge à 0), arrêt (état final exact), revoir ; aucun débit | — | e2e (stake) |

## Premiums (réaction propre à chacun)

| symbole | réaction au gain | accent de repos |
|---|---|---|
| H1 canette | bond + écrasement, le couvercle saute (pièce animée) | petite oscillation |
| H2 pelote | roule d'un quart de tour, les fibres flambent (lueur ×1,35) | lueur qui respire |
| H3 poisson | saut en arc + retournement (flip) | battement du corps |
| H4 souris-drone | décolle, zigzague, se repose ; rotor qui tourne | flotte |
| W | frappe (1,25 → 1) + anneau qui tourne | lueur |
| S | pulsation élastique, iris qui se dilate | pulsation |
| L1-L4 | pulsation sobre | scintillement holographique |

## Paliers (gain du spin / mise de base, seuil inclus)

| palier | seuil | idée | durée du compteur | chat |
|---|---|---|---|---|
| BIG WIN | ×10 | la ville s'allume (enseignes, luminosité), confettis néon | 3,0 s | dance en boucle |
| SUPER WIN | ×25 | pluie de jetons holographiques | +1,4 s | salto → dance |
| MEGA WIN | ×50 | essaim de 14 drones qui dessine le « C » | +1,4 s | salto → dance |
| EPIC WIN | ×100 | le train aérien passe vite, faisceaux des yeux dans le ciel | +1,4 s | salto → dance |
| CYBER WIN | ×500 | surcharge : ville cyan, grille laser dans le ciel, ondes | +1,4 s | salto → dance |
| MAX WIN | `wincap` | yeux géants dans le ciel | 10,5 s | salto → dance |

## Offres

| offre | carte | intro | spécificité |
|---|---|---|---|
| 9 VIES | neuf yeux sur une grille-circuit | « 9 FREE SPINS », un point par spin, puces | mode scan cyan |
| DOUBLE REGARD | deux faisceaux croisés | « 9 FREE SPINS », deux points, puces posées | mode scan double (iris dans le ciel) |
| SCAN | un faisceau, un point | « 1 SPIN », un point garanti | intro avant le défilement |
| DOUBLE SCAN | deux faisceaux | « 1 SPIN », deux points | multiplicateurs croisés possibles |

## Quatre modes, mêmes résultats

Normal · turbo (durées ×0,55, pas de petits gestes du chat, grands moments ×1,3, fondus ×0,7) · mouvements réduits (chat en idle seul, pose fixe de gain, apparition en fondu, ni zoom ni secousse ni pluie ni particules) · qualité réduite (pluie et particules divisées, résolution plafonnée). Le résultat affiché vient toujours du book.
