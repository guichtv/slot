# BOOMTOOTH — Direction artistique

Cinq maquettes d'écran complètes (1536 × 1024) ont été générées via ImageGen (Codex CLI, compte ChatGPT, modèle gpt-6-astra) : `assets/generated/directions/D1.png … D5.png`, galerie : `directions.html`.
Même grille 5 × 5, même mascotte, mêmes symboles ; les pistes changent le langage de formes, les matières, la composition, la lumière et l'interprétation du thème.

## Les cinq pistes

| Piste | Intention | Thème | Lisibilité grille | Potentiel d'animation | Originalité | Mobile | Faisabilité assets | Total /60 |
|---|---|---|---|---|---|---|---|---|
| **D1 Carrière à l'heure dorée** | Fin d'après-midi orangée, montagne à moitié sculptée, barrage et chute d'eau, cadre en poutres boulonnées à coins de sécurité | 10 | 9 | 10 | 8 | 8 | 9 | **54** |
| D2 Affiche de bûcheron pop | Aplats sérigraphiés, trame de points, soleil rayonnant, grille-caisse en bois clair | 7 | 8 | 7 | 7 | 9 | 9 | 47 |
| D3 Dynamitage de nuit | Aurore boréale, projecteurs sur mâts, cadre de wagonnet riveté, contre-jour turquoise | 9 | 8 | 10 | 9 | 8 | 7 | 51 |
| D4 Chantier du barrage à midi | Plein soleil, composition en diagonale, grue en rondins, champignon d'explosion lointain, cadre en rondins ligotés | 8 | 9 | 9 | 7 | 7 | 7 | 47 |
| D5 Atelier creusé dans le granit | Caverne-atelier, filons d'or, arche ouverte sur la montagne, cadre de pierre taillée | 8 | 8 | 7 | 8 | 7 | 7 | 45 |

Notes : lisibilité = contraste symboles / fond de case et séparation grille / décor ; animation = nombre de sources de mouvement naturelles (ciel, eau, fumée, grue, oiseaux, projecteurs) ; mobile = capacité à recomposer le décor en portrait sans perdre l'histoire ; faisabilité = facilité à décomposer en calques propres.

## Choix

**D1 est retenue** : identité la plus forte et la plus chaude (le ciel orangé est rare dans le catalogue Stake), cases sombres qui font ressortir des symboles très saturés, et un décor qui raconte déjà la mécanique (la montagne sculptée à coups d'explosions, le barrage, la chute d'eau). Le cadre en poutres boulonnées aux coins jaune et noir est lisible en petit et se découpe facilement en 9-slice.

**D3 sert d'ambiance de bonus** : même vallée à la tombée de la nuit, aurore turquoise, projecteurs orange qui balaient la montagne. La transition base → bonus est naturelle (le soleil se couche, les projecteurs s'allument, la grille ne change pas). Le bonus supérieur pousse la nuit vers l'or (aurore dorée, filons qui brillent dans la sculpture).

Rejetées : D2 (trop plate, soleil rayonnant générique), D4 (très bonne énergie mais trop chargée derrière la grille), D5 (l'intérieur limite le ciel vivant et les événements rares).

Correction de lisibilité décidée après la revue des maquettes : dans les cinq pistes, la caisse WILD, le fagot SCATTER et la TNT se ressemblent trop. Production :
- **WILD** = caisse dorée remplie de dynamite, mot WILD, couvercle qui saute ;
- **SCATTER** = détonateur à piston rouge et or, plaque SCATTER, poignée qui s'enfonce ;
- **TNT** = trois tailles croissantes sans texte : bâton (zone 2×2), fagot de trois bâtons (3×3), baril de poudre (4×4).

## Bible visuelle (s'applique à 100 % des éléments)

Résumé exécutable pour ImageGen : `docs/imagegen/_style.txt` (en tête de chaque brief de production).

**Trait** : encrage noir #1B1410 épais (4 à 7 px à 1024 px), légèrement irrégulier, pinceau ; traits intérieurs plus fins ; aucune bordure lumineuse.
**Ombrage** : cel-shading deux tons, ombre franche bleu-violet sur les objets éclairés en orange ; un reflet blanc cassé par volume ; aucun aérographe ni flou.
**Lumière** : source principale chaude de fin d'après-midi à gauche ; hiérarchie des lumières : 1) symboles gagnants et objets de mécanique (propre lumière), 2) mascotte, 3) grille, 4) décor (atténué pendant la lecture d'un gain).
**Matières** : bois équarri veiné (miel #C98A45, sombre #6B4526), granit ébréché (#6F7F92 / ombre #46526A), métal riveté, flanelle à carreaux rouge et noir, copeaux et poussière ocre.

**Palette**

| Rôle | Hex |
|---|---|
| Orange brûlé (accent chaud) | #E8742A |
| Orange ciel | #F39A3C |
| Or (gains, WILD, compteurs) | #F2B233 |
| Rouge TNT (danger, Scatter) | #D7332B |
| Vert pin | #2F5D46 / sombre #1E3B2E |
| Granit | #6F7F92 / ombre #46526A |
| Bois | #C98A45 / sombre #6B4526 |
| Crème (plaques, textes clairs) | #F4E6C8 |
| Encre | #1B1410 |
| Nuit (bonus) | #14233A, aurore #3FD6B8, projecteurs #FF9A3C |

**Typographies** (fichiers locaux, licence OFL, dans `public/fonts/`) : display « Lilita One » (titres, boutons, paliers, compteurs de célébration) ; interface « Baloo 2 » (étiquettes, valeurs, règles, chiffres tabulaires) ; replis par écriture : Baloo Bhaijaan 2 (arabe), Rubik (cyrillique), M PLUS Rounded 1c (japonais), Jua (coréen), Noto Sans SC (chinois). Texte de titre : crème #F4E6C8, contour encre 3-6 px, ombre portée dure décalée.

**Mascotte** : Buck Boomtooth, castor trapu (hauteur ≈ 1,05 × la hauteur de grille sur desktop), tête ≈ 1/3,2 de la hauteur totale, casque orange avec lampe, dent de devant gauche en or, flanelle rouge et noir, bretelles, ceinture à outils, allumette au coin de la bouche, queue plate écailleuse. Pieds ancrés au sol avec ombre de contact.

**Symboles** : 85 à 95 % de la case (mesurés sur les pixels visibles), vue trois-quarts, une couleur dominante par symbole ; lows = objets du chantier (jaune, bleu, vert, violet), highs = bustes de l'équipe (raton, élan, loutre, pic-vert), fond de case ardoise sombre #1c1a1f.

**Boutons** : disques et plaques de bois boulonnés cerclés de métal, coins arrondis ; SPIN rond rouge TNT cerclé d'acier ; états normal / survol / pressé / désactivé par la lumière et l'enfoncement, jamais par une seule couleur.

**Langage des effets** : poussière ocre en volutes dessinées, éclats de granit et copeaux, étincelles de mèche jaune-orange, flash d'explosion blanc-jaune bref, onde de choc en anneau, pépites d'or pour les gains. Particules faites en code uniquement pour les primitives (étincelles, halos, traits) ; débris illustrés via ImageGen.
