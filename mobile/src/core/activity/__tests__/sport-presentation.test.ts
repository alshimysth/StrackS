/** The core's view of a sport it doesn't know: labels, badges, grouping by family. */
import { groupByFamily, sportAppearance, sportLabel } from '../sport-presentation';
import type { SportTypeDescriptor } from '../../../types/api';

const descriptor = (code: string, family: string, familyLabel: string): SportTypeDescriptor => ({
  code,
  label: code,
  family: { code: family, label: familyLabel },
  trackingMode: 'GPS',
  usesGps: true,
  schemaVersion: 1,
});

describe('groupByFamily', () => {
  it('keeps the server order inside a family and the first appearance between families', () => {
    const groups = groupByFamily([
      descriptor('running', 'running', 'Course à pied'),
      descriptor('tennis', 'racket', 'Raquettes'),
      descriptor('trail_running', 'running', 'Course à pied'),
    ]);
    expect(groups.map((g) => g.code)).toEqual(['running', 'racket']);
    expect(groups[0].label).toBe('Course à pied');
    expect(groups[0].sports.map((s) => s.code)).toEqual(['running', 'trail_running']);
  });

  it('gives a sport without a family (older backend) a family of its own', () => {
    const legacy = { ...descriptor('running', 'x', 'x'), family: undefined } as unknown as SportTypeDescriptor;
    const groups = groupByFamily([legacy]);
    expect(groups).toHaveLength(1);
    expect(groups[0].code).toBe('running');
    expect(groups[0].label).toBe('Course à pied');
  });
});

describe('labels and badges', () => {
  it('uses the catalog label, the theme label, then the code', () => {
    expect(sportLabel('tennis')).toBe('Tennis');
    expect(sportLabel('strength')).toBe('Musculation');
    expect(sportLabel('kayak')).toBe('kayak');
  });

  it('gives a badge appearance to a catalogued sport and none to an unknown one', () => {
    expect(sportAppearance('bouldering')).toMatchObject({ label: 'Bloc' });
    expect(sportAppearance('kayak')).toBeUndefined();
  });
});
