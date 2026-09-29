/**
 * GPS modes (#36). The main safeguard: `balanced`, the default mode, must stay EXACTLY the
 * settings filtering and client/server parity were established with. Quietly changing it
 * would change the track of everyone who touches nothing.
 */
import { GPS_MODES } from '../../preferences/schema';

jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6, High: 4, Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));
jest.mock('../background-task', () => ({ BACKGROUND_LOCATION_TASK: 'test-task' }));

// Imported after the mocks.
import { GPS_MODE_SETTINGS, startGpsWatch } from '../index';

const Location = jest.requireMock('expo-location');

it('covers exactly the modes the preference allows', () => {
  expect(Object.keys(GPS_MODE_SETTINGS).sort()).toEqual([...GPS_MODES].sort());
});

it('keeps the historical settings in balanced mode (default)', () => {
  expect(GPS_MODE_SETTINGS.balanced).toEqual({
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1000,
    distanceInterval: 2,
  });
});

/** Beyond 15 s without a fix, distance is no longer counted (#19): saver mode must stay below. */
it('keeps saver mode under the signal loss threshold', () => {
  expect(GPS_MODE_SETTINGS.saver.timeInterval).toBeLessThan(15_000);
});

it('starts the watch with the requested mode settings', async () => {
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  Location.watchPositionAsync.mockResolvedValue({ remove: jest.fn() });

  await startGpsWatch(() => undefined, 'saver');

  expect(Location.watchPositionAsync).toHaveBeenCalledWith(
    GPS_MODE_SETTINGS.saver,
    expect.any(Function),
  );
});
