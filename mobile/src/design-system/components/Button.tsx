/**
 * Button: RN port of components/actions/Button.jsx (Claude Design).
 * Variants: primary / volt (celebration only) / secondary / text.
 * Press = scale(0.97), 120 ms, no colour change ("performance" tone).
 */
import React from 'react';
import { Animated, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './Icon';
import { colors, fonts, lightTheme, motion, radius } from '../theme';

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
  /** Icon before the label (#39), in the label's colour. Decorative: the text names the action. */
  icon?: IconName;
  /** Completes the label for a screen reader when the effect isn't obvious (#42). */
  accessibilityHint?: string;
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  fullWidth = false,
  style,
  icon,
  accessibilityHint,
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
        // The disabled state is announced ("dimmed") instead of a mute button that doesn't
        // react (#42).
        accessibilityState={{ disabled }}
        accessibilityHint={accessibilityHint}
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
        {icon != null && (
          <Icon name={icon} color={textStyles[variant].color} size={size === 'lg' ? 'md' : 'sm'} />
        )}
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
  // `textOnVolt` has the same value in both themes: the volt background doesn't change.
  volt: { color: lightTheme.textOnVolt },
  secondary: { color: colors.primary500 },
  text: { color: colors.primary500 },
};
