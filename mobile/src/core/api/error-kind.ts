/**
 * Classification of API call failures.
 *
 * Story #41: "an offline user understands the problem comes from the network, not the
 * app". Telling these cases apart requires knowing WHY the call failed, and that
 * information is lost if each screen tests `error` its own way.
 *
 * The HTTP client (`api()`) only throws an `ApiError` when the server answered. When
 * `fetch` rejects (plane, tunnel, Wi-Fi connected but with no route), the error that
 * bubbles up is a `TypeError`. That asymmetry is the signal: no response at all =
 * network, a response = server.
 */
import { ApiError } from './client';

export type ErrorKind =
  /** No response: the device couldn't reach the server. */
  | 'offline'
  /** The server answered, but it's down (5xx). */
  | 'server'
  /** Session refused (401/403): the refresh already failed upstream. */
  | 'unauthorized'
  /** Too many attempts (429, #72): nothing is broken, the user has to wait. */
  | 'rate-limited'
  /** The server answered an error caused by the request (4xx). */
  | 'client';

export function classifyError(error: unknown): ErrorKind {
  if (!(error instanceof ApiError)) {
    return 'offline';
  }
  if (error.status >= 500) {
    return 'server';
  }
  if (error.status === 429) {
    return 'rate-limited';
  }
  if (error.status === 401 || error.status === 403) {
    return 'unauthorized';
  }
  return 'client';
}

/**
 * Messages in a coach's tone, in the second person, without emoji (#41 constraint).
 *
 * `offline` doesn't say "error": being offline isn't a failure, it's a transient state the
 * user is already aware of. Presenting it as an app malfunction is precisely what the DoD
 * forbids.
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
  'rate-limited': {
    title: 'Trop de tentatives',
    message: 'Patiente quelques minutes avant de réessayer.',
  },
  client: {
    title: 'Impossible de charger',
    message: 'Cette demande n’a pas abouti. Réessaie.',
  },
};
