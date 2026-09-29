/** #82 : l'onboarding s'affiche une fois par appareil, et jamais à qui a déjà autorisé. */
type Storage = typeof import('@react-native-async-storage/async-storage').default;

const mockGranted = jest.fn();

jest.mock('../../gps/position', () => ({
  hasForegroundPermission: () => mockGranted(),
}));

let useOnboarding: typeof import('../onboarding').useOnboarding;
let KEY: string;
/** Relu après chaque `resetModules` : le module testé et le test partagent la même instance. */
let AsyncStorage: Storage;

beforeEach(async () => {
  jest.resetModules();
  const storageModule = require('@react-native-async-storage/async-storage');
  AsyncStorage = storageModule.default ?? storageModule;
  await AsyncStorage.clear();
  mockGranted.mockResolvedValue(false);
  ({ useOnboarding, ONBOARDING_KEY: KEY } = require('../onboarding'));
});

it('est à faire au tout premier lancement', async () => {
  await useOnboarding.getState().load();
  expect(useOnboarding.getState().status).toBe('pending');
});

it('ne revient pas une fois terminé, même après redémarrage', async () => {
  await useOnboarding.getState().load();
  await useOnboarding.getState().complete();
  expect(await AsyncStorage.getItem(KEY)).not.toBeNull();

  // Redémarrage : l'état en mémoire est perdu, le stockage de l'appareil, lui, reste.
  useOnboarding.setState({ status: 'unknown' });
  await useOnboarding.getState().load();
  expect(useOnboarding.getState().status).toBe('done');
});

/** Mise à jour de l'app : la permission est déjà accordée, il n'y a plus rien à expliquer. */
it('s’efface pour qui a déjà accordé la localisation', async () => {
  mockGranted.mockResolvedValue(true);
  await useOnboarding.getState().load();
  expect(useOnboarding.getState().status).toBe('done');
  expect(await AsyncStorage.getItem(KEY)).not.toBeNull();
});

it('reste à faire si la permission ne peut pas être lue', async () => {
  mockGranted.mockRejectedValue(new Error('module natif absent'));
  await useOnboarding.getState().load();
  expect(useOnboarding.getState().status).toBe('pending');
});

/**
 * Revue PR #85 : deux lectures lancées avant et après la connexion. Si l'utilisateur
 * termine l'onboarding pendant que la plus lente attend, elle ne doit pas le rouvrir.
 */
it('ne rouvre pas un onboarding terminé pendant une lecture en cours', async () => {
  let releasePermission: (granted: boolean) => void = () => undefined;
  mockGranted.mockImplementation(
    () => new Promise<boolean>((resolve) => (releasePermission = resolve)),
  );
  const getItem = jest.spyOn(AsyncStorage, 'getItem');

  const first = useOnboarding.getState().load();
  const second = useOnboarding.getState().load(); // partage la lecture en vol
  await Promise.resolve();
  await Promise.resolve();

  await useOnboarding.getState().complete(); // l'utilisateur a terminé entre-temps
  releasePermission(false); // la lecture lente revient avec « à faire »
  await Promise.all([first, second]);

  expect(useOnboarding.getState().status).toBe('done');
  expect(getItem).toHaveBeenCalledTimes(1);
});

