/**
 * Préférence de thème (#31).
 *
 * Le point le plus fragile n'est pas la sélection mais son ORDRE DE PRIORITÉ :
 * `ThemeOverride` doit primer sur la préférence, sinon quelqu'un ayant choisi « clair »
 * verrait l'écran de tracking s'éclaircir — or ce sombre est le mode « plein soleil »,
 * lisible bras tendu en extérieur. C'est explicitement dans la DoD.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';
import { Text } from 'react-native';

import { DEFAULT_PREFERENCES } from '../../core/preferences/schema';
import { QUERY_KEY } from '../../core/preferences/use-preferences';
import { darkTheme, lightTheme } from '../theme';
import { ThemeOverride, useTheme } from '../use-theme';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => 'light',
}));

/**
 * Aucun appel réseau : le cache est prérempli par `setQueryData`. Sans ce mock, la
 * requête part pour de bon, se prend un 401 et déclenche une déconnexion — jusqu'à
 * faire tomber le processus jest sur le rejet non capturé du secure-store.
 */
jest.mock('../../core/api/client', () => ({
  ...jest.requireActual('../../core/api/client'),
  api: jest.fn().mockRejectedValue(new Error('aucun appel attendu dans ce test')),
}));

let client: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Rend la clé du thème effectif : le test n'assume aucune couleur précise. */
function Probe() {
  const theme = useTheme();
  const name = theme === darkTheme ? 'dark' : theme === lightTheme ? 'light' : '?';
  return <Text testID="probe">{name}</Text>;
}

function setPreference(theme: 'auto' | 'light' | 'dark') {
  client.setQueryData(QUERY_KEY, { ...DEFAULT_PREFERENCES, theme });
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

afterEach(() => {
  client.unmount();
  client.clear();
});

describe('useTheme', () => {
  it('suit le système en mode auto', async () => {
    setPreference('auto');
    await render(<Probe />, { wrapper: Wrapper });
    expect(screen.getByTestId('probe')).toHaveTextContent('light');
  });

  it('applique la préférence sombre malgré un système clair', async () => {
    setPreference('dark');
    await render(<Probe />, { wrapper: Wrapper });
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');
  });

  it('applique la préférence claire', async () => {
    setPreference('light');
    await render(<Probe />, { wrapper: Wrapper });
    expect(screen.getByTestId('probe')).toHaveTextContent('light');
  });

  /** Le cœur de la DoD : le tracking reste sombre quel que soit le réglage. */
  it('laisse ThemeOverride primer sur la préférence claire', async () => {
    setPreference('light');
    await render(
      <ThemeOverride theme={darkTheme}>
        <Probe />
      </ThemeOverride>,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');
  });

  /** Sans préférence chargée, on retombe sur le comportement d'avant #31. */
  it('retombe sur le système quand rien n’est chargé', async () => {
    await render(<Probe />, { wrapper: Wrapper });
    expect(screen.getByTestId('probe')).toHaveTextContent('light');
  });
});
