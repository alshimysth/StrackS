/**
 * ErrorState — un appel a échoué et il n'y a rien à afficher à la place.
 *
 * Le message n'est pas choisi par l'appelant mais dérivé de l'erreur elle-même
 * (`classifyError`) : c'est ce qui garantit qu'un écran hors ligne dit « pas de
 * connexion » partout, et jamais « erreur serveur ». Un écran qui a du cache à
 * montrer ne doit PAS utiliser ce composant — il affiche le cache et le date
 * (voir `OfflineBanner`).
 */
import React from 'react';

import { classifyError, errorCopy, type ErrorKind } from '../../core/api/error-kind';
import { Button } from './Button';
import { StateView } from './StateView';

interface Props {
  error: unknown;
  onRetry?: () => void;
  testID?: string;
}

/** Se reconnecter n'est pas « réessayer » : le bouton n'aurait aucun effet. */
function isRetryable(kind: ErrorKind): boolean {
  return kind !== 'unauthorized';
}

export function ErrorState({ error, onRetry, testID }: Props) {
  const kind = classifyError(error);
  const copy = errorCopy[kind];

  return (
    <StateView
      testID={testID ?? `error-state-${kind}`}
      title={copy.title}
      message={copy.message}
      action={
        onRetry != null && isRetryable(kind) ? (
          <Button variant="secondary" onPress={onRetry}>
            Réessayer
          </Button>
        ) : undefined
      }
    />
  );
}
