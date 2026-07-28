/**
 * Carte live (Epic 3) — react-native-maps. Tracé des points GPS acceptés
 * (Polyline primaire) + suivi caméra sur le dernier point. Le conteneur
 * (SessionTrackingScreen) gère bordure et rayon.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';

import { colors } from '../../design-system/theme';
import { useSessionStore } from '../session/use-session-store';

const FOLLOW_ZOOM = 16.5;

export function LiveMap() {
  const path = useSessionStore((s) => s.path);
  const mapRef = React.useRef<MapView>(null);
  const last = path.length > 0 ? path[path.length - 1] : null;

  React.useEffect(() => {
    if (last != null) {
      mapRef.current?.animateCamera({ center: last, zoom: FOLLOW_ZOOM }, { duration: 500 });
    }
  }, [last]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      showsUserLocation
      userInterfaceStyle="dark"
      toolbarEnabled={false}
      pitchEnabled={false}
      initialCamera={{
        center: last ?? { latitude: 48.8566, longitude: 2.3522 },
        zoom: last != null ? FOLLOW_ZOOM : 11,
        heading: 0,
        pitch: 0,
      }}
    >
      {path.length > 1 && (
        <Polyline coordinates={path} strokeColor={colors.primary500} strokeWidth={4} />
      )}
    </MapView>
  );
}
