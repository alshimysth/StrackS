/** Aucune donnée personnelle ne part chez le tiers de monitoring. */
import { sanitizeText, scrub, stripQuery } from '../scrub';

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

/** Revue PR #88 : une clé composée échappait à la liste de noms exacts. */
it('reconnaît les clés composées', () => {
  const clean = scrub({ accessToken: 'a', userEmail: 'b', startLat: 1, currentPosition: 'c', statusCode: 500 });
  expect(clean).toEqual({
    accessToken: '[retiré]',
    userEmail: '[retiré]',
    startLat: '[retiré]',
    currentPosition: '[retiré]',
    statusCode: 500, // clé technique, conservée
  });
});

/** Revue PR #88 : un message d'erreur libre peut contenir une adresse ou un jeton. */
it('masque emails, jetons et coordonnées dans le texte libre', () => {
  expect(sanitizeText('Échec pour a.b@example.com avec eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl à 48.85661,2.35222')).toBe(
    'Échec pour [email retiré] avec [JWT retiré] à [coord. retirée],[coord. retirée]',
  );
  // Un nombre ordinaire n'est pas une coordonnée.
  expect(sanitizeText('HTTP 503 après 2.5 s, 42 points')).toBe('HTTP 503 après 2.5 s, 42 points');
  expect(scrub({ exception: { values: [{ value: 'Account a@example.com failed' }] } })).toEqual({
    exception: { values: [{ value: 'Account [email retiré] failed' }] },
  });
});

/** Revue PR #88 : au-delà de la limite de profondeur, rien n'est renvoyé sans inspection. */
it('remplace un sous-arbre trop profond au lieu de le laisser passer', () => {
  let deep: Record<string, unknown> = { password: 'secret' };
  for (let i = 0; i < 12; i++) {
    deep = { level: deep };
  }
  expect(JSON.stringify(scrub(deep))).not.toContain('secret');
});

/** Revue PR #88 : un secret écrit en clair dans un message libre. Résultat comparé en entier. */
it.each([
  ['Password hunter2 failed', 'Password [retiré] failed'],
  ['mot de passe: s3cr3t refusé', 'mot de passe: [retiré] refusé'],
  ['invalid token=abc.def', 'invalid token=[retiré]'],
  ['Authorization: Bearer xyz', 'Authorization: Bearer [retiré]'],
  ['header Bearer eyJhbGciOiJIUzI1NiJ9 rejected', 'header Bearer [retiré] rejected'],
  ['Authorization: Basic dXNlcjpwYXNz', 'Authorization: Basic [retiré]'],
  ['code ABCD-2345 expiré', 'code [retiré] expiré'],
  ['reçu WXYZ2345 par email', 'reçu [code retiré] par email'],
])('masque « %s »', (input, expected) => {
  expect(sanitizeText(input)).toBe(expected);
});

it('laisse intacts les messages techniques ordinaires', () => {
  for (const text of ['Network request failed', 'HTTP 503 Service Unavailable', 'Séance introuvable côté serveur']) {
    expect(sanitizeText(text)).toBe(text);
  }
});

