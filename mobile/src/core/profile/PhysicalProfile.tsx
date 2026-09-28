/**
 * Profil physique (#32) — le poids, et seulement lui pour l'instant.
 *
 * Le socle accepte aussi taille, date de naissance et sexe, mais **aucune fonction ne
 * s'en sert aujourd'hui** : les calories (#33) ne dépendent que du poids. Les demander
 * sans usage irait contre la minimisation que le ticket exige lui-même (« collecte
 * minimale, finalité expliquée ») et contre le RGPD. Ils arriveront avec la fonction qui
 * les utilise (zones d'effort, métabolisme de base) — question posée dans #32.
 *
 * Le poids se saisit dans l'unité de l'utilisateur et se stocke en kg.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { accountErrorMessage } from '../api/use-account';
import { fromDisplayWeight, toDisplayWeight, weightUnit } from '../format/units';
import { DEFAULT_PREFERENCES, physicalSchema } from '../preferences/schema';
import { usePreferences, useUpdatePreferences } from '../preferences/use-preferences';
import { Button } from '../../design-system/components/Button';
import { Input } from '../../design-system/components/Input';
import { spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';

/** Accepte « 72 », « 72,5 » et « 72.5 ». Rend null pour une saisie illisible. */
export function parseDecimal(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }
  return Number(normalized);
}

export function PhysicalProfile() {
  const theme = useTheme();
  const preferences = usePreferences();
  const update = useUpdatePreferences();
  const current = preferences.data ?? DEFAULT_PREFERENCES;
  const units = current.units;
  const storedKg = current.physical.weightKg;

  const [draft, setDraft] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();

  // Le champ suit la valeur enregistrée (et l'unité) tant qu'on ne le modifie pas.
  React.useEffect(() => {
    setDraft(storedKg != null ? String(toDisplayWeight(storedKg, units)).replace('.', ',') : '');
  }, [storedKg, units]);

  const save = () => {
    const value = parseDecimal(draft);
    const kg = value == null ? null : fromDisplayWeight(value, units);
    if (kg == null || !physicalSchema.shape.weightKg.safeParse(kg).success) {
      const [min, max] = units === 'imperial' ? [66, 661] : [30, 300];
      setError(`Saisis un poids entre ${min} et ${max} ${weightUnit(units)}.`);
      return;
    }
    setError(undefined);
    // Patch épars : le serveur fusionne `physical` clé par clé, rien d'autre ne bouge.
    update.mutate({ physical: { ...current.physical, weightKg: kg } });
  };

  const remove = () => {
    setError(undefined);
    update.mutate({ physical: { ...current.physical, weightKg: null } });
  };

  const apiError = accountErrorMessage(update.error);

  return (
    <View style={styles.section} testID="physical-section">
      <Text style={[typography.h3, { color: theme.textPrimary }]}>Profil physique</Text>
      <Input
        label={`Poids (${weightUnit(units)})`}
        value={draft}
        onChangeText={setDraft}
        error={error}
        helper="Facultatif. Sert uniquement à estimer les calories de tes séances ; sans lui, aucune calorie n’est affichée."
        keyboardType="decimal-pad"
        testID="weight-input"
      />
      {apiError != null && (
        <Text testID="weight-error" style={[typography.body, { color: theme.textError }]}>
          {apiError}
        </Text>
      )}
      <View style={styles.row}>
        <Button variant="secondary" onPress={save} disabled={update.isPending}>
          {update.isPending ? 'Enregistrement…' : 'Enregistrer le poids'}
        </Button>
        {storedKg != null && (
          <Button variant="text" onPress={remove} disabled={update.isPending}>
            Retirer
          </Button>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.base },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
});
