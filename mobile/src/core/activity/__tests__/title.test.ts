/**
 * Activity label (#25).
 *
 * Decision of 2026-08-11: the fallback is computed at display time and NEVER persisted.
 * These tests lock the boundary between "chosen title" and "derived title".
 */
import { activityTitle, derivedTitle, sportLabel } from '../title';

const BASE = { sportType: 'running', startedAt: '2026-08-14T09:30:00.000Z' };

describe('sportLabel', () => {
  it('translates a sport known to the theme', () => {
    expect(sportLabel('running')).toBe('Course');
    expect(sportLabel('walking')).toBe('Marche');
  });

  /** The backend may expose a sport the mobile theme doesn't know yet. */
  it('falls back to the raw code for an unknown sport', () => {
    expect(sportLabel('kayak')).toBe('kayak');
  });
});

describe('derivedTitle', () => {
  it('combines the sport and the date', () => {
    expect(derivedTitle('running', BASE.startedAt)).toBe('Course du 14 août');
  });
});

describe('activityTitle', () => {
  it('prefers the title chosen by the user', () => {
    expect(activityTitle({ ...BASE, title: 'Fractionné du mardi' })).toBe('Fractionné du mardi');
  });

  it('falls back to the derived label without a title', () => {
    expect(activityTitle({ ...BASE, title: null })).toBe('Course du 14 août');
  });

  /**
   * A whitespace title must not produce an empty header. The backend already stores it as
   * `null`, but an old response or a disk cache from before V6 may still contain one; the
   * display doesn't rely on it.
   */
  it('treats a whitespace title as absent', () => {
    expect(activityTitle({ ...BASE, title: '   ' })).toBe('Course du 14 août');
  });

  it('trims the displayed title', () => {
    expect(activityTitle({ ...BASE, title: '  Trail  ' })).toBe('Trail');
  });
});
