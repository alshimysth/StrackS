/**
 * How the core shows a sport it knows nothing about: label, badge colours, icon, family.
 *
 * The single place where the core consults the sport catalog for presentation. Screens
 * never read `sportColors` (theme.ts) or the catalog directly for this: a sport the
 * catalog doesn't know (removed module, newer backend) must still render, with its code
 * as label and a neutral badge, rather than crash a list.
 *
 * Reads the **catalog** (pure data), never the registry: a label must not load the
 * session engine.
 */
import type { SportAppearance } from '../../design-system/components/SportBadge';
import { sportColors } from '../../design-system/theme';
import { sportCatalog } from '../../sports/catalog';
import type { SportCatalogEntry } from '../../sports/types';
import type { SportTypeDescriptor } from '../../types/api';

/** Sport label: the module's, else the theme's, else the raw code. */
export function sportLabel(sportType: string): string {
  return sportCatalog[sportType]?.label ?? sportColors[sportType]?.label ?? sportType;
}

/** Badge appearance, or `undefined` to let the badge fall back on its theme table. */
export function sportAppearance(sportType: string): SportAppearance | undefined {
  const entry = sportCatalog[sportType];
  if (entry?.appearance != null) {
    return { ...entry.appearance, label: entry.appearance.label || entry.label };
  }
  return undefined;
}

export interface SportFamilyGroup<T extends { code: string }> {
  code: string;
  label: string;
  sports: T[];
}

/**
 * Groups the backend's descriptors by family, keeping the server order inside each
 * family and the order of first appearance between families. The picker shows a family
 * row then the family's sports: with fourteen sports, a flat list no longer scales
 * (#12, "l'accueil actuel ne scale pas au-delà de 3").
 */
export function groupByFamily<T extends Pick<SportTypeDescriptor, 'code' | 'family'>>(
  sports: T[],
): SportFamilyGroup<T>[] {
  const groups = new Map<string, SportFamilyGroup<T>>();
  for (const sport of sports) {
    const family = sport.family ?? { code: sport.code, label: sportLabel(sport.code) };
    let group = groups.get(family.code);
    if (group == null) {
      group = { code: family.code, label: family.label, sports: [] };
      groups.set(family.code, group);
    }
    group.sports.push(sport);
  }
  return [...groups.values()];
}

/** The catalog entry of a sport, if the app has one. */
export function entryOf(sportType: string): SportCatalogEntry | undefined {
  return sportCatalog[sportType];
}
