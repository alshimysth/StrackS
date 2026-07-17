/**
 * Button — transposition RN de components/actions/Button.jsx (Claude Design).
 * Variantes : primary / volt (célébration uniquement) / secondary / text.
 * Appui = scale(0.97), 120 ms, pas de changement de couleur (ton « performance »).
 */
import React from 'react';
import { Animated, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { colors, fonts, motion, radius } from '../theme';

type Variant = 'primary' | 'volt' | 'secondary' | 'text';
type Size = 'md' | 'lg';

interface Props {
  children: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  fullWidth = false,
  style,
}: Props) {
  const scale = React.useRef(new Animated.Value(1)).current;

  const animate = (to: number) =>
    Animated.timing(scale, {
      toValue: to,
      duration: motion.durationFast,
      useNativeDriver: true,
    }).start();

  return (
    <Animated.View style={[{ transform: [{ scale }] }, fullWidth && styles.fullWidth, style]}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => animate(0.97)}
        onPressOut={() => animate(1)}
        style={[
          styles.base,
          sizeStyles[size],
          variantStyles[variant],
          disabled && styles.disabled,
        ]}
      >
        <Text style={[styles.label, size === 'lg' && styles.labelLg, textStyles[variant]]}>
          {children}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  fullWidth: { alignSelf: 'stretch' },
  disabled: { opacity: 0.4 },
  label: { fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 0.14 },
  labelLg: { fontSize: 16 },
});

const sizeStyles: Record<Size, ViewStyle> = {
  md: { height: 44, paddingHorizontal: 20 },
  lg: { height: 56, paddingHorizontal: 28 },
};

const variantStyles: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.primary500 },
  volt: { backgroundColor: colors.volt500 },
  secondary: { backgroundColor: 'transparent', borderColor: colors.primary500 },
  text: { backgroundColor: 'transparent' },
};

const textStyles: Record<Variant, { color: string }> = {
  primary: { color: colors.neutral0 },
  volt: { color: '#2a3c10' },
  secondary: { color: colors.primary500 },
  text: { color: colors.primary500 },
};
