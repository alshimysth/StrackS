/**
 * Écran Statistiques — les comportements que la DoD de #24 rend obligatoires.
 *
 * Deux exigences y sont vérifiées littéralement :
 *  - « les chiffres affichés correspondent exactement à la réponse de /stats/summary » ;
 *  - « l'écran reste correct quand un sport n'a aucune séance sur la période ».
 */
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import StatsScreen from '../(tabs)/stats';
import { ApiError } from '../../core/api/client';
import type { SportTypeDescriptor, StatsSummary, StatsTimeline } from '../../types/api';

const mockApi = jest.fn();

jest.mock('../../core/api/client', () => ({
  ...jest.requireActual('../../core/api/client'),
  api: (...args: unknown[]) => mockApi(...args),
}));

/** Minuit local — c'est ce que le serveur renvoie, ayant reçu le fuseau du client. */
const localMidnight = (year: number, month: number, day: number) =>
  new Date(year, month, day).toISOString();

function summary(overrides: Partial<StatsSummary> = {}): StatsSummary {
  return {
    from: localMidnight(2026, 6, 1),
    to: localMidnight(2026, 7, 1),
    bySport: [
      {
        sportType: 'running',
        label: 'Course à pied',
        sessions: 18,
        totalDurationS: 41_400,
        totals: { distanceM: 107_500, elevationGainM: 980 },
      },
      {
        sportType: 'walking',
        label: 'Marche',
        sessions: 8,
        totalDurationS: 8_040,
        totals: { distanceM: 30_300, elevationGainM: 304 },
      },
    ],
    totalSessions: 26,
    totalDurationS: 49_440,
    totals: { distanceM: 137_800, elevationGainM: 1284 },
    previous: { sessions: 23, durationS: 41_200, totals: { distanceM: 123_000 } },
    ...overrides,
  };
}

function timeline(overrides: Partial<StatsTimeline> = {}): StatsTimeline {
  return {
    from: localMidnight(2026, 6, 1),
    to: localMidnight(2026, 7, 1),
    bucket: 'week',
    buckets: [
      {
        start: localMidnight(2026, 5, 29),
        end: localMidnight(2026, 6, 6),
        bySport: [
          { sportType: 'running', sessions: 3, durationS: 7200, distanceM: 18_000 },
          { sportType: 'walking', sessions: 1, durationS: 1800, distanceM: 6_300 },
        ],
      },
      // Semaine sans séance : elle existe et vaut zéro.
      { start: localMidnight(2026, 6, 6), end: localMidnight(2026, 6, 13), bySport: [] },
      {
        start: localMidnight(2026, 6, 13),
        end: localMidnight(2026, 6, 20),
        bySport: [{ sportType: 'running', sessions: 5, durationS: 12_000, distanceM: 31_600 }],
      },
    ],
    ...overrides,
  };
}

const SPORTS: SportTypeDescriptor[] = [
  { code: 'running', label: 'Course à pied', usesGps: true, schemaVersion: 1 },
  { code: 'walking', label: 'Marche', usesGps: true, schemaVersion: 1 },
];

/** Route par URL : l'écran émet trois appels — sports, résumé et découpage. */
function respond(handler: (path: string) => unknown) {
  mockApi.mockImplementation((path: string) => {
    if (path.startsWith('/api/v1/sport-types')) return Promise.resolve(SPORTS);
    const result = handler(path);
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  });
}

function respondOk(s: StatsSummary = summary(), t: StatsTimeline = timeline()) {
  respond((path) => (path.includes('/timeline') ? t : s));
}

let client: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const renderScreen = () => render(<StatsScreen />, { wrapper: Wrapper });

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  onlineManager.setOnline(true);
});

afterEach(() => {
  client.unmount();
  client.clear();
});

describe('Statistiques — DoD #24', () => {
  /**
   * Le cœur de la DoD : aucun chiffre n'est recalculé côté client. La distance
   * affichée est celle de `totals.distanceM`, pas la somme des barres du graphique.
   */
  it('affiche exactement les chiffres de /stats/summary', async () => {
    respondOk();
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('stats-screen')).toBeOnTheScreen());
    expect(screen.getByText('137,80')).toBeOnTheScreen(); // 137 800 m
    expect(screen.getByText('26')).toBeOnTheScreen(); // séances
    expect(screen.getByText('13:44:00')).toBeOnTheScreen(); // 49 440 s
    expect(screen.getByText('1284')).toBeOnTheScreen(); // D+
  });

  it('compare à la période précédente sans recalculer l’évolution ailleurs', async () => {
    respondOk();
    await renderScreen();

    // Chaque carte porte SA comparaison, pas une évolution globale recopiée :
    // distance 137 800 vs 123 000 → + 12 % ; durée 49 440 s vs 41 200 → + 20 % ;
    // séances 26 vs 23 → + 3, en écart brut car un pourcentage y parle moins.
    await waitFor(() => expect(screen.getByText('+ 12 %')).toBeOnTheScreen());
    expect(screen.getByText('+ 20 %')).toBeOnTheScreen();
    expect(screen.getByText('+ 3')).toBeOnTheScreen();
  });

  /**
   * Une période précédente vide ne donne pas « +100 % » : le taux n'est pas
   * défini, et le PRD interdit d'afficher un chiffre inventé.
   */
  it('n’affiche aucune évolution quand la période précédente est vide', async () => {
    respondOk(summary({ previous: { sessions: 0, durationS: 0, totals: {} } }));
    await renderScreen();

    await waitFor(() => expect(screen.getByText('137,80')).toBeOnTheScreen());
    expect(screen.queryByText(/%$/)).toBeNull();
    expect(screen.queryByText(/^\+ \d+$/)).toBeNull();
  });

  // ------------------------------------------------------------------
  // « L'écran reste correct quand un sport n'a aucune séance sur la période »
  // ------------------------------------------------------------------

  it('affiche un vide explicite quand la période n’a aucune séance', async () => {
    respondOk(
      summary({ bySport: [], totalSessions: 0, totalDurationS: 0, totals: {} }),
      timeline({ buckets: [] }),
    );
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('empty-state-filtered')).toBeOnTheScreen());
    expect(screen.getByText('Aucune séance sur cette période')).toBeOnTheScreen();
  });

  /**
   * Le socle backend ne nomme que séances et durée ; distance et dénivelé sont
   * déclarés par les plugins. Un sport sans distance ne fait donc pas apparaître
   * de carte « Distance » vide, ni un « 0 km » qui serait faux (#46).
   */
  it('n’affiche que les métriques réellement déclarées par les sports', async () => {
    respondOk(
      summary({
        bySport: [
          {
            sportType: 'strength',
            label: 'Musculation',
            sessions: 4,
            totalDurationS: 7200,
            totals: {},
          },
        ],
        totalSessions: 4,
        totalDurationS: 7200,
        totals: {},
        previous: { sessions: 2, durationS: 3600, totals: {} },
      }),
      timeline({ buckets: [] }),
    );
    await renderScreen();

    await waitFor(() => expect(screen.getByText('Musculation')).toBeOnTheScreen());
    expect(screen.getByText('Séances')).toBeOnTheScreen();
    expect(screen.getByText('Temps actif')).toBeOnTheScreen();
    expect(screen.queryByText('Distance')).toBeNull();
    expect(screen.queryByText('Dénivelé +')).toBeNull();
  });

  it('marque d’un tiret un sport sans distance dans le détail par sport', async () => {
    respondOk(
      summary({
        bySport: [
          {
            sportType: 'strength',
            label: 'Musculation',
            sessions: 4,
            totalDurationS: 7200,
            totals: {},
          },
        ],
        totalSessions: 4,
        totalDurationS: 7200,
        totals: {},
      }),
      timeline({ buckets: [] }),
    );
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('sport-row-strength')).toBeOnTheScreen());
    expect(screen.getByText('—')).toBeOnTheScreen();
  });

  // ------------------------------------------------------------------
  // Agrégation serveur
  // ------------------------------------------------------------------

  /**
   * Décision du 2026-08-10 : le découpage hebdomadaire est calculé par le serveur.
   * L'écran ne doit jamais rapatrier l'historique pour l'agréger lui-même — ce qui
   * annulerait la pagination et ferait exploser le budget de #28.
   */
  it('n’appelle jamais /activities', async () => {
    respondOk();
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('distance-chart')).toBeOnTheScreen());
    const paths = mockApi.mock.calls.map(([path]) => path as string);
    expect(paths.some((p) => p.includes('/api/v1/stats/summary'))).toBe(true);
    expect(paths.some((p) => p.includes('/api/v1/stats/timeline'))).toBe(true);
    expect(paths.some((p) => p.includes('/api/v1/activities'))).toBe(false);
  });

  it('envoie la période choisie au serveur plutôt que de filtrer sur place', async () => {
    respondOk();
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('stats-screen')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('chip-year'));

    await waitFor(() => {
      const paths = mockApi.mock.calls.map(([path]) => path as string);
      expect(paths.some((p) => p.includes('period=year'))).toBe(true);
    });
  });

  it('envoie le fuseau de l’appareil, pour que les semaines soient les siennes', async () => {
    respondOk();
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('stats-screen')).toBeOnTheScreen());
    const statsCalls = mockApi.mock.calls
      .map(([path]) => path as string)
      .filter((p) => p.includes('/api/v1/stats/'));
    expect(statsCalls.length).toBeGreaterThan(0);
    expect(statsCalls.every((p) => p.includes('tz='))).toBe(true);
  });

  /**
   * Le filtre sport part au serveur comme la période. L'appliquer sur place
   * supposerait d'avoir rapatrié les séances — exactement ce que cet écran évite.
   */
  it('envoie le filtre sport au serveur', async () => {
    respondOk();
    await renderScreen();
    // Les puces sport viennent du registre : elles n'existent qu'une fois
    // /sport-types résolu, après le premier rendu de l'écran.
    await waitFor(() => expect(screen.getByTestId('chip-walking')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('chip-walking'));

    await waitFor(() => {
      const paths = mockApi.mock.calls.map(([path]) => path as string);
      expect(paths.some((p) => p.includes('/stats/summary') && p.includes('sport=walking')))
        .toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // Navigation de période
  // ------------------------------------------------------------------

  it('recule d’une période et redemande au serveur', async () => {
    respondOk();
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('stats-screen')).toBeOnTheScreen());

    const before = mockApi.mock.calls.length;
    await fireEvent.press(screen.getByTestId('period-prev'));

    await waitFor(() => {
      const paths = mockApi.mock.calls.slice(before).map(([path]) => path as string);
      expect(paths.some((p) => p.includes('from='))).toBe(true);
    });
  });

  /** Avancer au-delà de la période courante mènerait à un écran vide inexplicable. */
  it('désactive l’avance tant que la période suivante n’a pas commencé', async () => {
    respondOk();
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('stats-screen')).toBeOnTheScreen());
    expect(screen.getByTestId('period-next')).toBeDisabled();
  });

  // ------------------------------------------------------------------
  // États système (#41)
  // ------------------------------------------------------------------

  it('affiche l’erreur serveur quand il n’y a rien à montrer', async () => {
    respond(() => new ApiError({ title: 'Panne', status: 503, detail: 'indisponible' }));
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('error-state-server')).toBeOnTheScreen());
  });

  it('parle de connexion, pas de panne, quand la requête n’aboutit pas', async () => {
    respond(() => new TypeError('Network request failed'));
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('error-state-offline')).toBeOnTheScreen());
  });

  /**
   * Le graphique est secondaire : s'il échoue seul, les totaux restent lisibles.
   * Remplacer tout l'écran par une erreur priverait l'utilisateur de chiffres
   * parfaitement valides.
   */
  it('garde les totaux quand seul le découpage échoue', async () => {
    respond((path) =>
      path.includes('/timeline')
        ? new ApiError({ title: 'Panne', status: 503, detail: 'indisponible' })
        : summary(),
    );
    await renderScreen();

    await waitFor(() => expect(screen.getByText('137,80')).toBeOnTheScreen());
    expect(screen.queryByTestId('error-state-server')).toBeNull();
  });
});
