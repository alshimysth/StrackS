/**
 * Story #41, DoD : « un utilisateur hors ligne comprend que le problème vient du
 * réseau, pas de l'app ». C'est cette classification qui le décide.
 */
import { ApiError } from '../client';
import { classifyError, errorCopy } from '../error-kind';

function problem(status: number) {
  return new ApiError({ title: 'Erreur', status, detail: 'détail' });
}

describe('classifyError', () => {
  /**
   * `fetch` rejette avec un TypeError quand l'appareil ne joint pas le serveur. C'est
   * l'unique signal disponible pour distinguer « pas de réseau » de « serveur en
   * panne » — un 5xx suppose une réponse, donc une connexion.
   */
  it('traite une erreur non-HTTP comme une absence de réseau', () => {
    expect(classifyError(new TypeError('Network request failed'))).toBe('offline');
  });

  it('traite un rejet sans erreur comme une absence de réseau', () => {
    expect(classifyError(undefined)).toBe('offline');
    expect(classifyError('boom')).toBe('offline');
  });

  it.each([500, 502, 503])('classe %s en panne serveur', (status) => {
    expect(classifyError(problem(status))).toBe('server');
  });

  it.each([401, 403])('classe %s en session refusée', (status) => {
    expect(classifyError(problem(status))).toBe('unauthorized');
  });

  it.each([400, 404, 409, 422])('classe %s en erreur de requête', (status) => {
    expect(classifyError(problem(status))).toBe('client');
  });
});

describe('errorCopy', () => {
  it('ne présente pas le hors-ligne comme une panne de l’app', () => {
    expect(errorCopy.offline.title).not.toMatch(/erreur|panne|échec/i);
  });

  it('distingue le message hors ligne du message serveur', () => {
    expect(errorCopy.offline.title).not.toBe(errorCopy.server.title);
  });

  /** Contrainte du ticket : ton coach français, sans emoji en production. */
  it('n’utilise aucun emoji', () => {
    const all = Object.values(errorCopy)
      .flatMap((c) => [c.title, c.message])
      .join(' ');
    expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
