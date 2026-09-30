# ART-DIRECTION - CYBER CAT

**Direction retenue : « Céramique & néon sous la pluie ».** Rendu 3D stylisé propre de jeu, dérivé du chat Meshy : céramique blanche brillante, métal anodisé bleu, lumière émissive cyan, visière laquée noire. Le décor est une ville néon de nuit sous une pluie fine, plus sombre et moins contrastée que les symboles et le chat, pour que le jeu se lise d'abord.
Pourquoi (2 lignes) : c'est la seule direction qui raccorde avec un chat PBR (exception assumée au style maison BD 2D) ; la céramique blanche sur nuit indigo donne le contraste le plus lisible sur mobile, et le cyan des yeux devient naturellement la couleur de la mécanique (point laser, puces).

## Palette (hex)

À ré-échantillonner dans la texture réelle du chat dès que le GLB est disponible (`npm run cat:poses` écrit la pose de référence ; comparer les valeurs ci-dessous et ajuster si l'écart dépasse ~6 %).

| rôle | hex | usage |
|---|---|---|
| céramique blanche | `#EEF3F9` | faces principales du chat, cadres, boutons |
| céramique ombre | `#C9D3E0` | ombres de la céramique |
| bleu anodisé | `#2F6FE0` | pièces métalliques, anneaux, rubans |
| bleu profond | `#1B3F8F` | contours, liserés des textes |
| cyan émissif | `#3FEAFF` | yeux, point laser, puces, traits de lumière |
| halo cyan | `#9AF6FF` | reflets, cœur des lumières |
| visière | `#0A0D14` | visière, fonds des cases |
| nuit indigo | `#0B1230` / `#141D45` | ciel, verre sombre, panneaux |
| brume sarcelle | `#0F3B4A` | bas du ciel, reflets du sol |
| néon magenta (rare) | `#FF3FA4` | enseignes, glyphe L4 |
| néon ambre (rare) | `#FFB547` | enseignes, fenêtres chaudes |
| glyphes | L1 `#3FFFB2`, L2 `#3FE0FF`, L3 `#9B7BFF`, L4 `#FF5FD1` | lows (formes différentes, jamais seule la couleur) |

## Matières

- **Céramique** : blanc cassé très légèrement bleuté, reflets larges et doux, petites arêtes biseautées, joints fins entre panneaux.
- **Anodisé** : bleu saturé satiné, micro-reflets, jamais chromé (le chrome est réservé au poisson H3).
- **Émissif** : cyan qui éclaire vraiment ce qui l'entoure (liseré de lumière sur la céramique voisine), jamais un « glow » générique posé par-dessus.
- **Verre sombre** : panneaux et cases en verre indigo presque noir, reflet net en haut.
- **Néon** : uniquement des tubes, enseignes, reflets sur le sol mouillé ; pas de halo flou sans source.

## Lumière (identique au rendu three.js, dans chaque brief)

Principale blanche chaude en haut à gauche (~45°), contour cyan en arrière à droite, remplissage bleu très faible, ombres douces. Environnement studio doux (RoomEnvironment), tone mapping neutre.

## Polices (OFL, locales)

- **Oxanium** 700/800 : titres, montants, logo dynamique, boutons (cohérente avec le logo biseauté).
- **Chakra Petch** 500/600 : libellés, règles, réglages.
- Repli pour les langues non latines : Noto Sans JP / KR / SC / Arabic / Devanagari (chargées seulement pour la langue active).

## Symboles

- Visible à **85-95 % de la case** (boîte alpha réelle, mesurée par `npm run assets`), vue 3/4 cohérente pour les premiums, face pour les glyphes.
- Lows = glyphes holographiques projetés par un petit socle en céramique ; formes : triangle, anneau, losange, hexagone.
- Premiums : H1 canette de nano-pâtée, H2 pelote de fibre optique, H3 poisson-robot chromé, H4 souris-drone. Pièces animées séparées (couvercle, queue, rotor).
- WILD (emblème « C ») et SCATTER (portail œil de chat) : lumière propre, texte peint exact (WILD / SCATTER), plus flashy que tout le reste.
- Aucun badge ×0/×1, aucun faux Wild dans les bandes de défilement.

## Objets de mécanique

- Point laser : sphère cyan à cœur blanc, anneau de flare net.
- Puces +1/+2/+3 : micro-puce céramique, **1, 2 ou 3 chevrons** + chiffre dynamique (lisible sans la couleur).
- Jeton multiplicateur : pièce anodisée, centre vide pour la valeur (texte dynamique).

## Interface

- HUD compact en verre sombre bordé de céramique ; gros SPIN rond à droite ; BUY BONUS illustré à gauche ; boutons secondaires ronds (icônes au trait blanc/cyan).
- Popups arrondies, centrées dans la zone de jeu, cadre 9-slice (céramique + verre), peu de mots, police Oxanium.
- **Textes peints : uniquement le logo (CYBER CAT, CROWNFORGE) et WILD / SCATTER.** SPIN, BUY BONUS, noms des bonus et des paliers sont du texte dynamique traduit posé sur des plaques illustrées sans texte.

## Effets (primitives en code, autorisées)

Anneaux d'onde, faisceaux, étincelles, pluie, particules : primitives code ou planche FX ImageGen. Pas de flou générique, pas de bordure lumineuse décorative sur les panneaux.

## Contrôle

Chaque image : histogramme alpha, planche sur fond clair (`#E9EEF5`) et sur fond sombre (`#0B1230`), puis en scène. Toute image hors style est régénérée (une correction au plus, en édition depuis l'image validée).
