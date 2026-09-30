/**
 * HoldToFinish: press-and-hold "Terminer" button (spec from
 * screens/tracking-running.html, Claude Design): a 56 px SVG ring filling in 1.5 s
 * (dashoffset C → 0, standard ease) with increasing haptics; releasing before the end
 * resets. Protects against an accidental stop.
 */
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Alert, Animated, Easing, Pressable, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Icon } from './Icon';
import { useTheme } from '../use-theme';
import { colors, motion } from '../theme';

const SIZE = 56;
const RADIUS = 26;
const STROKE = 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ≈ 163.36, as in the spec
const HOLD_MS = 1500;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  onFinish: () => void;
  disabled?: boolean;
}

export function HoldToFinish({ onFinish, disabled = false }: Props) {
  const theme = useTheme();
  const progress = React.useRef(new Animated.Value(0)).current;
  const hapticTimers = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearHaptics = () => {
    hapticTimers.current.forEach(clearTimeout);
    hapticTimers.current = [];
  };

  React.useEffect(() => clearHaptics, []);

  const onPressIn = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    hapticTimers.current = [
      setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 500),
      setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 1000),
    ];
    Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.bezier(0.2, 0, 0, 1),
      useNativeDriver: false, // props SVG non supportées par le driver natif
    }).start(({ finished }) => {
      if (finished) {
        clearHaptics();
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onFinish();
        progress.setValue(0);
      }
    });
  };

  const onPressOut = () => {
    clearHaptics();
    progress.stopAnimation(() => {
      Animated.timing(progress, {
        toValue: 0,
        duration: motion.durationFast,
        useNativeDriver: false,
      }).start();
    });
  };

  const dashOffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, 0],
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Terminer la séance"
      accessibilityHint="Maintiens 1,5 seconde, ou utilise l’action « Terminer »."
      accessibilityState={{ disabled }}
      // A screen reader can't reliably hold a press (#42). The accessible action asks for
      // a confirmation: for its user, that's the equivalent of the protection against an
      // accidental stop that press-and-hold gives a finger.
      accessibilityActions={disabled ? [] : [{ name: 'activate', label: 'Terminer' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'activate') {
          confirmFinish(onFinish);
        }
      }}
      disabled={disabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[styles.container, disabled && styles.disabled]}
    >
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={styles.ring}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill={theme.surfaceCard}
          stroke={theme.borderStrong}
          strokeWidth={STROKE}
        />
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={colors.primary500}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE}`}
          strokeDashoffset={dashOffset}
        />
      </Svg>
      <Icon name="action-finish" color={colors.primary500} size="sm" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  ring: {
    position: 'absolute',
    transform: [{ rotate: '-90deg' }],
  },
});

/** Stop confirmation for the screen reader (#42): the same safeguard as press-and-hold. */
export function confirmFinish(onFinish: () => void): void {
  Alert.alert('Terminer la séance ?', 'La séance sera enregistrée et envoyée.', [
    { text: 'Continuer', style: 'cancel' },
    { text: 'Terminer', style: 'destructive', onPress: onFinish },
  ]);
}

