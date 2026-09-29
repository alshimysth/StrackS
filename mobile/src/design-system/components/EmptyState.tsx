/**
 * EmptyState: no data to show.
 *
 * Two cases the design explicitly distinguishes and that must not be confused:
 *
 * - `initial`: the user hasn't created anything. It's an invitation to start.
 * - `filtered`: they have data, but their filter doesn't reach it. Offering "start your
 *   first session" here would be wrong and vaguely insulting: they already have some. The
 *   useful way out is clearing the filter.
 */
import React, { type ReactNode } from 'react';

import { Icon } from './Icon';
import { StateView } from './StateView';
import { useTheme } from '../use-theme';

interface Props {
  variant?: 'initial' | 'filtered';
  title: string;
  message?: string;
  action?: ReactNode;
  testID?: string;
}

export function EmptyState({ variant = 'initial', title, message, action, testID }: Props) {
  const theme = useTheme();
  return (
    <StateView
      glyph={<Icon name="state-empty" color={theme.textTertiary} size="xl" />}
      testID={testID ?? `empty-state-${variant}`}
      title={title}
      message={message}
      action={action}
    />
  );
}
