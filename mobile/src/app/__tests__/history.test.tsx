/**
 * Écran Historique — les comportements que les DoD du lot E rendent obligatoires.
 *
 * Ce test vise les décisions de conception, pas la mise en page : quel état s'affiche
 * dans quelle situation, et ce que le serveur reçoit réellement quand on filtre.
 */
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import HistoryScreen from '../(tabs)/history';
import { ApiError } from '../../core/api/client';
import type { Activity, Page, SportTypeDescriptor } from '../../types/api';

const mockApi = jest.fn();

// `ApiError` reste la vraie classe : `classifyError` s'appuie sur `instanceof`,
// et un mock complet du module ferait basculer toute erreur en « hors ligne ».
jest.mock('../../core/api/client', () => ({
  ...jest.requireActual('../../core/api/client'),
  api: (...args: unknown[]) => mockApi(...args),
}));

const SPORTS: SportTypeDescriptor[] = [
  { code: 'running', label: 'Course', usesGps: true, schemaVersion: 1 },
  { code: 'walking', label: 'Marche', usesGps: true, schemaVersion: 1 },
];

function activity(id: string, startedAt = '2026-08-12T08:00:00.000Z'): Activity {
  return {
    id,
    sportType: 'running',
    status: 'completed',
    startedAt,
    endedAt: startedAt,
    durationS: 1800,
    distanceM: 5000,
    calories: null,
    notes: null,
    metrics: {},
  };
}

function pageOf(items: Activity[], total = items.length): Page<Activity> {
  return { items, page: 0, size: 20, total };
}

/** Route les appels par URL : l'écran en émet deux (sports puis activités). */
function respond(handler: (path: string) => unknown) {
  mockApi.mockImplementation((path: string) => {
    if (path.startsWith('/api/v1/sport-types')) return Promise.resolve(SPORTS);
    const result = handler(path);
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  });
}

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const renderScreen = () => render(<HistoryScreen />, { wrapper: Wrapper });

beforeEach(() => {
  onlineManager.setOnline(true);
});

describe('Historique — états système', () => {
  it('affiche le vide initial quand l’utilisateur n’a aucune séance', async () => {
    respond(() => pageOf([]));
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('empty-state-initial')).toBeOnTheScreen());
    expect(screen.getByText('Pas encore de séance')).toBeOnTheScreen();
  });

  /**
   * Vide initial ≠ vide après filtrage : proposer « démarre ta première séance » à
   * quelqu'un qui en a déjà des dizaines mais dont le filtre ne remonte rien est faux.
   */
  it('distingue le vide après filtrage du vide initial', async () => {
    respond((path) => (path.includes('sport=walking') ? pageOf([]) : pageOf([activity('a')])));
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('history-list')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('chip-walking'));

    await waitFor(() => expect(screen.getByTestId('empty-state-filtered')).toBeOnTheScreen());
    expect(screen.queryByTestId('empty-state-initial')).toBeNull();
  });

  it('rend les filtres effaçables depuis le vide filtré', async () => {
    respond((path) => (path.includes('sport=walking') ? pageOf([]) : pageOf([activity('a')])));
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('history-list')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('chip-walking'));
    await waitFor(() => expect(screen.getByTestId('empty-state-filtered')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('reset-filters'));
    await waitFor(() => expect(screen.getByTestId('history-list')).toBeOnTheScreen());
  });

  it('affiche l’erreur serveur quand il n’y a rien à montrer', async () => {
    respond(() => new ApiError({ title: 'Panne', status: 503, detail: 'indisponible' }));
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('error-state-server')).toBeOnTheScreen());
  });

  /** Sans réponse du serveur, le message doit parler réseau et non panne applicative. */
  it('parle de connexion, pas de panne, quand la requête n’aboutit pas', async () => {
    respond(() => new TypeError('Network request failed'));
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('error-state-offline')).toBeOnTheScreen());
    expect(screen.getByText('Pas de connexion')).toBeOnTheScreen();
  });
});

describe('Historique — filtrage serveur (DoD #23)', () => {
  it('demande le filtre au backend plutôt que de trier la page reçue', async () => {
    respond(() => pageOf([activity('a')]));
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('history-list')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('chip-walking'));

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(expect.stringContaining('sport=walking')),
    );
  });

  it('borne la période côté serveur', async () => {
    respond(() => pageOf([activity('a')]));
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('history-list')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('chip-week'));

    await waitFor(() => expect(mockApi).toHaveBeenCalledWith(expect.stringContaining('from=')));
  });
});

describe('Historique — hors ligne (DoD #27)', () => {
  /**
   * Le cœur de la règle du lot E : hors ligne n'est pas une erreur. Tant qu'il reste
   * des données, on les montre — datées — au lieu de vider l'écran.
   */
  it('garde les données visibles et les date au lieu d’afficher une erreur', async () => {
    respond(() => pageOf([activity('a')]));
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('history-list')).toBeOnTheScreen());

    // `onlineManager` notifie hors du cycle React : sans `act`, le re-rendu qu'il
    // déclenche part en avertissement au lieu d'être attendu par le test.
    await act(async () => {
      onlineManager.setOnline(false);
    });

    await waitFor(() => expect(screen.getByTestId('offline-banner')).toBeOnTheScreen());
    expect(screen.getByTestId('history-list')).toBeOnTheScreen();
    expect(screen.queryByTestId('error-state-offline')).toBeNull();
  });

  it('n’affiche aucun bandeau tant que le réseau est là', async () => {
    respond(() => pageOf([activity('a')]));
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('history-list')).toBeOnTheScreen());
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });
});
