/**
 * StrackS — design tokens (direction « Volt Performance »).
 * Transposé de design_handoff_sporttracker/theme.js du projet Claude Design
 * d8a01989-0514-45c1-9a9c-fe1015bb2ffc — ne pas éditer à la main : toute
 * évolution visuelle part du projet de design (flux Claude Design → code).
 */
import type { TextStyle, ViewStyle } from 'react-native';

export const colors = {
  // Brand — primary (electric blue)
  primary900: '#1a3a73',
  primary700: '#1f4faa',
  primary600: '#2f63c9',
  primary500: '#3d78e6', // base
  primary300: '#9ec0f5',
  primary100: '#e8f0fd',

  // Brand — accent (volt lime) — réservé aux célébrations
  volt900: '#6f8f1e', // marques de données — voir dataSeries
  volt700: '#a9d63a',
  volt500: '#d9f36a', // base
  volt300: '#ecf7ae',
  volt100: '#f4faca',

  // Semantic
  success600: '#1f8a4c',
  success500: '#3aa863',
  success100: '#e3f7ea',

  error600: '#c1372b',
  error500: '#e0483a',
  error100: '#fbe4e1',

  warning600: '#c98a1f',
  warning500: '#e0a83e',
  warning100: '#fcf0da',

  // Neutrals — cool-tinted (hue ~250)
  neutral0: '#ffffff',
  neutral50: '#f7f9fc',
  neutral100: '#eef1f6',
  neutral200: '#dde2ea',
  neutral300: '#c1c9d6',
  neutral400: '#8d97ab',
  neutral500: '#6b7386',
  neutral600: '#4d5364',
  neutral700: '#363b48',
  neutral800: '#22252e',
  neutral900: '#15161c',
  neutral950: '#0b0c10', // surface « plein soleil »
} as const;

export interface Theme {
  surfaceApp: string;
  surfaceCard: string;
  surfaceSunken: string;
  borderSubtle: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  textOnPrimary: string;
  textOnVolt: string;
  textSuccess: string;
  textError: string;
  textWarning: string;
}

export const lightTheme: Theme = {
  surfaceApp: colors.neutral50,
  surfaceCard: colors.neutral0,
  surfaceSunken: colors.neutral100,
  borderSubtle: colors.neutral200,
  borderStrong: colors.neutral300,
  textPrimary: colors.neutral900,
  textSecondary: colors.neutral500,
  textTertiary: colors.neutral400,
  textInverse: colors.neutral0,
  textOnPrimary: colors.neutral0,
  textOnVolt: '#2a3c10',
  textSuccess: colors.success600,
  textError: colors.error600,
  textWarning: colors.warning600,
};

/**
 * Thème sombre = AUSSI le mode « plein soleil » : à appliquer par défaut
 * pendant une séance de tracking GPS en extérieur.
 */
export const darkTheme: Theme = {
  surfaceApp: colors.neutral950,
  surfaceCard: colors.neutral900,
  surfaceSunken: colors.neutral800,
  borderSubtle: colors.neutral800,
  borderStrong: colors.neutral700,
  textPrimary: colors.neutral50,
  textSecondary: colors.neutral400,
  textTertiary: colors.neutral500,
  textInverse: colors.neutral900,
  textOnPrimary: colors.neutral0,
  textOnVolt: '#2a3c10',
  textSuccess: colors.success500,
  textError: colors.error500,
  textWarning: colors.warning500,
};

export const fonts = {
  display: 'Sora_700Bold',
  displaySemiBold: 'Sora_600SemiBold',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemiBold: 'DMSans_600SemiBold',
  bodyBold: 'DMSans_700Bold',
} as const;

export const typography = {
  statXl: { fontFamily: fonts.display, fontSize: 40, lineHeight: 46 },
  statLg: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34 },
  h1: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38 },
  h2: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30 },
  h3: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24 },
  bodyLg: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  caption: { fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 14 },
} satisfies Record<string, TextStyle>;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  layoutGutter: 20,
  tabBarHeight: 64,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const shadows: Record<'card' | 'elevated', ViewStyle> = {
  card: {
    shadowColor: '#1a2233',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  elevated: {
    shadowColor: '#1a2233',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
};

export const motion = {
  durationFast: 120,
  durationBase: 200,
} as const;

/** Seul endroit où un nouveau sport ajoute sa couleur de badge. */
export const sportColors: Record<string, { label: string; color: string; tint: string }> = {
  running: { label: 'Course', color: colors.primary500, tint: colors.primary100 },
  walking: { label: 'Marche', color: colors.volt700, tint: colors.volt100 },
  strength: { label: 'Musculation', color: colors.neutral600, tint: colors.neutral100 },
  climbing: { label: 'Escalade', color: colors.warning600, tint: colors.warning100 },
};

/**
 * Identité d'un sport dans un GRAPHIQUE — volontairement distincte de
 * `sportColors`. Un badge repose sur sa propre teinte pâle ; une marque de
 * données repose directement sur la surface de l'app, où le volt du badge
 * devient illisible : `volt700` y mesure **1,61 : 1** de contraste, très en
 * dessous du plancher de 3 : 1. `volt900` mesure 3,54 : 1.
 *
 * Une seule valeur par sport, identique dans les deux thèmes. Le design gardait
 * `volt700` en sombre parce qu'il y passe le contraste (11,5 : 1) — mais le
 * contraste était le seul contrôle qu'on lui avait appliqué. Sur la validation
 * complète de palette, `volt700` échoue la bande de clarté en sombre (L 0,816
 * pour une bande 0,48–0,67), et l'effet se voit : une marque à 11,5 : 1 à côté
 * d'une autre à 4,7 : 1 se lit comme la série importante, quels que soient les
 * chiffres. `volt900` mesure 5,2 : 1 en sombre — à côté du bleu plutôt qu'au
 * dessus — et passe les six contrôles dans les deux modes.
 *
 * Séparation course/marche en protanopie : ΔE 29,3.
 *
 * Un sport absent de cette table n'a pas de barre colorée dédiée : l'écran
 * retombe sur une neutre, comme `SportBadge` le fait déjà pour son pastille.
 */
export const dataSeriesColors: Record<string, string> = {
  running: colors.primary500,
  walking: colors.volt900,
};
