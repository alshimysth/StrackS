/**
 * Classification des échecs d'appel API.
 *
 * Story #41 : « un utilisateur hors ligne comprend que le problème vient du réseau,
 * pas de l'app ». Distinguer ces cas exige de savoir POURQUOI l'appel a échoué, et
 * cette information se perd si chaque écran teste `error` à sa façon.
 *
 * Le client HTTP (`api()`) ne lève un `ApiError` que lorsque le serveur a répondu.
 * Quand `fetch` rejette — avion, tunnel, Wi-Fi capté mais sans route — l'erreur qui
 * remonte est un `TypeError`. C'est cette asymétrie qui sert de signal : pas de
 * réponse du tout = réseau, réponse = serveur.
 */
import { ApiError } from './client';

export type ErrorKind =
  /** Aucune réponse : l'appareil n'a pas pu joindre le serveur. */
  | 'offline'
  /** Le serveur a répondu, mais il est en panne (5xx). */
  | 'server'
  /** Session refusée (401/403) — le renouvellement a déjà échoué en amont. */
  | 'unauthorized'
  /** Le serveur a répondu une erreur qui vient de la requête (4xx). */
  | 'client';

export function classifyError(error: unknown): ErrorKind {
  if (!(error instanceof ApiError)) {
    return 'offline';
  }
  if (error.status >= 500) {
    return 'server';
  }
  if (error.status === 401 || error.status === 403) {
    return 'unauthorized';
  }
  return 'client';
}

/**
 * Messages en ton coach, à la deuxième personne, sans emoji (contrainte #41).
 *
 * `offline` ne dit pas « erreur » : hors ligne n'est pas une panne, c'est un état
 * transitoire dont l'utilisateur est déjà conscient. Le lui présenter comme un
 * dysfonctionnement de l'app est précisément ce que la DoD interdit.
 */
export const errorCopy: Record<ErrorKind, { title: string; message: string }> = {
  offline: {
    title: 'Pas de connexion',
    message: 'Tes données se rechargeront dès que le réseau reviendra.',
  },
  server: {
    title: 'Le serveur ne répond pas',
    message: 'Le problème vient de chez nous, pas de toi. Réessaie dans un instant.',
  },
  unauthorized: {
    title: 'Session expirée',
    message: 'Reconnecte-toi pour retrouver tes séances.',
  },
  client: {
    title: 'Impossible de charger',
    message: 'Cette demande n’a pas abouti. Réessaie.',
  },
};
