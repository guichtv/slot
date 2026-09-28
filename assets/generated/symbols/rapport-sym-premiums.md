# BOOMTOOTH — lot sym-premiums

Méthode : compétence imagegen, outil natif `image_gen` exclusivement pour la génération. Référence obligatoire `assets/generated/directions/D1.png` chargée avec `view_image` et jointe comme référence stylistique à chaque appel. Douze appels : une génération et une unique reprise par asset. Aucun script CLI/API de génération, aucune retouche des pixels, aucune modification du code du jeu. Copies binaires des sorties de `/root/.codex/generated_images/01a0e77c-af66-7330-a33c-0535b5ea6bb1/`.

Les prompts exacts des versions retenues sont dans les six fichiers `.prompt.txt` voisins. Contrôle visuel des sorties et contrôle technique des PNG avec Pillow en lecture seule.

| Fichier | Dimensions | Alpha réel | Prompt |
|---|---|---|---|
| H1.png | 1536×1024 | oui, RGBA | H1.prompt.txt |
| H2.png | 1536×1024 | oui, RGBA | H2.prompt.txt |
| H3.png | 1536×1024 | oui, RGBA | H3.prompt.txt |
| H4.png | 1536×1024 | oui, RGBA | H4.prompt.txt |
| W.png | 1536×1024 | oui, RGBA | W.prompt.txt |
| S.png | 1536×1024 | oui, RGBA | S.prompt.txt |

Les six images ont des pixels entièrement transparents (alpha 0). Alpha maximal observé : 254, donc les sujets ne sont pas strictement opaques à 255. Pas de recours au vert chroma. L'aperçu de génération affiche une lueur diffuse ; le contrôle du canal alpha confirme néanmoins de grandes zones réellement transparentes. Des franges faiblement opaques subsistent et peuvent atteindre les bords : absence totale de halo non certifiée.

## Défauts et limites restants après l'unique reprise

- H1 : sujet complet, dynamite verticale et petite flamme ; légère frange alpha jusqu'au bord inférieur.
- H2 : absence de bois sur la tête respectée ; marges latérales inférieures à 3 %. Écartement et perspective de la paire de bois non garantis pour un montage exact par simple translation.
- H3 : casque bleu, plan roulé et blueprint sans texte présents ; marges latérales trop faibles et séparation nettement inférieure à 100 px près du bas du plan. Le plan roulé est encore tenu devant le buste. Dessin du blueprint plus détaillé que demandé.
- H4 : absence de huppe sur la tête respectée ; huppe séparée encore plus grande que la cible corrective et raccord exact à vérifier. Marge inférieure proche de 3 %. Les lunettes reposent sur le casque.
- W : texte exact WILD, caisse ouverte sans couvercle attaché ; couvercle encore trop petit et perspective imparfaitement concordante pour un montage exact. Séparation et marge droite inférieures aux cibles.
- S : texte exact SCATTER, absence de poignée sur la boîte, tige séparée sans embout inférieur ; marge droite inférieure à 3 %, diamètre de tige plus étroit que l'orifice.
- Ensemble : encrage et palette proches de D1, mais détails de texture et nuances supplémentaires dépassent parfois le cel-shading strict à deux tons. Hauteur du symbole principal variable, environ 810–946 px.

Ces fichiers sont réellement générés et livrés, mais ne satisfont pas intégralement les contraintes d'assemblage et d'espacement. Aucune nouvelle génération au-delà de la reprise autorisée par asset.

## Traçabilité des sorties retenues

- H1 : exec-47d42938-d025-42ca-8df1-7263f681057e.png
- H2 : exec-2da8e39b-d3d1-4d96-9fce-5d61315ef2a2.png
- H3 : exec-71837e7b-7504-44ca-b992-cd8f24a676b9.png
- H4 : exec-70f9ef4f-e006-4a54-92bd-c2112b24fb52.png
- W : exec-51a0a696-e03c-4793-8657-90e6068f7b30.png
- S : exec-76a5b224-0f69-44f8-9fc6-ee42c88c3153.png
