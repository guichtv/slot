# BOOMTOOTH — rapport decor-extra

Date : 2026-09-28. Studio : Crownforge.

Méthode réellement utilisée : compétence imagegen, outil natif image_gen__imagegen exclusivement pour la génération et les éditions. Aucun CLI/API de génération, aucun SVG de substitution, aucun code du jeu créé ou modifié. D1.png et far.png chargés avec view_image avant génération. Les étapes suivantes du monument ont été éditées à partir des images précédentes. Un appel initial et une seule relance corrective par asset, soit 14 appels. Les versions retenues ont été copiées depuis /root/.codex/generated_images/01a0e7bb-5ad4-7442-a48c-30312c4ac65c/. Aucun redimensionnement ou traitement graphique par script ; Pillow utilisé uniquement pour lire dimensions et alpha.

Chaque PNG possède son fichier homonyme .prompt.txt, avec le prompt exact de la version retenue.

| Fichier dans assets/generated/decor/ | Dimensions réelles | Canal alpha |
|---|---|---|
| sky-rich.png | 1536×1024 | non, RGB opaque |
| monument-0.png | 1254×1254 | oui, RGBA |
| monument-1.png | 1254×1254 | oui, RGBA |
| monument-2.png | 1254×1254 | oui, RGBA |
| monument-3.png | 1254×1254 | oui, RGBA |
| floodlight.png | 1024×1536 | oui, RGBA |
| birds.png | 1536×1024 | oui, RGBA |

Contrôles et défauts restants :
- Les quatre étapes de sculpture sont présentes : dessin à la craie ; casque et sourcils ; yeux, museau et incisives avec échafaudage réduit ; visage achevé sans échafaudage, incisive à droite de l’image dorée.
- Les monuments ne respectent pas le format 1024×1024 : le natif a produit 1254×1254 malgré les demandes et les relances. Leur cadrage est proche, mais leurs contours, fissures et certains détails varient légèrement : la superposition exacte demandée n’est pas obtenue. Les premières versions des étapes 1 à 3 ont été retenues, les relances n’améliorant pas ce point.
- Le bloc seul occupe moins de 90 % de la largeur, les échafaudages puis les éclats élargissant le sujet total. Les marges ne sont pas toutes dans l’intervalle 3–6 % : notamment les monuments ont environ 7 % en haut/bas et le projecteur environ 2,5 % en haut.
- Le ciel garde certaines modulations douces de couleur malgré la relance, au lieu d’aplats strictement uniformes. La pierre présente aussi une texture plus nuancée que le cel-shading à deux tons strict demandé.
- Les trois oies sont complètes, de profil, avec ailes hautes/intermédiaires/basses. La pose intermédiaire reste légèrement oblique plutôt que parfaitement horizontale. Au seuil alpha >128, leurs largeurs sont 382, 404 et 380 px, au lieu d’environ 300 px. Espacements mesurés : 118 et 122 px, conformes au minimum de 100 px.
- Transparence réelle confirmée : alpha 0 dans le fond et alpha élevé sur les sujets. Les halos colorés visibles dans certains aperçus correspondent, aux points contrôlés, à des couleurs RGB stockées sous un alpha nul et sont donc invisibles avec une composition alpha correcte. Il subsiste quelques pixels de très faible alpha hors contour ; le détourage n’est pas strictement propre au pixel près. Pas de fond chroma nécessaire.
- Aucun texte, logo, filigrane ou signature visible dans les images finales.

Sources natives retenues :
- sky-rich.png : exec-6342c855-a70c-4d48-97c4-300d0c146e8d.png
- monument-0.png : exec-b687bd63-f7a2-4c98-8c72-2604c3ee7dda.png
- monument-1.png : exec-970c612e-7490-4100-ba3e-122039f55219.png
- monument-2.png : exec-784ea086-37d4-43ac-b15c-8f722a64e466.png
- monument-3.png : exec-f4382ac0-5a7b-4364-9d45-25e74b1e0a39.png
- floodlight.png : exec-2361c361-d7cc-44ba-b096-e1bbc2a8f81c.png
- birds.png : exec-756da091-d585-48b9-b3c1-08607bc9bb75.png
