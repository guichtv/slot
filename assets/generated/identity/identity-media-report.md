# BOOMTOOTH — lot identity-media

Méthode : outil natif `image_gen` exclusivement pour la génération ; aucun script CLI/API, aucune modification du code du jeu. Références D1.png, D3.png et buck-ref.png chargées avec `view_image` avant génération ; H2.png également inspecté pour l'élan de la couverture.

Chaque asset a été généré séparément puis inspecté visuellement. Une unique reprise a été effectuée pour chacun (10 appels au total). Les sorties retenues ont été copiées sans retouche ni redimensionnement depuis `/root/.codex/generated_images/01a0e7c6-f6c0-7280-ab1a-bab89f8497f4/`. Le prompt exact de la sortie retenue accompagne chaque PNG sous le nom `<nom>.prompt.txt`.

| Fichier depuis la racine du projet | Dimensions réelles | Canal alpha | Source retenue |
|---|---|---|---|
| assets/generated/identity/card-detonator.png | 1024 × 1536 | Non, RGB opaque | exec-c6a37f1c-b9bc-45f1-92ba-118701e64508.png |
| assets/generated/identity/card-bonus.png | 1024 × 1536 | Non, RGB opaque | exec-7295b485-62a5-47e3-a59c-fe2145de6fcd.png |
| assets/generated/identity/cover.png | 1672 × 941 | Non, RGB opaque | exec-cf5a8191-cd14-4477-bbe6-bd6c74db7509.png |
| assets/generated/identity/tile.png | 1086 × 1448 | Non, RGB opaque | exec-8c8622f7-8caf-48d0-bf59-09bb3f2bcb6e.png |
| assets/generated/decor/decor-portrait.png | 1024 × 1536 | Non, RGB opaque | exec-ca83f051-0f0f-42f8-9aac-7f9edbee32d6.png |

Contrôle technique : les cinq PNG sont lisibles, leurs dimensions et leur mode RGB ont été vérifiés avec Pillow en lecture seule ; les cinq fichiers de prompts sont présents. Aucun fond chroma nécessaire, tous les fonds demandés étant opaques. Aucun texte, logo ou filigrane visible.

Écarts restants après l'unique reprise autorisée :

- Cover : la résolution native reste 1672 × 941 (proche du 16:9), au lieu de 1536 × 864 ou 1536 × 1024. Le contact allumette/dent en or est amélioré, partiellement masqué par les étincelles.
- Tile : la résolution native reste 1086 × 1448, ratio 3:4 exact, au lieu de 1152 × 1536. Buck est entier, avec les deux bras levés et une zone calme supérieure.
- Card-detonator : le sens des éclats reste ambigu et peut se lire comme une projection hors du bloc. Le cadre est complet et arrondi, mais sa marge latérale extérieure est par endroits inférieure à 3%.
- Décor portrait : la cascade reste à gauche vers la mi-hauteur, au-dessus du tiers inférieur demandé ; la forêt occupe encore une partie du centre supérieur. La clairière centrale inférieure est dégagée et la montagne ne porte aucun visage.
- Style général : encrage et palette proches des références, mais légères transitions lumineuses dans certains ciels/aurores et textures plus détaillées que le cel-shading strict à deux tons demandé. Correspondance stylistique non parfaite.

Aucune reprise supplémentaire ni transformation logicielle des images n'a été effectuée.
