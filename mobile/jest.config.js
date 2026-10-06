/**
 * Mobile unit tests (#40). `jest-expo` preset (SDK 57): it transforms react-native and
 * the expo modules, and provides mocks of the native modules.
 *
 * Config in a dedicated file rather than in package.json's `jest` key: several sessions
 * edit package.json in parallel, so better to reduce the conflict surface.
 */

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',

  // Only `*.test.ts(x)` files are tests: the helpers in __tests__/support/ are plain
  // imported modules, not suites.
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],

  // Global mocks of native modules (AsyncStorage); see the file.
  setupFiles: ['<rootDir>/jest.setup.js'],

  // Same alias as tsconfig.json, so tests can import `@/…`.
  moduleNameMapper: {
    // Icons (#39): the package exposes an `.mjs` build that jest's Babel transform
    // doesn't handle; its CommonJS build loads as is.
    '^lucide-react-native$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
  },

  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|standard-navigation)',
  ],

  // The first test that renders a screen pays for transforming that screen's module graph.
  // With a cold cache (every CI run) it took ~1.1 s locally on SDK 54 and ~1.6 s on SDK 57,
  // and several times that on a 2-core runner with parallel workers: the 5 s default made
  // activity-detail and summary fail in CI only. 15 s keeps a hung test bounded.
  testTimeout: 15_000,

  // mockClear between tests (implementations set in jest.mock factories are kept);
  // jest.spyOn spies are restored.
  clearMocks: true,
  restoreMocks: true,
};
