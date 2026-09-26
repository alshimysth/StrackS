/**
 * Client HTTP et renouvellement de session (#44, #49).
 *
 * Depuis #49, le JWT d'accès vit 15 min : une séance de 2 h le voit expirer huit fois, et
 * un retour de veille fait repartir plusieurs requêtes ensemble avec un jeton périmé. La
 * garantie du lot D — renouvellement transparent, zéro point perdu — n'était prouvée que
 * par une manipulation manuelle. Ces tests la fixent.
 *
 * Le serveur est simulé au niveau de `fetch` : c'est le vrai client qui tourne, avec sa
 * mutualisation du renouvellement et son rejeu.
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

/** Serveur simulé : seul `validToken` passe ; le renouvellement fait tourner la paire. */
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
    // Petite latence : laisse les requêtes concurrentes arriver pendant le renouvellement.
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

describe('renouvellement transparent (#49)', () => {
  it('renouvelle puis rejoue une requête partie avec un JWT expiré', async () => {
    await expect(api('/api/v1/activities/a/track-points', { method: 'POST', body: { points: [] } }))
      .resolves.toMatchObject({ ok: true });

    expect(refreshCalls()).toHaveLength(1);
    const replay = calls[calls.length - 1];
    expect(replay.authorization).toBe('Bearer access-1');
    expect(replay.body).toEqual({ points: [] }); // même lot, rejoué tel quel
    expect(mockLogout).not.toHaveBeenCalled();
  });

  /**
   * Retour de veille : l'uploader, l'accueil et les stats repartent ensemble. Deux
   * rotations concurrentes du même refresh token seraient prises pour un vol côté
   * serveur (#44) et feraient tomber la famille : UN seul renouvellement doit partir.
   */
  it('mutualise le renouvellement quand plusieurs requêtes reviennent ensemble', async () => {
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

  /** Séance de 2 h à 15 min de durée de vie : huit expirations, zéro reconnexion. */
  it('tient huit expirations successives sans déconnecter ni perdre un lot', async () => {
    for (let lot = 0; lot < 8; lot++) {
      mockSession.token = 'expired-access'; // le JWT courant vient d'expirer
      await api(`/api/v1/activities/a/track-points`, { method: 'POST', body: { lot } });
    }

    expect(refreshCalls()).toHaveLength(8);
    const delivered = calls
      .filter((c) => c.path.endsWith('/track-points') && c.authorization === `Bearer access-${(c.body as { lot: number }).lot + 1}`)
      .map((c) => (c.body as { lot: number }).lot);
    expect(delivered).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  /** Un tunnel n'est pas une fin de session : le coureur ne doit pas être déconnecté. */
  it('ne déconnecte pas quand le serveur est injoignable pendant le renouvellement', async () => {
    refreshBehaviour = 'network-error';
    await expect(api('/api/v1/activities')).rejects.toBeInstanceOf(ApiError);
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockSession.refreshToken).toBe('refresh-0');
  });

  it('déconnecte quand le serveur refuse le renouvellement', async () => {
    refreshBehaviour = 'reject';
    await expect(api('/api/v1/activities')).rejects.toMatchObject({ status: 401 });
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});

describe('sessions ouvertes par un endpoint de compte (#73)', () => {
  /**
   * Le serveur révoque toutes les sessions et en rend une neuve. Sans la capter, le
   * prochain renouvellement présenterait un refresh token révoqué et déconnecterait
   * l'utilisateur qui vient justement de sécuriser son compte.
   */
  it('range la session neuve rendue par le changement de mot de passe', async () => {
    mockSession.token = 'access-0';
    await api('/api/v1/users/me/password', {
      method: 'POST',
      body: { currentPassword: 'a', newPassword: 'motdepasse8' },
    });
    expect(mockSession.token).toBe('after-password');
    expect(mockSession.refreshToken).toBe('refresh-after-password');
  });
});

describe('réponse texte (#76)', () => {
  it('rend le corps sans le parser', async () => {
    mockSession.token = 'access-0';
    await expect(api<string>('/api/v1/users/me/export', { parse: 'text' })).resolves.toBe(
      '{"formatVersion":1}',
    );
  });
});
