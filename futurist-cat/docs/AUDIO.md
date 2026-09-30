# AUDIO - CYBER CAT

## Provenance

**100 % synthétisé par le code de `tools/audio/`.** Aucun échantillon, aucun son tiers, aucune banque de sons, aucun téléchargement, aucune API payante ni IA générative audio. Chaque son est calculé hors ligne, en JavaScript pur, à 48 kHz, par :

| fichier | rôle |
|---|---|
| `tools/audio/lib/dsp.mjs` | générateur pseudo-aléatoire à graine (mulberry32), oscillateurs à bande limitée (polyBLEP), bruits blanc/rose/brun, filtres (SVF TPT, biquads RBJ), enveloppes, FFT + convolution, réponses impulsionnelles synthétiques, limiteur à anticipation, mesure true peak (suréchantillonnage x4), K-pondération, outils de boucle, analyse |
| `tools/audio/lib/synth.mjs` | briques sonores : mixeur, 6 salles (IR synthétiques), résonateurs modaux (verre, cloche, plaque), FM 2 opérateurs, cuivres, supersaw, pluck, basse, piano FM, lead, batterie (grosse caisse, caisse claire, clap, charleston, toms, cymbale), rendu Doppler |
| `tools/audio/lib/master.mjs` | mastering par cue : passe-haut (DC), limiteur éventuel, coupe de la queue, normalisation true peak, fondus en cosinus ; version « périodique » pour les boucles |
| `tools/audio/cues/*.mjs` | les 75 cues (ui, jeu, célébrations et bonus, musique, ambiances) |
| `tools/audio/render.mjs` | rendu → WAV float (`tools/audio/.work/`, ignoré par git) → encodage `ffmpeg-static` en `.ogg` (Vorbis) **et** `.m4a` (AAC) → `public/audio/manifest.json` |
| `tools/audio/check.mjs` | contrôle qualité, écrit `docs/preuves/audio-report.json` |
| `src/audio/audio.ts` | moteur WebAudio du jeu (sans dépendance) |

`ffmpeg-static` sert uniquement d’encodeur (et de décodeur pour le contrôle). Le rendu est **déterministe** : une graine par cue (hash de son id). Deux rendus successifs produisent des fichiers identiques octet pour octet (encodage `bitexact`, sans métadonnées).

## Identité sonore

- **Tonalité unique : Ré mineur naturel / Fa majeur** (Ré Mi Fa Sol La Si♭ Do). Tous les sons tonals sont dans la gamme, donc ils se superposent à la musique sans frotter. Le plus grand accord (CYBER WIN, MAX WIN) est un **Rédsus2** : sans tierce, il ne peut pas heurter la musique. Les étincelles utilisent la pentatonique de Ré mineur.
- **Palette** : verre (résonateurs modaux inharmoniques, paires désaccordées qui scintillent), cloches à tierce mineure, FM douce pour le « numérique », synthwave chaude (supersaws désaccordées, cuivres analogiques, arpèges en ping-pong, sidechain), bruit filtré résonant pour les souffles, pas de bip carré. Chaque son est construit en couches **transitoire + corps + queue**.
- **Salles** (réponses impulsionnelles synthétiques, convolution FFT) : `short` 0,28 s (UI), `lab` 0,55 s (toit-labo, SFX courts), `glass` 0,95 s (moments plus larges), `plate` 1,6 s, `hall` 2,6 s (fanfares, musique), `city` 3,6 s (ville, train).
- **Petits haut-parleurs** : le corps des impacts est placé entre 110 et 400 Hz (pas seulement dans le sub), pour qu’un arrêt de rouleau reste audible sur un téléphone.
- **Variantes** : `ui_click` ×3, `reel_stop` ×3, `laser_hop` ×4, `chip_off` ×3. Le moteur tire une variante (jamais deux fois de suite la même) et ajoute un désaccord de ±10 cents.
- **Montée en hauteur dans la gamme** : `hopRate(n)` donne le rapport de lecture du n-ième saut (Ré, Mi, Fa, Sol, La, Si♭, Do, Ré…), `chipLevelRate(niveau)` celui des puces (La → Do → Mi).

## Liste des cues

Bus : `ui`, `sfx`, `music`, `amb`. « critique » = chargé avant le lancement du jeu (tous les `ui_*`, `spin_start`, `reel_loop`, `reel_stop*`, `quick_stop`, `amb_city`). `gainDb` = réglage de mixage appliqué par le moteur à chaque lecture (voir *Niveaux*).

| cue | bus | durée (s) | boucle | canaux | critique | gainDb | usage |
|---|---|---:|---|---:|---|---:|---|
| `ui_click` | ui | 0.17 |  | 1 | oui | 0 | clic bouton (3 variantes : tick de verre + blip La6) |
| `ui_click_2` | ui | 0.15 |  | 1 | oui | -0.5 | variante de ui_click |
| `ui_click_3` | ui | 0.18 |  | 1 | oui | -0.5 | variante de ui_click |
| `ui_hover` | ui | 0.18 |  | 1 | oui | -12.5 | survol (très discret) |
| `ui_open` | ui | 0.74 |  | 1 | oui | -8.5 | ouverture de panneau (souffle montant + Ré6/La6) |
| `ui_close` | ui | 0.59 |  | 1 | oui | -9 | fermeture de panneau (miroir de ui_open) |
| `ui_toggle` | ui | 0.21 |  | 1 | oui | -4 | interrupteur (loquet en deux temps) |
| `ui_bet_up` | ui | 0.26 |  | 1 | oui | -9 | mise + (Ré6 → La6) |
| `ui_bet_down` | ui | 0.30 |  | 1 | oui | -10 | mise − (La6 → Ré6) |
| `ui_error` | ui | 0.47 |  | 1 | oui | -2.5 | action refusée (deux bosses FM douces Mi/Fa, filtrées) |
| `ui_buy_confirm` | ui | 1.20 |  | 1 | oui | -4 | achat accepté (arpège Fa majeur + accord de verre) |
| `ui_autoplay_start` | ui | 0.53 |  | 1 | oui | -9 | lancement autoplay (arpège tournant) |
| `spin_start` | sfx | 0.40 |  | 1 | oui | 0 | départ des rouleaux (servo + loquet) |
| `reel_loop` | sfx | 1.20 | oui | 1 | oui | -9.5 | boucle pendant la rotation (bourdon Ré3 + tics capteur) |
| `reel_stop` | sfx | 0.32 |  | 1 | oui | -1.5 | arrêt d’un rouleau (3 variantes) |
| `reel_stop_2` | sfx | 0.33 |  | 1 | oui | -1.5 | variante de reel_stop |
| `reel_stop_3` | sfx | 0.32 |  | 1 | oui | -1 | variante de reel_stop |
| `reel_stop_last` | sfx | 0.80 |  | 1 | oui | -2 | arrêt du dernier rouleau (plus lourd, accord Ré/La) |
| `quick_stop` | sfx | 0.69 |  | 2 | oui | 0 | arrêt forcé : 5 rouleaux claquent de gauche à droite |
| `anticipation_loop` | sfx | 2.00 | oui | 1 |  | -3.5 | boucle de tension (glissando de Shepard infini + pulsation 8 Hz) |
| `anticipation_riser` | sfx | 1.90 |  | 2 |  | -5 | montée d’anticipation 1,8 s (Ré3 → Ré5) |
| `scatter_land_1` | sfx | 1.30 |  | 1 |  | -3 | 1er Scatter (ping de portail Ré5/La5) |
| `scatter_land_2` | sfx | 1.40 |  | 1 |  | -4.5 | 2e Scatter (Fa5/Do6, plus riche) |
| `scatter_land_3` | sfx | 2.20 |  | 2 |  | -1.5 | 3e Scatter : ouverture triomphale (accord + souffle + sub) |
| `scatter_fail` | sfx | 0.66 |  | 1 |  | -4.5 | Scatter raté (dégonflement du portail) |
| `eyes_charge` | sfx | 0.83 |  | 1 |  | -10 | charge des yeux (0,5 s, montée FM) |
| `laser_fire` | sfx | 0.51 |  | 1 |  | -5 | tir laser (zap descendant, filtré, non agressif) |
| `laser_hop` | sfx | 0.23 |  | 1 |  | -5 | saut du point (4 variantes, Ré6 ; monter la hauteur avec hopRate(n)) |
| `laser_hop_2` | sfx | 0.23 |  | 1 |  | -6 | variante de laser_hop |
| `laser_hop_3` | sfx | 0.26 |  | 1 |  | -7 | variante de laser_hop |
| `laser_hop_4` | sfx | 0.23 |  | 1 |  | -6.5 | variante de laser_hop |
| `upgrade_tick` | sfx | 0.45 |  | 1 |  | -8.5 | symbole surcadencé (+1 cran) |
| `upgrade_max` | sfx | 0.54 |  | 1 |  | -8.5 | symbole déjà au maximum (étincelle) |
| `mult_stamp` | sfx | 0.70 |  | 1 |  | 0 | jeton multiplicateur posé (impact + plaque métallique) |
| `chip_place` | sfx | 0.23 |  | 1 |  | -4 | puce posée (bonus) |
| `chip_level` | sfx | 0.54 |  | 1 |  | -10 | puce +1 niveau (hauteur via chipLevelRate(niveau)) |
| `chip_off` | sfx | 0.24 |  | 1 |  | -6 | extinction d’une puce (3 variantes) |
| `chip_off_2` | sfx | 0.26 |  | 1 |  | -7.5 | variante de chip_off |
| `chip_off_3` | sfx | 0.26 |  | 1 |  | -6 | variante de chip_off |
| `circuit_hum` | sfx | 2.00 | oui | 1 |  | -5.5 | bourdon électrique du circuit (bonus), accordé sur Ré |
| `win_small` | sfx | 1.10 |  | 1 |  | -6 | petit gain (carillon Ré-Fa-La) |
| `win_connect` | sfx | 0.97 |  | 1 |  | -6.5 | ways qui se connectent (lumière qui court sur la pentatonique) |
| `win_count_loop` | sfx | 1.00 | oui | 1 |  | -7.5 | compteur de gain (12 tics/s sur Rém(add9)) |
| `win_count_end` | sfx | 1.40 |  | 1 |  | -4 | fin du compteur |
| `sym_H1` | sfx | 0.65 |  | 1 |  | -0.5 | réaction canette (pop + pétillement) |
| `sym_H2` | sfx | 0.76 |  | 1 |  | -9.5 | réaction pelote fibre optique (scintillement) |
| `sym_H3` | sfx | 0.76 |  | 1 |  | -6 | réaction poisson chromé (flip + éclaboussure) |
| `sym_H4` | sfx | 0.83 |  | 2 |  | -2.5 | réaction souris-drone (passage en stéréo) |
| `sym_W` | sfx | 1.30 |  | 1 |  | -3.5 | réaction Wild (montée FM + accord) |
| `sym_S` | sfx | 1.20 |  | 1 |  | -4 | réaction Scatter (bourdon de portail) |
| `bigwin_intro` | sfx | 1.30 |  | 2 |  | -2 | entrée des gros gains (impact + montée + roulement) |
| `tier_big` | sfx | 2.60 |  | 2 |  | -2.5 | BIG WIN (Sib → Do → Rém) |
| `tier_super` | sfx | 2.90 |  | 2 |  | -3 | SUPER WIN (Solm → Sib → Do → Rém(add9)) |
| `tier_mega` | sfx | 3.20 |  | 2 |  | -1.5 | MEGA WIN (… → Fa majeur add9, toms) |
| `tier_epic` | sfx | 3.60 |  | 2 |  | -1.5 | EPIC WIN (mélodie de cuivres, taikos, double arpège) |
| `tier_cyber` | sfx | 4.00 |  | 2 |  | 0 | CYBER WIN (balayages laser, Rédsus2 massif) |
| `maxwin` | sfx | 5.80 |  | 2 |  | 0 | MAX WIN (fanfare complète, 2 phrases + final Rédsus2) |
| `coin_rain` | sfx | 1.80 |  | 2 |  | -6.5 | pluie de jetons holographiques |
| `drone_swarm` | sfx | 1.99 |  | 2 |  | -6 | essaim de drones |
| `train_pass` | sfx | 2.80 |  | 2 |  | -2.5 | passage du maglev (Doppler physique) |
| `city_lights_on` | sfx | 1.90 |  | 2 |  | -2 | la ville s’allume district par district |
| `bonus_trigger` | sfx | 2.00 |  | 2 |  | 0 | déclenchement du bonus (le portail s’ouvre) |
| `bonus_intro` | sfx | 2.50 |  | 2 |  | 0 | titre 9 VIES / DOUBLE REGARD |
| `punch_tear` | sfx | 0.56 |  | 2 |  | -1 | transition « déchirure numérique » |
| `run_whoosh` | sfx | 0.97 |  | 2 |  | -5.5 | course / transition |
| `fs_add` | sfx | 1.20 |  | 2 |  | -3 | +N free spins |
| `bonus_end` | sfx | 3.00 |  | 2 |  | -0.5 | GAIN TOTAL (Solm9 → La7sus4 → Rém(add9)) |
| `dive_impact` | sfx | 1.20 |  | 2 |  | 0 | atterrissage + onde de choc cyan |
| `scan_mode_on` | sfx | 1.60 |  | 2 |  | -4 | la ville passe en mode scan |
| `scan_mode_off` | sfx | 1.35 |  | 2 |  | -5 | retour au mode normal |
| `music_base` | music | 40.00 | oui | 2 |  | 0 | musique du jeu de base (96 BPM, 16 mesures) |
| `music_bonus` | music | 34.91 | oui | 2 |  | 0 | musique 9 VIES (110 BPM, 16 mesures) |
| `music_bonus_double` | music | 34.91 | oui | 2 |  | 0 | musique DOUBLE REGARD (110 BPM, deux arpèges G/D, contre-chant) |
| `amb_city` | amb | 20.00 | oui | 2 | oui | 0 | ambiance ville : pluie fine, trafic lointain, néons, train lointain |
| `amb_scan` | amb | 20.00 | oui | 2 |  | 0 | couche bonus : balayages radar, scintillements, pulsation |

## Niveaux (loudness)

| élément | cible |
|---|---|
| SFX et UI (fichiers) | crête **true peak -1 dBTP** (≤ -0,6 dBFS après décodage ogg/m4a) |
| musique (fichiers) | **RMS -20 dBFS**, crête ≤ -1 dBTP, limitation douce 2 dB |
| ambiances (fichiers) | **RMS -30 dBFS** (`amb_city`) et **-32 dBFS** (`amb_scan`) |
| mixage en jeu | `gainDb` par cue = cible - mesure (loudness K-pondérée BS.1770, maximum sur fenêtres de 200 ms), borné à [-30, 0] dB. Cibles : UI -21 à -29 ; SFX de jeu -13 à -21 ; boucles de fond -21 à -29 ; célébrations et bonus -17 à -11. Paliers mesurés à la lecture, du BIG au MAX : -13,9 / -13,5 / -12,8 / -12,5 / -11,7 / -11,6 |
| bus par défaut | musique 0,65 (≈ -3,7 dB), ambiance 0,7 (≈ -3,1 dB), UI 0,85, SFX 1 (courbe perceptive : gain = v²) |
| sécurité | limiteur maître (DynamicsCompressor : seuil -3 dB, ratio 20, attaque 2 ms) ; `duck(true)` baisse musique + ambiance de 9 dB sous les fanfares |

Médianes mesurées (RMS des fichiers) : SFX -17,4 dBFS, UI -19,3, **musique -20**, **ambiance -30** : la musique et l’ambiance restent sous les SFX.

## Boucles sans couture

- Événements (notes, tics, gouttes, trains) : rendus avec leur queue (release, delay, réverbération) au-delà de la durée T, puis **la queue est repliée sur le début** : le point de bouclage est la suite exacte du morceau (régime périodique établi).
- Couches stationnaires (pluie, trafic, courant électrique) : rendues sur T + X puis **fondu enchaîné à puissance constante** sur X.
- Couches tonales (bourdons, glissando de Shepard) : formules exactement périodiques (fréquences quantifiées sur 1/T).
- Tous les modulateurs (LFO, chorus, balayage de filtre, sidechain) ont des périodes qui divisent T ; les filtres et le limiteur du mastering tournent en mode périodique.
- Le moteur boucle sur `[0, duration]` du manifeste, ce qui ignore le rembourrage de fin ajouté par l’AAC.

## Moteur (`src/audio/audio.ts`)

```ts
const audio = new AudioEngine({ baseUrl: './audio/' });
await audio.loadManifest();
await audio.loadCritical((done, total) => bar.set(done / total)); // buffers décodés, progression réelle
void audio.loadRest();                                           // le reste en arrière-plan
window.addEventListener('pointerdown', () => void audio.unlock()); // à chaque geste (idempotent)
audio.bindVisibility();                                           // suspend()/resume() automatiques
audio.ambience('amb_city'); audio.music('music_base');            // mémorisés jusqu’au déverrouillage
audio.play('reel_stop', { variant: true, pan: -0.5 });
audio.play('laser_hop', { rate: hopRate(i) });
const spin = audio.loop('reel_loop', { fadeIn: 0.1 }); spin?.stop(0.15);
```

- Format : Ogg Vorbis si `canPlayType('audio/ogg; codecs="vorbis"')`, sinon m4a (Safari) ; en cas d’échec de décodage de l’ogg, repli automatique sur le m4a.
- Graphe : voix → bus (`sfx`, `ui` | `music`, `amb` → duck) → maître → limiteur → sortie.
- Au plus 4 voix simultanées par cue (5 pour `reel_stop`, 6 pour sauts, puces et montées) : la plus ancienne est volée avec un fondu de 20 ms ; plafond global de 48 voix ponctuelles.
- Tous les arrêts passent par une rampe de gain (aucun clic). `stopAll()` coupe tous les SFX et UI (y compris leurs boucles), pas la musique.
- Page cachée : les sons ponctuels sont refusés (pas de rafale au retour), les boucles reprennent là où elles étaient, les changements de musique demandés entre-temps sont appliqués au retour.
- Aucune exception : sans WebAudio, avant `unlock()`, avec un id inconnu ou un fichier en échec, chaque appel est un no-op (un seul message console par problème).

## Régénérer

```sh
node tools/audio/render.mjs                 # tout (ou : npm run audio)
node tools/audio/render.mjs --only reel_stop,reel_stop_2
node tools/audio/render.mjs --no-encode     # WAV seulement
node tools/audio/render.mjs --force         # ré-encoder même si le WAV n’a pas changé
node tools/audio/check.mjs                  # contrôle -> docs/preuves/audio-report.json (code 1 si échec)
node tools/audio/check.mjs --md             # + tableau Markdown (celui ci-dessous)
npx vitest run tests/audio.test.ts          # tests unitaires (DSP, manifeste, moteur)
```

Rendu complet ≈ 45 s, ou ≈ 70 s avec ré-encodage de tout (un seul processus, ffmpeg lancé séquentiellement) ; l’encodage n’est relancé que si le WAV ou les réglages d’encodage changent. Si un codec dépasse le plafond de crête (-0,6 dBFS après décodage), le WAV est baissé d’autant et ré-encodé (cas rencontrés : `ui_error` -2,45 dB, huit autres cues entre -0,26 et -0,77 dB).

Encodage : Vorbis q4 partout sauf ambiances (q2) ; AAC-LC 128 kb/s pour la musique et les SFX stéréo, 96 kb/s pour les SFX mono (qualité par canal équivalente à 192 kb/s stéréo), 80 kb/s pour les ambiances (bruit à -30 dBFS RMS sous la musique).

## Résultats du contrôle

Critères d’échec : crête ou true peak > -0,5 dBFS, |DC| > 0,002, premier ou dernier échantillon > -60 dBFS (sons ponctuels), saut au point de bouclage > 2,5 fois le mouvement typique échantillon à échantillon (boucles), NaN, durée ≠ manifeste, crête décodée ogg/m4a > -0,5 dBFS, boucle encodée non alignée à l’échantillon près, musique ou ambiance plus forte que les SFX.

**Verdict : PASS - 75/75 cues conformes**, aucun problème global. Médianes RMS par bus (dBFS) : SFX -17.4, UI -19.3, musique -20, ambiance -30. Rapport complet (par cue : crête, true peak, RMS, loudness K-pondérée, DC, bords, jointure, crêtes et longueurs décodées ogg/m4a, alignement des boucles) : `docs/preuves/audio-report.json`. Dans le tableau, `-inf` signifie un échantillon exactement nul.

| cue | bus | durée (s) | crête WAV (dBFS) | true peak (dBTP) | RMS (dBFS) | DC | bords / jointure | crête ogg | crête m4a | statut |
|---|---|---:|---:|---:|---:|---:|---|---:|---:|---|
| ui_click | ui | 0.170 | -1.2 | -1 | -23.4 | 0.00004 | -inf / -inf | -1.5 | -1.2 | OK |
| ui_click_2 | ui | 0.150 | -1 | -1 | -22.9 | 0.00004 | -inf / -inf | -1.5 | -1.1 | OK |
| ui_click_3 | ui | 0.179 | -2.4 | -1 | -23.2 | 0.00005 | -inf / -inf | -2.9 | -3.9 | OK |
| ui_hover | ui | 0.179 | -1.2 | -1 | -19.8 | 0.00003 | -inf / -inf | -1.4 | -1.2 | OK |
| ui_open | ui | 0.741 | -1 | -1 | -17.6 | 0.00000 | -inf / -inf | -0.9 | -0.9 | OK |
| ui_close | ui | 0.589 | -1.1 | -1 | -17.2 | 0.00001 | -inf / -inf | -1.1 | -1.1 | OK |
| ui_toggle | ui | 0.206 | -1 | -1 | -19.5 | 0.00003 | -inf / -inf | -1.3 | -1 | OK |
| ui_bet_up | ui | 0.257 | -1.1 | -1 | -15.1 | 0.00005 | -inf / -inf | -1.4 | -1.3 | OK |
| ui_bet_down | ui | 0.298 | -1.1 | -1 | -14.5 | 0.00004 | -inf / -inf | -1.6 | -1.3 | OK |
| ui_error | ui | 0.471 | -3.4 | -3.4 | -19.8 | 0.00000 | -inf / -inf | -3.4 | -4.4 | OK |
| ui_buy_confirm | ui | 1.200 | -1 | -1 | -19.3 | 0.00001 | -inf / -inf | -1.5 | -1 | OK |
| ui_autoplay_start | ui | 0.533 | -1.3 | -1.3 | -15.6 | 0.00000 | -inf / -inf | -0.9 | -1.3 | OK |
| spin_start | sfx | 0.396 | -1 | -1 | -21.4 | 0.00001 | -inf / -inf | -1.3 | -1.2 | OK |
| reel_loop | sfx | 1.200 | -8 | -8 | -20 | 0.00000 | boucle, saut 0× typique | -8.4 | -8.1 | OK |
| reel_stop | sfx | 0.323 | -1 | -1 | -19.3 | 0.00007 | -inf / -inf | -0.8 | -1 | OK |
| reel_stop_2 | sfx | 0.328 | -1 | -1 | -19.2 | 0.00006 | -inf / -inf | -1 | -1.1 | OK |
| reel_stop_3 | sfx | 0.322 | -1 | -1 | -20 | 0.00007 | -inf / -inf | -0.8 | -1.1 | OK |
| reel_stop_last | sfx | 0.800 | -1 | -1 | -19.2 | 0.00002 | -inf / -inf | -0.9 | -1 | OK |
| quick_stop | sfx | 0.688 | -1 | -1 | -19.2 | 0.00002 | -inf / -inf | -1 | -1.3 | OK |
| anticipation_loop | sfx | 2.000 | -5.2 | -5.2 | -18 | 0.00000 | boucle, saut 0.1× typique | -5.1 | -5 | OK |
| anticipation_riser | sfx | 1.900 | -1.1 | -1 | -17.8 | 0.00001 | -inf / -inf | -1.1 | -1.1 | OK |
| scatter_land_1 | sfx | 1.300 | -1.1 | -1 | -18.9 | 0.00000 | -inf / -inf | -0.7 | -1.2 | OK |
| scatter_land_2 | sfx | 1.400 | -1 | -1 | -17.1 | 0.00000 | -inf / -inf | -1 | -1 | OK |
| scatter_land_3 | sfx | 2.200 | -1 | -1 | -18.6 | 0.00000 | -inf / -inf | -0.7 | -1 | OK |
| scatter_fail | sfx | 0.664 | -1 | -1 | -18 | 0.00000 | -inf / -inf | -1.4 | -1 | OK |
| eyes_charge | sfx | 0.828 | -1 | -1 | -15.5 | 0.00000 | -inf / -inf | -1.3 | -1 | OK |
| laser_fire | sfx | 0.508 | -1 | -1 | -16.5 | 0.00002 | -inf / -inf | -0.8 | -0.6 | OK |
| laser_hop | sfx | 0.231 | -1.3 | -1.3 | -16.9 | 0.00004 | -inf / -inf | -1 | -1.3 | OK |
| laser_hop_2 | sfx | 0.230 | -1.4 | -1.4 | -15.7 | 0.00007 | -inf / -inf | -1.2 | -1.4 | OK |
| laser_hop_3 | sfx | 0.262 | -1 | -1 | -14.7 | 0.00009 | -inf / -inf | -1 | -1 | OK |
| laser_hop_4 | sfx | 0.232 | -1 | -1 | -15.1 | 0.00009 | -inf / -inf | -1.2 | -1 | OK |
| upgrade_tick | sfx | 0.448 | -1 | -1 | -15.2 | 0.00003 | -inf / -inf | -1 | -1.3 | OK |
| upgrade_max | sfx | 0.540 | -1.1 | -1 | -19.6 | 0.00000 | -inf / -inf | -1.4 | -1.2 | OK |
| mult_stamp | sfx | 0.700 | -1 | -1 | -20.3 | 0.00003 | -inf / -inf | -1 | -0.9 | OK |
| chip_place | sfx | 0.233 | -1 | -1 | -17.3 | 0.00007 | -inf / -inf | -1.3 | -1 | OK |
| chip_level | sfx | 0.536 | -1.8 | -1.8 | -14.5 | 0.00004 | -inf / -inf | -1.3 | -1.7 | OK |
| chip_off | sfx | 0.243 | -1 | -1 | -16.3 | 0.00001 | -inf / -inf | -1.4 | -1 | OK |
| chip_off_2 | sfx | 0.265 | -1 | -1 | -15.3 | 0.00001 | -inf / -inf | -1.4 | -1 | OK |
| chip_off_3 | sfx | 0.258 | -1.3 | -1.3 | -16.7 | 0.00001 | -inf / -inf | -1.3 | -1.4 | OK |
| circuit_hum | sfx | 2.000 | -16.2 | -16.2 | -24 | 0.00000 | boucle, saut 0.3× typique | -16 | -14.4 | OK |
| win_small | sfx | 1.100 | -1 | -1 | -18.5 | 0.00000 | -inf / -inf | -1.2 | -1.1 | OK |
| win_connect | sfx | 0.972 | -1 | -1 | -18.1 | 0.00000 | -inf / -inf | -1.1 | -1 | OK |
| win_count_loop | sfx | 1.000 | -5.5 | -5.5 | -18 | 0.00000 | boucle, saut 0.1× typique | -5.6 | -5.7 | OK |
| win_count_end | sfx | 1.400 | -1 | -1 | -19.8 | 0.00000 | -inf / -inf | -1.2 | -1 | OK |
| sym_H1 | sfx | 0.653 | -1 | -1 | -23.5 | 0.00001 | -inf / -inf | -0.8 | -1.2 | OK |
| sym_H2 | sfx | 0.755 | -1 | -1 | -14.4 | 0.00000 | -inf / -inf | -1 | -0.9 | OK |
| sym_H3 | sfx | 0.759 | -1 | -1 | -18.7 | 0.00000 | -inf / -inf | -1.1 | -1 | OK |
| sym_H4 | sfx | 0.826 | -1 | -1 | -20.8 | 0.00000 | -inf / -inf | -1.4 | -1.5 | OK |
| sym_W | sfx | 1.300 | -1.1 | -1 | -20.4 | 0.00000 | -inf / -inf | -1 | -1 | OK |
| sym_S | sfx | 1.200 | -1 | -1 | -18.5 | 0.00000 | -inf / -inf | -1.1 | -1.1 | OK |
| bigwin_intro | sfx | 1.300 | -1.5 | -1 | -15.6 | 0.00003 | -inf / -inf | -1.2 | -0.9 | OK |
| tier_big | sfx | 2.600 | -1.5 | -1.3 | -15.3 | 0.00001 | -inf / -inf | -1 | -1.3 | OK |
| tier_super | sfx | 2.900 | -1.2 | -1 | -14.3 | 0.00000 | -inf / -inf | -0.8 | -0.8 | OK |
| tier_mega | sfx | 3.200 | -1 | -1 | -15.7 | 0.00000 | -inf / -inf | -1 | -0.7 | OK |
| tier_epic | sfx | 3.600 | -1.3 | -1.3 | -13.5 | 0.00000 | -inf / -inf | -1.1 | -1.1 | OK |
| tier_cyber | sfx | 4.000 | -1.2 | -1 | -16.3 | 0.00000 | -inf / -inf | -0.6 | -0.9 | OK |
| maxwin | sfx | 5.800 | -1.9 | -1.6 | -15.8 | 0.00000 | -inf / -inf | -1.5 | -1.6 | OK |
| coin_rain | sfx | 1.800 | -1.4 | -1 | -14.3 | 0.00001 | -inf / -inf | -0.7 | -1.1 | OK |
| drone_swarm | sfx | 1.993 | -1 | -1 | -16.7 | 0.00000 | -inf / -inf | -0.8 | -0.9 | OK |
| train_pass | sfx | 2.800 | -1 | -1 | -17.4 | 0.00000 | -inf / -inf | -1 | -0.9 | OK |
| city_lights_on | sfx | 1.900 | -1 | -1 | -17.7 | 0.00001 | -inf / -inf | -1 | -0.9 | OK |
| bonus_trigger | sfx | 2.000 | -1 | -1 | -17.9 | 0.00002 | -inf / -inf | -0.9 | -0.9 | OK |
| bonus_intro | sfx | 2.500 | -1 | -1 | -17.6 | 0.00000 | -inf / -inf | -0.9 | -1.1 | OK |
| punch_tear | sfx | 0.560 | -1.2 | -1 | -19.2 | 0.00000 | -inf / -inf | -1.4 | -1 | OK |
| run_whoosh | sfx | 0.972 | -1 | -1 | -16.6 | 0.00000 | -inf / -inf | -1 | -0.9 | OK |
| fs_add | sfx | 1.200 | -1 | -1 | -16.3 | 0.00000 | -inf / -inf | -0.8 | -1.1 | OK |
| bonus_end | sfx | 3.000 | -1.1 | -1 | -15 | 0.00000 | -inf / -inf | -0.7 | -0.7 | OK |
| dive_impact | sfx | 1.200 | -1 | -1 | -18.3 | 0.00002 | -inf / -inf | -1 | -0.9 | OK |
| scan_mode_on | sfx | 1.600 | -1.1 | -1 | -15.1 | 0.00000 | -inf / -inf | -0.9 | -1.2 | OK |
| scan_mode_off | sfx | 1.350 | -1.1 | -1 | -13.9 | 0.00001 | -inf / -inf | -0.9 | -0.9 | OK |
| music_base | music | 40.000 | -6.8 | -6.7 | -20 | 0.00000 | boucle, saut 0.1× typique | -6.5 | -6.5 | OK |
| music_bonus | music | 34.909 | -7 | -6.9 | -20 | 0.00000 | boucle, saut 0.1× typique | -6.7 | -6.8 | OK |
| music_bonus_double | music | 34.909 | -6.6 | -6.5 | -20 | 0.00000 | boucle, saut 0.2× typique | -6.4 | -6.1 | OK |
| amb_city | amb | 20.000 | -12.9 | -12.7 | -30 | 0.00000 | boucle, saut 0.2× typique | -13.1 | -12.4 | OK |
| amb_scan | amb | 20.000 | -12.8 | -12.7 | -32 | 0.00000 | boucle, saut 0.2× typique | -12.9 | -12.6 | OK |

## Taille

`public/audio` : **ogg 3.19 Mo + m4a 3.36 Mo = 6.56 Mo** (75 cues). Un joueur ne télécharge qu’un seul des deux formats, soit environ 3,2 à 3,4 Mo, dont environ 0,35 Mo de sons critiques (chargés avant le jeu).

La cible de 6 Mo (les deux formats ensemble) est **dépassée d’environ 0,6 Mo**. Les trois musiques aux réglages demandés (Vorbis q4, AAC 128 kb/s) pèsent à elles seules 3,3 Mo. Les ambiances (q2 / 80k), les SFX mono (96k) et les queues de réverbération (coupées près des durées indicatives) ont déjà été réduits. Pour passer sous 6 Mo, il faudrait baisser la musique (Vorbis q3 + AAC 112k ≈ -0,45 Mo, dans `encSettings()` de `render.mjs`), ce qui n’a pas été fait : décision D41 (qualité des musiques gardée, un joueur ne charge qu’un format).

## Ce qui n’est PAS vérifié

- **Aucun de ces sons n’a été écouté par un humain.** Ils ont été conçus et rendus par un agent qui ne peut pas entendre. Tout ce qui est affirmé ici vient de mesures : niveaux, true peak, DC, bords, jointures, spectres par bandes, corrélation stéréo, spectrogrammes regardés comme images. Rien ne garantit qu’un son est *beau*, que le mixage est *juste* à l’oreille, ni qu’aucun son n’est agaçant à la centième répétition. **Une écoute humaine au casque et sur haut-parleur de téléphone est indispensable avant soumission à Stake.**
- Lecture dans les navigateurs non testée : le moteur est couvert par des tests unitaires avec un faux WebAudio, pas par Chrome, Safari ou Firefox réels. En particulier, le bouclage sans trou des `.m4a` dépend de la prise en compte par Safari du délai d’encodeur AAC (liste d’édition MP4). ffmpeg le respecte (vérifié : décalage 0), Safari n’a pas été essayé.
- La balance entre sons (`gainDb`, volumes de bus) repose sur une mesure K-pondérée, pas sur l’oreille. Les réglages fins se font dans le jeu via `setVolume`/`gainDb` à la lecture ou en changeant la cible `loud` d’une cue.
- Rendu sur petits haut-parleurs estimé par la répartition spectrale uniquement.
- Charge CPU et mémoire sur mobile non mesurées : environ 80 Mo de PCM décodé (float 32 bits, 48 kHz) si tout est chargé, dont environ 40 Mo pour les trois musiques.
