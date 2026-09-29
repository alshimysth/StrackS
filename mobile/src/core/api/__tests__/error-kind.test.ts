/**
 * Story #41, DoD: "an offline user understands the problem comes from the network, not
 * the app". This classification is what decides it.
 */
import { ApiError } from '../client';
import { classifyError, errorCopy } from '../error-kind';

function problem(status: number) {
  return new ApiError({ title: 'Erreur', status, detail: 'détail' });
}

describe('classifyError', () => {
  /**
   * `fetch` rejects with a TypeError when the device can't reach the server. It's the only
   * signal available to tell "no network" from "server down": a 5xx implies a response,
   * hence a connection.
   */
  it('treats a non-HTTP error as no network', () => {
    expect(classifyError(new TypeError('Network request failed'))).toBe('offline');
  });

  it('treats a rejection without error as no network', () => {
    expect(classifyError(undefined)).toBe('offline');
    expect(classifyError('boom')).toBe('offline');
  });

  it.each([500, 502, 503])('classifies %s as a server outage', (status) => {
    expect(classifyError(problem(status))).toBe('server');
  });

  /** #72: a 429 is neither an outage nor a faulty request; the user has to wait. */
  it('classifies 429 as rate limiting, with a message that does not mention an outage', () => {
    expect(classifyError(problem(429))).toBe('rate-limited');
    expect(errorCopy['rate-limited'].message).toMatch(/Patiente/);
  });

  it.each([401, 403])('classifies %s as a refused session', (status) => {
    expect(classifyError(problem(status))).toBe('unauthorized');
  });

  it.each([400, 404, 409, 422])('classifies %s as a request error', (status) => {
    expect(classifyError(problem(status))).toBe('client');
  });
});

describe('errorCopy', () => {
  it('does not present offline as an app failure', () => {
    expect(errorCopy.offline.title).not.toMatch(/erreur|panne|échec/i);
  });

  it('tells the offline message apart from the server message', () => {
    expect(errorCopy.offline.title).not.toBe(errorCopy.server.title);
  });

  /** Ticket constraint: French coach tone, no emoji in production. */
  it('uses no emoji', () => {
    const all = Object.values(errorCopy)
      .flatMap((c) => [c.title, c.message])
      .join(' ');
    expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
