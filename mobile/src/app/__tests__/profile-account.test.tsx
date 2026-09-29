/**
 * Profile Account section (#73, #75, #76): access to the security screens, the address
 * verification state, and the export.
 */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import ProfileScreen from '../(tabs)/profile';
import { ApiError } from '../../core/api/client';
import { DEFAULT_PREFERENCES } from '../../core/preferences/schema';
import { QUERY_KEY } from '../../core/preferences/use-preferences';
import { createTestQueryClient } from '../../test-support/query-client';

const mockApi = jest.fn();
const mockPush = jest.fn();
const mockExport = jest.fn();
let mockVerified = false;

jest.mock('../../core/api/client', () => ({
  ...jest.requireActual('../../core/api/client'),
  api: (...args: unknown[]) => mockApi(...args),
}));

jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a) },
}));

jest.mock('../../core/account/export-data', () => ({
  exportPersonalData: () => mockExport(),
}));

jest.mock('../../core/auth/use-auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector({ user: null, logout: jest.fn() }),
    { getState: () => ({ user: null }) },
  ),
}));

jest.mock('../../sports/registry', () => ({
  sportRegistry: { running: { code: 'running' } },
}));

jest.mock('../../core/api/use-auth', () => ({
  useProfile: () => ({
    data: { displayName: 'Testeur', email: 't@example.com', emailVerified: mockVerified },
  }),
  useDeleteAccount: () => ({ mutate: jest.fn() }),
}));

/** Profile totals (#7): served by path, they aren't the subject of this suite. */
const ALL_TIME = {
  from: '1970-01-01T00:00:00Z',
  to: '2026-09-28T00:00:00Z',
  bySport: [],
  totalSessions: 0,
  totalDurationS: 0,
  totals: {},
  previous: { sessions: 0, durationS: 0, totals: {} },
};

let client: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = createTestQueryClient();
  client.setQueryData(QUERY_KEY, DEFAULT_PREFERENCES);
  client.setQueryData(['sport-types'], []);
  mockApi.mockImplementation((path: string) =>
    Promise.resolve(path.startsWith('/api/v1/stats/summary') ? ALL_TIME : []),
  );
  mockVerified = false;
});

afterEach(() => {
  client.unmount();
  client.clear();
});

const renderScreen = () => render(<ProfileScreen />, { wrapper: Wrapper });

it('flags an unverified address and offers to verify it', async () => {
  await renderScreen();
  expect(screen.getByTestId('email-status')).toHaveTextContent('Adresse non vérifiée');
  await fireEvent.press(screen.getByText('Vérifier mon adresse'));
  expect(mockPush).toHaveBeenCalledWith('/account/verify-email');
});

it('no longer offers verification once the address is verified', async () => {
  mockVerified = true;
  await renderScreen();
  expect(screen.getByTestId('email-status')).toHaveTextContent('Adresse vérifiée');
  expect(screen.queryByText('Vérifier mon adresse')).toBeNull();
});

it.each([
  ['Changer d’adresse email', '/account/email'],
  ['Changer le mot de passe', '/account/password'],
])('"%s" opens %s', async (label, route) => {
  await renderScreen();
  await fireEvent.press(screen.getByText(label));
  expect(mockPush).toHaveBeenCalledWith(route);
});

it('starts the export and shows an understandable failure', async () => {
  mockExport.mockRejectedValue(
    new ApiError({ title: 'Trop de tentatives', status: 429, detail: 'Réessaie dans 3 min.' }),
  );
  await renderScreen();
  await fireEvent.press(screen.getByText('Exporter mes données'));

  expect(mockExport).toHaveBeenCalledTimes(1);
  expect(await screen.findByTestId('export-error')).toHaveTextContent('Réessaie dans 3 min.');
});
