# Preparation du GLB (SQUELETTE DE TEST, pas le chat)

Source : `tools/.work/test-rig.glb` (0.6 Mo, sha256 859c4c4b0663c2dc...)

Sortie : `tools/.work/test-rig.prepared.glb` **0.06 Mo** ; textures : 2048x2048 image/webp 8 Ko ; 512x512 image/webp 1 Ko

Masque emissif : 0.238 % de la texture. Hanches idle frame 0 : X -1.8 Z 20.5. Gel de Running source : 33 ms.

| clip | duree s | point bas cm (avant -> apres) | appui p25 cm | plus bas | derive X/Z cm (clip source -> final) | lacet debut -> fin (ecart idle) | correction cste / levee max cm |
|---|---|---|---|---|---|---|---|
| idle | 11.33 | 1.7 -> 0 | 1.8 -> 0 | mixamorigLeftFoot @2.83s | 0/0 -> 0/0 | -14 -> -14 (0) | -1.8 / 0.1 |
| alert | 4.033 | 0.6 -> 0 | 0.6 -> 0 | mixamorigLeftToeBase @0s | 0/0 -> 0/0 | -14 -> -14 (0) | -0.6 / 0 |
| idle34 | 11.33 | -4.2 -> 0 | -4.1 -> 0 | mixamorigLeftToeBase @2.83s | 0/0 -> 0/0 | -10 -> -10 (4) | 4.1 / 0.1 |
| dance | 2.667 | -12.5 -> 0 | -5.9 -> 3.7 | mixamorigLeftToeBase @0.33s | 6/69.9 -> 0/0 | -14 -> -14.2 (0.2) | 5.9 / 6.6 |
| flip | 2.45 | -15.4 -> 0 | -10.8 -> 3.5 | mixamorigLeftToeBase @2.05s | 0/110 -> 0/0 | -45.9 -> 0 (14) | 10.8 / 4.6 |
| hooks | 1.2 | -4.1 -> 0 | -3 -> 0 | mixamorigLeftToeBase @0.25s | 0/110 -> 0/0 | 0 -> 0 (14) | 3 / 1.1 |
| dive | 2.867 | -22.9 -> -24.9 | -20.6 -> -22.6 | mixamorigLeftToeBase @1.7s | 31.8/70.5 -> 0/0 | 0 -> 15 (29) | -2 / 0 |
| run | 0.667 | -11.4 -> 0 | -10.2 -> 1.1 | mixamorigLeftToeBase @0.67s | 0/0 -> 0/0 | 0 -> 0 (14) | 10.2 / 1.2 |
| hop | 1.267 | -12.5 -> 0 | -6 -> 3.7 | mixamorigLeftToeBase @0.33s | 6/69.9 -> 0/0 | -14 -> -17.6 (3.6) | 6 / 6.6 |

## Alertes

- dive : fin tournee de 29 deg par rapport a idle (fondu long prevu)
