/**
 * Mobile error monitoring (lot 5) with Sentry, **disabled until a DSN is provided**
 * (`EXPO_PUBLIC_SENTRY_DSN`). No account is created by the code: plugging it in is a
 * human decision (see `docs/release/RUNBOOK.md`).
 *
 * Privacy settings, non-negotiable:
 *  - `sendDefaultPii: false`: no IP, no user id;
 *  - no performance traces, no session replay;
 *  - every event and every breadcrumb goes through `scrub` (locations, emails, tokens,
 *    codes removed), and URLs lose their query string.
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
      // Free context added by a caller: nothing guarantees what it contains. It isn't
      // sent; the exception, stack and technical context are enough.
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

/** Wraps the root component: without a DSN, returns the component as is. */
export function withMonitoring(Component: React.ComponentType): React.ComponentType {
  return enabled ? (Sentry.wrap(Component as React.ComponentType<Record<string, unknown>>) as React.ComponentType) : Component;
}
