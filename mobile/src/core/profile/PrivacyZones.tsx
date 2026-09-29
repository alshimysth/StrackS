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
   * Chaque action part de l'état le plus récent, pas de celui du dernier rendu (revue
   * PR #80). Le serveur remplace la liste d'un bloc et les PATCH sont sérialisés : deux
   * retraits rapides calculés depuis le même rendu enverraient la même liste, et le second
   * annulerait le premier. D'où la mise à jour optimiste du cache, que l'action suivante
   * relit ; en cas d'échec, on relit le serveur plutôt que de garder un état inventé.
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
      // Centre décalé au hasard : la position réelle ne quitte jamais le téléphone.
      const center = jitteredCenter(here.lat, here.lng, radius);
      const current = latest().privacyZones;
      const zone: PrivacyZone = {
        // 5 décimales ≈ 1 m : rien de plus précis que nécessaire n'est stocké.
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

  /** Retire CETTE zone (par valeur) de la liste la plus récente, pas un index périmé. */
  const remove = (target: PrivacyZone) => {
    applyZones(
      latest().privacyZones.filter(
        (z) => !(z.lat === target.lat && z.lng === target.lng && z.radiusM === target.radiusM),
      ),
    );
  };

  const error = locateError ?? accountErrorMessage(update.error);
  // Les retraits restent possibles pendant un enregistrement : ils sont mis en file et
  // calculés depuis l'état le plus récent.
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
