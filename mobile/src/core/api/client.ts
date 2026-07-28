/**
 * Client HTTP du socle : base URL + Bearer automatique + erreurs RFC 7807.
 * Les modules de sport ne parlent JAMAIS directement à l'API : ils passent
 * par les hooks de core/.
 */
import { useAuthStore } from '../auth/use-auth-store';
import { API_BASE_URL } from './config';
import type { Problem } from '../../types/api';

export class ApiError extends Error {
  readonly status: number;
  readonly title: string;

  constructor(problem: Problem) {
    super(problem.detail || problem.title);
    this.status = problem.status;
    this.title = problem.title;
  }
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (auth) {
    const token = useAuthStore.getState().token;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && auth) {
    // Token expiré ou invalide : retour à l'écran de connexion
    useAuthStore.getState().logout();
  }

  if (!response.ok) {
    let problem: Problem = {
      title: 'Erreur réseau',
      status: response.status,
      detail: `Réponse ${response.status}`,
    };
    try {
      problem = { ...problem, ...(await response.json()) };
    } catch {
      // corps non JSON : on garde le problème générique
    }
    throw new ApiError(problem);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
