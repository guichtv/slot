# Test HUD (non-chevauchement) - 5 langues x 7 tailles

`node tools/hud-check.mjs --lang <code>` sur la build QA servie, horloge virtuelle. Solde 1 234 567 890,12 et gain 9 876 543 210,99 (10 chiffres). Contrôles : aucun chevauchement entre boutons / champs / Ante / logo, rien hors écran, aucun montant tronqué, cibles tactiles >= 44 px (tailles tactiles), le HUD ne couvre pas la grille, logo et Ante hors de la grille, grille entière, texte de l'Ante non coupé.

| langue | taille | classe | éléments | résultat | solde affiché | gain affiché |
|---|---|---|---|---|---|---|
| fr | 1920x1080 | xl | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |
| fr | 1440x900 | xl | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |
| fr | 960x720 | md | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |
| fr | tablet-1024x768 | tablet | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |
| fr | portrait-390x844 | portrait | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |
| fr | short-844x390 | short | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |
| fr | popout-S-400x300 | short | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |
| ar | 1920x1080 | xl | 14 | OK | ‏1,234,567,890.12 € | ‏9,876,543,210.99 € |
| ar | 1440x900 | xl | 14 | OK | ‏1,234,567,890.12 € | ‏9,876,543,210.99 € |
| ar | 960x720 | md | 14 | OK | ‏1,234,567,890.12 € | ‏9,876,543,210.99 € |
| ar | tablet-1024x768 | tablet | 14 | OK | ‏1,234,567,890.12 € | ‏9,876,543,210.99 € |
| ar | portrait-390x844 | portrait | 14 | OK | ‏1,234,567,890.12 € | ‏9,876,543,210.99 € |
| ar | short-844x390 | short | 14 | OK | ‏1,234,567,890.12 € | ‏9,876,543,210.99 € |
| ar | popout-S-400x300 | short | 14 | OK | ‏1,234,567,890.12 € | ‏9,876,543,210.99 € |
| ru | 1920x1080 | xl | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |
| ru | 1440x900 | xl | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |
| ru | 960x720 | md | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |
| ru | tablet-1024x768 | tablet | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |
| ru | portrait-390x844 | portrait | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |
| ru | short-844x390 | short | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |
| ru | popout-S-400x300 | short | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |
| id | 1920x1080 | xl | 14 | OK | €1.234.567.890,12 | €9.876.543.210,99 |
| id | 1440x900 | xl | 14 | OK | €1.234.567.890,12 | €9.876.543.210,99 |
| id | 960x720 | md | 14 | OK | €1.234.567.890,12 | €9.876.543.210,99 |
| id | tablet-1024x768 | tablet | 14 | OK | €1.234.567.890,12 | €9.876.543.210,99 |
| id | portrait-390x844 | portrait | 14 | OK | €1.234.567.890,12 | €9.876.543.210,99 |
| id | short-844x390 | short | 14 | OK | €1.234.567.890,12 | €9.876.543.210,99 |
| id | popout-S-400x300 | short | 14 | OK | €1.234.567.890,12 | €9.876.543.210,99 |
| fi | 1920x1080 | xl | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |
| fi | 1440x900 | xl | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |
| fi | 960x720 | md | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |
| fi | tablet-1024x768 | tablet | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |
| fi | portrait-390x844 | portrait | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |
| fi | short-844x390 | short | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |
| fi | popout-S-400x300 | short | 14 | OK | 1 234 567 890,12 € | 9 876 543 210,99 € |

Les tailles court (844x390) et Popout S (400x300) ont été repassées après le dernier correctif (Ante dans la colonne du HUD sous 340 px de haut) ; les 5 autres tailles viennent de la passe précédente, dont le CSS de ces classes est identique.
