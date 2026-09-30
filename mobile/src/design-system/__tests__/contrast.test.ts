/**
 * WCAG contrast of the tokens (#42), computed on the actual `theme.ts` values.
 *
 * Two lists:
 *  - the pairs **actually used to carry information**, which must pass AA (4.5:1 for body
 *    text); a token change that would make them fail breaks this test;
 *  - the pairs failing **because of the token values themselves**, recorded as
 *    `it.failing`. `theme.ts` isn't edited by hand: these values come down from Claude
 *    Design. The day the design fixes them, these tests turn green and jest requires
 *    turning them back into plain `it`: a token can't be fixed without this file knowing.
 *
 * Deliberately out of scope: decorative icons (the neighbouring text carries the
 * information) and the hint text of empty fields (placeholder).
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

/** Body text (< 18.66 px bold): 4.5:1. */
const AA = 4.5;

const THEMES: [string, Theme][] = [
  ['clair', lightTheme],
  ['sombre', darkTheme],
];

describe('pairs used for text: AA required', () => {
  for (const [name, theme] of THEMES) {
    it.each([
      ['textPrimary', 'surfaceApp'],
      ['textPrimary', 'surfaceCard'],
      ['textPrimary', 'surfaceSunken'],
      ['textSecondary', 'surfaceApp'],
      ['textSecondary', 'surfaceCard'],
      ['textError', 'surfaceApp'],
    ] as const)(`${name} theme: %s on %s`, (fg, bg) => {
      expect(contrast(theme[fg], theme[bg])).toBeGreaterThanOrEqual(AA);
    });
  }

  it('text on the offline banner (neutral900 on warning100)', () => {
    expect(contrast(colors.neutral900, colors.warning100)).toBeGreaterThanOrEqual(AA);
  });

  it('text on a volt button or banner', () => {
    expect(contrast(lightTheme.textOnVolt, colors.volt500)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.neutral900, colors.volt500)).toBeGreaterThanOrEqual(AA);
  });

  it('session tracking, always dark: secondary and error on the background', () => {
    expect(contrast(darkTheme.textSecondary, darkTheme.surfaceApp)).toBeGreaterThanOrEqual(AA);
    expect(contrast(darkTheme.textError, darkTheme.surfaceApp)).toBeGreaterThanOrEqual(AA);
  });
});

/**
 * Failures caused by the token values: to fix in Claude Design, not here.
 * Measurements as of 2026-09-29 in brackets.
 */
describe('tokens to fix on the design side (known failures)', () => {
  it.failing('white text on primary500: primary buttons (4.18:1)', () => {
    expect(contrast(colors.neutral0, colors.primary500)).toBeGreaterThanOrEqual(AA);
  });

  it.failing('primary500 as text on a light background: links, secondary buttons (3.96:1)', () => {
    expect(contrast(colors.primary500, lightTheme.surfaceApp)).toBeGreaterThanOrEqual(AA);
  });

  it.failing('primary500 as text on a dark card (4.32:1)', () => {
    expect(contrast(colors.primary500, darkTheme.surfaceCard)).toBeGreaterThanOrEqual(AA);
  });

  it.failing('textSecondary on surfaceSunken, light theme: sport panels (4.19:1)', () => {
    expect(contrast(lightTheme.textSecondary, lightTheme.surfaceSunken)).toBeGreaterThanOrEqual(AA);
  });

  it.failing('textError on a dark card (4.43:1)', () => {
    expect(contrast(darkTheme.textError, darkTheme.surfaceCard)).toBeGreaterThanOrEqual(AA);
  });

  it.failing('textSuccess on a light background (4.15:1)', () => {
    expect(contrast(lightTheme.textSuccess, lightTheme.surfaceApp)).toBeGreaterThanOrEqual(AA);
  });
});

it('computes contrast like WCAG: white on black = 21:1, identical = 1:1', () => {
  expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
  expect(contrast('#3d78e6', '#3d78e6')).toBeCloseTo(1, 5);
});
