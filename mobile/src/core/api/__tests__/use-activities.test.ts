/**
 * Story #23 — la logique de pagination et de filtrage, isolée du rendu.
 *
 * La DoD exige que « les filtres appellent bien le backend (pas de filtrage côté
 * client) » : ce qui se vérifie ici, c'est l'URL réellement construite.
 */
import {
  buildActivitiesPath,
  groupByMonth,
  nextPageParam,
  periodStart,
} from '../use-activities';
import type { Activity, Page } from '../../../types/api';

function activity(id: string, startedAt: string): Activity {
  return {
    id,
    sportType: 'running',
    status: 'completed',
    startedAt,
    endedAt: startedAt,
    durationS: 600,
    distanceM: 2000,
    calories: null,
    notes: null,
    metrics: {},
  };
}

function page(items: Activity[], p: number, size: number, total: number): Page<Activity> {
  return { items, page: p, size, total };
}

describe('periodStart', () => {
  const now = new Date('2026-08-14T10:00:00.000Z');

  it('ne borne pas la période « tout »', () => {
    expect(periodStart('all', now)).toBeUndefined();
  });

  it.each([
    ['week', '2026-08-07T10:00:00.000Z'],
    ['month', '2026-07-14T10:00:00.000Z'],
    ['year', '2025-08-14T10:00:00.000Z'],
  ] as const)('recule la borne basse pour « %s »', (period, expected) => {
    expect(periodStart(period, now)).toBe(expected);
  });

  it('ne mute pas la date qu’on lui passe', () => {
    const reference = new Date('2026-08-14T10:00:00.000Z');
    periodStart('year', reference);
    expect(reference.toISOString()).toBe('2026-08-14T10:00:00.000Z');
  });
});

describe('buildActivitiesPath', () => {
  it('demande la pagination sans filtre quand aucun n’est actif', () => {
    expect(buildActivitiesPath({}, 0)).toBe('/api/v1/activities?page=0&size=20');
  });

  it('transmet le sport au serveur plutôt que de filtrer après coup', () => {
    expect(buildActivitiesPath({ sport: 'walking' }, 2)).toContain('sport=walking');
    expect(buildActivitiesPath({ sport: 'walking' }, 2)).toContain('page=2');
  });

  it('transmet la borne de période au serveur', () => {
    const path = buildActivitiesPath({ period: 'week' }, 0);
    expect(path).toMatch(/from=\d{4}-\d{2}-\d{2}T/);
  });

  it('n’envoie pas de borne pour la période « tout »', () => {
    expect(buildActivitiesPath({ period: 'all' }, 0)).not.toContain('from=');
  });
});

describe('nextPageParam', () => {
  it('enchaîne tant que le total n’est pas atteint', () => {
    expect(nextPageParam(page([activity('a', '2026-08-01T10:00:00Z')], 0, 20, 45))).toBe(1);
  });

  it('s’arrête quand tout est chargé', () => {
    const items = Array.from({ length: 5 }, (_, i) => activity(`a${i}`, '2026-08-01T10:00:00Z'));
    expect(nextPageParam(page(items, 2, 20, 45))).toBeUndefined();
  });

  /**
   * Le piège que ce test verrouille : un dernier lot EXACTEMENT plein. En se fiant à
   * `items.length === size` on annoncerait une page suivante inexistante, et le pied
   * de liste tournerait indéfiniment.
   */
  it('s’arrête sur un dernier lot exactement plein', () => {
    const items = Array.from({ length: 20 }, (_, i) => activity(`a${i}`, '2026-08-01T10:00:00Z'));
    expect(nextPageParam(page(items, 1, 20, 40))).toBeUndefined();
  });
});

describe('groupByMonth', () => {
  it('regroupe les activités du même mois sous une seule section', () => {
    const sections = groupByMonth([
      activity('a', '2026-08-12T10:00:00Z'),
      activity('b', '2026-08-03T10:00:00Z'),
      activity('c', '2026-07-28T10:00:00Z'),
    ]);
    expect(sections.map((s) => s.key)).toEqual(['2026-08', '2026-07']);
    expect(sections[0].data).toHaveLength(2);
    expect(sections[1].data).toHaveLength(1);
  });

  it('sépare deux mois de même rang sur des années différentes', () => {
    const sections = groupByMonth([
      activity('a', '2026-01-05T10:00:00Z'),
      activity('b', '2025-01-05T10:00:00Z'),
    ]);
    expect(sections.map((s) => s.key)).toEqual(['2026-01', '2025-01']);
  });

  /**
   * L'ordre d'arrivée doit être conservé tel quel : re-trier ferait remonter la page 2
   * au milieu de la page 1 à chaque chargement infini.
   */
  it('préserve l’ordre reçu du serveur', () => {
    const sections = groupByMonth([
      activity('recent', '2026-08-12T10:00:00Z'),
      activity('ancien', '2026-08-01T10:00:00Z'),
    ]);
    expect(sections[0].data.map((a) => a.id)).toEqual(['recent', 'ancien']);
  });

  it('rend une liste vide sans section', () => {
    expect(groupByMonth([])).toEqual([]);
  });
});
