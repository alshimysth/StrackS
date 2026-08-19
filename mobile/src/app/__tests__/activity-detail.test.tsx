/**
 * Écran de détail d'une activité (#6) et suppression confirmée (#26).
 *
 * Ce test vise les critères d'acceptation : le détail s'ouvre et affiche les
 * métriques, la suppression exige une confirmation, et l'écran ne se quitte
 * qu'une fois le serveur d'accord.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';
import { Alert } from 'react-native';

import ActivityDetailScreen from '../activity/[id]';
import { ApiError } from '../../core/api/client';
import type { Activity } from '../../types/api';

const mockApi = jest.fn();
const mockBack = jest.fn();

jest.mock('../../core/api/client', () => ({
  ...jest.requireActual('../../core/api/client'),
  api: (...args: unknown[]) => mockApi(...args),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'act-1' }),
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
}));

// react-native-maps est natif : jest-expo ne le transforme pas.
jest.mock('react-native-maps', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: View, Polyline: View, Marker: View };
});

/**
 * Le registre de sports est stubé plutôt que chargé.
 *
 * L'écran de détail ne dépend des modules que par `SummaryPanel`, mais importer le
 * vrai registre tire tout le moteur de séance derrière lui — `SessionTrackingScreen`,
 * le buffer SQLite, l'uploader — pour un écran qui ne fait que lire. Sous jest cela
 * réclame `expo-sqlite` et laisse le worker ouvert après la suite.
 *
 * Ce que le stub vérifie reste l'essentiel : que le socle passe bien par le module du
 * sport au lieu de coder ses métriques en dur.
 */
jest.mock('../../sports/registry', () => {
  const { Text } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  const panel = ({ activity }: { activity: { sportType: string } }) =>
    React.createElement(Text, { testID: 'sport-panel' }, `panneau ${activity.sportType}`);
  return {
    sportRegistry: {
      running: { code: 'running', label: 'Course', SummaryPanel: panel },
      walking: { code: 'walking', label: 'Marche', SummaryPanel: panel },
    },
  };
});

const ACTIVITY: Activity = {
  id: 'act-1',
  sportType: 'running',
  status: 'completed',
  startedAt: '2026-08-14T09:30:00.000Z',
  endedAt: '2026-08-14T10:10:00.000Z',
  durationS: 2400,
  distanceM: 8000,
  calories: 520,
  title: null,
  notes: 'Vent de face au retour',
  metrics: {
    schemaVersion: 1,
    avgPaceSecPerKm: 300,
    splits: [
      { km: 1, paceSecPerKm: 298 },
      { km: 2, paceSecPerKm: 305 },
    ],
  },
};

function respond(overrides: { activity?: unknown; track?: unknown } = {}) {
  mockApi.mockImplementation((path: string) => {
    if (path.endsWith('/track-points')) {
      const track = overrides.track ?? [
        { seq: 0, recordedAt: ACTIVITY.startedAt, lat: 45.0, lng: 5.0, altitudeM: 200, accuracyM: 5 },
        { seq: 1, recordedAt: ACTIVITY.startedAt, lat: 45.01, lng: 5.0, altitudeM: 210, accuracyM: 5 },
      ];
      return track instanceof Error ? Promise.reject(track) : Promise.resolve(track);
    }
    const activity = overrides.activity ?? ACTIVITY;
    return activity instanceof Error ? Promise.reject(activity) : Promise.resolve(activity);
  });
}

/**
 * Le client est gardé pour être vidé après chaque test : react-query planifie des
 * timers de notification et de garbage-collection qui, laissés en vol, empêchent le
 * worker jest de rendre la main en fin de suite.
 */
let client: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const renderScreen = () => render(<ActivityDetailScreen />, { wrapper: Wrapper });

/**
 * Déclenche le bouton d'un `Alert.alert` par son libellé.
 *
 * Enveloppé dans `act` : le rappel lance une mutation, donc un rendu, et React n'a
 * aucun moyen de savoir qu'un appui de modale native vient de l'utilisateur.
 */
async function pressAlertButton(label: string) {
  const spy = Alert.alert as unknown as jest.Mock;
  const buttons = spy.mock.calls[spy.mock.calls.length - 1][2] as {
    text: string;
    onPress?: () => void;
  }[];
  const button = buttons.find((b) => b.text === label);
  await act(async () => {
    button?.onPress?.();
  });
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  client.unmount();
  client.clear();
});

describe('Détail d’activité (#6)', () => {
  it('affiche les métriques de la séance', async () => {
    respond();
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('activity-title')).toBeOnTheScreen());
    expect(screen.getByText('8,00')).toBeOnTheScreen(); // distance en km
    expect(screen.getByText('40:00')).toBeOnTheScreen(); // durée
    expect(screen.getByText('520')).toBeOnTheScreen(); // calories
  });

  it('affiche le libellé dérivé quand la séance n’a pas de titre', async () => {
    respond();
    await renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId('activity-title')).toHaveTextContent('Course du 14 août'),
    );
  });

  it('affiche le titre choisi quand il existe', async () => {
    respond({ activity: { ...ACTIVITY, title: 'Sortie longue' } });
    await renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId('activity-title')).toHaveTextContent('Sortie longue'),
    );
  });

  it('affiche le tracé et les splits', async () => {
    respond();
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('route-map')).toBeOnTheScreen());
    expect(screen.getByTestId('splits-list')).toBeOnTheScreen();
    expect(screen.getByTestId('split-1')).toBeOnTheScreen();
  });

  /** Le socle délègue les métriques propres au sport au module, jamais un `if`. */
  it('délègue le panneau spécifique au module de sport', async () => {
    respond();
    await renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId('sport-panel')).toHaveTextContent('panneau running'),
    );
  });

  /** Une séance de marche n'a pas de splits — la section ne doit pas apparaître vide. */
  it('n’affiche pas de section splits sans splits', async () => {
    respond({ activity: { ...ACTIVITY, sportType: 'walking', metrics: { schemaVersion: 1 } } });
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('activity-title')).toBeOnTheScreen());
    expect(screen.queryByTestId('splits-list')).toBeNull();
  });

  it('n’affiche pas de cadre de carte sans tracé', async () => {
    respond({ track: [] });
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('activity-title')).toBeOnTheScreen());
    expect(screen.queryByTestId('route-map')).toBeNull();
  });

  it('permet de revenir à l’historique', async () => {
    respond();
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('back')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('affiche un état d’erreur exploitable si la séance ne charge pas', async () => {
    respond({ activity: new ApiError({ title: 'Panne', status: 503, detail: 'ko' }) });
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('error-state-server')).toBeOnTheScreen());
  });
});

describe('Suppression (#26)', () => {
  it('ne supprime rien sans confirmation', async () => {
    respond();
    await renderScreen();
    await waitFor(() => expect(screen.getByText('Supprimer')).toBeOnTheScreen());

    await fireEvent.press(screen.getByText('Supprimer'));

    expect(Alert.alert).toHaveBeenCalled();
    expect(mockApi).not.toHaveBeenCalledWith(
      expect.stringContaining('act-1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('appelle le backend une fois la suppression confirmée', async () => {
    respond();
    await renderScreen();
    await waitFor(() => expect(screen.getByText('Supprimer')).toBeOnTheScreen());

    await fireEvent.press(screen.getByText('Supprimer'));
    mockApi.mockResolvedValueOnce(undefined);
    await pressAlertButton('Supprimer');

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        '/api/v1/activities/act-1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  /**
   * On ne quitte l'écran qu'après l'accord du serveur : sortir tout de suite puis
   * échouer ferait réapparaître la séance dans l'historique sans explication.
   */
  it('ne quitte pas l’écran si la suppression échoue', async () => {
    respond();
    await renderScreen();
    await waitFor(() => expect(screen.getByText('Supprimer')).toBeOnTheScreen());

    await fireEvent.press(screen.getByText('Supprimer'));
    mockApi.mockRejectedValueOnce(new ApiError({ title: 'Panne', status: 503, detail: 'ko' }));
    await pressAlertButton('Supprimer');

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Suppression impossible',
        expect.stringContaining('toujours là'),
      ),
    );
    expect(mockBack).not.toHaveBeenCalled();
  });
});
