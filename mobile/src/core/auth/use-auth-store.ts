/**
 * Store d'authentification : token JWT + utilisateur, persistés dans le
 * stockage sécurisé de l'appareil (SecureStore ; localStorage en dev web).
 * Repris du pattern validé de l'ancien code (LEGACY_SUMMARY §3).
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

import type { User } from '../../types/api';

const TOKEN_KEY = 'stracks.token';
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

interface AuthState {
  token: string | null;
  user: User | null;
  /** true une fois la session relue depuis le stockage sécurisé. */
  hydrated: boolean;
  setAuth: (token: string, user: User) => void;
  setUser: (user: User) => void;
  logout: () => void;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  hydrated: false,

  setAuth: (token, user) => {
    set({ token, user });
    void storage.set(TOKEN_KEY, token);
    void storage.set(USER_KEY, JSON.stringify(user));
  },

  setUser: (user) => {
    set({ user });
    void storage.set(USER_KEY, JSON.stringify(user));
  },

  logout: () => {
    set({ token: null, user: null });
    void storage.remove(TOKEN_KEY);
    void storage.remove(USER_KEY);
  },

  hydrate: async () => {
    const [token, rawUser] = await Promise.all([
      storage.get(TOKEN_KEY),
      storage.get(USER_KEY),
    ]);
    set({
      token,
      user: rawUser ? (JSON.parse(rawUser) as User) : null,
      hydrated: true,
    });
  },
}));
