/** Sans DSN, rien n'est initialisé : aucun événement ne peut partir. */
const mockInit = jest.fn();
jest.mock('@sentry/react-native', () => ({ init: (o: unknown) => mockInit(o), wrap: (c: unknown) => c }));

import { initMonitoring, monitoringEnabled } from '../sentry';

beforeEach(() => mockInit.mockClear());

it('reste éteint sans DSN', () => {
  expect(initMonitoring(undefined)).toBe(false);
  expect(initMonitoring('  ')).toBe(false);
  expect(mockInit).not.toHaveBeenCalled();
  expect(monitoringEnabled()).toBe(false);
});

it('s’initialise avec un DSN, sans donnée personnelle ni traces de performance', () => {
  expect(initMonitoring('https://clef@o0.ingest.de.sentry.io/1')).toBe(true);
  const options = mockInit.mock.calls[0][0];
  expect(options).toMatchObject({ sendDefaultPii: false, tracesSampleRate: 0 });

  const sent = options.beforeSend({
    user: { email: 'a@example.com', ip_address: '1.2.3.4' },
    request: { url: 'https://api.test/api/v1/activities?sport=running' },
    extra: { lat: 48.8 },
  });
  expect(sent.user).toBeUndefined();
  expect(sent.request.url).toBe('https://api.test/api/v1/activities');
  expect(JSON.stringify(sent)).not.toContain('48.8');
});
