/**
 * Onboarding de premier lancement (#82) : état « déjà vu », **par appareil**.
 *
 * Par appareil et non par compte : ce qu'il explique — les permissions de localisation —
 * appartient au téléphone. Un second compte sur le même téléphone n'a rien à réapprendre.
 * Stocké dans AsyncStorage : ce n'est pas une donnée sensible.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { hasForegroundPermission } from '../gps/position';

export const ONBOARDING_KEY = 'stracks.onboarding.v1';

type Status = 'unknown' | 'pending' | 'done';

interface OnboardingState {
  status: Status;
  /** Lit l'état une fois ; sans effet si déjà connu. */
  load(): Promise<void>;
  complete(): Promise<void>;
}

/**
 * Lecture en cours, partagée : deux `load()` rapprochés (la mise en page des onglets se
 * monte avant et après la connexion) ne doivent pas lancer deux lectures, dont la plus
 * lente écraserait un `complete()` survenu entre-temps (revue PR #85).
 */
let inFlight: Promise<void> | null = null;

export const useOnboarding = create<OnboardingState>((set, get) => ({
  status: 'unknown',

  load() {
    if (get().status !== 'unknown') {
      return Promise.resolve();
    }
    inFlight ??= read().finally(() => {
      inFlight = null;
    });
    return inFlight;

    async function read(): Promise<void> {
      const seen = await AsyncStorage.getItem(ONBOARDING_KEY).catch(() => null);
      if (seen != null) {
        settle('done');
        return;
      }
      // Déjà autorisé (mise à jour de l'app, réinstallation) : il n'y a plus rien à
      // expliquer avant de demander, puisque plus rien ne sera demandé.
      const granted = await hasForegroundPermission().catch(() => false);
      if (granted) {
        await get().complete();
        return;
      }
      settle('pending');
    }

    /** Une lecture ne revient jamais sur un onboarding terminé pendant qu'elle attendait. */
    function settle(status: Status): void {
      if (get().status !== 'done') {
        set({ status });
      }
    }
  },

  async complete() {
    set({ status: 'done' });
    await AsyncStorage.setItem(ONBOARDING_KEY, new Date().toISOString()).catch(() => {});
  },
}));
