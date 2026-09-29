/**
 * Monitoring des erreurs mobile (lot 5) — Sentry, **désactivé tant qu'aucun DSN n'est
 * fourni** (`EXPO_PUBLIC_SENTRY_DSN`). Aucun compte n'est créé par le code : le brancher
 * est une décision humaine (voir `docs/release/RUNBOOK.md`).
 *
 * Réglages de confidentialité, non négociables :
 *  - `sendDefaultPii: false` : ni IP, ni identifiant d'utilisateur ;
 *  - aucune trace de performance, aucun replay de session ;
 *  - chaque événement et chaque fil d'Ariane passent par `scrub` (positions, emails,
 *    jetons, codes retirés), et les URL perdent leur chaîne de requête.
 */
import * as Sentry from '@sentry/react-native';
import type React from 'react';

import { scrub, stripQuery } from './scrub';

let enabled = false;

export function initMonitoring(dsn: string | undefined = process.env.EXPO_PUBLIC_SENTRY_DSN): boolean {
  if (dsn == null || dsn.trim() === '') {
    enabled = false;
    return false;
  }
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    enableAutoSessionTracking: true,
    environment: __DEV__ ? 'development' : 'production',
    beforeSend(event) {
      // Contexte libre ajouté par un appelant : rien ne garantit ce qu'il contient.
      // Il ne part pas ; l'exception, la pile et le contexte technique suffisent.
      delete event.extra;
      const clean = scrub(event);
      if (clean.request?.url != null) {
        clean.request = { ...clean.request, url: stripQuery(clean.request.url) };
      }
      delete clean.user;
      return clean;
    },
    beforeBreadcrumb(breadcrumb) {
      const clean = scrub(breadcrumb);
      if (typeof clean.data?.url === 'string') {
        clean.data = { ...clean.data, url: stripQuery(clean.data.url) };
      }
      return clean;
    },
  });
  enabled = true;
  return true;
}

export function monitoringEnabled(): boolean {
  return enabled;
}

/** Enveloppe le composant racine : sans DSN, rend le composant tel quel. */
export function withMonitoring(Component: React.ComponentType): React.ComponentType {
  return enabled ? (Sentry.wrap(Component as React.ComponentType<Record<string, unknown>>) as React.ComponentType) : Component;
}
