/** #82: onboarding shows once per device, and never to someone who already allowed. */
type Storage = typeof import('@react-native-async-storage/async-storage').default;

const mockGranted = jest.fn();

jest.mock('../../gps/position', () => ({
  hasForegroundPermission: () => mockGranted(),
}));

let useOnboarding: typeof import('../onboarding').useOnboarding;
let KEY: string;
/** Read again after each `resetModules`: the tested module and the test share the same instance. */
let AsyncStorage: Storage;

beforeEach(async () => {
  jest.resetModules();
  const storageModule = require('@react-native-async-storage/async-storage');
  AsyncStorage = storageModule.default ?? storageModule;
  await AsyncStorage.clear();
  mockGranted.mockResolvedValue(false);
  ({ useOnboarding, ONBOARDING_KEY: KEY } = require('../onboarding'));
});

it('is pending on the very first launch', async () => {
  await useOnboarding.getState().load();
  expect(useOnboarding.getState().status).toBe('pending');
});

it('does not come back once completed, even after a restart', async () => {
  await useOnboarding.getState().load();
  await useOnboarding.getState().complete();
  expect(await AsyncStorage.getItem(KEY)).not.toBeNull();

  // Restart: the in-memory state is lost, the device storage stays.
  useOnboarding.setState({ status: 'unknown' });
  await useOnboarding.getState().load();
  expect(useOnboarding.getState().status).toBe('done');
});

/** App update: the permission is already granted, there's nothing left to explain. */
it('steps aside for someone who already granted location', async () => {
  mockGranted.mockResolvedValue(true);
  await useOnboarding.getState().load();
  expect(useOnboarding.getState().status).toBe('done');
  expect(await AsyncStorage.getItem(KEY)).not.toBeNull();
});

it('stays pending if the permission cannot be read', async () => {
  mockGranted.mockRejectedValue(new Error('module natif absent'));
  await useOnboarding.getState().load();
  expect(useOnboarding.getState().status).toBe('pending');
});

/**
 * PR #85 review: two reads started before and after login. If the user completes
 * onboarding while the slower one waits, it must not reopen it.
 */
it('does not reopen an onboarding completed during an in-flight read', async () => {
  let releasePermission: (granted: boolean) => void = () => undefined;
  mockGranted.mockImplementation(
    () => new Promise<boolean>((resolve) => (releasePermission = resolve)),
  );
  const getItem = jest.spyOn(AsyncStorage, 'getItem');

  const first = useOnboarding.getState().load();
  const second = useOnboarding.getState().load(); // shares the in-flight read
  await Promise.resolve();
  await Promise.resolve();

  await useOnboarding.getState().complete(); // the user completed in the meantime
  releasePermission(false); // the slow read comes back with "to do"
  await Promise.all([first, second]);

  expect(useOnboarding.getState().status).toBe('done');
  expect(getItem).toHaveBeenCalledTimes(1);
});

