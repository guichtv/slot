# Fixtures locales

Generees par `npm run fixtures` (tools/fixtures/build.ts), controlees par `npm run fixtures:check`.
Montants des books en centiemes de mise (100 = x1).

| id | titre | mode(s) | poids | gain x | spins | paliers de spin |
|---|---|---|---|---|---|---|
| F01 | perte | BASE, ANTE | 30 | 0.00 | 1 | - |
| F02 | petit gain (glyphes) | BASE, ANTE | 22 | 0.10 | 1 | - |
| F03 | gain canette (H1) | BASE, ANTE | 8 | 1.30 | 1 | - |
| F04 | gain pelote (H2) | BASE, ANTE | 7 | 1.60 | 1 | - |
| F05 | gain poisson (H3, 5 colonnes) | BASE, ANTE | 6 | 2.25 | 1 | - |
| F06 | gain souris-drone (H4) | BASE, ANTE | 5 | 6.25 | 1 | - |
| F07 | point laser (3 cases, x2) | BASE, ANTE | 7 | 1.60 | 1 | - |
| F08 | point laser long (8 cases, x10) -> BIG WIN | BASE, ANTE | 3 | 12.00 | 1 | big |
| F09 | anticipation reussie -> 9 VIES complet (puces +1/+2/+3, +3 FS, dernier tour sans gain) | BASE, ANTE | 2 | 17.05 | 13 | big |
| F10 | anticipation ratee (2 Scatters) | BASE, ANTE | 3 | 0.00 | 1 | - |
| F11 | DOUBLE REGARD (4 Scatters) complet | BASE, ANTE | 1 | 8.00 | 10 | - |
| F12 | SCAN : 1 spin, 1 point garanti | SCAN | 1 | 2.80 | 1 | - |
| F13 | DOUBLE SCAN : 1 spin, 2 points (multiplicateurs croises x3 x x5) | DOUBLE_SCAN | 1 | 30.80 | 1 | super |
| F14 | gain juste sous x10 | BASE, ANTE | 2 | 9.50 | 1 | - |
| F15 | gain exactement x10 (BIG WIN inclus) | BASE, ANTE | 2 | 10.00 | 1 | big |
| F16 | SUPER WIN (>= x25) | BASE, ANTE | 1 | 48.00 | 1 | super |
| F17 | MEGA WIN (>= x50) | BASE, ANTE | 1 | 60.20 | 1 | mega |
| F18 | EPIC WIN (>= x100) | BASE, ANTE | 1 | 120.20 | 1 | epic |
| F19 | CYBER WIN (>= x500) | BASE, ANTE | 1 | 1536.00 | 1 | cyber |
| F20 | MAX WIN (plafond 25 000x en bonus) | SUPER | 0 | 25000.00 | 3 | cyber |
| F21 | achat 9 VIES | BONUS | 1 | 6.50 | 10 | - |
| F22 | achat DOUBLE REGARD | SUPER | 1 | 40.40 | 10 | big |
| F23 | Ante : spin normal en mode ANTE | ANTE | 0 | 0.10 | 1 | - |
| F24 | sous-centime (x0,05 : 0,005 EUR a 0,10 EUR) | BASE, ANTE | 1 | 0.05 | 1 | - |
| F25 | point laser sur souris-drone (H4 ne monte plus) | BASE, ANTE | 3 | 3.00 | 1 | - |
| F26 | gros gain en bonus (montants longs avec une grosse mise, panneau DEV) | BASE | 0 | 217.60 | 10 | epic |
