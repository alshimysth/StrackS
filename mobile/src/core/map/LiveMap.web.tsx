/**
 * Fallback web : react-native-maps est natif uniquement. Reprend le
 * placeholder réglementaire du design (zone neutre + mention).
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
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
});
