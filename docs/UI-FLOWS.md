# BOOMTOOTH — Parcours d'interface

> Tous les parcours du joueur, de l'ouverture à la relecture, tels que le code les exécute. Pour les animations et leurs durées : `ANIMATIONS.md`.

État décrit : commit `c88a599` du **28/09** (d'autres agents modifient encore le code). Sources : `src/main.ts`, `src/core/fsm.ts`, `src/controller/game.ts`, `src/controller/presenter.ts`, `src/ui/*.ts`, `src/ui/*.css`, `src/render/layout.ts`, `src/stake/*`, `src/provider/*`.

---

## 1. Machine à états et transitions d'interface

### 1.1 Hors manche

```
 loading ──► welcome ──► entering ──┬──────────────────────────────► ready ◄─────────────┐
    │        (accueil ou              └──► resume ──► spinning … (manche reprise)        │
    │         entrée directe)                                                            │
    └──► bloc d'erreur du chargeur (hors FSM, « Réessayer » = recharger)                 │
                                                                                         │
 ready ── SPIN / Espace / autoplay ──────────────► requesting ──► spinning … returning ──┤
 ready ── BUY ──► catalog ◄──── Annuler ────► confirm ── CONFIRMER ──► requesting        │
                    │                           │                                        │
                    └── X / Échap / voile ──────┴──────────────────────────────► ready ──┤
 requesting ── erreur certaine ──► error ── OK / Réessayer ──► ready                     │
 requesting ── erreur incertaine ──► waiting ── réconciliation ─┬─► spinning (reprise)   │
                                                                └─► ready ───────────────┤
 ready ── REVOIR (historique) ou relecture Stake ──► replay ── fin ──► ready ────────────┘
```

### 1.2 Pendant la manche

Le présentateur annonce une **phase** à chaque événement (`GamePresenter.onPhase`). Le contrôleur ne l'applique **que si la transition est permise** (`fsm.can`) ; sinon elle est ignorée (relecture, reprise).

```
 spinning ──(rouleau anticipé)──► anticipation
    │                                  │
    └──── fin du reveal ─────► resolving ◄──┘
                                │  ▲  │  ▲
                   blast / carve│  │  │  └──── fin de la célébration
                                ▼  │  ▼
                             feature   celebration   (setWin ≥ ×10, wincap)

 resolving ── freeSpinTrigger ──► bonusIntro ── toucher ──► bonus ── reveal ──► spinning …
 resolving ── updateFreeSpin ───► bonus
 resolving ── freeSpinEnd ──────► bonusOutro ── toucher ──► returning
 resolving | bonusOutro ── fin du book ──► returning ── end-round ──► ready
```

### 1.3 États, déclencheurs, entrées

| État | Posé par | Entrées acceptées (`ALLOWED_INPUTS`) |
|---|---|---|
| `loading` | démarrage | — |
| `welcome` | `main.ts`, même si l'accueil est sauté | `dismiss` |
| `entering` | `main.ts`, après l'accueil | — |
| `ready` | fin de manche, annulation, erreur | `spin`, `bet`, `buy`, `menu`, `autoplay`, `ante` |
| `requesting` | `GameController.playRound` (pari envoyé) | — |
| `spinning` | `finishRound`, `presenter.reveal` | `quickStop`, `skip`, `menu` |
| `anticipation` | `presenter.reveal` (`onAnticipate`) | `quickStop`, `skip`, `menu` |
| `resolving` | fin du reveal, gains, chute, multiplicateur, `setWin`, relance | `skip`, `menu` |
| `feature` | `blast`, `carve` | `skip`, `menu` |
| `celebration` | `setWin` ≥ ×10, `wincap` | `skip`, `dismiss` |
| `bonusIntro` / `bonus` / `bonusOutro` | `presenter.fsTrigger`, `updateFreeSpin`, `fsEnd` | `dismiss` / `skip`, `menu` / `dismiss`, `skip` |
| `returning` | `finishRound` | — |
| `catalog` / `confirm` | `BuyMenu.onStep` | `buy`, `dismiss`, `menu` / `buy`, `dismiss` |
| `waiting` | erreur **incertaine** sur un pari | — |
| `error` | erreur **certaine** sur un pari | `dismiss` |
| `resume` | manche ouverte au démarrage | — |
| `replay` | `GameController.replayRound` | `skip`, `menu` |

Ce que le code consulte vraiment : `spin` et `bet` (`GameController`), `menu` (bouton menu, avec `ready`), `ante` (avec `ready`), `state === 'ready'` pour BUY. **Arrêt rapide et skip** ne lisent pas la table : ils suivent la phase du HUD et `fsm.inRound`.

---

## 2. Chargement

| Étape | Progression | Détail |
|---|---|---|
| Langue | — | `lang` de l'URL, sinon langue du navigateur ; `social=true` impose l'anglais |
| Paramètres invalides | — | bloc d'erreur **immédiat** (jamais de bascule silencieuse vers le mode local) |
| Config maths | 4 % | `game-math-config.json` |
| Manifeste | 8 % | liste des textures |
| Polices | 12 % | Lilita One, Baloo 2 |
| Textures | 12 → 84 % | **progression réelle** |
| Envoi au GPU | 84 → 92 % | aucun à-coup au premier bonus |
| Session | 100 % | `authenticate` (local, Stake ou relecture) |

- **Écran** : logo Crownforge, barre bois/or, étincelle au bout ; fondu 400 ms quand tout est prêt.
- **Erreur** (n'importe quelle étape) : « Le chargement a échoué. Vérifiez votre connexion. » + **Réessayer** (focus clavier) → **recharge la page**.

---

## 3. Accueil

| Point | Comportement |
|---|---|
| **Quand** | Après le chargement. **Sauté** si `?skipIntro`, `?qa`, relecture Stake, manche à reprendre, ou préférence « Ne plus afficher ». `?welcome` le force. |
| **Contenu** | Logo, **3 cartes illustrées** (BLAST & CARVE, SUNDOWN SHIFT, FLOODLIGHT SHIFT), gain maximal (« Gain maximal 25 000× la mise »), « Touchez n'importe où », case **« Ne plus afficher »**. |
| **Fermer** | **Toucher n'importe où**, ou Entrée / Espace. Aucun bouton « Continuer ». Armé après 300 ms. |
| **Geste consommé** | `pointerdown`, `click` qui suit (400 ms) et touche : **aucun spin, achat ou écran suivant** ne se déclenche. |
| **« Ne plus afficher »** | Préférence locale `bt.skipWelcome` (stockage protégé par try/catch) ; cliquer la case ne ferme pas l'accueil. |
| **Après** | Sortie « souffle » des cartes, entrée de Buck (balayage), `entering` → `ready`. |

---

## 4. Jeu de base

### 4.1 HUD (bureau, de gauche à droite)

**BUY BONUS** · menu · son · infos (règles) · **Solde** · **Gain** · **Mise − valeur +** · turbo · **SPIN** · autoplay. Ante sous le logo, à gauche de la grille. Compteur de free spins sur la planche au-dessus de la grille.

### 4.2 SPIN

| Phase HUD | Icône / libellé | Clic |
|---|---|---|
| `idle` | flèches · « Lancer » | **spin** |
| `spinning` (toute la manche, bonus compris) | STOP · « Arrêter » | **arrêt rapide** + passe l'événement en cours |
| `autoplay` | STOP + tours restants · « Arrêter le jeu automatique » | **arrête l'autoplay** (la manche en cours finit) |
| `locked` | désactivé | relecture en cours |

- **Au clic, les rouleaux partent tout de suite** ; le pari part au serveur en même temps (`requesting`).
- Solde insuffisant pour le prochain spin : **aucun pari**, dialogue « Solde insuffisant », solde mis en évidence.
- **Espace** : `ready` → spin ; en manche → arrêt rapide. Ignoré si : juridiction `disabledSpacebar`, dialogue bloquant, menu ou BUY ouvert, relecture Stake, focus sur un bouton / champ / dialogue. **Inactif pendant `requesting`** (seul le bouton marche avant la réponse).
- **Clic sur la grille** pendant une manche : passe l'événement en cours (état final exact).

### 4.3 Mise

| Disposition | Commande |
|---|---|
| `desktop`, `laptop`, `tablet` | boutons **−** / **+** de part et d'autre de la valeur |
| `portrait`, `mini`, `landscapeShort` | **sélecteur compact** : la case « Mise » est un bouton (≥ 44 px, `aria-haspopup`, `aria-expanded`) qui ouvre **− / valeur / +** au-dessus |

- La valeur affichée est le **coût du prochain spin** (mise × coût Ante si l'Ante est actif).
- Paliers : ceux du serveur (filtrés par min / max) ; en local 27 paliers de 0,10 € à 100 €, 1 € par défaut.
- − et + se désactivent aux bornes et **pendant la manche**. Le sélecteur se ferme au toucher extérieur, au changement de disposition et au lancement d'un spin.

### 4.4 Turbo (3 niveaux)

- Bouton éclair du HUD : **NON (×1) → TURBO (×1,8) → ULTRA (×3) → NON**. Deux éclairs affichés au niveau ULTRA.
- Même réglage dans **RÉGLAGES** (boutons segmentés). Mémorisé (`bt.settings`).
- Juridiction : `disabledTurbo` masque le bouton et la rangée ; `disabledSuperTurbo` saute ULTRA.
- Changer de niveau en cours de manche agit sur les attentes suivantes.

### 4.5 Autoplay

| Étape | Comportement |
|---|---|
| Ouvrir | Bouton autoplay (au repos seulement) → menu **10 · 25 · 50 · 100 · 250 · 500 · 1 000** (focus sur le premier) |
| Pendant | SPIN montre STOP et le nombre de tours restants ; **220 ms** entre deux manches (÷ vitesse turbo) |
| Arrêter | SPIN ou bouton autoplay : la manche en cours va à son terme |
| Arrêt automatique | compteur épuisé, **solde insuffisant** (dialogue), **toute erreur** |
| Bonus | les free spins s'enchaînent seuls ; **les panneaux d'intro et de fin de bonus attendent un toucher** (l'autoplay attend) |

- Juridiction `disabledAutoplay` : bouton masqué.
- Aucune limite de perte ou de gain unique. Le premier tour de `startAuto` ne vérifie pas le solde (le serveur refuse le pari si besoin).

### 4.6 Ante — DOUBLE FUSE

| Point | Comportement |
|---|---|
| **Où** | Encart sous le logo (colonne gauche en bureau et paysage court, en-tête en portrait et tablette) |
| **Contenu** | « MISE ANTE », interrupteur OUI / NON, « CHANCE DE BONUS ×3 », « PROCHAIN SPIN » + coût réel. Valeurs lues dans `modes.ANTE` (coût 1,5, facteur 3 en config provisoire). |
| **Basculer** | Au repos seulement (sinon désactivé). Pas un achat : aucun débit. |
| **Effets** | Mode de pari `ANTE` ; lampe frontale de Buck **rouge** ; mise du HUD = coût réel ; **BUY bloqué** (raison affichée dans le catalogue). |
| **Masqué** | Mode sans `ANTE` dans la config, **relecture**, **pendant les free spins**. |
| **Accessibilité** | `role="switch"`, `aria-checked`, `aria-describedby` vers le facteur et le coût. |

Le nom « DOUBLE FUSE » n'apparaît pas à l'écran.

### 4.7 Son

Bouton son : coupe tout (contexte audio suspendu après 200 ms), le rallume au clic suivant. Non mémorisé. Les volumes (général, musique, effets) sont dans RÉGLAGES et mémorisés.

---

## 5. Achat (BUY BONUS)

```
 ready ── BUY ──► CATALOGUE ── carte ──► CONFIRMATION (devis figé) ── CONFIRMER ──► requesting
            (catalog)      │            (confirm)      │                              │
                           │                           └─ ANNULER / voile ─► CATALOGUE │
                           └─ X / Échap / voile ─► ready (aucun achat)                 │
                                                                                       ▼
                            serveur accepte (débit serveur) ──► le panneau se ferme ──► manche du mode acheté
                            serveur refuse / erreur ──► dialogue d'erreur ──► CATALOGUE (état cohérent)
```

| Étape | Détail |
|---|---|
| **Ouvrir** | BUY au repos (`ready`) si la juridiction autorise l'achat. Enseigne qui descend et se balance. |
| **Catalogue** | 4 cartes : **SUNDOWN SHIFT** (10 FREE SPINS, 100 ×), **FLOODLIGHT SHIFT** (12 FREE SPINS, 350 ×), **TNT SPIN** (« 2+ CHARGES EN CHAÎNE », 25 ×), **MEGA BLAST SPIN** (« GÉANT 4×4 », 60 ×). Prix = mise × coût du mode, en monnaie. |
| **Confirmation** | « ACHETER {nom} ? », ligne courte, **TOTAL** exact, **CONFIRMER** / **ANNULER**. Le devis (mode, mise, coût, devise) est **figé** à l'ouverture. |
| **CONFIRMER** | Verrou immédiat : les deux boutons et X désactivés, `aria-busy` ; **un seul appel** quelle que soit la cadence des clics. Échap et voile sans effet pendant l'attente. |
| **Débit** | **Côté serveur uniquement**, à l'acceptation du pari. Le panneau se ferme dès que la manche commence (`onRoundStart`). |
| **Manche** | Les rouleaux partent au `reveal` (pas au clic). Bonus : déclenchement, intro, free spins. Feature : une révélation et sa résolution. |

**Refus**

| Cas | Où | Effet |
|---|---|---|
| **Ante actif** | catalogue | bandeau « Indisponible avec la MISE ANTE » ; toutes les cartes atténuées (`aria-disabled`) ; clic sans effet |
| **Solde insuffisant** | catalogue | carte atténuée + « Solde insuffisant » (`aria-describedby`) |
| **Devis périmé** (mise changée, Ante activé) | à la confirmation | aucun débit, retour au catalogue |
| **Refus serveur** (`ERR_IB`, `ERR_BR`…) | après CONFIRMER | dialogue d'erreur, puis retour au catalogue, cartes recalculées |
| **Juridiction** `disabledBuyFeature` | HUD | bouton BUY masqué ; prix et features masqués dans les règles |

---

## 6. Menus

| Point | Comportement |
|---|---|
| **Ouvrir** | Bouton menu (onglet courant) ou infos (onglet RÈGLES). Au repos et pendant la manche (`spinning`, `anticipation`, `resolving`, `feature`, `bonus`, `replay`) ; **pas** pendant une célébration, une intro / fin de bonus, une requête ou une erreur. |
| **Fermer** | Bouton X (icône seule), **Échap** (même si le focus est sorti), clic sur le voile. |
| **Forme** | Panneau `scr.card` sur voile léger, **la slot reste visible**, ouverture instantanée. |
| **Onglets** | **RÈGLES · RÉGLAGES · HISTORIQUE** ; flèches, Début, Fin ; `tablist` / `tab` / `tabpanel`. |

**RÈGLES** (tout vient de la config maths, jamais du texte en dur) : façons de gagner (3 125), valeur des symboles **en monnaie pour la mise courante**, WILD et SCATTER, BLAST & CARVE (trois charges et leurs zones), bonus (déclenchement, tours, relances 2 → +2, 3 → +5, 4+ → +8 en super), CORNERSTONE, features, prix des modes, ANTE, gain max, RTP par mode, clause de dysfonctionnement. Le statut « provisoire » de la config n'est jamais affiché.

**RÉGLAGES** (mémorisés : `bt.settings`, `bt.quality`)

| Réglage | Valeurs | Effet |
|---|---|---|
| Volume général, Musique, Effets | 0-100 % (0,8 / 0,7 / 0,9 par défaut) | bus audio |
| Turbo | NON · ⚡ · ⚡⚡ | voir § 4.4 |
| Animations réduites | OUI / NON (défaut : préférence système) | voir § 13 |
| Graphismes | HAUTE / BASSE | densité de pixels 2 / 1,25 |

**HISTORIQUE + relecture**

- Jusqu'à **20 manches** de la session : mode, heure, coût réel (mise × coût du mode), gain.
- **REVOIR** : actif seulement au repos (désactivé pendant une manche, jamais un clic sans effet). Le menu se ferme, la manche est **rejouée sans appel serveur ni débit** (état `replay`, SPIN verrouillé), puis retour à `ready`.
- Liste vide : Buck et « Aucune manche pour l'instant. ».
- L'onglet se rafraîchit en fin de manche s'il est ouvert.

---

## 7. Dialogues d'erreur (codes RGS → actions)

Panneau `alertdialog` centré dans la zone de jeu ; un seul dialogue à la fois (file) ; gestes sur le voile consommés.

| Code | Titre | Boutons | Échap | Effet |
|---|---|---|---|---|
| `ERR_IS`, `ERR_ATE` | Session expirée | **RECHARGER** | non | recharge la page |
| `ERR_IB`, `ERR_IPB` | Solde insuffisant | **OK** | oui | solde du HUD mis en évidence |
| `ERR_BR`, `ERR_OR`, `ERR_NR`, `ERR_VAL`, `ERR_GLE` | Un problème est survenu | **OK** | oui | retour au repos |
| `ERR_TF`, `ERR_GEN`, `BAD_RESPONSE` | Un problème est survenu | **RÉESSAYER** + Fermer ; **OK seul si incertain** | oui | incertain : « Votre dernière manche sera vérifiée avant de continuer. » |
| `ERR_LOC` | Un problème est survenu | **RECHARGER** | non | recharge la page |
| `ERR_MAINTENANCE` | Maintenance | **RECHARGER** | non | recharge la page |
| `TIMEOUT`, `NETWORK` | Connexion perdue | **RÉESSAYER** + Fermer | oui | hors ligne : « En attente du réseau… » ; retour du réseau : « Reconnexion… » puis réessai **automatique** (400 ms) |
| Code inconnu | → `ERR_GEN` | | | |

Conséquences côté contrôleur :

- **Pari** (`play`) : jamais de nouveau pari automatique. Une erreur certaine ramène à `ready`. RÉESSAYER ne relance la demande que si l'erreur était certaine ; en session Stake, les codes « réessayables » (`ERR_TF`, `ERR_GEN`, `BAD_RESPONSE`, `TIMEOUT`, `NETWORK`) sont **toujours incertains** sur un pari : quel que soit le bouton, le jeu réconcilie (§ 8), jamais un second pari.
- **Clôture** (`end-round`) : RÉESSAYER relance la clôture (une seule fois par manche côté serveur) ; OK garde le solde connu.
- **Démarrage** : une erreur d'authentification passe par le bloc du chargeur (§ 2), pas par ces dialogues.

---

## 8. Attente et incertitude réseau

| Situation | Indicateur | Verrou |
|---|---|---|
| Requête normale (`requesting`) | « Veuillez patienter » **après 1,5 s** seulement | **non bloquant** : l'arrêt rapide reste possible |
| Pari **incertain** (`waiting`) | voile transparent **immédiat**, indicateur après 250 ms, puis dialogue d'erreur | **toutes les commandes bloquées** |

Incertain = sur un pari : délai dépassé, réseau, réponse illisible, 5xx, `ERR_TF`, `ERR_GEN`.

```
 requesting ── pari incertain ──► waiting ── dialogue (OK / Réessayer) ──► réconciliation (nouvelle authentification)
                                                                     ├─ manche ouverte ► spinning : jouée SANS nouveau débit
                                                                     └─ aucune         ► ready : solde serveur
```

Écart : si la réconciliation échoue elle-même, le jeu **revient quand même à `ready`** (le commentaire du code dit « reste bloqué »). Un nouveau pari reste alors possible ; le serveur répondrait `ERR_BR` si une manche est encore ouverte. En local (`DemoProvider`), il n'y a pas de réconciliation.

---

## 9. Reprise d'une manche interrompue

| Étape | Comportement |
|---|---|
| Détection | `authenticate` renvoie une manche **active** : `startAt = dernier événement enregistré + 1` |
| Accueil | **sauté** |
| Dialogue | « **Manche en cours** » — « Votre dernière manche a été interrompue. Elle reprend là où elle s'est arrêtée, sans nouvelle mise. » — **REPRENDRE LA PARTIE** (seul bouton, pas d'Échap) |
| Restauration | événements antérieurs appliqués **en silence**, scène remise directement (grille, nuit du bonus, compteur, Cornerstone si > ×1, gain) |
| Suite | présentation à partir de `startAt`, puis `end-round` et `ready` ; **aucun nouveau débit** |
| Progression | après chaque événement d'une manche active : `/bet/event` (en série, non bloquant, jamais en arrière) |

Même mécanisme après une réconciliation (§ 8). Écarts : monument non restauré ; Cornerstone absent si la reprise tombe à ×1.

---

## 10. Relecture Stake (badge REPLAY)

| Point | Comportement |
|---|---|
| **Lancement** | URL `replay=true` + `rgs_url`, `game`, `version`, `mode`, `event` (+ `currency`, `amount`, `lang`). Paramètre manquant → bloc d'erreur du chargeur. |
| **Chargement** | `GET /bet/replay/…` ; **aucune session, aucun appel wallet, aucun pari**. |
| **Accueil** | sauté. |
| **HUD** | classe `is-replay` : **BUY, solde, − / +, autoplay, turbo masqués** ; Ante masqué ; Espace ignoré. |
| **Badge** | « **RELECTURE** » (« REPLAY » en anglais) sur la planche au-dessus de la grille. |
| **Déroulé** | La manche se joue seule à l'ouverture (état `replay`, SPIN verrouillé) ; à la fin, **SPIN la rejoue**. |

Écarts : **impossible de passer** pendant la relecture (`replay` n'est pas un état de manche, SPIN verrouillé) ; si la manche contient un bonus, **le compteur de free spins remplace le badge puis le masque** à la fin du bonus.

---

## 11. Mode social

| Point | Comportement |
|---|---|
| **Activation** | `social=true` dans l'URL (le drapeau `socialCasino` renvoyé par le RGS n'est pas lu) |
| **Langue** | **anglais imposé**, quel que soit `lang` |
| **Dictionnaire** | appliqué à **toutes** les chaînes traduites (`socialize`), expressions longues d'abord, casse conservée |
| **Exemples** | BUY BONUS → **GET BONUS** · Bet → **Play** · ANTE BET → **ANTE PLAY** · « BUY {name}? » → « PLAY {name}? » · purchase → play · currency → token |
| **Devises** | `XGC` → « GC », `XSC` / `XEC` → « SC », sans symbole monétaire |
| **Contrôle** | `socialViolations()` (tests) ; `tools/check-release.mjs` (mots interdits) |

---

## 12. Dispositions par classe d'écran

Une seule mise en page pour la scène et le HUD (`computeLayout`). Classement dans cet ordre :

| Classe | Condition | HUD | Grille | Buck, logo, Ante | Ce qui change |
|---|---|---|---|---|---|
| **mini** | largeur < 560 **et** hauteur < 560 | bas, 26 % (110-150 px), 1re rangée 44 px | pleine largeur, en-tête 10 % | **Buck masqué** ; Cornerstone sous l'Ante | SPIN ≤ 76 px, BUY 78 × 53, mise compacte, infos dans le menu |
| **tablet** | ratio < 0,8 et largeur ≥ 700 | bas, 20 % (170-230 px), **2 rangées** : solde · gain · mise / BUY · SPIN · icônes | pleine largeur (96 %) | en-tête 26 % : logo et Ante à gauche, Buck à droite au-dessus de la grille | − / + visibles ; décor portrait plein cadre |
| **portrait** | ratio < 0,8 | bas, 24 % (170-220 px) : valeurs sur la planche / BUY · turbo+auto · SPIN · menu+son | pleine largeur | comme tablet | **mise compacte**, **infos masquées** (règles via menu), SPIN ≤ 104 px |
| **landscapeShort** | hauteur < 520 | **colonne droite** 15 % (96-150 px) : solde, gain, turbo+auto, SPIN ≤ 84 px, mise compacte | 66 % de la scène | **colonne gauche** 17 % : logo, Ante, menu + son ; Buck à droite s'il y a la place | BUY fixé en bas à gauche, planche du HUD masquée, infos masquées |
| **desktop** | largeur ≥ 1 280 | **bande basse** 12 % (88-118 px), une rangée | centre, ≤ 50 % de la largeur | logo et Ante à gauche, Mount Buckmore dessous ; Buck à droite (1,02 × la grille) | SPIN 118 px, BUY 150 × 101 |
| **laptop** | sinon | comme desktop | ≤ 54 % de la largeur | comme desktop | SPIN 96 px, textes plus petits, icônes 44 px |

- **Menus, achat, dialogues** : centrés dans la **zone de scène** (au-dessus du HUD, entre les colonnes en paysage court).
- **Compteur de free spins / badge** : planche au-dessus de la grille (`topBar`), au plus 460 px de large.
- **Marges de sécurité** : `env(safe-area-inset-*)`. Recalcul sur `resize` et `visualViewport.resize`.
- Contrôle : `tools/hud-check.mjs` sur ~25 tailles (chevauchements, débordements, cibles ≥ 44 px, HUD hors grille) ; `captures/hud/`.

---

## 13. Accessibilité

| Sujet | Mise en œuvre |
|---|---|
| **Focus visible** | contour 3 px (`--focus`) sur boutons du HUD, case mise, autoplay, onglets, cartes, bouton Réessayer du chargeur |
| **Pièges de focus** | menu, achat, confirmation, dialogues, intro / fin de bonus ; **empilables** (seul le dernier reçoit Tab et Échap) ; retour du focus au déclencheur à la fermeture ; pendant un achat en cours, le focus reste dans la confirmation |
| **Focus initial** | Réessayer du chargeur ; accueil (racine) ; onglet courant du menu ; carte sélectionnée ou première carte disponible ; premier bouton d'un dialogue ; premier palier d'autoplay |
| **Clavier** | Espace : spin / arrêt rapide (§ 4.2) ; Entrée / Espace : fermer accueil, intro, fin de bonus, célébration ; flèches / Début / Fin : onglets ; Tab limité aux éléments atteignables |
| **Échap** | ferme le menu, le BUY (même depuis la confirmation, sauf achat en cours), les dialogues fermables. **Sans effet** sur l'accueil, l'intro / fin de bonus, la célébration, la reprise et les erreurs non fermables |
| **Cibles ≥ 44 px** | icônes du HUD, − / +, case mise compacte, paliers d'autoplay (52 × 44), bouton X (50 px), curseurs de volume et interrupteurs (44 px), REVOIR, onglets en paysage court, case « Ne plus afficher » |
| **Mouvement réduit** | réglage « Animations réduites » (défaut : `prefers-reduced-motion`) → `html[data-motion]` + scène ; détail et limites dans `ANIMATIONS.md` § 0.3 |
| **aria-live** | gain du HUD (`polite`) ; compteur de free spins (`polite`) ; « +N FS » (`assertive`) ; région cachée des surcouches (`polite` : titre et montant final d'une célébration) ; attente (`role="status"`) ; état de connexion dans un dialogue (`polite`) ; célébration `role="status"` |
| **Rôles** | chargeur `progressbar` (`aria-valuenow`) ; dialogues `alertdialog` / `dialog` + `aria-modal`, `aria-labelledby`, `aria-describedby` ; Ante `switch` ; cartes d'achat `aria-pressed`, `aria-disabled`, raison liée ; autoplay `menu` / `menuitem` ; SPIN avec libellé selon la phase |
| **Langue** | `lang` sur `<html>` ; `dir="rtl"` en arabe (interface HTML seulement, la scène garde sa géométrie) |

Limites : `aria-label="Loading"` du chargeur figé en anglais ; `overlays.css`, `welcome.css` et `hud.css` ne suivent que la préférence système, pas le réglage du jeu.

---

## 14. Juridiction (`authenticate` → `config.jurisdiction`)

| Drapeau | Effet |
|---|---|
| `disabledTurbo` | bouton turbo et rangée des réglages masqués |
| `disabledSuperTurbo` | niveau ULTRA sauté et désactivé |
| `disabledAutoplay` | bouton autoplay masqué |
| `disabledBuyFeature` | BUY masqué ; prix, features achetables et leurs RTP masqués dans les règles |
| `disabledSpacebar` | Espace sans effet |
| `disabledSlamstop`, `socialCasino`, `displayRTP`, `displayNetPosition`, `displaySessionTimer`, `disabledFullscreen` | **lus mais non appliqués** |

---

## 15. Écarts connus (intention → code)

| # | Écart | Section |
|---|---|---|
| 1 | Espace inactif pendant `requesting` ; arrêt rapide jamais interdit (`disabledSlamstop` ignoré) | § 4.2, § 14 |
| 2 | L'autoplay s'arrête aux panneaux d'intro et de fin de bonus (toucher obligatoire) ; premier tour sans contrôle de solde | § 4.5 |
| 3 | Réconciliation en échec → retour à `ready` au lieu de rester bloqué | § 8 |
| 4 | Relecture non passable ; badge écrasé par le compteur de bonus ; relecture d'historique sans badge et avec le gain relu dans le HUD | § 6, § 10 |
| 5 | Reprise : monument et Cornerstone ×1 non restaurés | § 9 |
| 6 | Mode social piloté par l'URL seulement | § 11 |
| 7 | « DOUBLE FUSE » absent de l'écran | § 4.6 |
| 8 | Réglage « Animations réduites » ignoré par trois feuilles CSS | § 13 |

---

## 16. Reproduire les parcours

| Parcours | Local (`DemoProvider`, build QA) | Faux RGS (`node tools/mock-rgs.mjs`, port 5310) |
|---|---|---|
| Erreur certaine | `provider.failNext = 'ERR_BR'` (via `__qa.deps`) | `POST /__mock/next {"error":"ERR_BR"}` |
| Pari incertain | `provider.uncertainNext = true` | `POST /__mock/next {"timeout":true}` |
| Solde insuffisant | mise > solde, ou `ERR_IB` forcé | `{"error":"ERR_IB"}` |
| Reprise | — | `{"resume":true}` (manche BONUS ouverte, reprise à l'index 4) |
| Session | — | `sessionID=expired` → 401 ; `sessionID` absent → `ERR_IS` |
| Relecture | menu HISTORIQUE → REVOIR | URL `replay=true&…` |

Lancer contre le faux RGS : `http://127.0.0.1:5302/?sessionID=mock-session&rgs_url=http://127.0.0.1:5310&lang=fr`.


## Mise à jour (28/09, fin de journée)

- **Espace** agit aussi pendant l'attente de la réponse serveur (arrêt rapide appliqué à l'atterrissage).
- **Juridiction** : `disabledSlamstop` désactive l'arrêt rapide (clic SPIN / Espace sans effet pendant le défilement) ; `socialCasino` impose le mode social même sans `?social=true`.
- **Pari incertain** : tant que la relecture de l'état serveur échoue, le jeu reste **verrouillé** et l'erreur est reproposée ; une manche encore ouverte (ERR_BR) déclenche aussi cette réconciliation.
- **Erreur au démarrage** : le message correspond au code RGS (session expirée, maintenance, juridiction…).
- **Grille de départ** neutre identique dans tous les modes (local, Stake, relecture).
- **Relecture** : clic sur la grille pour passer ; badge conservé pendant les free spins.
