/**
 * Sport order and preselection (#34).
 *
 * DoD: "starting a session of the preferred sport takes ≤ 2 interactions" and "stay
 * tolerant if the preferred sport disappears from the registry".
 */
import { initialSelection, orderSports } from '../sport-order';

const SPORTS = [{ code: 'running' }, { code: 'walking' }, { code: 'strength' }];

describe('orderSports', () => {
  it('keeps the server order without a preference', () => {
    expect(orderSports(SPORTS, null).map((s) => s.code)).toEqual([
      'running',
      'walking',
      'strength',
    ]);
  });

  it('moves the preferred sport to the top', () => {
    expect(orderSports(SPORTS, 'walking').map((s) => s.code)).toEqual([
      'walking',
      'running',
      'strength',
    ]);
  });

  it('preserves the server order for the others', () => {
    expect(orderSports(SPORTS, 'strength').map((s) => s.code)).toEqual([
      'strength',
      'running',
      'walking',
    ]);
  });

  /** Tolerance required by the DoD: sport removed from the backend, or renamed. */
  it('leaves the list intact if the preferred sport disappeared', () => {
    expect(orderSports(SPORTS, 'kayak').map((s) => s.code)).toEqual([
      'running',
      'walking',
      'strength',
    ]);
  });

  it('handles an empty list', () => {
    expect(orderSports([], 'running')).toEqual([]);
  });
});

describe('initialSelection', () => {
  /** Without preselection, moving the sport to the top saves no interaction. */
  it('preselects the preferred sport', () => {
    expect(initialSelection(SPORTS, 'walking')).toBe('walking');
  });

  it('preselects nothing without a preference', () => {
    expect(initialSelection(SPORTS, null)).toBeNull();
  });

  it('preselects nothing if the preferred sport disappeared', () => {
    expect(initialSelection(SPORTS, 'kayak')).toBeNull();
  });

  it('handles an empty list', () => {
    expect(initialSelection([], 'running')).toBeNull();
  });
});

/**
 * Sports that can't be started (#68 review).
 *
 * The backend may expose a sport the mobile app has no module for. Letting it into the
 * list would allow setting it as default, preselecting it, then doing nothing when
 * "Démarrer" is tapped: a dead end. Filtering therefore happens BEFORE ordering and
 * preselection, which these cases pin down.
 */
describe('sports that cannot be started', () => {
  const startable = SPORTS.filter((s) => s.code !== 'strength');

  it('only orders sports that can be started', () => {
    expect(orderSports(startable, 'walking').map((s) => s.code)).toEqual(['walking', 'running']);
  });

  it('does not preselect a sport missing from the filtered list', () => {
    expect(initialSelection(startable, 'strength')).toBeNull();
  });
});
