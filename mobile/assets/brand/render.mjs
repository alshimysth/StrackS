/**
 * Generates the app images (icon, Android adaptive icon, splash, favicon) from
 * `mark.svg`. Run by hand, not at build time:
 *
 *   cd mobile/assets/brand && npm i --no-save @resvg/resvg-js && node render.mjs
 *
 * The produced PNGs are versioned; this script only regenerates them when the mark
 * changes. `@resvg/resvg-js` is deliberately not a project dependency.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const BLUE = '#3d78e6'; // colors.primary500
const mark = readFileSync(new URL('./mark.svg', import.meta.url), 'utf8');
const inner = mark.slice(mark.indexOf('>', mark.indexOf('<svg')) + 1, mark.lastIndexOf('</svg>'));

/** Places the mark (viewBox 100) at `scale` of the size, centred, on an optional background. */
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
  console.log('wrote', file);
}

// iOS / general icon: solid background (iOS doesn't accept transparency), mark at 70 %.
png(compose({ size: 1024, scale: 0.7, background: BLUE }), 'icon.png');
// Android adaptive: the safe zone is a 66 % circle, mark at 55 % to cross it.
png(compose({ size: 1024, scale: 0.55 }), 'android-icon-foreground.png');
png(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${BLUE}"/></svg>`, 'android-icon-background.png');
png(compose({ size: 1024, scale: 0.55, monochrome: true }), 'android-icon-monochrome.png');
// Splash: the mark alone, on transparent; the background colour comes from app.json.
png(compose({ size: 1024, scale: 1 }), 'splash-icon.png');
png(compose({ size: 48, scale: 0.8, background: BLUE }), 'favicon.png');
