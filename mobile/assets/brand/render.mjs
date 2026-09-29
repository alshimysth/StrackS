/**
 * Génère les images d'app (icône, icône adaptative Android, splash, favicon) depuis
 * `mark.svg`. Lancé à la main, pas au build :
 *
 *   cd mobile/assets/brand && npm i --no-save @resvg/resvg-js && node render.mjs
 *
 * Les PNG produits sont versionnés ; ce script ne sert qu'à les régénérer quand la marque
 * change. `@resvg/resvg-js` n'est volontairement pas une dépendance du projet.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const BLUE = '#3d78e6'; // colors.primary500
const mark = readFileSync(new URL('./mark.svg', import.meta.url), 'utf8');
const inner = mark.slice(mark.indexOf('>', mark.indexOf('<svg')) + 1, mark.lastIndexOf('</svg>'));

/** Place la marque (viewBox 100) à `scale` de la taille, centrée, sur un fond optionnel. */
function compose({ size, scale, background, monochrome = false }) {
  const s = (size * scale) / 100;
  const offset = (size - size * scale) / 2;
  let body = inner;
  if (monochrome) {
    body = body.replaceAll('#d9f36a', '#ffffff');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : ''}
  <g transform="translate(${offset} ${offset}) scale(${s})">${body}</g>
</svg>`;
}

function png(svg, file) {
  writeFileSync(new URL(`../images/${file}`, import.meta.url), new Resvg(svg).render().asPng());
  console.log('écrit', file);
}

// Icône iOS / générale : fond plein (iOS n'accepte pas la transparence), marque à 70 %.
png(compose({ size: 1024, scale: 0.7, background: BLUE }), 'icon.png');
// Android adaptatif : la zone sûre est un cercle de 66 % — marque à 55 % pour le traverser.
png(compose({ size: 1024, scale: 0.55 }), 'android-icon-foreground.png');
png(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${BLUE}"/></svg>`, 'android-icon-background.png');
png(compose({ size: 1024, scale: 0.55, monochrome: true }), 'android-icon-monochrome.png');
// Splash : la marque seule, sur transparent ; la couleur de fond vient d'app.json.
png(compose({ size: 1024, scale: 1 }), 'splash-icon.png');
png(compose({ size: 48, scale: 0.8, background: BLUE }), 'favicon.png');
