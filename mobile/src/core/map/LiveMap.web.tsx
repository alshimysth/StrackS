/**
 * Web fallback: react-native-maps is native only. Reuses the design's placeholder
 * (neutral area + caption).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';

export function LiveMap() {
  const theme = useTheme();
  return (
    <View style={[styles.placeholder, { backgroundColor: theme.surfaceSunken }]}>
      <Text style={[typography.label, { color: theme.textTertiary }]}>GPS MAP VIEW</Text>
      <Text style={[typography.caption, { color: theme.textTertiary }]}>
        Carte disponible sur iOS/Android
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
});
