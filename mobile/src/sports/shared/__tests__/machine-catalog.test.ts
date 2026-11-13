/** Machine readings: lenient typing, strict report (SI units, bounded). */
import { distanceField, machineMetricsFromDraft, parseReading } from '../machine-catalog';

const FIELDS = [distanceField(), { key: 'inclinePct', label: 'Inclinaison', unit: '%', min: 0, max: 40 }];

describe('parseReading', () => {
  it('accepts a decimal comma and ignores blanks', () => {
    expect(parseReading('6,5')).toBe(6.5);
    expect(parseReading(' 6.5 ')).toBe(6.5);
    expect(parseReading('')).toBeUndefined();
    expect(parseReading('abc')).toBeUndefined();
    expect(parseReading(undefined)).toBeUndefined();
  });
});

describe('machineMetricsFromDraft', () => {
  it('converts the typed distance to metres in the unit system it was typed in', () => {
    expect(machineMetricsFromDraft(FIELDS, { units: 'metric', readings: { distanceM: '6,5' } })).toEqual({
      schemaVersion: 1,
      distanceM: 6500,
    });
    expect(
      machineMetricsFromDraft(FIELDS, { units: 'imperial', readings: { distanceM: '1' } }).distanceM,
    ).toBeCloseTo(1609.3, 1);
  });

  it('drops an out-of-range or unreadable reading rather than sending a 422', () => {
    expect(
      machineMetricsFromDraft(FIELDS, { units: 'metric', readings: { distanceM: '999', inclinePct: '50' } }),
    ).toEqual({ schemaVersion: 1 });
    expect(machineMetricsFromDraft(FIELDS, { units: 'metric', readings: { inclinePct: '12' } })).toEqual({
      schemaVersion: 1,
      inclinePct: 12,
    });
  });
});
