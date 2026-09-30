/**
 * Core HTTP client: base URL + automatic Bearer + RFC 7807 errors.
 * Sport modules NEVER talk to the API directly: they go through core/ hooks.
 *
 * Session refresh (story #44): on a 401, the client refreshes the session and replays the
 * request. The caller sees nothing, neither an error nor a login screen. That's what
 * guarantees a JWT expiring mid-session costs no track point: `uploadTrackPoints`
 * succeeds instead of failing, and the uploader marks the batch as sent.
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

/** Response of the endpoints that open or extend a session. */
interface SessionPayload {
  token: string;
  refreshToken: string;
  user?: User;
}

/** Endpoints whose response carries a token pair to store. */
const SESSION_PATHS = [
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  // Password change (#73): the server revokes every session and returns a fresh one for
  // this device. Without capturing it, the next refresh would present a revoked refresh
  // token, and log out the user who just secured their account.
  '/api/v1/users/me/password',
];

function isSessionPayload(value: unknown): value is SessionPayload {
  const payload = value as SessionPayload | null;
  return (
    typeof payload?.token === 'string' && typeof payload?.refreshToken === 'string'
  );
}

/**
 * Captures the tokens of a login/registration response.
 *
 * The store is fed here rather than in `use-auth.ts` so that the token lifecycle stays
 * entirely within the HTTP client: a future authentication entry point inherits it
 * without any wiring.
 */
function captureSession(path: string, payload: unknown): void {
  if (SESSION_PATHS.includes(path) && isSessionPayload(payload)) {
    useAuthStore.getState().setSession(payload.token, payload.refreshToken);
  }
}

/**
 * `unavailable`: the server didn't answer. The session is NOT doomed: the network is what's
 * missing. Logging out here would kick out a runner in a tunnel.
 */
type RefreshOutcome = 'renewed' | 'rejected' | 'unavailable';

let inFlightRefresh: Promise<RefreshOutcome> | null = null;

/**
 * Refreshes the session on the server. Shared: several requests hitting a 401 at the same
 * time (the normal case when the app comes back to the foreground) trigger ONE call. Two
 * concurrent rotations of the same token would bring the family down on the server side:
 * replay detection would take the race for a theft.
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
    return 'rejected'; // nothing to refresh: the session is really over
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
    return 'unavailable'; // unexpected response: a server anomaly, not the end of the session
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
  options: {
    method?: string;
    body?: unknown;
    auth?: boolean;
    /** `text`: body returned as is, without parsing (GDPR export #76, written as is to disk). */
    parse?: 'json' | 'text';
  } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true, parse = 'json' } = options;

  // Headers are rebuilt on each attempt: after a refresh, the replay must go out with the
  // NEW token, not the one that was just rejected.
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
      response = await send(); // a single retry: no loop on a persistent 401
    }
    if (response.status === 401 && outcome !== 'unavailable') {
      // The server did refuse to refresh: the session is over, not just unreachable.
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

  if (parse === 'text') {
    return (await response.text()) as T;
  }

  const payload = (await response.json()) as T;
  captureSession(path, payload);
  return payload;
}
