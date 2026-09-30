/**
 * Building the edit PATCH (#25).
 *
 * The backend treats an absent field as "don't touch". Sending both fields on every save
 * would therefore overwrite a note written elsewhere in the meantime, hence a patch
 * reduced to what actually changed.
 */
import { buildPatch } from '../ActivityEditor';

describe('buildPatch', () => {
  it('sends nothing when nothing changed', () => {
    expect(buildPatch({ title: 'Trail', notes: 'RAS' }, { title: 'Trail', notes: 'RAS' })).toEqual(
      {},
    );
  });

  it('only sends the changed field', () => {
    expect(buildPatch({ title: 'Trail', notes: 'RAS' }, { title: 'Sortie', notes: 'RAS' })).toEqual(
      { title: 'Trail' },
    );
  });

  /** Cleared field: the empty string is the explicit clear the backend expects. */
  it('sends an empty string to clear a title', () => {
    expect(buildPatch({ title: '', notes: '' }, { title: 'Trail', notes: null })).toEqual({
      title: '',
    });
  });

  /** `null` in the database and `''` in the field describe the same state: nothing to send. */
  it('does not mistake null and empty string for a change', () => {
    expect(buildPatch({ title: '', notes: '' }, { title: null, notes: null })).toEqual({});
  });

  it('sends both fields when both change', () => {
    expect(
      buildPatch({ title: 'Trail', notes: 'Jambes lourdes' }, { title: null, notes: null }),
    ).toEqual({ title: 'Trail', notes: 'Jambes lourdes' });
  });
});
