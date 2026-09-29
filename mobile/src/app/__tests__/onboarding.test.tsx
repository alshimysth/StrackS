/** #82 : expliquer avant de demander, et laisser passer sans insister. */
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

it('explique avant de demander : aucune demande à l’ouverture', async () => {
  await reachLocationStep();
  expect(screen.getByText('Seulement pendant tes séances')).toBeOnTheScreen();
  expect(screen.getByText(/« Toujours », pour l’écran verrouillé/)).toBeOnTheScreen();
  expect(mockRequest).not.toHaveBeenCalled();
});

it('demande la permission de premier plan, puis ouvre l’app', async () => {
  mockRequest.mockResolvedValue(true);
  await reachLocationStep();
  await fireEvent.press(screen.getByText('Autoriser la localisation'));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(useOnboarding.getState().status).toBe('done');
});

/** Pas de redemande en boucle : un consentement explicite, pas insistant (PRD). */
it('après un refus, dit où changer d’avis et laisse passer', async () => {
  mockRequest.mockResolvedValue(false);
  await reachLocationStep();
  await fireEvent.press(screen.getByText('Autoriser la localisation'));

  expect(await screen.findByTestId('onboarding-denied')).toHaveTextContent(/Réglages/);
  expect(mockReplace).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Commencer'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

it('« Plus tard » ne demande rien et ne revient pas', async () => {
  await reachLocationStep();
  await fireEvent.press(screen.getByText('Plus tard'));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
  expect(mockRequest).not.toHaveBeenCalled();
  expect(useOnboarding.getState().status).toBe('done');
});
