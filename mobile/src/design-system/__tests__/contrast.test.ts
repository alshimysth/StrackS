/**
 * Contrastes WCAG des jetons (#42), calculés sur les valeurs réelles de `theme.ts`.
 *
 * Deux listes :
 *  - les couples **effectivement utilisés pour porter de l'information**, qui doivent
 *    passer AA (4,5:1 pour un texte courant) — un changement de jeton qui les ferait
 *    tomber casse ce test ;
 *  - les couples qui échouent **à cause des valeurs des jetons elles-mêmes**, consignés en
 *    `it.failing`. `theme.ts` ne s'édite pas à la main : ces valeurs descendent de Claude
 *    Design. Le jour où le design les corrige, ces tests passent au vert et jest exige de
 *    les repasser en `it` normal — impossible de corriger un jeton sans que ce fichier le
 *    sache.
 *
 * Hors périmètre, délibérément : les icônes décoratives (le texte voisin porte
 * l'information) et le texte indicatif des champs vides (placeholder).
 */
import { colors, darkTheme, lightTheme, type Theme } from '../theme';

function channel(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Texte courant (< 18,66 px gras) : 4,5:1. */
const AA = 4.5;

const THEMES: [string, Theme][] = [
  ['clair', lightTheme],
  ['sombre', darkTheme],
];

describe('couples utilisés pour du texte — AA exigé', () => {
  for (const [name, theme] of THEMES) {
    it.each([
      ['textPrimary', 'surfaceApp'],
      ['textPrimary', 'surfaceCard'],
      ['textPrimary', 'surfaceSunken'],
      ['textSecondary', 'surfaceApp'],
      ['textSecondary', 'surfaceCard'],
      ['textError', 'surfaceApp'],
    ] as const)(`thème ${name} : %s sur %s`, (fg, bg) => {
      expect(contrast(theme[fg], theme[bg])).toBeGreaterThanOrEqual(AA);
    });
  }

  it('texte sur le bandeau hors ligne (neutral900 sur warning100)', () => {
    expect(contrast(colors.neutral900, colors.warning100)).toBeGreaterThanOrEqual(AA);
  });

  it('texte sur un bouton ou un bandeau volt', () => {
    expect(contrast(lightTheme.textOnVolt, colors.volt500)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.neutral900, colors.volt500)).toBeGreaterThanOrEqual(AA);
  });

  it('suivi de séance, toujours en sombre : secondaire et erreur sur le fond', () => {
    expect(contrast(darkTheme.textSecondary, darkTheme.surfaceApp)).toBeGreaterThanOrEqual(AA);
    expect(contrast(darkTheme.textError, darkTheme.surfaceApp)).toBeGreaterThanOrEqual(AA);
  });
});

/**
 * Échecs dus aux valeurs des jetons — à corriger dans Claude Design, pas ici.
 * Mesures au 2026-09-29 entre parenthèses.
 */
describe('jetons à corriger côté design (échecs connus)', () => {
  it.failing('texte blanc sur primary500 — boutons principaux (4,18:1)', () => {
    expect(contrast(colors.neutral0, colors.primary500)).toBeGreaterThanOrEqual(AA);
  });

  it.failing('primary500 comme texte sur fond clair — liens, boutons secondaires (3,96:1)', () => {
    expect(contrast(colors.primary500, lightTheme.surfaceApp)).toBeGreaterThanOrEqual(AA);
  });

  it.failing('primary500 comme texte sur carte sombre (4,32:1)', () => {
    expect(contrast(colors.primary500, darkTheme.surfaceCard)).toBeGreaterThanOrEqual(AA);
  });

  it.failing('textSecondary sur surfaceSunken, thème clair — panneaux de sport (4,19:1)', () => {
    expect(contrast(lightTheme.textSecondary, lightTheme.surfaceSunken)).toBeGreaterThanOrEqual(AA);
  });

  it.failing('textError sur carte sombre (4,43:1)', () => {
    expect(contrast(darkTheme.textError, darkTheme.surfaceCard)).toBeGreaterThanOrEqual(AA);
  });

  it.failing('textSuccess sur fond clair (4,15:1)', () => {
    expect(contrast(lightTheme.textSuccess, lightTheme.surfaceApp)).toBeGreaterThanOrEqual(AA);
  });
});

it('calcule le contraste comme WCAG : blanc sur noir = 21:1, identique = 1:1', () => {
  expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
  expect(contrast('#3d78e6', '#3d78e6')).toBeCloseTo(1, 5);
});
