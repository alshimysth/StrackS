/**
 * RouteMap — tracé figé d'une séance terminée (#22, #6).
 *
 * Distinct de `LiveMap`, qui suit la caméra sur le dernier point et lit le store de
 * séance en cours. Ici le tracé est complet et connu d'avance : la carte se cadre une
 * fois sur l'ensemble du parcours, sans animation ni suivi.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, type LatLng } from 'react-native-maps';

import { colors } from '../../design-system/theme';

interface Props {
  path: LatLng[];
  testID?: string;
}

/** Marge autour du tracé, en proportion de son étendue. */
const PADDING_RATIO = 0.25;
/** Étendue plancher (degrés) : sans elle, une séance de 200 m cadre au ras du sol. */
const MIN_DELTA = 0.004;

export function boundingRegion(path: LatLng[]) {
  const lats = path.map((p) => p.latitude);
  const lngs = path.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * (1 + PADDING_RATIO), MIN_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * (1 + PADDING_RATIO), MIN_DELTA),
  };
}

export function RouteMap({ path, testID = 'route-map' }: Props) {
  if (path.length === 0) {
    return null;
  }

  const start = path[0];
  const end = path[path.length - 1];

  return (
    <MapView
      testID={testID}
      style={StyleSheet.absoluteFill}
      initialRegion={boundingRegion(path)}
      toolbarEnabled={false}
      pitchEnabled={false}
      rotateEnabled={false}
    >
      {path.length > 1 && (
        <Polyline coordinates={path} strokeColor={colors.primary500} strokeWidth={4} />
      )}
      <Marker coordinate={start} title="Départ" pinColor={colors.success500} />
      {path.length > 1 && <Marker coordinate={end} title="Arrivée" pinColor={colors.error500} />}
    </MapView>
  );
}
