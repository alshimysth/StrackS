/**
 * Global mocks of native modules that have no implementation under jest.
 *
 * AsyncStorage: since the PR #80 review, logout clears the persisted cache
 * (`clearUserCache`), so the auth store loads the react-query client, and AsyncStorage
 * with it, in every suite that touches the HTTP client. The package ships its own
 * in-memory mock: we use it rather than writing one.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
