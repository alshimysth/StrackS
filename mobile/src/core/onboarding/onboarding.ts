/**
 * First-launch onboarding (#82): "already seen" state, **per device**.
 *
 * Per device and not per account: what it explains (location permissions) belongs to the
 * phone. A second account on the same phone has nothing to learn again.
 * Stored in AsyncStorage: it isn't sensitive data.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { hasForegroundPermission } from '../gps/position';

export const ONBOARDING_KEY = 'stracks.onboarding.v1';

type Status = 'unknown' | 'pending' | 'done';

interface OnboardingState {
  status: Status;
  /** Reads the state once; no effect if already known. */
  load(): Promise<void>;
  complete(): Promise<void>;
}

/**
 * Shared in-flight read: two close `load()` calls (the tabs layout mounts before and after
 * login) must not start two reads, the slower of which would overwrite a `complete()` that
 * happened in between (PR #85 review).
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
      // Already allowed (app update, reinstall): there's nothing left to explain before
      // asking, since nothing will be asked anymore.
      const granted = await hasForegroundPermission().catch(() => false);
      if (granted) {
        await get().complete();
        return;
      }
      settle('pending');
    }

    /** A read never reopens an onboarding completed while it was waiting. */
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
