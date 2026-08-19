/**
 * Construction du PATCH d'édition (#25).
 *
 * Le backend traite un champ absent comme « ne pas toucher ». Envoyer les deux champs
 * à chaque enregistrement écraserait donc une note écrite entre-temps ailleurs — d'où
 * un patch réduit à ce qui a réellement changé.
 */
import { buildPatch } from '../ActivityEditor';

describe('buildPatch', () => {
  it('n’envoie rien quand rien n’a bougé', () => {
    expect(buildPatch({ title: 'Trail', notes: 'RAS' }, { title: 'Trail', notes: 'RAS' })).toEqual(
      {},
    );
  });

  it('n’envoie que le champ modifié', () => {
    expect(buildPatch({ title: 'Trail', notes: 'RAS' }, { title: 'Sortie', notes: 'RAS' })).toEqual(
      { title: 'Trail' },
    );
  });

  /** Champ vidé : la chaîne vide est l'effacement explicite attendu par le backend. */
  it('envoie une chaîne vide pour effacer un titre', () => {
    expect(buildPatch({ title: '', notes: '' }, { title: 'Trail', notes: null })).toEqual({
      title: '',
    });
  });

  /** `null` en base et `''` dans le champ décrivent le même état : rien à envoyer. */
  it('ne confond pas null et chaîne vide avec une modification', () => {
    expect(buildPatch({ title: '', notes: '' }, { title: null, notes: null })).toEqual({});
  });

  it('envoie les deux champs quand les deux changent', () => {
    expect(
      buildPatch({ title: 'Trail', notes: 'Jambes lourdes' }, { title: null, notes: null }),
    ).toEqual({ title: 'Trail', notes: 'Jambes lourdes' });
  });
});
