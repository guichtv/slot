# BOOMTOOTH — lot screens
Date : 2026-09-28.

## Méthode
Génération réelle exclusivement avec l’outil natif image_gen (image_gen__imagegen), transparent_background=true. Références D1.png et D3.png chargées avec view_image avant génération ; D1 fourni à chaque appel, D3 également pour floodlight. Aucun CLI/API de génération, aucun SVG, aucune modification du code du jeu. Douze appels : une génération et une seule reprise par asset après inspection. Fichiers finaux copiés sans retouche depuis $CODEX_HOME/generated_images. Chaque fichier .prompt.txt adjacent contient le prompt exact du résultat retenu.

## Contrôles
Inspection visuelle de chaque génération et reprise ; lecture des dimensions, du canal alpha et de la boîte englobante avec Pillow (lecture seule). Tous les fichiers sont des PNG RGBA, avec des pixels extérieurs réellement transparents (alpha 0). Aucun recours au vert chroma. Aucun texte ni chiffre visible. Le rendu reprend le bois dessiné, le métal, les contours épais et la palette des références, mais reste partiellement non conforme aux aplats stricts demandés.

| Fichier | Dimensions | Alpha | Marges G / H / D / B (%) |
|---|---|---|---|
| panel-sundown.png | 1536 × 1024 | oui | 2,0 / 1,8 / 2,0 / 2,1 |
| panel-floodlight.png | 1536 × 1024 | oui | 3,8 / 3,5 / 3,8 / 5,3 |
| panel-total.png | 1536 × 1024 | oui | 2,5 / 5,0 / 2,4 / 10,3 |
| banner-tier.png | 1536 × 1024 | oui | 1,8 / 21,3 / 1,8 / 32,1 |
| shop-board.png | 1536 × 1024 | oui | 2,3 / 6,5 / 0,3 / 2,8 |
| card-frame.png | 1024 × 1536 | oui | 4,0 / 3,1 / 3,9 / 4,8 |

Marges mesurées sur les pixels d’alpha > 127 ; les franges plus transparentes ne sont pas incluses.

## Défauts restants après l’unique reprise autorisée
- Les zones centrales sont grandes et vides, mais conservent des variations de teinte / ombrages doux : elles ne sont pas des aplats parfaitement unis. Cette limite est particulièrement visible sur sundown ; plus discrète sur floodlight.
- Tous les fichiers ont un alpha maximal de 254, et non 255 : même les surfaces pleines gardent une légère transparence. La présence d’un canal alpha ne signifie donc pas un détourage parfaitement opaque à l’intérieur. Des franges partiellement transparentes peuvent subsister ; absence absolue de halo non garantie.
- Sundown : deux lanternes, trois détonateurs et cordes complètes ; marges inférieures aux 3 % demandés.
- Floodlight : deux luminaires et quatre détonateurs ; les luminaires ressemblent à des lanternes de chantier plutôt qu’à de petits projecteurs directionnels.
- Total : médaillon de castor en granit à dent dorée et pépites présents ; ajout non demandé de deux lanternes et de petits pins ; marges latérales légèrement insuffisantes.
- Bannière : deux dynamites allumées présentes ; silhouette mesurée d’environ 1481 × 477 px, au lieu d’environ 1400 × 380 ; marges latérales insuffisantes. Grandes marges verticales intentionnelles.
- Boutique : deux poteaux, plan roulé et pioche présents ; pioche très proche du bord droit ; punaises peu distinctes des fixations métalliques.
- Cadre : quatre équerres, boulons et bordure intérieure présents ; marges conformes ; intérieur légèrement ombré.

Les six images sont livrées avec ces réserves, sans prétendre à une conformité intégrale.

## Provenance des fichiers copiés
- `panel-sundown.png` : `/root/.codex/generated_images/01a0e7bb-f7c4-7d32-b030-5205806838a3/exec-848c3f40-3b20-4946-8dab-c18b229e427d.png`
- `panel-floodlight.png` : `/root/.codex/generated_images/01a0e7bb-f7c4-7d32-b030-5205806838a3/exec-ec28d1ed-b9f0-4abb-9758-7f883a447933.png`
- `panel-total.png` : `/root/.codex/generated_images/01a0e7bb-f7c4-7d32-b030-5205806838a3/exec-c69b511e-8351-4132-b3e9-98cef9576802.png`
- `banner-tier.png` : `/root/.codex/generated_images/01a0e7bb-f7c4-7d32-b030-5205806838a3/exec-b8a90600-7ab7-4b6b-a2ab-dcdc76e9fbcc.png`
- `shop-board.png` : `/root/.codex/generated_images/01a0e7bb-f7c4-7d32-b030-5205806838a3/exec-a05324b2-1dfe-4dfb-860d-ef9af97dbe04.png`
- `card-frame.png` : `/root/.codex/generated_images/01a0e7bb-f7c4-7d32-b030-5205806838a3/exec-b414b003-9956-4290-bf04-8f91a69b0e7f.png`

