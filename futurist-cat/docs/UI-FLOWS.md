# UI-FLOWS - CYBER CAT

Tous les écrans « clic n'importe où » (accueil, intros, fin de bonus, célébrations) se ferment d'un clic n'importe où ou avec Entrée / Espace ; ce clic est **consommé** (garde de 280 ms, le `click` qui suit le `pointerdown` est avalé) : il ne lance ni spin, ni achat, ni l'écran suivant. Aucun bouton « Continuer ».

## Démarrage

1. **Chargement** : écran Crownforge seul, barre de progression **réelle** pondérée (images décodées ×6, sons critiques ×2, polices ×1, session ×1). Erreur : message + « Réessayer ». Aucune grille avant l'accueil.
2. **Accueil** : logo + 3 cartes (point laser, 9 VIES, DOUBLE REGARD), chat en pose fixe, décor visible à 35 %. three.js commence à se charger.
3. **Entrée** (au clic) : le logo vole vers sa place en haut à gauche, décor + grille + HUD s'installent, le chat atterrit (dive, traînée depuis le haut, onde cyan, poussière, secousse de 80 ms). Mouvements réduits : fondu. GLB indisponible ou > 8 s : pose fixe puis fondu, jamais de dive tardif.
4. Manche active côté serveur (rechargement en plein bonus) : reprise au point sauvegardé (`/bet/event`), sans nouveau débit.

## Spin

SPIN / Espace / Entrée → le bouton passe en « arrêt rapide » (carré) pendant le défilement ; un 2e appui arrête les rouleaux sans changer le résultat (sauf `disabledSlamstop`). Pendant la résolution et les célébrations, SPIN / clic = passer à l'état final. Aucun spin payant ne part pendant un bonus.

## Bonus

Déclenchement : Scatters mis en avant, le chat fait son salto, popup d'intro (nom, nombre réel de spins, règle clé) → clic → le coup de poing du chat déchire la popup (≤ 0,3 s) → course sur place, la ville glisse en parallaxe → la ville passe en mode scan, musique du bonus → free spins enchaînés automatiquement (indépendants de l'autoplay). Seul « Spins restants : N » au-dessus de la grille. Retrigger : « +N FS » au centre puis vers le compteur. Fin : GAIN TOTAL seul, centré → clic → puces qui s'éteignent une à une, fin du mode scan, le chat replonge (dive → idle).

## Boutique

BUY BONUS → une seule page, 4 cartes (visuel, nom, spins, **prix réel = mise × coût**, grisée si solde insuffisant) → carte → confirmation à **devis figé** (fonction, mise, coût, devise) → ACHETER (double clic bloqué, une seule requête) ou ANNULER (aucun débit). Refus / erreur : message, rouleaux ramenés sur la dernière grille, solde du serveur inchangé. Bonus acheté : les Scatters tombent un par un avec anticipation (clic = passer), puis intro.

## Ante

Bouton sous le logo : titre, état ACTIF/INACTIF très visible (lumière cyan), vrai facteur de chance des Scatters et coût du prochain spin. Pas un achat : aucun débit au clic ; modifiable seulement au repos.

## Autoplay

Petite popup au-dessus du bouton : 10 / 25 / 50 / 100 / 250 / 500 / 1000. Compteur visible sur le bouton et sur SPIN pendant la série. Un clic sur SPIN ou sur le bouton arrête la série. Arrêt automatique : solde insuffisant, erreur, `disabledAutoplay`.

## Menu Infos (onglets arrondis)

Règles (ways, table des paiements en devise pour la mise courante, Wild, Scatter, point laser, échelle de montée, puces, bonus, features et prix, Ante, gain max, RTP par mode si `displayRTP`, « Malfunction voids all pays and plays. » traduit, version) · Réglages (volume, musique, effets, turbo, mouvements réduits, qualité) · Historique / Replay (revoir une manche sans débit). Échap ferme ; focus gardé.

## Replay

URL `?replay=true&game=&version=&mode=&event=&rgs_url=&amount=&currency=&lang=` : GET `/bet/replay/…`, aucune commande de pari ni appel wallet. Barre REPLAY : mise, gain, pause, arrêt (état final exact), revoir.

## Erreurs

| code | comportement |
|---|---|
| ERR_IPB | « Solde insuffisant », solde du serveur relu |
| ERR_IS, ERR_ATE, session invalide | bloquant, « Recharger » |
| ERR_GLE | « Limite de jeu atteinte » |
| ERR_BE | manche déjà active → réconciliation et reprise |
| ERR_BNF (end-round) | déjà clôturée → solde relu |
| ERR_LOC, ERR_MAINTENANCE | message dédié |
| délai dépassé / réseau après envoi | incertain → état `reconcile` → `authenticate` → reprise ou solde relu ; jamais de re-pari |
| book invalide | signalé (jamais réparé), résultat du serveur maintenu, end-round envoyé |
| autres | « Une erreur est survenue » |
