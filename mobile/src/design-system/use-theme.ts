/**
 * Sélection du thème. Le thème sombre est aussi le mode « plein soleil » :
 * le moteur de séance (core/session, Epic 3) le forcera pendant le tracking.
 */
import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme, type Theme } from './theme';

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}
