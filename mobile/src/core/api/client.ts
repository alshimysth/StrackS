/**
 * Client HTTP du socle : base URL + Bearer automatique + erreurs RFC 7807.
 * Les modules de sport ne parlent JAMAIS directement à l'API : ils passent
 * par les hooks de core/.
 *
 * Renouvellement de session (Story #44) : sur un 401, le client renouvelle la session
 * et rejoue la requête. L'appelant ne voit rien — ni erreur, ni écran de connexion.
 * C'est ce qui garantit qu'un JWT expiré en pleine séance ne coûte aucun point de tracé :
 * `uploadTrackPoints` aboutit au lieu d'échouer, et l'uploader marque le lot comme envoyé.
 */
import { useAuthStore } from '../auth/use-auth-store';
import { API_BASE_URL } from './config';
import type { Problem, User } from '../../types/api';

export class ApiError extends Error {
  readonly status: number;
  readonly title: string;

  constructor(problem: Problem) {
    super(problem.detail || problem.title);
    this.status = problem.status;
    this.title = problem.title;
  }
}

/** Réponse des endpoints qui ouvrent ou prolongent une session. */
interface SessionPayload {
  token: string;
  refreshToken: string;
  user?: User;
}

/** Endpoints dont la réponse porte un couple de jetons à ranger dans le store. */
const SESSION_PATHS = ['/api/v1/auth/login', '/api/v1/auth/register'];

function isSessionPayload(value: unknown): value is SessionPayload {
  const payload = value as SessionPayload | null;
  return (
    typeof payload?.token === 'string' && typeof payload?.refreshToken === 'string'
  );
}

/**
 * Capte les jetons d'une réponse de connexion/inscription.
 *
 * Le store est alimenté ici plutôt que dans `use-auth.ts` pour que le cycle de vie des
 * jetons reste entièrement dans le client HTTP : un futur point d'entrée d'authentification
 * en hérite sans rien câbler.
 */
function captureSession(path: string, payload: unknown): void {
  if (SESSION_PATHS.includes(path) && isSessionPayload(payload)) {
    useAuthStore.getState().setSession(payload.token, payload.refreshToken);
  }
}

/**
 * `unavailable` — le serveur n'a pas répondu. La session n'est PAS condamnée : c'est
 * le réseau qui manque. Déconnecter ici éjecterait un coureur dans un tunnel.
 */
type RefreshOutcome = 'renewed' | 'rejected' | 'unavailable';

let inFlightRefresh: Promise<RefreshOutcome> | null = null;

/**
 * Renouvelle la session côté serveur. Mutualisé : plusieurs requêtes qui se prennent un
 * 401 en même temps (le cas normal quand l'app reprend la main) déclenchent UN seul appel.
 * Deux rotations concurrentes du même jeton feraient tomber la famille côté serveur —
 * la détection de rejeu prendrait la course pour un vol.
 */
function refreshSession(): Promise<RefreshOutcome> {
  inFlightRefresh ??= performRefresh().finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

async function performRefresh(): Promise<RefreshOutcome> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) {
    return 'rejected'; // rien à renouveler : la session est bel et bien terminée
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    return 'unavailable';
  }

  if (!response.ok) {
    return response.status >= 500 ? 'unavailable' : 'rejected';
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!isSessionPayload(payload)) {
    return 'unavailable'; // réponse inattendue : anomalie serveur, pas fin de session
  }

  const store = useAuthStore.getState();
  store.setSession(payload.token, payload.refreshToken);
  if (payload.user) {
    store.setUser(payload.user);
  }
  return 'renewed';
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  // Les en-têtes sont reconstruits à chaque tentative : après un renouvellement, le
  // rejeu doit partir avec le NOUVEAU jeton, pas celui qui vient d'être refusé.
  const send = () => {
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (auth) {
      const token = useAuthStore.getState().token;
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }
    return fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let response = await send();

  if (response.status === 401 && auth) {
    const outcome = await refreshSession();
    if (outcome === 'renewed') {
      response = await send(); // une seule reprise : pas de boucle sur un 401 persistant
    }
    if (response.status === 401 && outcome !== 'unavailable') {
      // Le serveur a bien refusé de renouveler : la session est finie, pas juste injoignable.
      useAuthStore.getState().logout();
    }
  }

  if (!response.ok) {
    let problem: Problem = {
      title: 'Erreur réseau',
      status: response.status,
      detail: `Réponse ${response.status}`,
    };
    try {
      problem = { ...problem, ...(await response.json()) };
    } catch {
      // corps non JSON : on garde le problème générique
    }
    throw new ApiError(problem);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json()) as T;
  captureSession(path, payload);
  return payload;
}
