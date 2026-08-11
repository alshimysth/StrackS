/**
 * Tests unitaires du mobile (#40). Preset `jest-expo` (SDK 54) : il transforme
 * react-native et les modules expo, et fournit les mocks des modules natifs.
 *
 * Config dans un fichier dédié plutôt que dans la clé `jest` de package.json :
 * plusieurs sessions éditent package.json en parallèle, autant réduire la
 * surface de conflit.
 */

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',

  // Seuls les `*.test.ts(x)` sont des tests : les helpers de __tests__/support/
  // sont de simples modules importés, pas des suites.
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],

  // Même alias que tsconfig.json, pour que les tests puissent importer `@/…`.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
  },

  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)',
  ],

  // mockClear entre chaque test (les implémentations posées dans les factories
  // jest.mock sont conservées) ; restore des spies jest.spyOn.
  clearMocks: true,
  restoreMocks: true,
};
