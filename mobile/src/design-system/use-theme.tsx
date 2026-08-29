/**
 * Sélection du thème. Le thème sombre est aussi le mode « plein soleil » :
 * le moteur de séance (core/session) le force pendant le tracking via
 * <ThemeOverride theme={darkTheme}>.
 */
import React from 'react';
import { useColorScheme } from 'react-native';

import { DEFAULT_PREFERENCES } from '../core/preferences/schema';
import { usePreferences } from '../core/preferences/use-preferences';
import { darkTheme, lightTheme, type Theme } from './theme';

const ThemeOverrideContext = React.createContext<Theme | null>(null);

/** Force un thème pour tout un sous-arbre, quel que soit le réglage système. */
export function ThemeOverride({
  theme,
  children,
}: {
  theme: Theme;
  children: React.ReactNode;
}) {
  return <ThemeOverrideContext.Provider value={theme}>{children}</ThemeOverrideContext.Provider>;
}

/**
 * Thème effectif (#31).
 *
 * Ordre de priorité, du plus fort au plus faible :
 *  1. `ThemeOverride` — le tracking force le sombre (mode « plein soleil » en
 *     extérieur). La DoD de #31 l'exige : le réglage utilisateur ne doit PAS pouvoir
 *     éclaircir un écran qu'on lit en plein soleil, un bras tendu.
 *  2. la préférence `theme` (light | dark) ;
 *  3. `auto` — le réglage système, comportement d'avant #31 et défaut conservé.
 */
export function useTheme(): Theme {
  const override = React.useContext(ThemeOverrideContext);
  const scheme = useColorScheme();
  const preferences = usePreferences();
  const preferred = preferences.data?.theme ?? DEFAULT_PREFERENCES.theme;

  if (override != null) {
    return override;
  }
  if (preferred === 'light') {
    return lightTheme;
  }
  if (preferred === 'dark') {
    return darkTheme;
  }
  return scheme === 'dark' ? darkTheme : lightTheme;
}
