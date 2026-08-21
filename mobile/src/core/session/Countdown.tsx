/**
 * Compte à rebours avant le démarrage effectif d'une séance (#3).
 *
 * Rendu par la route de tracking, jamais par l'accueil : le décompte doit couvrir la
 * transition d'écran, sinon l'utilisateur voit l'écran de tracking vide pendant trois
 * secondes avant que quoi que ce soit ne démarre.
 *
 * Le thème sombre est forcé comme sur le reste du tracking (mode « plein soleil »).
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

  // `onDone` est lu par référence au moment du tir : le mettre en dépendance
  // relancerait l'intervalle à chaque rendu du parent et le décompte n'avancerait jamais.
  const done = React.useRef(onDone);
  done.current = onDone;

  React.useEffect(() => {
    const timer = setInterval(() => {
      // L'updater reste PUR : déclencher `onDone` ici l'appellerait plusieurs fois,
      // React pouvant rejouer un updater et le garde `current <= 1` étant vrai aussi
      // pour 0. Le démarrage d'une séance n'est pas une opération idempotente.
      setRemaining((current) => (current > 0 ? current - 1 : 0));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Le franchissement de zéro est l'effet, pas le calcul. Le garde par ref survit aux
  // rendus et garantit un seul démarrage même si le composant re-rend.
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
