/**
 * Theme selection. The dark theme is also the "full sun" mode: the session engine
 * (core/session) forces it during tracking through <ThemeOverride theme={darkTheme}>.
 */
import React from 'react';
import { useColorScheme } from 'react-native';

import { DEFAULT_PREFERENCES } from '../core/preferences/schema';
import { usePreferences } from '../core/preferences/use-preferences';
import { darkTheme, lightTheme, type Theme } from './theme';

const ThemeOverrideContext = React.createContext<Theme | null>(null);

/** Forces a theme for a whole subtree, whatever the system setting. */
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
 * Effective theme (#31).
 *
 * Priority order, from strongest to weakest:
 *  1. `ThemeOverride`: tracking forces dark ("full sun" mode outdoors). #31's DoD requires
 *     it: the user setting must NOT be able to lighten a screen read in full sun, at arm's
 *     length.
 *  2. the `theme` preference (light | dark);
 *  3. `auto`: the system setting, the behaviour from before #31 and the kept default.
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
