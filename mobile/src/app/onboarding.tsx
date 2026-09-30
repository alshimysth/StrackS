/**
 * First-launch onboarding (#82): explain location before asking for it.
 *
 * Two short steps. The second is the heart: what is collected, when, why, and the means
 * to stay in control (privacy zones, export, deletion). The foreground permission request
 * starts here, after the explanation; "Always" is still requested when a session starts,
 * the only moment iOS accepts it (#16).
 */
import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { requestForegroundPermission } from '../core/gps/position';
import { useOnboarding } from '../core/onboarding/onboarding';
import { Button } from '../design-system/components/Button';
import { Icon, type IconName } from '../design-system/components/Icon';
import { SafeScreen } from '../design-system/components/SafeScreen';
import { radius, spacing, typography } from '../design-system/theme';
import { useTheme } from '../design-system/use-theme';

const POINTS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'state-gps',
    title: 'Seulement pendant tes séances',
    text: 'StrackS ne suit ta position que lorsqu’une séance est en cours. Jamais en dehors.',
  },
  {
    icon: 'action-pause',
    title: '« Toujours », pour l’écran verrouillé',
    text: 'Au démarrage de ta première séance, ton téléphone te proposera « Toujours » : c’est ce qui permet de continuer l’enregistrement téléphone en poche. Si tu choisis « Une fois » maintenant, iPhone ne le proposera pas : il faudra alors passer par Réglages › StrackS › Position. Tu peux aussi refuser ; la séance s’arrêtera si l’écran s’éteint.',
  },
  {
    icon: 'state-place',
    title: 'Ton tracé reste à toi',
    text: 'Il est enregistré sur ton compte pour calculer ta distance et dessiner ta carte.',
  },
  {
    icon: 'state-privacy',
    title: 'Tu gardes la main',
    text: 'Dans Profil : masquer ton tracé autour de chez toi, exporter toutes tes données, ou supprimer ton compte.',
  },
];

export default function OnboardingScreen() {
  const theme = useTheme();
  const complete = useOnboarding((s) => s.complete);
  const [step, setStep] = React.useState<'welcome' | 'location'>('welcome');
  const [asking, setAsking] = React.useState(false);
  const [denied, setDenied] = React.useState(false);

  const finish = async () => {
    await complete();
    router.replace('/(tabs)');
  };

  const allow = async () => {
    setAsking(true);
    try {
      const granted = await requestForegroundPermission();
      if (!granted) {
        // No request loop: the PRD wants explicit consent, not insistent consent. We say
        // where to change it, and let the user through.
        setDenied(true);
        return;
      }
      await finish();
    } catch {
      setDenied(true);
    } finally {
      setAsking(false);
    }
  };

  if (step === 'welcome') {
    return (
      <SafeScreen edges={['top', 'bottom']} testID="onboarding-welcome">
        <View style={styles.container}>
          <View style={styles.body}>
            <Text style={[typography.h1, { color: theme.textPrimary }]}>Bienvenue sur StrackS</Text>
            <Text style={[typography.bodyLg, { color: theme.textSecondary }]}>
              Enregistre tes sorties de course et de marche, et suis ta progression semaine
              après semaine.
            </Text>
          </View>
          <Button size="lg" fullWidth onPress={() => setStep('location')}>
            Continuer
          </Button>
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen edges={['top', 'bottom']} testID="onboarding-location">
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[typography.h2, { color: theme.textPrimary }]}>Ta position, et pourquoi</Text>
        {POINTS.map((point) => (
          <View
            key={point.title}
            accessible
            style={[styles.point, { backgroundColor: theme.surfaceCard, borderColor: theme.borderSubtle }]}
          >
            <Icon name={point.icon} color={theme.textSecondary} />
            <View style={styles.pointText}>
              <Text style={[typography.bodyLg, { color: theme.textPrimary }]}>{point.title}</Text>
              <Text style={[typography.body, { color: theme.textSecondary }]}>{point.text}</Text>
            </View>
          </View>
        ))}

        {denied ? (
          <>
            <Text testID="onboarding-denied" style={[typography.body, { color: theme.textSecondary }]}>
              Pas de souci. Tu pourras l’autoriser plus tard dans les Réglages de ton téléphone ;
              StrackS te le redemandera au démarrage de ta première séance.
            </Text>
            <Button size="lg" fullWidth onPress={() => void finish()}>
              Commencer
            </Button>
          </>
        ) : (
          <>
            <Button
              size="lg"
              fullWidth
              icon="action-locate"
              onPress={() => void allow()}
              disabled={asking}
            >
              Autoriser la localisation
            </Button>
            <Button variant="text" fullWidth onPress={() => void finish()} disabled={asking}>
              Plus tard
            </Button>
          </>
        )}
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: spacing.layoutGutter,
    gap: spacing.base,
    justifyContent: 'space-between',
  },
  body: { flex: 1, justifyContent: 'center', gap: spacing.base },
  point: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  pointText: { flex: 1, gap: spacing.xs },
});
