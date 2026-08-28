/**
 * Dérivations de l'écran de statistiques (#24) — la logique qui n'a pas besoin
 * d'un rendu pour être fausse : ce qui part au serveur, et ce qu'on ose déduire
 * d'une comparaison.
 */
import {
  buildStatsPath,
  canGoForward,
  chartTitle,
  deltaPercent,
  formatDelta,
  periodTitle,
  shiftAnchor,
} from '../use-stats';

describe('buildStatsPath', () => {
  it('envoie la période et le fuseau de l’appareil', () => {
    const path = buildStatsPath('summary', { period: 'month' });
    expect(path).toContain('/api/v1/stats/summary?');
    expect(path).toContain('period=month');
    expect(path).toContain('tz=');
  });

  it('n’envoie de filtre sport que s’il y en a un', () => {
    expect(buildStatsPath('timeline', { period: 'week' })).not.toContain('sport=');
    expect(buildStatsPath('timeline', { period: 'week', sport: 'running' })).toContain(
      'sport=running',
    );
  });

  it('envoie l’ancre en ISO 8601', () => {
    const anchor = new Date('2026-07-15T10:00:00.000Z');
    expect(buildStatsPath('summary', { period: 'month', anchor })).toContain(
      `from=${encodeURIComponent('2026-07-15T10:00:00.000Z')}`,
    );
  });
});

describe('deltaPercent', () => {
  it('calcule l’évolution relative', () => {
    expect(deltaPercent(112, 100)).toBeCloseTo(12);
    expect(deltaPercent(80, 100)).toBeCloseTo(-20);
  });

  /**
   * Partir de zéro n'est pas « +100 % » : le taux n'est pas défini. Afficher un
   * pourcentage ici reviendrait à inventer un chiffre, ce que le PRD interdit.
   */
  it('refuse de comparer à une période vide', () => {
    expect(deltaPercent(42, 0)).toBeNull();
    expect(deltaPercent(0, 0)).toBeNull();
  });
});

describe('formatDelta', () => {
  it('signe l’évolution et marque l’égalité', () => {
    expect(formatDelta(12.4)).toBe('+ 12 %');
    expect(formatDelta(-3.6)).toBe('− 4 %');
    expect(formatDelta(0.2)).toBe('=');
  });

  it('ne rend rien quand la comparaison n’a pas de sens', () => {
    expect(formatDelta(null)).toBeNull();
  });

  /** Signe moins typographique (U+2212), pas trait d'union : il s'aligne sur le plus. */
  it('emploie un vrai signe moins', () => {
    expect(formatDelta(-10)).toContain('−');
    expect(formatDelta(-10)).not.toContain('-');
  });
});

describe('shiftAnchor', () => {
  /**
   * Le piège que l'arithmétique en millisecondes ne passe pas : depuis le 31 mars,
   * « moins 30 jours » atterrit le 1er mars — soit le même mois qu'au départ.
   */
  it('recule d’un mois calendaire depuis une fin de mois', () => {
    const march31 = new Date(2026, 2, 31, 12);
    expect(shiftAnchor('month', march31, -1).getMonth()).toBe(1); // février
  });

  it('recule d’une semaine et d’une année', () => {
    const day = new Date(2026, 6, 15, 12);
    expect(shiftAnchor('week', day, -1).getDate()).toBe(8);
    expect(shiftAnchor('year', day, -1).getFullYear()).toBe(2025);
  });

  /** Même piège au 29 février : `setFullYear` sur un jour bissextile déborde sur mars. */
  it('recule d’une année depuis un 29 février sans déborder', () => {
    const leapDay = new Date(2028, 1, 29, 12);
    const previous = shiftAnchor('year', leapDay, -1);
    expect(previous.getFullYear()).toBe(2027);
    expect(previous.getMonth()).toBe(0);
  });

  it('n’altère pas la date d’origine', () => {
    const anchor = new Date(2026, 6, 15, 12);
    shiftAnchor('month', anchor, -3);
    expect(anchor.getMonth()).toBe(6);
  });
});

describe('canGoForward', () => {
  /** Proposer « août » depuis juillet quand on est en juillet mène à un écran vide. */
  it('interdit d’avancer au-delà de la période courante', () => {
    const now = new Date(2026, 6, 15, 12);
    expect(canGoForward('month', new Date(2026, 6, 1, 12), now)).toBe(false);
    expect(canGoForward('month', new Date(2026, 5, 1, 12), now)).toBe(true);
  });
});

describe('periodTitle', () => {
  it('nomme la fenêtre selon la maille', () => {
    const july15 = new Date(2026, 6, 15, 12);
    expect(periodTitle('year', july15)).toBe('2026');
    expect(periodTitle('month', july15)).toBe('Juillet 2026');
    // Le 15 juillet 2026 est un mercredi : la semaine commence le lundi 13.
    expect(periodTitle('week', july15)).toBe('Semaine du 13 juillet');
  });

  /** Dimanche : `getDay()` vaut 0, le lundi est 6 jours en arrière, pas 1 jour en avant. */
  it('ramène un dimanche au lundi qui le précède', () => {
    expect(periodTitle('week', new Date(2026, 6, 19, 12))).toBe('Semaine du 13 juillet');
  });
});

describe('chartTitle', () => {
  it('suit la maille renvoyée par le serveur', () => {
    expect(chartTitle('day')).toBe('Distance par jour');
    expect(chartTitle('week')).toBe('Distance par semaine');
    expect(chartTitle('month')).toBe('Distance par mois');
  });
});
