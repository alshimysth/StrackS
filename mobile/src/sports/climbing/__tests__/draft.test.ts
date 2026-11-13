/** The climbing log: what a session reports, and the live counts it shows. */
import {
  addClimb,
  climbingMetricsFromDraft,
  climbingTotals,
  initialClimbingDraft,
  removeClimb,
  setLocation,
} from '../draft';

describe('climbing draft', () => {
  it('starts empty, indoors, with a modest grade preselected', () => {
    expect(initialClimbingDraft('bouldering')).toEqual({ location: 'indoor', climbs: [], nextGrade: '5' });
    expect(initialClimbingDraft('rope_climbing').nextGrade).toBe('5c');
  });

  it('logs a climb and preselects its grade for the next one', () => {
    const draft = addClimb(initialClimbingDraft('bouldering'), { grade: '6B', result: 'flash', attempts: 1 });
    expect(draft.climbs).toHaveLength(1);
    expect(draft.nextGrade).toBe('6B');
  });

  it('removes a climb by index without touching the others', () => {
    let draft = initialClimbingDraft('bouldering');
    draft = addClimb(draft, { grade: '6A', result: 'send', attempts: 2 });
    draft = addClimb(draft, { grade: '6B', result: 'attempt', attempts: 3 });
    draft = removeClimb(draft, 0);
    expect(draft.climbs.map((c) => c.grade)).toEqual(['6B']);
  });

  it('counts sends and names the hardest one, like the server', () => {
    let draft = setLocation(initialClimbingDraft('bouldering'), 'outdoor');
    draft = addClimb(draft, { grade: '6A', result: 'flash', attempts: 1 });
    draft = addClimb(draft, { grade: '6B+', result: 'send', attempts: 4 });
    draft = addClimb(draft, { grade: '7A', result: 'attempt', attempts: 6 });
    draft = addClimb(draft, { grade: '5+', result: 'flash', attempts: 1 });
    expect(climbingTotals(draft, 'bouldering')).toEqual({ climbs: 4, sends: 3, hardest: '6B+' });
  });

  it('reports only what the backend schema accepts, attempts at least 1', () => {
    let draft = initialClimbingDraft('rope_climbing');
    draft = addClimb(draft, { grade: '6a', result: 'onsight', attempts: 0 });
    expect(climbingMetricsFromDraft(draft)).toEqual({
      schemaVersion: 1,
      location: 'indoor',
      climbs: [{ grade: '6a', result: 'onsight', attempts: 1 }],
    });
    expect(climbingMetricsFromDraft(draft)).not.toHaveProperty('nextGrade');
  });
});
