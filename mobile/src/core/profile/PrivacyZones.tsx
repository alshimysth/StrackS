/**
 * Privacy zones (#37).
 *
 * Masking **at display time** only; see `core/map/privacy.ts` for why. The screen says it
 * plainly: "masked" isn't "deleted", and a user who believed their data erased would be
 * wrong about what their export contains.
 *
 * A zone is declared where the user stands: no address input, hence no geocoding, hence
 * no third-party service to hand the home address to.
 */
import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { accountErrorMessage } from '../api/use-account';
import { useFormat } from '../format/use-format';
import { getCurrentPosition } from '../gps/position';
import { jitteredCenter } from '../map/privacy';
import {
  DEFAULT_PREFERENCES,
  MAX_PRIVACY_ZONES,
  type Preferences,
  type PrivacyZone,
} from '../preferences/schema';
import { QUERY_KEY, usePreferences, useUpdatePreferences } from '../preferences/use-preferences';
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

  const queryClient = useQueryClient();

  /**
   * Each action starts from the most recent state, not the last render's (PR #80 review).
   * The server replaces the list as a whole and PATCHes are serialized: two quick removals
   * computed from the same render would send the same list, and the second would cancel
   * the first. Hence the optimistic cache update, which the next action reads back; on
   * failure, the server is read again rather than keeping a made-up state.
   */
  const latest = (): Preferences =>
    queryClient.getQueryData<Preferences>(QUERY_KEY) ?? DEFAULT_PREFERENCES;

  const applyZones = (next: PrivacyZone[]) => {
    queryClient.setQueryData<Preferences>(QUERY_KEY, { ...latest(), privacyZones: next });
    update.mutate(
      { privacyZones: next },
      { onError: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }) },
    );
  };

  const addHere = async () => {
    setLocating(true);
    setLocateError(null);
    try {
      const here = await getCurrentPosition();
      const radius = Number(radiusM);
      // Randomly offset centre: the real position never leaves the phone.
      const center = jitteredCenter(here.lat, here.lng, radius);
      const current = latest().privacyZones;
      const zone: PrivacyZone = {
        // 5 decimals ≈ 1 m: nothing more precise than needed is stored.
        lat: Math.round(center.lat * 1e5) / 1e5,
        lng: Math.round(center.lng * 1e5) / 1e5,
        radiusM: radius,
        label: current.length === 0 ? 'Domicile' : `Zone ${current.length + 1}`,
      };
      applyZones([...current, zone]);
    } catch (error) {
      setLocateError(error instanceof Error ? error.message : 'Position introuvable. Réessaie dehors.');
    } finally {
      setLocating(false);
    }
  };

  /** Removes THIS zone (by value) from the most recent list, not a stale index. */
  const remove = (target: PrivacyZone) => {
    applyZones(
      latest().privacyZones.filter(
        (z) => !(z.lat === target.lat && z.lng === target.lng && z.radiusM === target.radiusM),
      ),
    );
  };

  const error = locateError ?? accountErrorMessage(update.error);
  // Removals stay possible during a save: they're queued and computed from the most
  // recent state.
  const busy = locating;

  return (
    <View style={styles.section} testID="privacy-section">
      <Text style={[typography.h3, { color: theme.textPrimary }]}>Zones de confidentialité</Text>
      <Text style={[typography.body, { color: theme.textSecondary }]}>
        Autour de ces lieux, ton tracé n’est pas dessiné sur les cartes : départ et arrivée ne
        désignent plus ton domicile. Le cercle est décalé au hasard autour de ta position, pour
        que son centre ne la révèle pas. Le tracé reste enregistré en entier — il sert au
        calcul de la distance et figure dans ton export.
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
          <Button variant="text" onPress={() => remove(zone)} disabled={locating}>
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
