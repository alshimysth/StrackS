/**
 * Hooks d'authentification (TanStack Query) — mêmes contrats que l'ancien
 * backend Spring, servis aujourd'hui par Quarkus.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { api } from './client';
import { useAuthStore } from '../auth/use-auth-store';
import type { AuthResponse, User } from '../../types/api';

export const loginSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

export const registerSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(8, 'Au moins 8 caractères'),
  displayName: z.string().max(80).optional(),
});

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: (input: z.infer<typeof loginSchema>) =>
      api<AuthResponse>('/api/v1/auth/login', { method: 'POST', body: input, auth: false }),
    onSuccess: ({ token, user }) => setAuth(token, user),
  });
}

export function useRegister() {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: (input: z.infer<typeof registerSchema>) =>
      api<AuthResponse>('/api/v1/auth/register', { method: 'POST', body: input, auth: false }),
    onSuccess: ({ token, user }) => setAuth(token, user),
  });
}

export function useProfile() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<User>('/api/v1/users/me'),
    enabled: token != null,
  });
}

export function useDeleteAccount() {
  const logout = useAuthStore((s) => s.logout);
  return useMutation({
    mutationFn: () => api<void>('/api/v1/users/me', { method: 'DELETE' }),
    onSuccess: () => logout(),
  });
}
