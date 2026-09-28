# BOOMTOOTH — directions D2 à D5

Images réellement produites avec l’outil natif image_gen (image_gen__imagegen), sans CLI ni appel API par script. Un asset par appel ; une reprise pour D2, D3 et D5 après inspection visuelle, aucune pour D4. Les fichiers finaux ont été copiés depuis /root/.codex/generated_images/ vers ce dossier. Aucun code du jeu modifié.

| Image | Dimensions vérifiées | Mode | Canal alpha | Prompt final |
|---|---|---|---|---|
| D2.png | 1536 × 1024 | RGB | Non, fond opaque demandé | D2.prompt.txt |
| D3.png | 1536 × 1024 | RGB | Non, fond opaque demandé | D3.prompt.txt |
| D4.png | 1536 × 1024 | RGB | Non, fond opaque demandé | D4.prompt.txt |
| D5.png | 1536 × 1024 | RGB | Non, fond opaque demandé | D5.prompt.txt |

Inspection visuelle : les quatre images présentent une grille de 5 colonnes et 5 lignes, les onze familles de symboles, Buck entier à droite avec dent dorée, les textes BOOMTOOTH, BUY BONUS, SPIN, WILD et SCATTER lisibles et trois plaques de valeurs vides. Vérification technique des dimensions et du mode couleur avec Pillow en lecture seule.

Écarts restants : les cases de D2 et D4 sont légèrement plus larges que hautes. Le remplissage de certaines cases reste inférieur aux 85–95 % demandés. D2 conserve un décor plus détaillé et moins strictement découpé en papier que souhaité ; la symétrie est approximative. Quelques lumières et ombrages présentent des transitions au lieu de deux aplats stricts, surtout dans D3 et D5. La morphologie et les accessoires de Buck varient légèrement entre directions malgré leurs attributs communs. Les diagonales de D4 restent surtout présentes dans le décor ; sa grille reste frontale. Les directions se distinguent par leurs décors, cadres, matières et éclairages, avec une structure générale très proche.

Sources finales :
- D2 : exec-86d4efed-75ce-400a-9522-03f671cd8c00.png
- D3 : exec-23d34aa2-9309-40ae-904a-3c63d9c26809.png
- D4 : exec-b1db3621-145d-40f6-a72d-40b882319548.png
- D5 : exec-e9325410-413d-410e-8768-aef36abac35a.png

Répertoire source commun : /root/.codex/generated_images/01a0e76d-252e-7320-aeb5-29c271e94959/
