/**
 * ErrorState: a call failed and there's nothing to show instead.
 *
 * The message isn't chosen by the caller but derived from the error itself
 * (`classifyError`): that's what guarantees an offline screen says "no connection"
 * everywhere, and never "server error". A screen with cached data to show must NOT use
 * this component: it shows the cache and dates it (see `OfflineBanner`).
 */
import React from 'react';

import { classifyError, errorCopy, type ErrorKind } from '../../core/api/error-kind';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { StateView } from './StateView';
import { useTheme } from '../use-theme';

/** The pictogram states the nature of the problem before the text: network, server, or other (#39). */
const KIND_ICON: Record<ErrorKind, IconName> = {
  offline: 'state-offline',
  server: 'state-server-error',
  unauthorized: 'state-warning',
  'rate-limited': 'state-warning',
  client: 'state-warning',
};

interface Props {
  error: unknown;
  onRetry?: () => void;
  testID?: string;
}

/** Logging in again isn't "retrying": the button would have no effect. */
function isRetryable(kind: ErrorKind): boolean {
  return kind !== 'unauthorized';
}

export function ErrorState({ error, onRetry, testID }: Props) {
  const theme = useTheme();
  const kind = classifyError(error);
  const copy = errorCopy[kind];

  return (
    <StateView
      testID={testID ?? `error-state-${kind}`}
      title={copy.title}
      message={copy.message}
      glyph={<Icon name={KIND_ICON[kind]} color={theme.textTertiary} size="xl" />}
      action={
        onRetry != null && isRetryable(kind) ? (
          <Button variant="secondary" icon="action-retry" onPress={onRetry}>
            Réessayer
          </Button>
        ) : undefined
      }
    />
  );
}
