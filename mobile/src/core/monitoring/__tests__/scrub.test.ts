/** Aucune donnée personnelle ne part chez le tiers de monitoring. */
import { scrub, stripQuery } from '../scrub';

it('retire positions, emails, jetons et codes où qu’ils soient', () => {
  const event = {
    message: 'Échec de l’envoi du tracé',
    extra: {
      points: [{ lat: 48.85, lng: 2.35 }],
      activity: { id: 'act-1', distanceM: 4200 },
      request: { body: { email: 'a@example.com', password: 'secret', code: 'ABCD-EFGH' } },
      headers: { Authorization: 'Bearer eyJ…' },
    },
    breadcrumbs: [{ data: { latitude: 45.1, longitude: 5.2, refreshToken: 'r' } }],
  };

  const clean = scrub(event);
  const text = JSON.stringify(clean);

  for (const secret of ['48.85', '2.35', 'a@example.com', 'secret', 'ABCD-EFGH', 'eyJ', '45.1', '"r"']) {
    expect(text).not.toContain(secret);
  }
  // Ce qui aide au diagnostic reste : message, identifiant d'activité, distance.
  expect(clean.message).toBe('Échec de l’envoi du tracé');
  expect(clean.extra.activity).toEqual({ id: 'act-1', distanceM: 4200 });
});

it('ne modifie pas l’objet d’origine', () => {
  const original = { email: 'a@example.com' };
  scrub(original);
  expect(original.email).toBe('a@example.com');
});

it('retire la chaîne de requête des URL', () => {
  expect(stripQuery('https://api.test/api/v1/stats/summary?period=week&tz=Europe/Paris')).toBe(
    'https://api.test/api/v1/stats/summary',
  );
  expect(stripQuery(undefined)).toBeUndefined();
});
