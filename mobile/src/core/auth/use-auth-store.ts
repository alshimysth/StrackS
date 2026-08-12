/**
 * Store d'authentification : jeton d'accès, jeton de renouvellement et utilisateur,
 * persistés dans le stockage sécurisé de l'appareil (SecureStore ; localStorage en dev web).
 * Repris du pattern validé de l'ancien code (LEGACY_SUMMARY §3).
 *
 * Le jeton de renouvellement (Story #44) prolonge la session sans reconnexion manuelle.
 * Il est écrit ici, mais c'est `core/api/client.ts` qui décide QUAND s'en servir : le
 * store garde l'état, le client porte la politique.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { API_BASE_URL } from '../api/config';
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
 * Prévient le serveur que la session est close, pour qu'il révoque le jeton.
 * Silencieux et sans attente : une déconnexion ne doit jamais échouer côté client
 * parce que le réseau est coupé — le jeton expirera de lui-même.
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
  /** true une fois la session relue depuis le stockage sécurisé. */
  hydrated: boolean;
  setAuth: (token: string, user: User, refreshToken?: string | null) => void;
  /** Rotation : nouveau couple de jetons, utilisateur inchangé. */
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
    // `refreshToken` omis ⇒ on conserve celui déjà en place. Les appelants historiques
    // (`use-auth.ts`) n'en passent pas : c'est le client HTTP qui l'a déjà capté sur la
    // réponse de connexion. L'omission ne doit donc pas valoir effacement.
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
