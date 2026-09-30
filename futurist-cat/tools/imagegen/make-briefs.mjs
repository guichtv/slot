// Writes one Codex brief per mission (docs/imagegen/<mission>.txt, UTF-8) from assets/plan.json
// and docs/imagegen/_style.txt, plus docs/imagegen/PLAN.md.   node tools/imagegen/make-briefs.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const plan = JSON.parse(readFileSync(resolve(ROOT, 'assets/plan.json'), 'utf8'));
const style = readFileSync(resolve(ROOT, 'docs/imagegen/_style.txt'), 'utf8').trim();
const DIR = resolve(ROOT, 'docs/imagegen');
mkdirSync(resolve(DIR, 'logs'), { recursive: true });

const lots = Object.entries(plan.lots).sort((a, b) => a[1].order - b[1].order);
const rows = [];
for (const [lot, meta] of lots) {
  const imgs = Object.entries(plan.images).filter(([, v]) => v.lot === lot);
  const refs = ['- docs/imagegen/ref/cat-pose-ref.png : le chat rendu depuis le GLB (palette, matières, lumière).'];
  if (lot !== 'ref') refs.push('- assets/generated/ref/ref.screen.png : l\'écran de référence validé (composition, style du décor et de l\'interface).');
  const edits = new Set(imgs.map(([, v]) => v.edit_of).filter(Boolean));
  for (const e of edits) { const src = plan.images[e]; if (src && src.lot !== lot) refs.push(`- assets/generated/${src.lot}/${e}.png : image validée à éditer.`); }
  const list = imgs.map(([id, v], i) => {
    const parts = [
      `${i + 1}. Fichier : assets/generated/${lot}/${id}.png`,
      `   Sujet : ${v.subject}`,
      `   Taille : ${v.size[0]}x${v.size[1]} px ; ${v.alpha ? 'fond transparent (vrai alpha)' : 'image pleine, sans transparence'}.`,
    ];
    if (v.slice9) parts.push(`   Cadre pour 9-slice : coins et bords réguliers, marges ${v.slice9.join('/')} px (gauche/haut/droite/bas) sans détail qui change le long des bords, centre vide ou uniforme.`);
    if (v.sheet) parts.push(`   Planche ${v.sheet[0]}x${v.sheet[1]} : cellules égales, chaque élément centré dans sa cellule avec marge, rien ne déborde sur la cellule voisine.`);
    if (v.edit_of) parts.push(`   À faire en MODE ÉDITION depuis ${v.edit_of} (même cadrage, même lumière) : seule la différence décrite change.`);
    return parts.join('\n');
  }).join('\n');
  const brief = `Utilise $imagegen et l'outil natif image_gen (PAS un script CLI/API) ; mission limitée à ces images et à leur rapport, ne crée ni ne modifie aucun code du jeu, aucun autre fichier du dépôt.

${style}

Références à charger avec view_image AVANT de générer :
${refs.join('\n')}

Mission « ${lot} » : ${meta.title}. Un appel image_gen par image, dans cet ordre :
${list}

Pour chaque image :
- générer avec image_gen ;
- l'inspecter avec view_image (sujet entier, pas de coupe, pas de texte parasite, pas de damier, pas de halo, conformité au style et aux couleurs) ;
- si un défaut est visible, régénérer UNE seule fois, en mode édition depuis l'image obtenue ;
- copier le fichier final depuis $CODEX_HOME/generated_images/… vers le chemin indiqué (créer le dossier si besoin) ;
- écrire à côté un fichier <nom>.prompt.txt contenant le prompt exact utilisé.

Rapport final (dans ta réponse, en français) : pour chaque image, le chemin, la méthode réellement utilisée (image_gen natif, édition), les dimensions, la présence d'un vrai alpha ou d'un fond chroma #00FF00, et les défauts restants. Si image_gen est inaccessible ou refuse, dis-le clairement et arrête-toi : ne produis jamais de SVG, de dessin en code, de copie d'une autre image ni d'image factice à la place.
`;
  writeFileSync(resolve(DIR, `${lot}.txt`), brief, 'utf8');
  rows.push(`| ${meta.order} | \`${lot}\` | ${meta.title} | ${imgs.length} | ${imgs.map(([id]) => `\`${id}\``).join(', ')} |`);
}
const md = `# PLAN ImageGen (Codex CLI) - CYBER CAT

Source : \`assets/plan.json\` (généré par \`node tools/imagegen/make-briefs.mjs\`). Style : \`docs/imagegen/_style.txt\`. Bible : \`docs/ART-DIRECTION.md\`.

## Avant de lancer (sur le PC, Git Bash, dans le dossier du projet)

1. \`npm ci\` puis déposer \`Meshy_AI_Cyber_Cat_All_Animations.glb\` à la racine du projet.
2. \`npm run cat:prepare && npm run cat:poses\` : écrit \`docs/imagegen/ref/cat-pose-ref.png\` (référence de palette et de matières, obligatoire pour la mission \`ref\`).
3. \`bash tools/imagegen/run-lot.sh ref\` puis regarder \`assets/generated/ref/ref.screen.png\` ; relancer en édition tant qu'elle ne raccorde pas avec le chat.
4. \`bash tools/imagegen/run-all.sh\` : toutes les missions restantes, 2 au plus en même temps, départs espacés de 40 s, seules les images absentes sont relancées.
5. \`npm run assets\` : alpha normalisé, rognage, WebP, manifeste, planches claires/sombres dans \`docs/preuves/assets/\`, provenance dans \`docs/IMAGEGEN.md\`.
6. \`npm run build\` : le build public refuse de se construire tant qu'une image requise manque.

Quota : \`node tools/imagegen/quota.mjs\` lit \`used_percent\` dans le dernier rollout de \`~/.codex/sessions\` (environ 1 % par mission de 5 à 7 images). Quota épuisé : s'arrêter, ne jamais remplacer une image par une image factice.

## Missions (1 à 7 images chacune)

| ordre | mission | contenu | n | images |
|---|---|---|---|---|
${rows.join('\n')}
`;
writeFileSync(resolve(DIR, 'PLAN.md'), md, 'utf8');
console.log(`${lots.length} briefs ecrits dans docs/imagegen/`);
