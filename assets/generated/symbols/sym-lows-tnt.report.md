# BOOMTOOTH — lot sym-lows-tnt

Sept images réellement générées avec l’outil natif image_gen, sans CLI/API de génération, sans SVG ni modification du code du jeu. D1.png a été chargé avec view_image et fourni comme référence de style à chaque appel. Chaque asset a reçu un appel initial puis une unique reprise, soit 14 appels. Inspection visuelle des sorties et lecture des métadonnées avec Pillow, sans retouche raster. Fichiers finaux copiés depuis /root/.codex/generated_images/01a0e77c-1336-74e3-bddf-871d22e8bb36/. Le prompt exact de la version retenue accompagne chaque PNG sous le nom <nom>.prompt.txt.

## Vérification technique

Tous les PNG sont en RGBA avec alpha réel allant de 0 à 255. Aucun fond chroma utilisé. Les dimensions natives sont 1254 × 1254 malgré les demandes répétées de 1024 × 1024. Les fichiers ont été conservés sans redimensionnement : le lot n’est donc pas entièrement conforme au format demandé.

| Chemin relatif au projet | Dimensions | Alpha | Marge minimale visible |
| --- | --- | --- | --- |
| assets/generated/symbols/L1.png | 1254 × 1254 | oui | 6,38 % |
| assets/generated/symbols/L2.png | 1254 × 1254 | oui | 10,69 % |
| assets/generated/symbols/L3.png | 1254 × 1254 | oui | 6,46 % |
| assets/generated/symbols/L4.png | 1254 × 1254 | oui | 6,14 % |
| assets/generated/symbols/T-stick.png | 1254 × 1254 | oui | 4,86 % |
| assets/generated/symbols/T-bundle.png | 1254 × 1254 | oui | 7,18 % |
| assets/generated/symbols/T-keg.png | 1254 × 1254 | oui | 4,39 % |

Marges mesurées sur les pixels dont alpha ≥ 128 ; de faibles pixels semi-transparents peuvent dépasser ces limites.

## Inspection et défauts restants

- Sujets complets, silhouettes différenciées, aucun texte, cadre, logo ou ombre au sol visible. Lanterne avec flamme interne, charges sans flamme ni étincelle. Fagot de trois bâtons avec deux liens et mèche commune ; baril avec trois cerclages et étoile rouge et jaune. La masse apparente progresse du bâton au fagot puis au baril.
- Quelques variations progressives de couleur persistent malgré les reprises : le cel-shading n’est pas strictement limité à deux aplats uniformes et le trait reste plus régulier que demandé.
- L1 présente davantage de marques que les deux éraflures demandées ; sa lampe est assez volumineuse.
- L2 occupe environ 78 % de la hauteur, sous l’objectif d’environ 88 %.
- T-stick est incliné d’environ 20 degrés plutôt que 15 ; sa marge minimale est légèrement inférieure à 5 %.
- T-keg a une marge inférieure d’environ 4,39 %, sous le minimum de 5 %.
- Les mèches sombres peuvent perdre du contraste sur une case sombre à petite taille. La lisibilité à 90 px n’a pas fait l’objet d’une validation en jeu.

Les reprises ont été limitées à une par asset conformément à la procédure.
