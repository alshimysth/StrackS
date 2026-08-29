/**
 * Ordre et présélection des sports (#34).
 *
 * DoD : « démarrer une séance du sport préféré se fait en ≤ 2 interactions » et
 * « rester tolérant si le sport préféré disparaît du registre ».
 */
import { initialSelection, orderSports } from '../sport-order';

const SPORTS = [{ code: 'running' }, { code: 'walking' }, { code: 'strength' }];

describe('orderSports', () => {
  it('laisse l’ordre serveur sans préférence', () => {
    expect(orderSports(SPORTS, null).map((s) => s.code)).toEqual([
      'running',
      'walking',
      'strength',
    ]);
  });

  it('remonte le sport préféré en tête', () => {
    expect(orderSports(SPORTS, 'walking').map((s) => s.code)).toEqual([
      'walking',
      'running',
      'strength',
    ]);
  });

  it('préserve l’ordre serveur pour les autres', () => {
    expect(orderSports(SPORTS, 'strength').map((s) => s.code)).toEqual([
      'strength',
      'running',
      'walking',
    ]);
  });

  /** Tolérance exigée par la DoD : sport retiré du backend, ou renommé. */
  it('laisse la liste intacte si le sport préféré a disparu', () => {
    expect(orderSports(SPORTS, 'kayak').map((s) => s.code)).toEqual([
      'running',
      'walking',
      'strength',
    ]);
  });

  it('supporte une liste vide', () => {
    expect(orderSports([], 'running')).toEqual([]);
  });
});

describe('initialSelection', () => {
  /** Sans présélection, remonter le sport en tête ne fait gagner aucune interaction. */
  it('présélectionne le sport préféré', () => {
    expect(initialSelection(SPORTS, 'walking')).toBe('walking');
  });

  it('ne présélectionne rien sans préférence', () => {
    expect(initialSelection(SPORTS, null)).toBeNull();
  });

  it('ne présélectionne rien si le sport préféré a disparu', () => {
    expect(initialSelection(SPORTS, 'kayak')).toBeNull();
  });

  it('supporte une liste vide', () => {
    expect(initialSelection([], 'running')).toBeNull();
  });
});

/**
 * Sports non démarrables (revue #68).
 *
 * Le backend peut exposer un sport dont le mobile n'a pas de module. Le laisser entrer
 * dans la liste permettrait de le définir comme défaut, de le présélectionner, puis de
 * ne rien faire au clic sur « Démarrer » — un cul-de-sac. Le filtre a donc lieu AVANT
 * l'ordonnancement et la présélection, ce que ces cas figent.
 */
describe('sports non démarrables', () => {
  const startable = SPORTS.filter((s) => s.code !== 'strength');

  it('n’ordonne que les sports démarrables', () => {
    expect(orderSports(startable, 'walking').map((s) => s.code)).toEqual(['walking', 'running']);
  });

  it('ne présélectionne pas un sport absent de la liste filtrée', () => {
    expect(initialSelection(startable, 'strength')).toBeNull();
  });
});
