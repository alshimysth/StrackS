/**
 * Activity label (#25).
 *
 * Decision of 2026-08-11: the `title` column is nullable and the fallback **is computed at
 * display time, never persisted**. Writing "Course du 14 août" to the database would
 * freeze a French string in the data, which would no longer follow the user's language
 * once #43 is decided, and could no longer be told apart from a title really chosen.
 */
import { sportColors } from '../../design-system/theme';

/** Sport label, falling back to the raw code if the theme doesn't know the sport. */
export function sportLabel(sportType: string): string {
  return sportColors[sportType]?.label ?? sportType;
}

/** "Course du 14 août": fallback shown when the activity has no title. */
export function derivedTitle(sportType: string, startedAt: string): string {
  const date = new Date(startedAt).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
  });
  return `${sportLabel(sportType)} du ${date}`;
}

/** Title to display: the user's one if it exists, otherwise the derived fallback. */
export function activityTitle(activity: {
  title: string | null;
  sportType: string;
  startedAt: string;
}): string {
  const own = activity.title?.trim();
  return own != null && own.length > 0 ? own : derivedTitle(activity.sportType, activity.startedAt);
}
