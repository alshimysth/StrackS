/** No personal data is sent to the monitoring third party. */
import { sanitizeText, scrub, stripQuery } from '../scrub';

it('removes locations, emails, tokens and codes wherever they are', () => {
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
  // What helps diagnosis stays: message, activity id, distance.
  expect(clean.message).toBe('Échec de l’envoi du tracé');
  expect(clean.extra.activity).toEqual({ id: 'act-1', distanceM: 4200 });
});

it('does not modify the original object', () => {
  const original = { email: 'a@example.com' };
  scrub(original);
  expect(original.email).toBe('a@example.com');
});

it('removes the query string from URLs', () => {
  expect(stripQuery('https://api.test/api/v1/stats/summary?period=week&tz=Europe/Paris')).toBe(
    'https://api.test/api/v1/stats/summary',
  );
  expect(stripQuery(undefined)).toBeUndefined();
});

/** PR #88 review: a compound key slipped past the list of exact names. */
it('recognizes compound keys', () => {
  const clean = scrub({ accessToken: 'a', userEmail: 'b', startLat: 1, currentPosition: 'c', statusCode: 500 });
  expect(clean).toEqual({
    accessToken: '[retiré]',
    userEmail: '[retiré]',
    startLat: '[retiré]',
    currentPosition: '[retiré]',
    statusCode: 500, // clé technique, conservée
  });
});

/** PR #88 review: a free error message may contain an address or a token. */
it('masks emails, tokens and coordinates in free text', () => {
  expect(sanitizeText('Échec pour a.b@example.com avec eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl à 48.85661,2.35222')).toBe(
    'Échec pour [email retiré] avec [JWT retiré] à [coord. retirée],[coord. retirée]',
  );
  // An ordinary number isn't a coordinate.
  expect(sanitizeText('HTTP 503 après 2.5 s, 42 points')).toBe('HTTP 503 après 2.5 s, 42 points');
  expect(scrub({ exception: { values: [{ value: 'Account a@example.com failed' }] } })).toEqual({
    exception: { values: [{ value: 'Account [email retiré] failed' }] },
  });
});

/** PR #88 review: beyond the depth limit, nothing is returned without inspection. */
it('replaces a too deep subtree instead of letting it through', () => {
  let deep: Record<string, unknown> = { password: 'secret' };
  for (let i = 0; i < 12; i++) {
    deep = { level: deep };
  }
  expect(JSON.stringify(scrub(deep))).not.toContain('secret');
});

/** PR #88 review: a secret written in clear in a free message. The whole result is compared. */
it.each([
  ['Password hunter2 failed', 'Password [retiré] failed'],
  ['mot de passe: s3cr3t refusé', 'mot de passe: [retiré] refusé'],
  ['invalid token=abc.def', 'invalid token=[retiré]'],
  ['Authorization: Bearer xyz', 'Authorization: Bearer [retiré]'],
  ['header Bearer eyJhbGciOiJIUzI1NiJ9 rejected', 'header Bearer [retiré] rejected'],
  ['Authorization: Basic dXNlcjpwYXNz', 'Authorization: Basic [retiré]'],
  ['code ABCD-2345 expiré', 'code [retiré] expiré'],
  ['reçu WXYZ2345 par email', 'reçu [code retiré] par email'],
])('masks "%s"', (input, expected) => {
  expect(sanitizeText(input)).toBe(expected);
});

it('leaves ordinary technical messages intact', () => {
  for (const text of ['Network request failed', 'HTTP 503 Service Unavailable', 'Séance introuvable côté serveur']) {
    expect(sanitizeText(text)).toBe(text);
  }
});

