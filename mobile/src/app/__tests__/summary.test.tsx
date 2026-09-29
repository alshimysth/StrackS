/**
 * Écran de résumé : aucune célébration sur un cache d'avant la séance (#69).
 *
 * Les deux raisons de célébrer se lisent dans des caches partagés — la clé des totaux
 * de la semaine est celle de la carte d'objectif de l'accueil, la sonde « première
 * séance » a pu être remplie par un résumé précédent. Ces tests préremplissent ces
 * caches avec des données **antérieures à la séance**, comme l'accueil les aurait
 * laissées, et vérifient qu'aucun bandeau volt n'apparaît, pas même le temps d'un rendu.
 *
 * Le bandeau est remplacé par une sonde qui consigne chacun de ses rendus : une
 * assertion sur l'état final ne verrait pas un bandeau affiché puis retiré.
 */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import SummaryScreen from '../summary/[id]';
import { deviceTimeZone } from '../../core/api/use-stats';
import { QUERY_KEY as PREFERENCES_KEY } from '../../core/preferences/use-preferences';
import { DEFAULT_PREFERENCES } from '../../core/preferences/schema';
import { createTestQueryClient } from '../../test-support/query-client';
import type { Activity, Page, StatsSummary } from '../../types/api';

const mockApi = jest.fn();
const mockBannerRenders: string[] = [];
let mockBannerRecords: string[] | undefined;

jest.mock('../../core/api/client', () => ({
  ...jest.requireActual('../../core/api/client'),
  api: (...args: unknown[]) => mockApi(...args),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'act-4' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../design-system/components/CelebrationBanner', () => ({
  CelebrationBanner: ({ reason, records }: { reason: string; records?: string[] }) => {
    mockBannerRenders.push(reason);
    mockBannerRecords = records;
    return null;
  },
}));

/** Le corps du résumé (carte, splits, panneau de sport) n'est pas le sujet ici. */
jest.mock('../../core/activity/ActivityDetailBody', () => ({
  ActivityDetailBody: () => null,
}));

const NOW = Date.now();
/** La séance vient de se terminer : c'est l'instant qui départage les caches. */
const ENDED_AT_MS = NOW - 1_000;
const WEEK_FROM = new Date(NOW - 3 * 24 * 3600 * 1000).toISOString();
const WEEK_TO = new Date(NOW + 3 * 24 * 3600 * 1000).toISOString();

const ACTIVITY: Activity = {
  id: 'act-4',
  sportType: 'running',
  status: 'completed',
  startedAt: new Date(ENDED_AT_MS - 20 * 60 * 1000).toISOString(),
  endedAt: new Date(ENDED_AT_MS).toISOString(),
  durationS: 1200,
  distanceM: 4000,
  calories: null,
  title: null,
  notes: null,
  metrics: {},
};

const STATS_KEY = ['stats', 'summary', 'week', 'all', 'now', deviceTimeZone()];
const PROBE_KEY = ['activities', 'running', 'first-session-probe'];

function weekStats(sessions: number): StatsSummary {
  return {
    from: WEEK_FROM,
    to: WEEK_TO,
    bySport: [],
    totalSessions: sessions,
    totalDurationS: sessions * 1200,
    totals: { distanceM: sessions * 4000 },
    previous: { sessions: 0, durationS: 0, totals: {} },
  };
}

function page(total: number): Page<Activity> {
  return { items: [ACTIVITY], page: 0, size: 1, total };
}

/**
 * Les agrégats répondent après la fiche d'activité, comme en production (une
 * agrégation contre une lecture par clé). Avec des réponses instantanées, le refetch
 * atterrirait avant le premier rendu utile et masquerait le défaut.
 */
const later = <T,>(value: T) =>
  new Promise<T>((resolve) => {
    setTimeout(() => resolve(value), 30);
  });

interface RecordHolders {
  /** Détenteur du record de distance ; par défaut une séance plus ancienne. */
  distance?: string;
  duration?: string;
  fail?: boolean;
}

function records(sportSessions: number, holders: RecordHolders) {
  return {
    bySport: [
      {
        sportType: 'running',
        label: 'Course à pied',
        sessions: sportSessions,
        records: [
          { key: 'durationS', label: 'Plus longue séance', unit: 's', value: 1800,
            activityId: holders.duration ?? 'act-old', startedAt: '2025-01-01T08:00:00Z' },
          { key: 'distanceM', label: 'Plus longue distance', unit: 'm', value: 9000,
            activityId: holders.distance ?? 'act-old', startedAt: '2025-01-01T08:00:00Z' },
        ],
      },
    ],
  };
}

/** Réponses du serveur **après** la séance. */
function serverAfterSession(opts: {
  weekSessions: number;
  sportSessions: number;
  records?: RecordHolders;
}) {
  mockApi.mockImplementation((path: string) => {
    if (path.startsWith('/api/v1/stats/records')) {
      return opts.records?.fail === true
        ? Promise.reject(new Error('hors ligne'))
        : later(records(opts.sportSessions, opts.records ?? {}));
    }
    if (path.startsWith('/api/v1/stats/summary')) {
      return later(weekStats(opts.weekSessions));
    }
    if (path.startsWith('/api/v1/activities?')) {
      return later(page(opts.sportSessions));
    }
    if (path === '/api/v1/users/me/preferences') {
      return Promise.resolve({}); // défauts : aucun objectif
    }
    if (path === '/api/v1/activities/act-4') {
      return Promise.resolve(ACTIVITY);
    }
    return Promise.reject(new Error(`appel inattendu : ${path}`));
  });
}

function withSessionGoal(sessions: number) {
  client.setQueryData(PREFERENCES_KEY, {
    ...DEFAULT_PREFERENCES,
    weeklyGoal: { distanceM: null, sessions },
  });
}

/** Ce que `stop()` fait après une clôture réussie (voir use-session-store). */
async function invalidateLikeStop() {
  await client.invalidateQueries({ queryKey: ['stats'] });
  await client.invalidateQueries({ queryKey: ['activities'] });
}

let client: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const statsCalls = () =>
  mockApi.mock.calls.filter(([path]) => String(path).startsWith('/api/v1/stats/summary'));
const probeCalls = () =>
  mockApi.mock.calls.filter(([path]) => String(path).startsWith('/api/v1/activities?'));

beforeEach(() => {
  // Même staleTime que l'app : c'est lui qui rendait une séance courte dangereuse.
  client = createTestQueryClient({ staleTime: 30_000 });
  mockBannerRenders.length = 0;
});

afterEach(() => {
  client.unmount();
  client.clear();
});

describe('Résumé — objectif hebdomadaire sur un cache d’avant la séance (#69)', () => {
  it('ne célèbre pas, même transitoirement, un objectif déjà atteint avant la séance', async () => {
    // Objectif 3 séances, déjà atteint ; l'accueil a mis en cache « 3 » juste avant.
    withSessionGoal(3);
    client.setQueryData(STATS_KEY, weekStats(3), { updatedAt: ENDED_AT_MS - 60_000 });
    client.setQueryData(PROBE_KEY, page(3), { updatedAt: ENDED_AT_MS - 60_000 });
    await invalidateLikeStop();
    serverAfterSession({ weekSessions: 4, sportSessions: 4 });

    await render(<SummaryScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(statsCalls()).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId('activity-title')).toBeOnTheScreen());
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(mockBannerRenders).toEqual([]);
  });

  /**
   * Séance de moins de 30 s : la donnée en cache est encore « fraîche » pour
   * react-query, rien ne la rafraîchit. Seule la comparaison à `endedAt` protège.
   * L'invalidation n'est volontairement pas rejouée : la garde doit tenir seule.
   */
  it('ne conclut rien sur un cache frais mais antérieur à la fin de la séance', async () => {
    withSessionGoal(3);
    client.setQueryData(STATS_KEY, weekStats(3), { updatedAt: ENDED_AT_MS - 20_000 });
    client.setQueryData(PROBE_KEY, page(3), { updatedAt: ENDED_AT_MS - 20_000 });
    serverAfterSession({ weekSessions: 4, sportSessions: 4 });

    await render(<SummaryScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('activity-title')).toBeOnTheScreen());
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(statsCalls()).toHaveLength(0); // le scénario est bien celui du cache jugé frais
    expect(mockBannerRenders).toEqual([]);
  });

  it('célèbre la séance qui fait franchir l’objectif, une fois les totaux à jour', async () => {
    withSessionGoal(3);
    client.setQueryData(STATS_KEY, weekStats(2), { updatedAt: ENDED_AT_MS - 60_000 });
    await invalidateLikeStop();
    serverAfterSession({ weekSessions: 3, sportSessions: 3 });

    await render(<SummaryScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(mockBannerRenders).toContain('weekly-goal'));
    // Rien avant que les totaux d'après la séance ne soient arrivés.
    expect(new Set(mockBannerRenders)).toEqual(new Set(['weekly-goal']));
  });
});

describe('Résumé — sonde « première séance » en cache (#69)', () => {
  it('ne fête pas une première séance sur une sonde remplie par un résumé précédent', async () => {
    // Le résumé de la vraie première séance avait mis `total: 1` en cache.
    client.setQueryData(PROBE_KEY, page(1), { updatedAt: ENDED_AT_MS - 3_600_000 });
    await invalidateLikeStop();
    serverAfterSession({ weekSessions: 2, sportSessions: 2 });

    await render(<SummaryScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(probeCalls()).toHaveLength(1));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(mockBannerRenders).toEqual([]);
  });

  it('fête la vraie première séance', async () => {
    serverAfterSession({ weekSessions: 1, sportSessions: 1 });

    await render(<SummaryScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(mockBannerRenders).toContain('first-session'));
    expect(new Set(mockBannerRenders)).toEqual(new Set(['first-session']));
  });
});

describe('Résumé — record personnel (#61)', () => {
  it('célèbre le record battu par cette séance, avec le libellé du serveur', async () => {
    serverAfterSession({ weekSessions: 2, sportSessions: 12, records: { distance: 'act-4' } });

    await render(<SummaryScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(mockBannerRenders).toContain('personal-record'));
    expect(new Set(mockBannerRenders)).toEqual(new Set(['personal-record']));
    expect(mockBannerRecords).toEqual(['Plus longue distance']);
  });

  /** Record et objectif sur la même séance : un seul bandeau, le plus rare. */
  it('préfère le record à l’objectif hebdomadaire franchi par la même séance', async () => {
    withSessionGoal(3);
    client.setQueryData(STATS_KEY, weekStats(2), { updatedAt: ENDED_AT_MS - 60_000 });
    await invalidateLikeStop();
    serverAfterSession({ weekSessions: 3, sportSessions: 12, records: { distance: 'act-4' } });

    await render(<SummaryScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(mockBannerRenders).toContain('personal-record'));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(mockBannerRenders).not.toContain('weekly-goal');
  });

  it('ne célèbre rien quand le record appartient à une autre séance', async () => {
    serverAfterSession({ weekSessions: 2, sportSessions: 12 });

    await render(<SummaryScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('activity-title')).toBeOnTheScreen());
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(mockBannerRenders).toEqual([]);
  });

  /** Sans réponse des records, les autres raisons de célébrer restent valables. */
  it('laisse passer l’objectif hebdomadaire quand les records sont injoignables', async () => {
    withSessionGoal(3);
    client.setQueryData(STATS_KEY, weekStats(2), { updatedAt: ENDED_AT_MS - 60_000 });
    await invalidateLikeStop();
    serverAfterSession({ weekSessions: 3, sportSessions: 12, records: { fail: true } });

    await render(<SummaryScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(mockBannerRenders).toContain('weekly-goal'));
    expect(mockBannerRenders).not.toContain('personal-record');
  });
});

