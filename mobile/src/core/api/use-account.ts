/**
 * Account security (#73, #74, #75, #76): password, email, export.
 *
 * One-time codes arrive by email. The server tolerates lowercase, spaces and dashes: the
 * screen sends what the user typed, without reformatting it.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { ApiError, api } from './client';
import { classifyError } from './error-kind';
import { useAuthStore } from '../auth/use-auth-store';
import type { AuthResponse, User } from '../../types/api';

/** Same rule as registration and the backend (`@Size(min = 8)`). */
const newPassword = z.string().min(8, 'Au moins 8 caractères');
const code = z.string().trim().min(4, 'Saisis le code reçu par email');

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
    newPassword,
    confirmation: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmation, {
    path: ['confirmation'],
    message: 'Les deux saisies ne correspondent pas',
  });

export const resetRequestSchema = z.object({ email: z.string().trim().email('Adresse email invalide') });

export const resetConfirmSchema = z
  .object({ code, newPassword, confirmation: z.string() })
  .refine((v) => v.newPassword === v.confirmation, {
    path: ['confirmation'],
    message: 'Les deux saisies ne correspondent pas',
  });

export const emailChangeSchema = z.object({
  newEmail: z.string().trim().email('Adresse email invalide'),
  currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
});

export const codeSchema = z.object({ code });

/**
 * Error message of an account screen. The server writes its refusals in French (RFC 7807,
 * `detail`): wrong password, expired code, exact waiting time of a 429. We show them as
 * is rather than rewriting them less precisely.
 */
export function accountErrorMessage(error: unknown): string | null {
  if (error == null) {
    return null;
  }
  if (classifyError(error) === 'offline') {
    return 'Serveur injoignable. Vérifie ta connexion et réessaie.';
  }
  if (error instanceof ApiError && error.status >= 500) {
    return 'Le serveur ne répond pas. Réessaie dans un instant.';
  }
  return error instanceof ApiError ? error.message : 'Cette demande n’a pas abouti. Réessaie.';
}

/** Updates the user displayed everywhere (session store + `['me']` cache). */
function useStoreUser() {
  const queryClient = useQueryClient();
  return (user: User) => {
    useAuthStore.getState().setUser(user);
    queryClient.setQueryData(['me'], user);
  };
}

/** #73. The HTTP client stores the fresh session returned by the server (see SESSION_PATHS). */
export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      api<AuthResponse>('/api/v1/users/me/password', { method: 'POST', body: input }),
  });
}

/** #74. Always 202: the screen can't (and mustn't) know whether the address has an account. */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (input: { email: string }) =>
      api<void>('/api/v1/auth/password-resets', { method: 'POST', body: input, auth: false }),
  });
}

export function useConfirmPasswordReset() {
  return useMutation({
    mutationFn: (input: { email: string; code: string; newPassword: string }) =>
      api<void>('/api/v1/auth/password-reset-confirmations', {
        method: 'POST',
        body: input,
        auth: false,
      }),
  });
}

export function useRequestEmailVerification() {
  return useMutation({
    mutationFn: () => api<void>('/api/v1/users/me/email-verifications', { method: 'POST' }),
  });
}

export function useConfirmEmailVerification() {
  const storeUser = useStoreUser();
  return useMutation({
    mutationFn: (input: { code: string }) =>
      api<User>('/api/v1/users/me/email-verification-confirmations', { method: 'POST', body: input }),
    onSuccess: storeUser,
  });
}

export function useRequestEmailChange() {
  return useMutation({
    mutationFn: (input: { newEmail: string; currentPassword: string }) =>
      api<void>('/api/v1/users/me/email-changes', { method: 'POST', body: input }),
  });
}

export function useConfirmEmailChange() {
  const storeUser = useStoreUser();
  return useMutation({
    mutationFn: (input: { code: string }) =>
      api<User>('/api/v1/users/me/email-change-confirmations', { method: 'POST', body: input }),
    onSuccess: storeUser,
  });
}

/**
 * Display name (#7). Empty = removed: the server stores `null` and the app falls back to
 * "—" and to the email's initial for the avatar.
 */
export const displayNameSchema = z.object({
  displayName: z.string().trim().max(80, '80 caractères au plus'),
});

export function useUpdateDisplayName() {
  const storeUser = useStoreUser();
  return useMutation({
    mutationFn: (input: { displayName: string }) =>
      api<User>('/api/v1/users/me', { method: 'PATCH', body: input }),
    onSuccess: storeUser,
  });
}

