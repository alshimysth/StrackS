/**
 * French grades, mirror of `FrenchGradeTest.java`: same accepted strings, same ordinal
 * formula. A record value sent by the server (an ordinal) must come back as the label
 * the user typed.
 */
import { gradeFromOrdinal, gradeLabel, gradeOrdinal, gradeScale, parseGrade } from '../grades';

describe('parseGrade', () => {
  it('accepts route grades in lowercase with a mandatory letter from 6', () => {
    expect(parseGrade('6a+', 'rope_climbing')).toEqual({ number: 6, letter: 1, plus: true });
    expect(parseGrade('5c', 'rope_climbing')).toEqual({ number: 5, letter: 3, plus: false });
    expect(parseGrade('6', 'rope_climbing')).toBeNull();
    expect(parseGrade('6A', 'rope_climbing')).toBeNull();
    expect(parseGrade('5+', 'rope_climbing')).toBeNull();
  });

  it('accepts Fontainebleau grades in uppercase, letterless below 6', () => {
    expect(parseGrade('7B+', 'bouldering')).toEqual({ number: 7, letter: 2, plus: true });
    expect(parseGrade('5+', 'bouldering')).toEqual({ number: 5, letter: 0, plus: true });
    expect(parseGrade('4', 'bouldering')).toEqual({ number: 4, letter: 0, plus: false });
    expect(parseGrade('6a', 'bouldering')).toBeNull();
    expect(parseGrade('V5', 'bouldering')).toBeNull();
  });
});

describe('ordinal: the formula the server uses (number × 10 + letter × 2 + plus)', () => {
  it('matches the Java values', () => {
    expect(gradeOrdinal(parseGrade('6a+', 'rope_climbing')!)).toBe(63);
    expect(gradeOrdinal(parseGrade('6C', 'bouldering')!)).toBe(66);
    expect(gradeOrdinal(parseGrade('5+', 'bouldering')!)).toBe(51);
  });

  it('orders grades as climbers do', () => {
    const scale = gradeScale('rope_climbing');
    for (let i = 1; i < scale.length; i++) {
      expect(gradeOrdinal(parseGrade(scale[i - 1], 'rope_climbing')!)).toBeLessThan(
        gradeOrdinal(parseGrade(scale[i], 'rope_climbing')!),
      );
    }
  });

  it('round-trips through the label', () => {
    for (const discipline of ['bouldering', 'rope_climbing'] as const) {
      for (const label of gradeScale(discipline)) {
        const grade = parseGrade(label, discipline)!;
        expect(gradeLabel(grade, discipline)).toBe(label);
        expect(gradeFromOrdinal(gradeOrdinal(grade), discipline)).toBe(label);
      }
    }
  });

  it('refuses an ordinal outside the scale', () => {
    expect(gradeFromOrdinal(20, 'bouldering')).toBeNull();
    expect(gradeFromOrdinal(68, 'bouldering')).toBeNull(); // letter 4 doesn't exist
  });
});

describe('gradeScale', () => {
  it('starts at 3, letterless for boulderers only', () => {
    expect(gradeScale('bouldering').slice(0, 6)).toEqual(['3', '3+', '4', '4+', '5', '5+']);
    expect(gradeScale('rope_climbing').slice(0, 2)).toEqual(['3a', '3a+']);
  });
});
