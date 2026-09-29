/**
 * Authentication store: access token, refresh token and user, persisted in the device's
 * secure storage (SecureStore; localStorage in web dev).
 *
 * The refresh token (story #44) extends the session without manual re-login. It's written
 * here, but `core/api/client.ts` decides WHEN to use it: the store holds the state, the
 * client carries the policy.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { API_BASE_URL } from '../api/config';
import { clearUserCache } from '../api/query-client';
import type { User } from '../../types/api';

const TOKEN_KEY = 'stracks.token';
const REFRESH_TOKEN_KEY = 'stracks.refreshToken';
const USER_KEY = 'stracks.user';

const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return globalThis.localStorage?.getItem(key) ?? null;
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

/**
 * Tells the server the session is closed, so it revokes the token. Silent and not awaited:
 * a logout must never fail on the client because the network is down; the token will
 * expire on its own.
 */
async function revokeOnServer(refreshToken: string): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // hors ligne : rien à faire de plus, le jeton reste borné par son expiration
  }
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  /** true once the session has been read back from secure storage. */
  hydrated: boolean;
  setAuth: (token: string, user: User, refreshToken?: string | null) => void;
  /** Rotation: new token pair, user unchanged. */
  setSession: (token: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  refreshToken: null,
  user: null,
  hydrated: false,

  setAuth: (token, user, refreshToken) => {
    // `refreshToken` omitted ⇒ keep the one already in place. Historical callers
    // (`use-auth.ts`) don't pass one: the HTTP client already captured it from the login
    // response. Omitting it must therefore not mean clearing it.
    const nextRefresh = refreshToken === undefined ? get().refreshToken : refreshToken;
    set({ token, user, refreshToken: nextRefresh });
    void storage.set(TOKEN_KEY, token);
    void storage.set(USER_KEY, JSON.stringify(user));
    if (nextRefresh) {
      void storage.set(REFRESH_TOKEN_KEY, nextRefresh);
    } else {
      void storage.remove(REFRESH_TOKEN_KEY);
    }
  },

  setSession: (token, refreshToken) => {
    set({ token, refreshToken });
    void storage.set(TOKEN_KEY, token);
    void storage.set(REFRESH_TOKEN_KEY, refreshToken);
  },

  setUser: (user) => {
    set({ user });
    void storage.set(USER_KEY, JSON.stringify(user));
  },

  logout: () => {
    const { refreshToken } = get();
    if (refreshToken) {
      void revokeOnServer(refreshToken);
    }
    set({ token: null, refreshToken: null, user: null });
    void storage.remove(TOKEN_KEY);
    void storage.remove(REFRESH_TOKEN_KEY);
    void storage.remove(USER_KEY);
    // The account's data must not outlive its session (PR #80 review).
    void clearUserCache().catch(() => {});
  },

  hydrate: async () => {
    const [token, refreshToken, rawUser] = await Promise.all([
      storage.get(TOKEN_KEY),
      storage.get(REFRESH_TOKEN_KEY),
      storage.get(USER_KEY),
    ]);
    set({
      token,
      refreshToken,
      user: rawUser ? (JSON.parse(rawUser) as User) : null,
      hydrated: true,
    });
  },
}));
