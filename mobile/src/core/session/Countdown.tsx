/**
 * Countdown before a session actually starts (#3).
 *
 * Rendered by the tracking route, never by the home screen: the countdown must cover the
 * screen transition, otherwise the user sees the empty tracking screen for three seconds
 * before anything starts.
 *
 * The dark theme is forced as on the rest of tracking ("full sun" mode).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../design-system/components/Button';
import { ThemeOverride } from '../../design-system/use-theme';
import { darkTheme, spacing, typography } from '../../design-system/theme';

export const COUNTDOWN_FROM = 3;
const TICK_MS = 1000;

interface Props {
  onDone: () => void;
  onCancel: () => void;
  from?: number;
}

export function Countdown({ onDone, onCancel, from = COUNTDOWN_FROM }: Props) {
  const [remaining, setRemaining] = React.useState(from);

  // `onDone` is read by reference when firing: making it a dependency would restart the
  // interval on every parent render and the countdown would never advance.
  const done = React.useRef(onDone);
  done.current = onDone;

  React.useEffect(() => {
    const timer = setInterval(() => {
      // The updater stays PURE: triggering `onDone` here would call it several times, since
      // React may replay an updater and the `current <= 1` guard is also true for 0.
      // Starting a session isn't an idempotent operation.
      setRemaining((current) => (current > 0 ? current - 1 : 0));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Crossing zero is the effect, not the computation. The ref guard survives renders and
  // guarantees a single start even if the component re-renders.
  const fired = React.useRef(false);
  React.useEffect(() => {
    if (remaining === 0 && !fired.current) {
      fired.current = true;
      done.current();
    }
  }, [remaining]);

  return (
    <ThemeOverride theme={darkTheme}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.screen} testID="countdown">
          <Text style={[typography.label, { color: darkTheme.textSecondary }]}>
            DÉPART DANS
          </Text>
          <Text testID="countdown-value" style={[styles.digit, { color: darkTheme.textPrimary }]}>
            {remaining}
          </Text>
          <Pressable accessibilityRole="button" onPress={onCancel} testID="countdown-cancel">
            <Button variant="secondary" size="lg" onPress={onCancel}>
              Annuler
            </Button>
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemeOverride>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: darkTheme.surfaceApp },
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  digit: { fontSize: 120, lineHeight: 132, fontVariant: ['tabular-nums'] },
});
