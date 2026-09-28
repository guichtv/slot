# BOOMTOOTH — lot decor-base
Date : 2026-09-28. Studio : Crownforge.

## Méthode
Skill imagegen, outil natif image_gen__imagegen exclusivement pour la création. Aucun CLI/API de génération, aucun SVG de substitution. D1.png et D3.png ont été chargées avec view_image avant génération et utilisées comme références visuelles dans le contexte. Un appel par asset, puis une unique reprise par asset après inspection : 14 appels au total. Aucun fichier cible préexistant à ignorer.
Les PNG finaux ont été copiés sans retouche depuis /root/.codex/generated_images/01a0e77d-4baa-7040-bc41-608da3c4d727/. Les scripts locaux ont seulement copié ou lu les fichiers et leurs métadonnées ; aucun code du jeu modifié.
Chaque fichier possède son prompt exact final dans le fichier homonyme .prompt.txt.

## Livrables
Tous les fichiers sont dans assets/generated/decor/, dimensions vérifiées : 1536 × 1024 pixels.

| Fichier | Canal alpha | Source native finale |
|---|---|---|
| sky.png | Non, RGB opaque | exec-6d1dc95a-ebbd-4a34-bf27-8c369db74603.png |
| clouds.png | Oui, RGBA | exec-fb4cee69-45b2-459f-b58b-ff1874b861ab.png |
| far.png | Oui, RGBA | exec-6e5a8328-2741-4d32-9ea5-d33473eac977.png |
| mid.png | Oui, RGBA | exec-04c452e8-d46b-45c0-94a7-d6b306e608dd.png |
| ground.png | Oui, RGBA | exec-00dda727-9984-4380-8c55-e025c9e0d128.png |
| night-sky.png | Non, RGB opaque | exec-e5eae2a0-0b5a-4bf0-beb4-c00a009558e3.png |
| fg-props.png | Oui, RGBA | exec-c2451df5-915e-445f-b7c3-5abf5a86e6e1.png |

## Inspection et limites restantes
Les sujets demandés sont présents : cinq nuages ; falaise vierge sans visage ; barrage et cascade à gauche, cabane à droite ; sol calme au centre ; aurore et croissant de lune ; trois rondins avec hache, rocher végétalisé, deux caisses avec étoiles d'explosion. Aucun personnage, grille, HUD, texte ou filigrane observé.
Les cinq RGBA possèdent réellement des pixels alpha=0 (respectivement 72,63 %, 36,86 %, 67,55 %, 84,28 %, 57,99 % pour clouds, far, mid, ground, fg-props). Pas de fond chroma utilisé. Leur alpha maximal est toutefois 254, pas 255 : les intérieurs gardent une très légère transparence. Les aperçus natifs montrent des lueurs autour des silhouettes ; de nombreuses zones correspondantes sont alpha=0 dans les PNG, mais les contours et bases conservent des transitions d'alpha. L'absence totale de halo n'est donc pas certifiée.
Les exigences ne sont pas toutes atteintes malgré l'unique reprise autorisée :
- sky : bandes franches et soleil complet, mais nuances/textures subtiles encore visibles à l'intérieur des bandes.
- clouds : espaces entre plusieurs nuages inférieurs aux 60 px demandés ; marges latérales autour de 36 px, sous 3 %.
- far : face libre exploitable, mais terrain plus nuancé que deux tons stricts ; marges latérales autour de 34–38 px, sous 3 % ; brume plus douce que souhaité.
- mid : forêt descend plus bas que le seul tiers central, rivière traverse aussi le bas central ; marges latérales autour de 40–42 px, sous 3 %.
- ground : silhouette complète mais bande plus mince que le tiers bas ; marges latérales autour de 24 px, sous 3 %.
- night-sky : rubans ondulants, étoiles et lune corrects ; légères variations tonales résiduelles, trait plus simple que D1.
- fg-props : trois groupes complets mais intervalles inférieurs aux 80 px et marges latérales autour de 21 px ; rocher végétalisé plus large que 500 px ; textures plus détaillées que le cel-shading strict.

Les marges indiquées sont mesurées sur la boîte des pixels alpha > 128. Aucune intégration ni validation dans le jeu n'a été effectuée, conformément au périmètre images et rapport.
