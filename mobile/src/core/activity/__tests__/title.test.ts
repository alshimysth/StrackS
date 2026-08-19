/**
 * Libellé d'activité (#25).
 *
 * Décision du 2026-08-11 : le repli se calcule à l'affichage et n'est JAMAIS persisté.
 * Ces tests verrouillent la frontière entre « titre choisi » et « titre dérivé ».
 */
import { activityTitle, derivedTitle, sportLabel } from '../title';

const BASE = { sportType: 'running', startedAt: '2026-08-14T09:30:00.000Z' };

describe('sportLabel', () => {
  it('traduit un sport connu du thème', () => {
    expect(sportLabel('running')).toBe('Course');
    expect(sportLabel('walking')).toBe('Marche');
  });

  /** Le backend peut exposer un sport que le thème mobile ne connaît pas encore. */
  it('retombe sur le code brut pour un sport inconnu', () => {
    expect(sportLabel('kayak')).toBe('kayak');
  });
});

describe('derivedTitle', () => {
  it('compose le sport et la date', () => {
    expect(derivedTitle('running', BASE.startedAt)).toBe('Course du 14 août');
  });
});

describe('activityTitle', () => {
  it('préfère le titre choisi par l’utilisateur', () => {
    expect(activityTitle({ ...BASE, title: 'Fractionné du mardi' })).toBe('Fractionné du mardi');
  });

  it('retombe sur le libellé dérivé sans titre', () => {
    expect(activityTitle({ ...BASE, title: null })).toBe('Course du 14 août');
  });

  /**
   * Un titre d'espaces ne doit pas produire un en-tête vide. Le backend le stocke
   * déjà en `null`, mais une réponse ancienne ou un cache disque d'avant V6 peut
   * encore en contenir — l'affichage ne s'y fie pas.
   */
  it('traite un titre d’espaces comme absent', () => {
    expect(activityTitle({ ...BASE, title: '   ' })).toBe('Course du 14 août');
  });

  it('rogne le titre affiché', () => {
    expect(activityTitle({ ...BASE, title: '  Trail  ' })).toBe('Trail');
  });
});
