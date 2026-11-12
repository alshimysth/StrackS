/** The score of a racket match: bounded counters, result by sets won, report at stop. */
import {
  addSet,
  adjustSet,
  initialRacketDraft,
  matchOutcome,
  racketMetricsFromDraft,
  removeSet,
} from '../score';

const TENNIS = { maxSetScore: 7, maxSets: 5 };

describe('sets', () => {
  it('starts with one empty set in the given format', () => {
    expect(initialRacketDraft('doubles')).toEqual({ format: 'doubles', sets: [{ won: 0, lost: 0 }] });
  });

  it('bounds a counter between 0 and the sport ceiling', () => {
    let draft = initialRacketDraft();
    draft = adjustSet(draft, 0, 'won', -1, TENNIS);
    expect(draft.sets[0].won).toBe(0);
    for (let i = 0; i < 10; i++) {
      draft = adjustSet(draft, 0, 'won', 1, TENNIS);
    }
    expect(draft.sets[0].won).toBe(7);
  });

  it('never exceeds the number of sets of the sport, nor removes the last one', () => {
    let draft = initialRacketDraft();
    for (let i = 0; i < 10; i++) {
      draft = addSet(draft, TENNIS);
    }
    expect(draft.sets).toHaveLength(5);
    draft = { ...draft, sets: [draft.sets[0]] };
    expect(removeSet(draft, 0).sets).toHaveLength(1);
  });
});

describe('matchOutcome: same rule as RacketSportPlugin.derive', () => {
  it('counts sets won and lost, a tie counting for nobody', () => {
    expect(
      matchOutcome([
        { won: 6, lost: 4 },
        { won: 3, lost: 6 },
        { won: 7, lost: 6 },
        { won: 5, lost: 5 },
      ]),
    ).toEqual({ setsWon: 2, setsLost: 1, result: 'win' });
  });

  it('has no result without any decided set', () => {
    expect(matchOutcome([{ won: 0, lost: 0 }])).toEqual({ setsWon: 0, setsLost: 0, result: null });
  });

  it('calls a draw when sets are even', () => {
    expect(matchOutcome([{ won: 21, lost: 15 }, { won: 18, lost: 21 }]).result).toBe('draw');
  });
});

describe('racketMetricsFromDraft', () => {
  it('drops the untouched sets and sends only the schema keys', () => {
    const draft = {
      format: 'singles' as const,
      sets: [{ won: 6, lost: 4 }, { won: 0, lost: 0 }],
    };
    expect(racketMetricsFromDraft(draft)).toEqual({
      schemaVersion: 1,
      format: 'singles',
      sets: [{ won: 6, lost: 4 }],
    });
  });
});
