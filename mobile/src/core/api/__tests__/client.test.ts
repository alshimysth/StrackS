/**
 * HTTP client and session refresh (#44, #49).
 *
 * Since #49, the access JWT lives 15 min: a 2 h session sees it expire eight times, and
 * waking from sleep sends several requests together with a stale token. Lot D's guarantee
 * (transparent refresh, zero lost points) was only proven by a manual procedure. These
 * tests pin it down.
 *
 * The server is simulated at the `fetch` level: it's the real client running, with its
 * shared refresh and its replay.
 */
import { ApiError, api } from '../client';

type Session = { token: string | null; refreshToken: string | null; user: unknown };

const mockSession: Session = { token: null, refreshToken: null, user: null };
const mockLogout = jest.fn();

jest.mock('../../auth/use-auth-store', () => ({
  useAuthStore: {
    getState: () => ({
      ...mockSession,
      setSession: (token: string, refreshToken: string) => {
        mockSession.token = token;
        mockSession.refreshToken = refreshToken;
      },
      setUser: (user: unknown) => {
        mockSession.user = user;
      },
      logout: () => {
        mockLogout();
        mockSession.token = null;
        mockSession.refreshToken = null;
      },
    }),
  },
}));

jest.mock('../config', () => ({ API_BASE_URL: 'https://api.test' }));

interface Call {
  path: string;
  authorization: string | undefined;
  body: unknown;
}

let calls: Call[];
let validToken: string;
let refreshBehaviour: 'rotate' | 'reject' | 'network-error';
let rotations: number;

function json(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

/** Simulated server: only `validToken` passes; refreshing rotates the pair. */
async function fakeServer(url: string, init: RequestInit = {}): Promise<Response> {
  const path = url.replace('https://api.test', '');
  const headers = (init.headers ?? {}) as Record<string, string>;
  const body = init.body != null ? JSON.parse(String(init.body)) : undefined;
  calls.push({ path, authorization: headers.Authorization, body });

  if (path === '/api/v1/auth/refresh') {
    if (refreshBehaviour === 'network-error') {
      throw new TypeError('Network request failed');
    }
    if (refreshBehaviour === 'reject') {
      return json(401, { title: 'Session expirée', status: 401, detail: 'Reconnectez-vous.' });
    }
    // Small latency: lets concurrent requests arrive during the refresh.
    await new Promise((resolve) => setTimeout(resolve, 5));
    rotations += 1;
    validToken = `access-${rotations}`;
    return json(200, { token: validToken, refreshToken: `refresh-${rotations}` });
  }
  if (path === '/api/v1/users/me/password') {
    return json(200, { token: 'after-password', refreshToken: 'refresh-after-password', user: {} });
  }
  if (headers.Authorization !== `Bearer ${validToken}`) {
    return json(401, { title: 'Non authentifié', status: 401, detail: 'Jeton expiré' });
  }
  if (path === '/api/v1/users/me/export') {
    return json(200, { formatVersion: 1 });
  }
  return json(201, { ok: true, path });
}

beforeEach(() => {
  calls = [];
  rotations = 0;
  refreshBehaviour = 'rotate';
  validToken = 'access-0';
  mockSession.token = 'expired-access';
  mockSession.refreshToken = 'refresh-0';
  mockSession.user = null;
  mockLogout.mockClear();
  global.fetch = jest.fn(fakeServer) as unknown as typeof fetch;
});

const refreshCalls = () => calls.filter((c) => c.path === '/api/v1/auth/refresh');

describe('transparent refresh (#49)', () => {
  it('refreshes then replays a request sent with an expired JWT', async () => {
    await expect(api('/api/v1/activities/a/track-points', { method: 'POST', body: { points: [] } }))
      .resolves.toMatchObject({ ok: true });

    expect(refreshCalls()).toHaveLength(1);
    const replay = calls[calls.length - 1];
    expect(replay.authorization).toBe('Bearer access-1');
    expect(replay.body).toEqual({ points: [] }); // same batch, replayed as is
    expect(mockLogout).not.toHaveBeenCalled();
  });

  /**
   * Waking from sleep: the uploader, home and stats all restart together. Two concurrent
   * rotations of the same refresh token would be taken for a theft by the server (#44)
   * and bring the family down: ONE refresh only must go out.
   */
  it('shares the refresh when several requests come back together', async () => {
    const results = await Promise.all([
      api('/api/v1/activities?page=0'),
      api('/api/v1/stats/summary?period=week'),
      api('/api/v1/activities/a/track-points', { method: 'POST', body: { points: [1] } }),
      api('/api/v1/users/me/preferences'),
    ]);

    expect(results).toHaveLength(4);
    expect(refreshCalls()).toHaveLength(1);
    expect(mockSession.refreshToken).toBe('refresh-1');
    expect(mockLogout).not.toHaveBeenCalled();
  });

  /** A 2 h session with a 15 min lifetime: eight expiries, zero re-login. */
  it('survives eight successive expiries without logging out or losing a batch', async () => {
    for (let lot = 0; lot < 8; lot++) {
      mockSession.token = 'expired-access'; // the current JWT just expired
      await api(`/api/v1/activities/a/track-points`, { method: 'POST', body: { lot } });
    }

    expect(refreshCalls()).toHaveLength(8);
    const delivered = calls
      .filter((c) => c.path.endsWith('/track-points') && c.authorization === `Bearer access-${(c.body as { lot: number }).lot + 1}`)
      .map((c) => (c.body as { lot: number }).lot);
    expect(delivered).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  /** A tunnel isn't the end of a session: the runner must not be logged out. */
  it('does not log out when the server is unreachable during the refresh', async () => {
    refreshBehaviour = 'network-error';
    await expect(api('/api/v1/activities')).rejects.toBeInstanceOf(ApiError);
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockSession.refreshToken).toBe('refresh-0');
  });

  it('logs out when the server refuses the refresh', async () => {
    refreshBehaviour = 'reject';
    await expect(api('/api/v1/activities')).rejects.toMatchObject({ status: 401 });
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});

describe('sessions opened by an account endpoint (#73)', () => {
  /**
   * The server revokes every session and returns a fresh one. Without capturing it, the
   * next refresh would present a revoked refresh token and log out the user who just
   * secured their account.
   */
  it('stores the fresh session returned by the password change', async () => {
    mockSession.token = 'access-0';
    await api('/api/v1/users/me/password', {
      method: 'POST',
      body: { currentPassword: 'a', newPassword: 'motdepasse8' },
    });
    expect(mockSession.token).toBe('after-password');
    expect(mockSession.refreshToken).toBe('refresh-after-password');
  });
});

describe('text response (#76)', () => {
  it('returns the body without parsing it', async () => {
    mockSession.token = 'access-0';
    await expect(api<string>('/api/v1/users/me/export', { parse: 'text' })).resolves.toBe(
      '{"formatVersion":1}',
    );
  });
});
