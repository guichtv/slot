# BOOMTOOTH — lot mechanics-ui

Méthode : compétence imagegen, outil natif `image_gen` exclusivement. D1.png chargée avec `view_image` avant génération et fournie comme référence de style à chaque appel. 12 appels : une génération puis une reprise par asset. Aucun CLI/API de génération, aucune retouche ou conversion des pixels, aucun code du jeu modifié. Fichiers copiés depuis `/root/.codex/generated_images/01a0e7ba-c4bf-7b42-98b4-74bd94fecf5e/`. Les prompts exacts des variantes retenues sont dans les six fichiers `.prompt.txt` adjacents.

| Chemin depuis la racine | Dimensions réelles | Alpha | Source retenue |
| --- | --- | --- | --- |
| assets/generated/ui/cornerstone.png | 1254 × 1254 | oui, RGBA | exec-1530dd2c-dcb7-408c-ac7f-6d4a05d44062.png |
| assets/generated/ui/cornerstone-gold.png | 1254 × 1254 | oui, RGBA | exec-8c26096d-a637-439c-8d05-7fe6bec9be2b.png |
| assets/generated/ui/topbar.png | 1536 × 1024 | oui, RGBA | exec-f4272554-ecb8-45df-98c8-79b8bac09551.png |
| assets/generated/symbols/T-log.png | 1254 × 1254 | oui, RGBA | exec-ef585160-43b1-4ef0-8ebb-418ad8959086.png |
| assets/generated/fx/fx-debris.png | 1536 × 1024 | oui, RGBA | exec-40e1796d-65c8-4276-9bba-0dea7968b049.png |
| assets/generated/fx/fx-dust.png | 1536 × 1024 | oui, RGBA | exec-c5771611-9627-48b3-a14e-c77679d06f55.png |

Inspection visuelle et lecture des dimensions/alpha avec Pillow, sans modification d'image. Aucun texte ni chiffre visible. Fonds réellement transparents : présence de pixels alpha 0 dans tous les fichiers. Pas de recours au vert chroma. Les halos colorés apparents dans les aperçus correspondent, aux points de fond contrôlés, à des couleurs RGB masquées par un alpha nul. Les trois images paysage ont un alpha maximum de 254 plutôt que 255.

Écarts restants après l'unique reprise autorisée :

- Les trois images carrées sont livrées en 1254 × 1254 malgré la demande répétée de 1024 × 1024.
- Cornerstone : marge latérale visible d'environ 1,5 %, trop faible ; marges verticales plus grandes que demandé. Quelques pixels alpha faibles s'étendent au-delà de la silhouette. La face est vide, mais conserve une légère variation tonale. Le bloc doré reprend très étroitement le cadrage, sans garantie d'identité pixel à pixel.
- Topbar : silhouette, chaînes incluses, d'environ 1343 × 435 px au lieu des 1200 × 260 visés ; centre sans texte mais veiné.
- T-log : trois bandes et mèche en boucle présentes. Une étincelle supplémentaire apparaît au bout de la mèche ; rendu un peu plus texturé que le strict cel-shading deux tons.
- Débris : compte correct de 6 granits, 3 bois et 3 ors. Éléments d'environ 163 à 243 px sur leur plus grand axe, plusieurs dépassent donc 180 px. Espacement entre silhouettes supérieur à 50 px. Première version retenue car la reprise avait un mauvais compte de matières.
- Poussière : quatre silhouettes de tailles croissantes, environ 356 × 223, 529 × 320, 596 × 365 et 716 × 447 px. Espacement minimal entre boîtes des silhouettes d'au moins 70 px. Marge droite du plus grand nuage d'environ 58 px.

Mesures des silhouettes calculées au seuil alpha > 128 ; elles excluent les pixels très transparents de bord. Le lot est produit, mais les écarts ci-dessus empêchent de le déclarer entièrement conforme au cahier des charges.
