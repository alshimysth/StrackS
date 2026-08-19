/**
 * Libellé d'une activité (#25).
 *
 * Décision du 2026-08-11 : la colonne `title` est nullable et le repli **se calcule à
 * l'affichage, jamais persisté**. Écrire « Course du 14 août » en base figerait une
 * chaîne française dans les données, qui ne suivrait plus la langue de l'utilisateur
 * une fois #43 tranchée — et qu'on ne saurait plus distinguer d'un titre réellement
 * choisi.
 */
import { sportColors } from '../../design-system/theme';

/** Libellé du sport, avec repli sur le code brut si le sport est inconnu du thème. */
export function sportLabel(sportType: string): string {
  return sportColors[sportType]?.label ?? sportType;
}

/** « Course du 14 août » — repli affiché quand l'activité n'a pas de titre. */
export function derivedTitle(sportType: string, startedAt: string): string {
  const date = new Date(startedAt).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
  });
  return `${sportLabel(sportType)} du ${date}`;
}

/** Titre à afficher : celui de l'utilisateur s'il existe, sinon le repli dérivé. */
export function activityTitle(activity: {
  title: string | null;
  sportType: string;
  startedAt: string;
}): string {
  const own = activity.title?.trim();
  return own != null && own.length > 0 ? own : derivedTitle(activity.sportType, activity.startedAt);
}
