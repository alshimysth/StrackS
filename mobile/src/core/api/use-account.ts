/**
 * Sécurité du compte (#73, #74, #75, #76) : mot de passe, email, export.
 *
 * Les codes à usage unique arrivent par email. Le serveur tolère minuscules, espaces et
 * tirets : l'écran transmet ce que l'utilisateur a tapé, sans le reformater.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { ApiError, api } from './client';
import { classifyError } from './error-kind';
import { useAuthStore } from '../auth/use-auth-store';
import type { AuthResponse, User } from '../../types/api';

/** Même règle que l'inscription et que le backend (`@Size(min = 8)`). */
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
 * Message d'erreur d'un écran de compte. Le serveur rédige ses refus en français
 * (RFC 7807, `detail`) : mauvais mot de passe, code expiré, délai d'attente précis d'un
 * 429. On les affiche tels quels plutôt que de les réécrire moins précisément.
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

/** Met à jour l'utilisateur affiché partout (store de session + cache `['me']`). */
function useStoreUser() {
  const queryClient = useQueryClient();
  return (user: User) => {
    useAuthStore.getState().setUser(user);
    queryClient.setQueryData(['me'], user);
  };
}

/** #73. Le client HTTP range la session neuve rendue par le serveur (voir SESSION_PATHS). */
export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      api<AuthResponse>('/api/v1/users/me/password', { method: 'POST', body: input }),
  });
}

/** #74. Toujours 202 : l'écran ne peut pas — et ne doit pas — savoir si l'adresse a un compte. */
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
