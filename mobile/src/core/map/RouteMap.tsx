/**
 * RouteMap: the frozen track of a completed session (#22, #6).
 *
 * Distinct from `LiveMap`, which follows the camera on the last point and reads the
 * in-progress session store. Here the track is complete and known in advance: the map
 * frames the whole route once, without animation or following.
 *
 * The track arrives in **portions** (#37): privacy zones cut it, and each portion is drawn
 * separately. Framing and markers only cover what's visible: framing on the full track
 * would recentre the view on the masked zone.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, type LatLng } from 'react-native-maps';

import { colors } from '../../design-system/theme';

interface Props {
  segments: LatLng[][];
  testID?: string;
}

/** Margin around the track, as a proportion of its extent. */
const PADDING_RATIO = 0.25;
/** Minimum extent (degrees): without it, a 200 m session is framed at ground level. */
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

export function RouteMap({ segments, testID = 'route-map' }: Props) {
  const visible = segments.filter((segment) => segment.length > 0);
  if (visible.length === 0) {
    return null;
  }

  const all = visible.flat();
  const start = visible[0][0];
  const lastSegment = visible[visible.length - 1];
  const end = lastSegment[lastSegment.length - 1];

  return (
    <MapView
      testID={testID}
      style={StyleSheet.absoluteFill}
      initialRegion={boundingRegion(all)}
      toolbarEnabled={false}
      pitchEnabled={false}
      rotateEnabled={false}
    >
      {visible
        .filter((segment) => segment.length > 1)
        .map((segment, index) => (
          <Polyline
            key={index}
            coordinates={segment}
            strokeColor={colors.primary500}
            strokeWidth={4}
          />
        ))}
      <Marker coordinate={start} title="Départ" pinColor={colors.success500} />
      {all.length > 1 && <Marker coordinate={end} title="Arrivée" pinColor={colors.error500} />}
    </MapView>
  );
}
