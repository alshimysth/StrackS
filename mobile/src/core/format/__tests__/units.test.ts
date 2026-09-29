/**
 * Formatage centralisé (#30, #4).
 *
 * Ce que ces tests protègent : la DoD « les données stockées restent en unités SI —
 * seul l'affichage change ». Toutes les entrées ci-dessous sont donc en mètres,
 * secondes et m/s, jamais en km ni en miles.
 */
import {
  formatAverage,
  formatDistance,
  formatDuration,
  formatElevation,
  formatPaceValue,
  formatSpeed,
  speedUnit,
  formatLongDuration,
  fromDisplayWeight,
  toDisplayWeight,
  weightUnit,
} from '../units';

describe('formatDistance', () => {
  it('convertit des mètres en km', () => {
    expect(formatDistance(4213, 'metric')).toBe('4,21');
  });

  it('convertit les mêmes mètres en miles', () => {
    expect(formatDistance(1609.344, 'imperial')).toBe('1,00');
  });

  /** Convention des maquettes, y compris en impérial. */
  it('utilise la virgule décimale', () => {
    expect(formatDistance(5000, 'metric')).toContain(',');
    expect(formatDistance(5000, 'imperial')).toContain(',');
  });
});

describe('formatElevation', () => {
  it('rend les mètres à l’entier', () => {
    expect(formatElevation(123.7, 'metric')).toBe('124');
  });

  it('convertit en pieds', () => {
    expect(formatElevation(100, 'imperial')).toBe('328');
  });
});

describe('formatSpeed', () => {
  /** 3,03 m/s ≈ 5'30"/km — l'allure de référence d'un coureur. */
  it('rend une allure métrique', () => {
    expect(formatSpeed(1000 / 330, 'metric', 'pace')).toBe("5'30\"");
  });

  it('rend une vitesse métrique', () => {
    expect(formatSpeed(1.5, 'metric', 'speed')).toBe('5,4');
  });

  it('rend une vitesse impériale', () => {
    expect(formatSpeed(1.609344, 'imperial', 'speed')).toBe('3,6');
  });

  /**
   * `pace` et `speed` ne sont pas deux habillages du même nombre mais deux inverses :
   * c'est la raison d'être du réglage par sport.
   */
  it('produit deux valeurs différentes pour allure et vitesse', () => {
    const ms = 3;
    expect(formatSpeed(ms, 'metric', 'pace')).not.toBe(formatSpeed(ms, 'metric', 'speed'));
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rend un tiret pour une vitesse inexploitable (%p)',
    (value) => {
      expect(formatSpeed(value, 'metric', 'pace')).toBe('—');
      expect(formatSpeed(value, 'metric', 'speed')).toBe('—');
    },
  );
});

describe('formatPaceValue', () => {
  it('garde le zéro de tête des secondes', () => {
    expect(formatPaceValue(305)).toBe("5'05\"");
  });

  /**
   * Régression signalée en revue : arrondir le RESTE au lieu du total produisait
   * « 4'60\" » — 299,6 % 60 = 59,6, qui s'arrondit à 60. Une allure ne comporte
   * jamais 60 secondes.
   */
  it('ne produit jamais 60 secondes', () => {
    expect(formatPaceValue(299.6)).toBe("5'00\"");
    expect(formatPaceValue(359.7)).toBe("6'00\"");
  });
});

describe('formatAverage', () => {
  it('calcule l’allure moyenne depuis distance et durée brutes', () => {
    expect(formatAverage(1000, 330, 'metric', 'pace')).toBe("5'30\"");
  });

  it('rend un tiret sur une séance sans distance', () => {
    expect(formatAverage(0, 600, 'metric', 'pace')).toBe('—');
    expect(formatAverage(1000, 0, 'metric', 'speed')).toBe('—');
  });
});

describe('speedUnit', () => {
  it('nomme l’unité selon le système ET le mode', () => {
    expect(speedUnit('metric', 'pace')).toBe('/km');
    expect(speedUnit('imperial', 'pace')).toBe('/mi');
    expect(speedUnit('metric', 'speed')).toBe('km/h');
    expect(speedUnit('imperial', 'speed')).toBe('mph');
  });
});

describe('formatDuration', () => {
  it.each([
    [3724, '1:02:04'],
    [754, '12:34'],
    [0, '0:00'],
  ])('formate %i secondes en %s', (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });

  /** La durée ne dépend d'aucun système d'unités — une heure reste une heure. */
  it('ne dépend pas des unités', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
  });

  /** Même régression que l'allure : « 0:60 » et « 59:60 » étaient produits. */
  it('ne produit jamais 60 secondes', () => {
    expect(formatDuration(59.6)).toBe('1:00');
    expect(formatDuration(3599.6)).toBe('1:00:00');
    expect(formatDuration(119.7)).toBe('2:00');
  });
});

describe('formatLongDuration (#7)', () => {
  it.each([
    [0, '0 min'],
    [59, '1 min'],
    [3600, '1 h 00 min'],
    [45 * 3600 + 12 * 60 + 29, '45 h 12 min'],
  ])('%s s → %s', (seconds, expected) => {
    expect(formatLongDuration(seconds)).toBe(expected);
  });
});

describe('poids (#32)', () => {
  it('reste en kg en métrique', () => {
    expect(weightUnit('metric')).toBe('kg');
    expect(toDisplayWeight(72.35, 'metric')).toBe(72.4);
    expect(fromDisplayWeight(72.35, 'metric')).toBe(72.4);
  });

  it('saisit et affiche en livres, stocke en kg', () => {
    expect(weightUnit('imperial')).toBe('lb');
    expect(toDisplayWeight(72, 'imperial')).toBe(158.7);
    expect(fromDisplayWeight(158.7, 'imperial')).toBe(72);
  });

  /** Une bascule métrique ↔ impérial ne doit pas faire dériver le poids stocké. */
  it('fait l’aller-retour sans dérive', () => {
    for (const kg of [30, 55.5, 72, 99.9, 300]) {
      expect(fromDisplayWeight(toDisplayWeight(kg, 'imperial'), 'imperial')).toBeCloseTo(kg, 1);
    }
  });
});

