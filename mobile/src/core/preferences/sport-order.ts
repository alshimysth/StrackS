/**
 * Ordre d'affichage des sports sur l'accueil (#34).
 *
 * Le PRD exige de démarrer une séance en **≤ 2 interactions**. Sans préférence, un
 * utilisateur qui ne fait que courir doit d'abord chercher son sport dans une liste
 * ordonnée par le serveur, puis le choisir, puis démarrer — trois gestes.
 *
 * Fonction pure et isolée du rendu : c'est la règle métier de #34, elle se teste sans
 * monter un écran. Le socle ne connaît toujours aucun sport — le code de sport n'est
 * ici qu'une clé opaque, aucun `switch` n'est possible.
 */

export interface OrderedSport {
  code: string;
}

/**
 * Remonte le sport préféré en tête, en préservant l'ordre serveur pour le reste.
 *
 * Tolérant par construction (DoD #34) : un `defaultSport` qui ne figure plus dans le
 * registre — sport retiré du backend, ou renommé — laisse simplement la liste
 * inchangée plutôt que de la vider ou de lever.
 */
export function orderSports<T extends OrderedSport>(sports: T[], defaultSport: string | null): T[] {
  if (defaultSport == null) {
    return sports;
  }
  const preferred = sports.find((s) => s.code === defaultSport);
  if (preferred == null) {
    return sports;
  }
  return [preferred, ...sports.filter((s) => s.code !== defaultSport)];
}

/**
 * Sport présélectionné à l'ouverture de l'accueil.
 *
 * C'est la moitié qui fait vraiment gagner une interaction : afficher le sport en
 * premier ne suffit pas, encore faut-il qu'il soit déjà choisi pour que « Démarrer »
 * soit le geste suivant.
 */
export function initialSelection<T extends OrderedSport>(
  sports: T[],
  defaultSport: string | null,
): string | null {
  if (sports.length === 0) {
    return null;
  }
  if (defaultSport != null && sports.some((s) => s.code === defaultSport)) {
    return defaultSport;
  }
  return null;
}
