# AVANCEMENT — BOOMTOOTH

Mis à jour le 28/09/2026. Branche `claude/funny-lamport-2y5sp6`.

## Fait

| Domaine | État |
|---|---|
| **Concept** | BOOMTOOTH choisi par un panel (5 concepts notés) ; mécanique BLAST & CARVE, SUNDOWN / FLOODLIGHT SHIFT, Cornerstone, Ante DOUBLE FUSE, features TNT SPIN / MEGA BLAST SPIN — `docs/CONCEPT.md` |
| **Direction artistique** | 5 directions ImageGen, D1 retenue — `docs/ART-DIRECTION.md` |
| **Images** | 4 lots ImageGen (Codex CLI, abonnement ChatGPT), 57 images sources → 127 textures ; pipeline alpha / découpe / planches de contrôle — `docs/ASSETS.md`, `docs/IMAGEGEN.md` |
| **Contrat** | Books v1.1, schéma zod + invariants, 33 fixtures validées (chaînes, charges reliées, relances, MAX WIN) — `docs/CONTRAT-EVENTS.md` |
| **Moteur** | Horloge de présentation unique, séquences passables/annulables, machine à états explicite suivant chaque phase, lecteur d'événements appliqués une fois |
| **Scène** | Grille 5×5 à rouleaux, cadre 9 pièces, symboles assemblés (pièces qui réagissent), géants sculptés, explosions par taille, chaînes, fil de mise à feu, tumbles ; décor vivant jour / nuit / super (sunset, aurore, projecteurs, oies, chute d'eau, monument Mount Buckmore) ; décor portrait dédié |
| **Mascotte** | Buck : rig cut-out IK, repos vivant, allumette sur la dent en or, détonateur à piston, esquive, fierté, célébrations graduées |
| **Célébrations** | Paliers ×10 → ×1000 + MAX WIN : bandeau illustré, geysers d'or, détonations, décor assombri |
| **Interface** | Chargement, accueil 3 cartes, HUD illustré (25 tailles OK), sélecteur de mise compact, turbo, autoplay, Ante, achat 4 modes, menu (règles / réglages / historique + relecture), dialogues d'erreur RGS, attente réseau, reprise |
| **Son** | Musique procédurale (3 ambiances), nappes, 40+ bruitages synthétisés — `docs/AUDIO.md` |
| **Langues** | 17 langues + mode social ; polices OFL locales (latin, cyrillique, arabe, devanagari, CJK par tranches) |
| **Stake** | Paramètres de lancement, client RGS, reprise à l'événement enregistré, `/bet/event`, relecture ; faux RGS local |
| **Outils QA** | Horloge virtuelle `?qa`, `shot.mjs`, `record.mjs` (vidéo), `hud-check.mjs`, `ui-states.mjs`, `check-release.mjs`, `package-delivery.mjs`, `serve-stable.mjs`, `LANCER-BOOMTOOTH.cmd` |
| **Docs** | CONCEPT, ART-DIRECTION, ARCHITECTURE, CONTRAT-EVENTS, ANIMATIONS, AUDIO, IMAGEGEN, ASSETS, UI-FLOWS, VERIFICATION, DECISIONS, AVANCEMENT |

## Livraison

- **`LIVRAISON-BOOMTOOTH-v0.9.0/`** : FRONTEND (build de production), zip (237 fichiers, `index.html` à la racine), MEDIA (couverture, vignette, logo, décors BG/FG, 3 vidéos 1280×720), CONTROLES, GAME-DETAILS-EN.txt, LIRE-AVANT-IMPORT.md, SHA256SUMS (vérifiées).
- **Build figée** : `LANCER-BOOMTOOTH.cmd` (Windows) ou `npm run serve-stable` → http://127.0.0.1:5320/?v=0.9.0

## Bloquant externe

- **Maths définitives** : `public/game-math-config.json` porte `provisional: true` ; l'import Stake reste bloqué (`check-release --stake` → code 2) jusqu'à la config et aux books de l'équipe maths.

## Reste à faire / à confirmer

- Mesurer la fluidité sur de vrais appareils (le conteneur n'a qu'un rendu logiciel).
- Écoute humaine du son ; relecture native des 15 traductions.
- Essai de `LANCER-BOOMTOOTH.cmd` sur Windows.
- Prototypes `?variant=` des pistes alternatives listées dans `docs/ANIMATIONS.md` (non implémentés).
- Mascotte en Spline : possible seulement dans une session locale (voir DECISIONS).
