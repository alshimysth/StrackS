/**
 * Fallback web : react-native-maps est natif uniquement. Même placeholder que
 * `LiveMap.web.tsx`, pour que le bundle web de la CI passe.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';

interface Props {
  path: { latitude: number; longitude: number }[];
  testID?: string;
}

export function RouteMap({ path, testID = 'route-map' }: Props) {
  const theme = useTheme();
  if (path.length === 0) {
    return null;
  }
  return (
    <View testID={testID} style={[styles.placeholder, { backgroundColor: theme.surfaceSunken }]}>
      <Text style={[typography.label, { color: theme.textTertiary }]}>GPS MAP VIEW</Text>
      <Text style={[typography.caption, { color: theme.textTertiary }]}>
        Carte disponible sur iOS/Android
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
});
