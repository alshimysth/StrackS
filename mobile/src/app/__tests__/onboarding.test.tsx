/** #82: explain before asking, and let the user through without insisting. */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import OnboardingScreen from '../onboarding';
import { useOnboarding } from '../../core/onboarding/onboarding';
import { createTestQueryClient } from '../../test-support/query-client';

const mockRequest = jest.fn();
const mockReplace = jest.fn();

jest.mock('../../core/gps/position', () => ({
  requestForegroundPermission: () => mockRequest(),
  hasForegroundPermission: jest.fn().mockResolvedValue(false),
}));
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a) } }));
jest.mock('../../core/api/client', () => ({
  ...jest.requireActual('../../core/api/client'),
  api: jest.fn().mockResolvedValue({}),
}));

let client: QueryClient;
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = createTestQueryClient();
  useOnboarding.setState({ status: 'pending' });
});
afterEach(() => {
  client.unmount();
  client.clear();
});

async function reachLocationStep() {
  await render(<OnboardingScreen />, { wrapper: Wrapper });
  await fireEvent.press(screen.getByText('Continuer'));
  await waitFor(() => expect(screen.getByTestId('onboarding-location')).toBeOnTheScreen());
}

it('explains before asking: no request on opening', async () => {
  await reachLocationStep();
  expect(screen.getByText('Seulement pendant tes séances')).toBeOnTheScreen();
  expect(screen.getByText(/« Toujours », pour l’écran verrouillé/)).toBeOnTheScreen();
  expect(mockRequest).not.toHaveBeenCalled();
});

it('requests the foreground permission, then opens the app', async () => {
  mockRequest.mockResolvedValue(true);
  await reachLocationStep();
  await fireEvent.press(screen.getByText('Autoriser la localisation'));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(useOnboarding.getState().status).toBe('done');
});

/** No repeated request: explicit consent, not insistent consent (PRD). */
it('after a refusal, says where to change the choice and lets the user through', async () => {
  mockRequest.mockResolvedValue(false);
  await reachLocationStep();
  await fireEvent.press(screen.getByText('Autoriser la localisation'));

  expect(await screen.findByTestId('onboarding-denied')).toHaveTextContent(/Réglages/);
  expect(mockReplace).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Commencer'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

it('"Plus tard" asks nothing and does not come back', async () => {
  await reachLocationStep();
  await fireEvent.press(screen.getByText('Plus tard'));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
  expect(mockRequest).not.toHaveBeenCalled();
  expect(useOnboarding.getState().status).toBe('done');
});
