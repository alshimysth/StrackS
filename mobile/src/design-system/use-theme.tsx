/**
 * Sélection du thème. Le thème sombre est aussi le mode « plein soleil » :
 * le moteur de séance (core/session) le force pendant le tracking via
 * <ThemeOverride theme={darkTheme}>.
 */
import React from 'react';
import { useColorScheme } from 'react-native';

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

export function useTheme(): Theme {
  const override = React.useContext(ThemeOverrideContext);
  const scheme = useColorScheme();
  return override ?? (scheme === 'dark' ? darkTheme : lightTheme);
}
