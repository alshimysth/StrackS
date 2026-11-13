/**
 * French climbing grades, mirror of `FrenchGrade.java` (backend).
 *
 * Same two patterns, same ordinal formula (`number × 10 + letter × 2 + plus`): the server
 * keeps the hardest send as an ordinal and the client turns it back into a label with
 * this table. A grade the server accepts must be one the client can display.
 */
export type Discipline = 'bouldering' | 'rope_climbing';

const ROUTE = /^([3-9])([abc])?(\+)?$/;
const BOULDER = /^([3-9])([ABC])?(\+)?$/;
const LETTERS = 'abc';

export interface Grade {
  number: number;
  /** 0 without a letter, 1..3 for a..c */
  letter: number;
  plus: boolean;
}

export function parseGrade(text: string, discipline: Discipline): Grade | null {
  const match = (discipline === 'bouldering' ? BOULDER : ROUTE).exec(text.trim());
  if (match == null) {
    return null;
  }
  const number = Number(match[1]);
  const letter = match[2];
  const plus = match[3] != null;
  if (letter == null && number >= 6) {
    return null; // from 6 upwards the letter is part of the grade
  }
  if (discipline === 'rope_climbing' && letter == null && plus) {
    return null; // "5+" is a boulder notation
  }
  return { number, letter: letter == null ? 0 : LETTERS.indexOf(letter.toLowerCase()) + 1, plus };
}

export function gradeOrdinal(grade: Grade): number {
  return grade.number * 10 + grade.letter * 2 + (grade.plus ? 1 : 0);
}

export function gradeLabel(grade: Grade, discipline: Discipline): string {
  const letter = grade.letter === 0 ? '' : LETTERS.charAt(grade.letter - 1);
  const label = `${grade.number}${letter}${grade.plus ? '+' : ''}`;
  return discipline === 'bouldering' ? label.toUpperCase() : label;
}

/** Inverse of `gradeOrdinal`, for a record value sent by the server. */
export function gradeFromOrdinal(ordinal: number, discipline: Discipline): string | null {
  const number = Math.floor(ordinal / 10);
  const rest = ordinal % 10;
  const letter = Math.floor(rest / 2);
  const plus = rest % 2 === 1;
  if (number < 3 || number > 9 || letter > 3) {
    return null;
  }
  return gradeLabel({ number, letter, plus }, discipline);
}

/**
 * The whole scale a picker offers, in climbing order, from 3 (what the parser accepts) to
 * 9. Below 6 the letterless grades (3, 3+, 4, 4+, 5, 5+) exist for boulders only; routes
 * always carry a letter.
 */
export function gradeScale(discipline: Discipline): string[] {
  const grades: string[] = [];
  for (let number = 3; number <= 9; number++) {
    if (discipline === 'bouldering' && number < 6) {
      grades.push(gradeLabel({ number, letter: 0, plus: false }, discipline));
      grades.push(gradeLabel({ number, letter: 0, plus: true }, discipline));
      continue;
    }
    for (let letter = 1; letter <= 3; letter++) {
      grades.push(gradeLabel({ number, letter, plus: false }, discipline));
      grades.push(gradeLabel({ number, letter, plus: true }, discipline));
    }
  }
  return grades;
}
