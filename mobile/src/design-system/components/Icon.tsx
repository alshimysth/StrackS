/**
 * Design system iconography (#39): the **Lucide** set, 2 px stroke.
 *
 * Choice: Lucide, recommended from the design system inventory on ("stroke-based set like
 * Lucide/Phosphor, ~2 px stroke"). ISC licence (permissive, no on-screen attribution
 * required). No new native module: it relies on `react-native-svg`, already present.
 *
 * Screens never import Lucide directly: they go through a **semantic name** (`tab-home`,
 * `action-pause`, `state-offline`). Changing an icon, or the whole set, happens here and
 * nowhere else: that's what guarantees the consistent usage the DoD asks for. Adding an
 * icon = adding an entry to `ICONS`.
 *
 * Accessibility: an icon is **decorative** by default (hidden from screen readers),
 * because it almost always accompanies a label. A standalone icon must receive an
 * `accessibilityLabel`.
 */
import {
  ArrowDown,
  ArrowUp,
  ChartColumn,
  Flag,
  Footprints,
  History,
  House,
  Inbox,
  LocateFixed,
  MapPin,
  Pause,
  PersonStanding,
  Play,
  RotateCw,
  Satellite,
  ServerCrash,
  ShieldCheck,
  Square,
  TriangleAlert,
  User,
  WifiOff,
  type LucideIcon,
} from 'lucide-react-native';
import React from 'react';

export const ICONS = {
  // Navigation
  'tab-home': House,
  'tab-history': History,
  'tab-stats': ChartColumn,
  'tab-profile': User,
  // Sports: referenced by name from the sport modules (`SportModule.icon`)
  'sport-run': Footprints,
  'sport-walk': PersonStanding,
  // Actions
  'action-pause': Pause,
  'action-resume': Play,
  'action-finish': Square,
  'action-retry': RotateCw,
  'action-locate': LocateFixed,
  // States
  'state-gps': Satellite,
  'state-offline': WifiOff,
  'state-server-error': ServerCrash,
  'state-warning': TriangleAlert,
  'state-empty': Inbox,
  'state-goal': Flag,
  'state-privacy': ShieldCheck,
  'state-place': MapPin,
  // Metrics
  'metric-elevation-gain': ArrowUp,
  'metric-elevation-loss': ArrowDown,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** Sizes aligned on the 4 px grid. */
export const ICON_SIZE = { sm: 16, md: 20, lg: 24, xl: 32 } as const;

interface Props {
  name: IconName;
  color: string;
  size?: keyof typeof ICON_SIZE;
  /** Mandatory for an icon without a visible label; otherwise the icon is decorative. */
  accessibilityLabel?: string;
  testID?: string;
}

/** Constant stroke of the set, whatever the size: it's the "stroke-based" identity. */
const STROKE_WIDTH = 2;

export function Icon({ name, color, size = 'lg', accessibilityLabel, testID }: Props) {
  const Glyph = ICONS[name];
  const decorative = accessibilityLabel == null;
  return (
    <Glyph
      testID={testID ?? `icon-${name}`}
      color={color}
      size={ICON_SIZE[size]}
      strokeWidth={STROKE_WIDTH}
      absoluteStrokeWidth
      accessible={!decorative}
      accessibilityLabel={accessibilityLabel}
      // Lucide sets `aria-hidden` by default: without this setting, even a named icon
      // would be silent for screen readers.
      aria-hidden={decorative}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
    />
  );
}
