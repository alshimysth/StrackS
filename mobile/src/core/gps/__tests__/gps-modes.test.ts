/**
 * Modes GPS (#36). Le garde-fou principal : `balanced`, le mode par défaut, doit rester
 * EXACTEMENT les réglages avec lesquels le filtrage et la parité client/serveur ont été
 * établis. Le changer en douce changerait le tracé de tous ceux qui ne touchent à rien.
 */
import { GPS_MODES } from '../../preferences/schema';

jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6, High: 4, Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));
jest.mock('../background-task', () => ({ BACKGROUND_LOCATION_TASK: 'test-task' }));

// Importé après les mocks.
import { GPS_MODE_SETTINGS, startGpsWatch } from '../index';

const Location = jest.requireMock('expo-location');

it('couvre exactement les modes que la préférence autorise', () => {
  expect(Object.keys(GPS_MODE_SETTINGS).sort()).toEqual([...GPS_MODES].sort());
});

it('garde les réglages historiques en mode équilibré (défaut)', () => {
  expect(GPS_MODE_SETTINGS.balanced).toEqual({
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1000,
    distanceInterval: 2,
  });
});

/** Au-delà de 15 s sans fix, la distance n'est plus comptée (#19) : l'économie doit rester en dessous. */
it('garde le mode économie sous le seuil de perte de signal', () => {
  expect(GPS_MODE_SETTINGS.saver.timeInterval).toBeLessThan(15_000);
});

it('démarre le watch avec les réglages du mode demandé', async () => {
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  Location.watchPositionAsync.mockResolvedValue({ remove: jest.fn() });

  await startGpsWatch(() => undefined, 'saver');

  expect(Location.watchPositionAsync).toHaveBeenCalledWith(
    GPS_MODE_SETTINGS.saver,
    expect.any(Function),
  );
});
