/**
 * Theme preference (#31).
 *
 * The most fragile point isn't the selection but its PRIORITY ORDER: `ThemeOverride`
 * must win over the preference, otherwise someone who chose "light" would see the tracking
 * screen lighten, whereas that dark theme is the "full sun" mode, readable at arm's length
 * outdoors. It's explicitly in the DoD.
 */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';
import { Text } from 'react-native';

import { DEFAULT_PREFERENCES } from '../../core/preferences/schema';
import { QUERY_KEY } from '../../core/preferences/use-preferences';
import { darkTheme, lightTheme } from '../theme';
import { ThemeOverride, useTheme } from '../use-theme';
import { createTestQueryClient } from '../../test-support/query-client';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => 'light',
}));

/**
 * No network call: the cache is prefilled with `setQueryData`. Without this mock, the
 * request really goes out, gets a 401 and triggers a logout, to the point of bringing the
 * jest process down on the secure-store's unhandled rejection.
 */
jest.mock('../../core/api/client', () => ({
  ...jest.requireActual('../../core/api/client'),
  api: jest.fn().mockRejectedValue(new Error('aucun appel attendu dans ce test')),
}));

let client: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Returns the key of the effective theme: the test assumes no specific colour. */
function Probe() {
  const theme = useTheme();
  const name = theme === darkTheme ? 'dark' : theme === lightTheme ? 'light' : '?';
  return <Text testID="probe">{name}</Text>;
}

function setPreference(theme: 'auto' | 'light' | 'dark') {
  client.setQueryData(QUERY_KEY, { ...DEFAULT_PREFERENCES, theme });
}

beforeEach(() => {
  client = createTestQueryClient();
});

afterEach(() => {
  client.unmount();
  client.clear();
});

describe('useTheme', () => {
  it('follows the system in auto mode', async () => {
    setPreference('auto');
    await render(<Probe />, { wrapper: Wrapper });
    expect(screen.getByTestId('probe')).toHaveTextContent('light');
  });

  it('applies the dark preference despite a light system', async () => {
    setPreference('dark');
    await render(<Probe />, { wrapper: Wrapper });
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');
  });

  it('applies the light preference', async () => {
    setPreference('light');
    await render(<Probe />, { wrapper: Wrapper });
    expect(screen.getByTestId('probe')).toHaveTextContent('light');
  });

  /** The heart of the DoD: tracking stays dark whatever the setting. */
  it('lets ThemeOverride win over the light preference', async () => {
    setPreference('light');
    await render(
      <ThemeOverride theme={darkTheme}>
        <Probe />
      </ThemeOverride>,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');
  });

  /** Without a loaded preference, we fall back to the behaviour from before #31. */
  it('falls back to the system when nothing is loaded', async () => {
    await render(<Probe />, { wrapper: Wrapper });
    expect(screen.getByTestId('probe')).toHaveTextContent('light');
  });
});
