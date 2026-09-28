/**
 * Mocks globaux des modules natifs sans implémentation sous jest.
 *
 * AsyncStorage : depuis la revue de la PR #80, la déconnexion vide le cache persisté
 * (`clearUserCache`), donc le store d'authentification charge le client react-query —
 * et avec lui AsyncStorage — dans toute suite qui touche au client HTTP. Le paquet
 * fournit son propre mock en mémoire : on l'utilise plutôt que d'en écrire un.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
