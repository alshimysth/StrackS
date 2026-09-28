/**
 * Zones de confidentialité (#37).
 *
 * Masquage **à l'affichage** seulement — voir `core/map/privacy.ts` pour le pourquoi.
 * L'écran le dit en toutes lettres : « masqué » n'est pas « supprimé », et un utilisateur
 * qui croirait ses données effacées se tromperait sur ce que contient son export.
 *
 * Une zone se déclare là où l'on se trouve : pas de saisie d'adresse, donc pas de
 * géocodage, donc aucun service tiers à qui confier l'adresse du domicile.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { accountErrorMessage } from '../api/use-account';
import { useFormat } from '../format/use-format';
import { getCurrentPosition } from '../gps/position';
import { DEFAULT_PREFERENCES, MAX_PRIVACY_ZONES, type PrivacyZone } from '../preferences/schema';
import { usePreferences, useUpdatePreferences } from '../preferences/use-preferences';
import { Button } from '../../design-system/components/Button';
import { SettingRow } from '../../design-system/components/SettingRow';
import { radius, spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';

const RADII = ['200', '500', '1000'] as const;
type Radius = (typeof RADII)[number];

export function PrivacyZones() {
  const theme = useTheme();
  const format = useFormat();
  const preferences = usePreferences();
  const update = useUpdatePreferences();
  const zones = (preferences.data ?? DEFAULT_PREFERENCES).privacyZones;

  const [radiusM, setRadiusM] = React.useState<Radius>('500');
  const [locating, setLocating] = React.useState(false);
  const [locateError, setLocateError] = React.useState<string | null>(null);

  const addHere = async () => {
    setLocating(true);
    setLocateError(null);
    try {
      const here = await getCurrentPosition();
      const zone: PrivacyZone = {
        // 5 décimales ≈ 1 m : bien assez pour un cercle de 200 m, et rien de plus précis
        // que nécessaire n'est stocké.
        lat: Math.round(here.lat * 1e5) / 1e5,
        lng: Math.round(here.lng * 1e5) / 1e5,
        radiusM: Number(radiusM),
        label: zones.length === 0 ? 'Domicile' : `Zone ${zones.length + 1}`,
      };
      // La liste est remplacée d'un bloc côté serveur : on envoie la liste complète.
      update.mutate({ privacyZones: [...zones, zone] });
    } catch (error) {
      setLocateError(error instanceof Error ? error.message : 'Position introuvable. Réessaie dehors.');
    } finally {
      setLocating(false);
    }
  };

  const remove = (index: number) => {
    update.mutate({ privacyZones: zones.filter((_, i) => i !== index) });
  };

  const error = locateError ?? accountErrorMessage(update.error);
  const busy = locating || update.isPending;

  return (
    <View style={styles.section} testID="privacy-section">
      <Text style={[typography.h3, { color: theme.textPrimary }]}>Zones de confidentialité</Text>
      <Text style={[typography.body, { color: theme.textSecondary }]}>
        Autour de ces lieux, ton tracé n’est pas dessiné sur les cartes : départ et arrivée ne
        désignent plus ton domicile. Le tracé reste enregistré en entier — il sert au calcul
        de la distance et figure dans ton export.
      </Text>

      {zones.map((zone, index) => (
        <View
          key={`${zone.lat},${zone.lng},${index}`}
          testID={`privacy-zone-${index}`}
          style={[styles.zone, { backgroundColor: theme.surfaceSunken }]}
        >
          <Text style={[typography.body, { color: theme.textPrimary }]}>
            {zone.label ?? `Zone ${index + 1}`} — rayon {format.distance(zone.radiusM)}{' '}
            {format.distanceUnit}
          </Text>
          <Button variant="text" onPress={() => remove(index)} disabled={busy}>
            Retirer
          </Button>
        </View>
      ))}

      {zones.length < MAX_PRIVACY_ZONES ? (
        <>
          <SettingRow
            testID="privacy-radius"
            label="Rayon de la nouvelle zone"
            options={RADII.map((r) => ({
              value: r,
              label: `${format.distance(Number(r))} ${format.distanceUnit}`,
            }))}
            value={radiusM}
            onChange={setRadiusM}
            disabled={busy}
          />
          <Button variant="secondary" fullWidth onPress={() => void addHere()} disabled={busy}>
            {locating ? 'Localisation…' : 'Masquer autour de ma position actuelle'}
          </Button>
        </>
      ) : (
        <Text style={[typography.body, { color: theme.textSecondary }]}>
          {MAX_PRIVACY_ZONES} zones au maximum.
        </Text>
      )}

      {error != null && (
        <Text testID="privacy-error" style={[typography.body, { color: theme.textError }]}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.base },
  zone: {
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});
