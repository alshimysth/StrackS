/**
 * Account security screens (#73, #74, #75): what the user sees at each step, and above
 * all what they must not see: a logout over a typo, a hint about whether an account
 * exists.
 */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import ForgotPasswordScreen from '../(auth)/forgot-password';
import ChangeEmailScreen from '../account/email';
import ChangePasswordScreen from '../account/password';
import VerifyEmailScreen from '../account/verify-email';
import { ApiError } from '../../core/api/client';
import { useAuthStore } from '../../core/auth/use-auth-store';
import { createTestQueryClient } from '../../test-support/query-client';

const mockApi = jest.fn();
const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };
let mockParams: Record<string, string> = {};

jest.mock('../../core/api/client', () => ({
  ...jest.requireActual('../../core/api/client'),
  api: (...args: unknown[]) => mockApi(...args),
}));

jest.mock('expo-router', () => ({
  router: {
    back: (...a: unknown[]) => mockRouter.back(...a),
    push: (...a: unknown[]) => mockRouter.push(...a),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
  },
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

let client: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const problem = (status: number, title: string, detail: string) =>
  new ApiError({ status, title, detail });

beforeEach(() => {
  client = createTestQueryClient();
  mockParams = {};
  mockApi.mockReset();
  useAuthStore.setState({ token: 'jwt', user: null });
});

afterEach(() => {
  client.unmount();
  client.clear();
});

describe('Forgotten password (#74)', () => {
  it('reuses the address typed on the login screen', async () => {
    mockParams = { email: 'coureur@example.com' };
    await render(<ForgotPasswordScreen />, { wrapper: Wrapper });
    expect(screen.getByTestId('reset-email').props.value).toBe('coureur@example.com');
  });

  /** The server answers 202 whether the account exists or not; the screen stays conditional. */
  it('moves on to entering the code without asserting the account exists', async () => {
    mockApi.mockResolvedValue(undefined);
    await render(<ForgotPasswordScreen />, { wrapper: Wrapper });

    await fireEvent.changeText(screen.getByTestId('reset-email'), 'coureur@example.com');
    await fireEvent.press(screen.getByText('Recevoir un code'));

    await waitFor(() => expect(screen.getByTestId('reset-code-sent')).toBeOnTheScreen());
    expect(screen.getByTestId('reset-code-sent')).toHaveTextContent(/Si un compte existe/);
    expect(mockApi).toHaveBeenCalledWith('/api/v1/auth/password-resets', {
      method: 'POST',
      body: { email: 'coureur@example.com' },
      auth: false,
    });
  });

  it('rejects two different entries of the new password before any call', async () => {
    mockApi.mockResolvedValue(undefined);
    await render(<ForgotPasswordScreen />, { wrapper: Wrapper });
    await fireEvent.changeText(screen.getByTestId('reset-email'), 'coureur@example.com');
    await fireEvent.press(screen.getByText('Recevoir un code'));
    await waitFor(() => expect(screen.getByTestId('reset-code')).toBeOnTheScreen());
    mockApi.mockClear();

    await fireEvent.changeText(screen.getByTestId('reset-code'), 'ABCD-EFGH');
    await fireEvent.changeText(screen.getByTestId('reset-password'), 'nouveau-mdp');
    await fireEvent.changeText(screen.getByTestId('reset-confirmation'), 'autre-mdp');
    await fireEvent.press(screen.getByRole('button', { name: 'Changer le mot de passe' }));

    expect(await screen.findByText('Les deux saisies ne correspondent pas')).toBeOnTheScreen();
    expect(mockApi).not.toHaveBeenCalledWith(
      '/api/v1/auth/password-reset-confirmations',
      expect.anything(),
    );
  });

  it('shows the server refusal for an invalid code, then succeeds', async () => {
    mockApi.mockResolvedValueOnce(undefined); // code request
    await render(<ForgotPasswordScreen />, { wrapper: Wrapper });
    await fireEvent.changeText(screen.getByTestId('reset-email'), 'coureur@example.com');
    await fireEvent.press(screen.getByText('Recevoir un code'));
    await waitFor(() => expect(screen.getByTestId('reset-code')).toBeOnTheScreen());

    await fireEvent.changeText(screen.getByTestId('reset-code'), 'ABCD-EFGH');
    await fireEvent.changeText(screen.getByTestId('reset-password'), 'nouveau-mdp');
    await fireEvent.changeText(screen.getByTestId('reset-confirmation'), 'nouveau-mdp');

    mockApi.mockRejectedValueOnce(
      problem(400, 'Code invalide', 'Ce code est invalide ou a expiré. Demandes-en un nouveau.'),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Changer le mot de passe' }));
    expect(await screen.findByText(/invalide ou a expiré/)).toBeOnTheScreen();

    mockApi.mockResolvedValueOnce(undefined);
    await fireEvent.press(screen.getByRole('button', { name: 'Changer le mot de passe' }));
    await waitFor(() => expect(screen.getByTestId('reset-done')).toBeOnTheScreen());
    expect(mockApi).toHaveBeenLastCalledWith('/api/v1/auth/password-reset-confirmations', {
      method: 'POST',
      body: { email: 'coureur@example.com', code: 'ABCD-EFGH', newPassword: 'nouveau-mdp' },
      auth: false,
    });
  });

  /** #72: the exact delay comes from the server; the screen doesn't replace it with something vague. */
  it('shows the waiting time of a 429 as the server words it', async () => {
    mockApi.mockRejectedValue(
      problem(429, 'Trop de tentatives', 'Trop de tentatives rapprochées. Réessaie dans 12 min.'),
    );
    await render(<ForgotPasswordScreen />, { wrapper: Wrapper });
    await fireEvent.changeText(screen.getByTestId('reset-email'), 'coureur@example.com');
    await fireEvent.press(screen.getByText('Recevoir un code'));
    expect(await screen.findByText(/Réessaie dans 12 min/)).toBeOnTheScreen();
  });
});

/** CodeRabbit review (PR #78): a failing "Renvoyer un code" must not stay silent. */
it('shows the refusal of a code resend at the code step', async () => {
  mockApi.mockResolvedValueOnce(undefined);
  await render(<ForgotPasswordScreen />, { wrapper: Wrapper });
  await fireEvent.changeText(screen.getByTestId('reset-email'), 'coureur@example.com');
  await fireEvent.press(screen.getByText('Recevoir un code'));
  await waitFor(() => expect(screen.getByTestId('reset-code')).toBeOnTheScreen());

  mockApi.mockRejectedValueOnce(
    problem(429, 'Trop de tentatives', 'Trop de tentatives rapprochées. Réessaie dans 40 min.'),
  );
  await fireEvent.press(screen.getByText('Renvoyer un code'));

  expect(await screen.findByText(/Réessaie dans 40 min/)).toBeOnTheScreen();
});

describe('Password change (#73)', () => {
  const fill = async () => {
    await fireEvent.changeText(screen.getByTestId('password-current'), 'ancien-mdp');
    await fireEvent.changeText(screen.getByTestId('password-new'), 'nouveau-mdp');
    await fireEvent.changeText(screen.getByTestId('password-confirmation'), 'nouveau-mdp');
  };

  /** 403 on the server: a typo is shown, it doesn't log the user out. */
  it('shows a wrong current password without leaving the session', async () => {
    mockApi.mockRejectedValue(
      problem(403, 'Mot de passe incorrect', 'Le mot de passe actuel ne correspond pas.'),
    );
    await render(<ChangePasswordScreen />, { wrapper: Wrapper });
    await fill();
    await fireEvent.press(screen.getByRole('button', { name: 'Changer le mot de passe' }));

    expect(await screen.findByTestId('password-error')).toHaveTextContent(
      'Le mot de passe actuel ne correspond pas.',
    );
    expect(useAuthStore.getState().token).toBe('jwt');
  });

  it('confirms the change and warns that the other devices are logged out', async () => {
    mockApi.mockResolvedValue({ token: 't', refreshToken: 'r', user: {} });
    await render(<ChangePasswordScreen />, { wrapper: Wrapper });
    await fill();
    await fireEvent.press(screen.getByRole('button', { name: 'Changer le mot de passe' }));

    expect(await screen.findByTestId('password-changed')).toHaveTextContent(/autres appareils/);
    expect(mockApi).toHaveBeenCalledWith('/api/v1/users/me/password', {
      method: 'POST',
      body: { currentPassword: 'ancien-mdp', newPassword: 'nouveau-mdp' },
    });
  });

  it('rejects a too short new password before any call', async () => {
    await render(<ChangePasswordScreen />, { wrapper: Wrapper });
    await fireEvent.changeText(screen.getByTestId('password-current'), 'ancien-mdp');
    await fireEvent.changeText(screen.getByTestId('password-new'), 'court');
    await fireEvent.changeText(screen.getByTestId('password-confirmation'), 'court');
    await fireEvent.press(screen.getByRole('button', { name: 'Changer le mot de passe' }));

    expect(await screen.findByText('Au moins 8 caractères')).toBeOnTheScreen();
    // The theme reads the preferences: only the change call matters here.
    expect(mockApi).not.toHaveBeenCalledWith('/api/v1/users/me/password', expect.anything());
  });
});

describe('Email change (#75)', () => {
  it('requests the code for the new address, then updates the displayed user', async () => {
    await render(<ChangeEmailScreen />, { wrapper: Wrapper });
    await fireEvent.changeText(screen.getByTestId('email-new'), 'nouvelle@example.com');
    await fireEvent.changeText(screen.getByTestId('email-password'), 'motdepasse8');
    mockApi.mockResolvedValueOnce(undefined);
    await fireEvent.press(screen.getByText('Recevoir un code'));

    expect(await screen.findByText(/envoyé à nouvelle@example.com/)).toBeOnTheScreen();

    const updated = {
      id: 'u1',
      email: 'nouvelle@example.com',
      displayName: null,
      createdAt: '2026-01-01T00:00:00Z',
      emailVerified: true,
    };
    mockApi.mockResolvedValueOnce(updated);
    await fireEvent.changeText(screen.getByTestId('email-code'), 'wxyz 2345');
    await fireEvent.press(screen.getByText('Confirmer'));

    expect(await screen.findByTestId('email-changed')).toHaveTextContent(/nouvelle@example.com/);
    expect(mockApi).toHaveBeenLastCalledWith('/api/v1/users/me/email-change-confirmations', {
      method: 'POST',
      body: { code: 'wxyz 2345' },
    });
    expect(useAuthStore.getState().user).toEqual(updated);
    expect(client.getQueryData(['me'])).toEqual(updated);
  });

  it('shows an address already taken', async () => {
    mockApi.mockRejectedValue(problem(409, 'Email déjà utilisé', 'Un compte existe déjà avec cet email.'));
    await render(<ChangeEmailScreen />, { wrapper: Wrapper });
    await fireEvent.changeText(screen.getByTestId('email-new'), 'prise@example.com');
    await fireEvent.changeText(screen.getByTestId('email-password'), 'motdepasse8');
    await fireEvent.press(screen.getByText('Recevoir un code'));

    expect(await screen.findByTestId('email-error')).toHaveTextContent('Un compte existe déjà avec cet email.');
  });
});

describe('Address verification (#75)', () => {
  it('verifies the address with the received code', async () => {
    mockApi.mockResolvedValue({ id: 'u1', email: 'a@example.com', emailVerified: true });
    await render(<VerifyEmailScreen />, { wrapper: Wrapper });
    await fireEvent.changeText(screen.getByTestId('verify-code'), 'ABCD-EFGH');
    await fireEvent.press(screen.getByText('Vérifier'));

    expect(await screen.findByTestId('email-verified')).toBeOnTheScreen();
    expect(useAuthStore.getState().user).toMatchObject({ emailVerified: true });
  });

  it('resends a code and warns that the previous one is no longer valid', async () => {
    mockApi.mockResolvedValue(undefined);
    await render(<VerifyEmailScreen />, { wrapper: Wrapper });
    await fireEvent.press(screen.getByText('Renvoyer un code'));

    expect(await screen.findByTestId('verify-resent')).toBeOnTheScreen();
    expect(mockApi).toHaveBeenCalledWith('/api/v1/users/me/email-verifications', { method: 'POST' });
  });
});
