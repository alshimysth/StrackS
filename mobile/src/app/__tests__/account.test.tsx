/**
 * Écrans de sécurité du compte (#73, #74, #75) : ce que voit l'utilisateur à chaque
 * étape, et surtout ce qu'il ne doit pas voir — une déconnexion sur une faute de frappe,
 * un indice sur l'existence d'un compte.
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

describe('Mot de passe oublié (#74)', () => {
  it('reprend l’adresse saisie sur l’écran de connexion', async () => {
    mockParams = { email: 'coureur@example.com' };
    await render(<ForgotPasswordScreen />, { wrapper: Wrapper });
    expect(screen.getByTestId('reset-email').props.value).toBe('coureur@example.com');
  });

  /** Le serveur répond 202 que le compte existe ou non ; l'écran reste au conditionnel. */
  it('passe à la saisie du code sans affirmer que le compte existe', async () => {
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

  it('refuse deux saisies différentes du nouveau mot de passe avant tout appel', async () => {
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

  it('affiche le refus du serveur pour un code invalide, puis réussit', async () => {
    mockApi.mockResolvedValueOnce(undefined); // demande du code
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

  /** #72 : le délai précis vient du serveur ; l'écran ne le remplace pas par un flou. */
  it('affiche le délai d’attente d’un 429 tel que le serveur le formule', async () => {
    mockApi.mockRejectedValue(
      problem(429, 'Trop de tentatives', 'Trop de tentatives rapprochées. Réessaie dans 12 min.'),
    );
    await render(<ForgotPasswordScreen />, { wrapper: Wrapper });
    await fireEvent.changeText(screen.getByTestId('reset-email'), 'coureur@example.com');
    await fireEvent.press(screen.getByText('Recevoir un code'));
    expect(await screen.findByText(/Réessaie dans 12 min/)).toBeOnTheScreen();
  });
});

/** Revue CodeRabbit (PR #78) : « Renvoyer un code » qui échoue ne doit pas rester muet. */
it('affiche le refus d’un renvoi de code à l’étape du code', async () => {
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

describe('Changement de mot de passe (#73)', () => {
  const fill = async () => {
    await fireEvent.changeText(screen.getByTestId('password-current'), 'ancien-mdp');
    await fireEvent.changeText(screen.getByTestId('password-new'), 'nouveau-mdp');
    await fireEvent.changeText(screen.getByTestId('password-confirmation'), 'nouveau-mdp');
  };

  /** 403 côté serveur : une faute de frappe s'affiche, elle ne déconnecte pas. */
  it('affiche un mauvais mot de passe actuel sans quitter la session', async () => {
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

  it('confirme le changement et prévient que les autres appareils sont déconnectés', async () => {
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

  it('refuse un nouveau mot de passe trop court avant tout appel', async () => {
    await render(<ChangePasswordScreen />, { wrapper: Wrapper });
    await fireEvent.changeText(screen.getByTestId('password-current'), 'ancien-mdp');
    await fireEvent.changeText(screen.getByTestId('password-new'), 'court');
    await fireEvent.changeText(screen.getByTestId('password-confirmation'), 'court');
    await fireEvent.press(screen.getByRole('button', { name: 'Changer le mot de passe' }));

    expect(await screen.findByText('Au moins 8 caractères')).toBeOnTheScreen();
    // Le thème lit les préférences : seul l'appel de changement compte ici.
    expect(mockApi).not.toHaveBeenCalledWith('/api/v1/users/me/password', expect.anything());
  });
});

describe('Changement d’email (#75)', () => {
  it('demande le code pour la nouvelle adresse, puis met à jour l’utilisateur affiché', async () => {
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

  it('affiche une adresse déjà prise', async () => {
    mockApi.mockRejectedValue(problem(409, 'Email déjà utilisé', 'Un compte existe déjà avec cet email.'));
    await render(<ChangeEmailScreen />, { wrapper: Wrapper });
    await fireEvent.changeText(screen.getByTestId('email-new'), 'prise@example.com');
    await fireEvent.changeText(screen.getByTestId('email-password'), 'motdepasse8');
    await fireEvent.press(screen.getByText('Recevoir un code'));

    expect(await screen.findByTestId('email-error')).toHaveTextContent('Un compte existe déjà avec cet email.');
  });
});

describe('Vérification d’adresse (#75)', () => {
  it('vérifie l’adresse avec le code reçu', async () => {
    mockApi.mockResolvedValue({ id: 'u1', email: 'a@example.com', emailVerified: true });
    await render(<VerifyEmailScreen />, { wrapper: Wrapper });
    await fireEvent.changeText(screen.getByTestId('verify-code'), 'ABCD-EFGH');
    await fireEvent.press(screen.getByText('Vérifier'));

    expect(await screen.findByTestId('email-verified')).toBeOnTheScreen();
    expect(useAuthStore.getState().user).toMatchObject({ emailVerified: true });
  });

  it('renvoie un code et prévient que le précédent ne vaut plus', async () => {
    mockApi.mockResolvedValue(undefined);
    await render(<VerifyEmailScreen />, { wrapper: Wrapper });
    await fireEvent.press(screen.getByText('Renvoyer un code'));

    expect(await screen.findByTestId('verify-resent')).toBeOnTheScreen();
    expect(mockApi).toHaveBeenCalledWith('/api/v1/users/me/email-verifications', { method: 'POST' });
  });
});
