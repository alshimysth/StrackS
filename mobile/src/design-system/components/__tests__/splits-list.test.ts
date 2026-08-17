/**
 * Mise en forme des splits (#22). Les valeurs viennent du JSONB `metrics.splits`
 * calculé par `RunningPlugin` — donc d'une source non typée qu'il faut filtrer.
 */
import { barRatio, parseSplits } from '../SplitsList';

describe('parseSplits', () => {
  it('lit les splits bien formés', () => {
    expect(
      parseSplits([
        { km: 1, paceSecPerKm: 300 },
        { km: 2, paceSecPerKm: 310 },
      ]),
    ).toEqual([
      { km: 1, paceSecPerKm: 300 },
      { km: 2, paceSecPerKm: 310 },
    ]);
  });

  /** `metrics` est du JSONB : une séance de marche n'a pas de splits du tout. */
  it('rend une liste vide pour une valeur absente ou non tabulaire', () => {
    expect(parseSplits(undefined)).toEqual([]);
    expect(parseSplits(null)).toEqual([]);
    expect(parseSplits({ km: 1 })).toEqual([]);
  });

  it('écarte les entrées incomplètes sans jeter les bonnes', () => {
    expect(
      parseSplits([{ km: 1, paceSecPerKm: 300 }, { km: 2 }, null, { paceSecPerKm: 320 }]),
    ).toEqual([{ km: 1, paceSecPerKm: 300 }]);
  });
});

describe('barRatio', () => {
  it('donne la barre pleine au km le plus lent', () => {
    expect(barRatio(360, 360)).toBe(1);
  });

  it('proportionne les autres au plus lent', () => {
    expect(barRatio(180, 360)).toBeCloseTo(0.5);
  });

  /** Sans plancher, un km très rapide se réduirait à un trait invisible. */
  it('applique un plancher de 15 %', () => {
    expect(barRatio(10, 600)).toBe(0.15);
  });

  it('ne divise pas par zéro', () => {
    expect(barRatio(300, 0)).toBe(1);
  });
});
