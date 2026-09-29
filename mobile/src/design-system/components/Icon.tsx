/**
 * Iconographie du design system (#39) — set **Lucide**, trait 2 px.
 *
 * Choix : Lucide, recommandé dès l'inventaire du design system (« set stroke-based type
 * Lucide/Phosphor, trait ~2 px »). Licence ISC (permissive, sans attribution requise à
 * l'écran). Aucun nouveau module natif : il s'appuie sur `react-native-svg`, déjà présent.
 *
 * Les écrans n'importent jamais Lucide directement : ils passent par un **nom sémantique**
 * (`tab-home`, `action-pause`, `state-offline`). Changer une icône, ou le set entier, se
 * fait ici et nulle part ailleurs — c'est ce qui garantit l'usage homogène que demande la
 * DoD. Ajouter une icône = ajouter une entrée à `ICONS`.
 *
 * Accessibilité : une icône est **décorative** par défaut (masquée aux lecteurs d'écran),
 * parce qu'elle accompagne presque toujours un libellé. Une icône seule doit recevoir un
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
  // Sports — référencés par nom depuis les modules de sport (`SportModule.icon`)
  'sport-run': Footprints,
  'sport-walk': PersonStanding,
  // Actions
  'action-pause': Pause,
  'action-resume': Play,
  'action-finish': Square,
  'action-retry': RotateCw,
  'action-locate': LocateFixed,
  // États
  'state-gps': Satellite,
  'state-offline': WifiOff,
  'state-server-error': ServerCrash,
  'state-warning': TriangleAlert,
  'state-empty': Inbox,
  'state-goal': Flag,
  'state-privacy': ShieldCheck,
  'state-place': MapPin,
  // Métriques
  'metric-elevation-gain': ArrowUp,
  'metric-elevation-loss': ArrowDown,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** Tailles alignées sur la grille de 4 px. */
export const ICON_SIZE = { sm: 16, md: 20, lg: 24, xl: 32 } as const;

interface Props {
  name: IconName;
  color: string;
  size?: keyof typeof ICON_SIZE;
  /** Obligatoire pour une icône sans libellé visible ; sinon l'icône est décorative. */
  accessibilityLabel?: string;
  testID?: string;
}

/** Trait constant du set, quelle que soit la taille — c'est l'identité « stroke-based ». */
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
      // Lucide pose `aria-hidden` par défaut : sans ce réglage, même une icône nommée
      // serait tue aux lecteurs d'écran.
      aria-hidden={decorative}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
    />
  );
}
