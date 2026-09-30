/**
 * Core network state: the single source for react-query AND for the UI.
 *
 * react-query ships its own `onlineManager`, but its default detector is the browser's:
 * under React Native it considers the app **always online**. Without the wiring below,
 * requests go nowhere in airplane mode and `retry` attempts run out instead of waiting for
 * the network to return.
 *
 * `isInternetReachable` is told apart from `isConnected` on purpose: a hotel Wi-Fi with a
 * captive portal is "connected" without routing anything. While the value is `null`,
 * NetInfo hasn't decided yet; we stay optimistic rather than showing an offline banner at
 * every launch.
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

export function isOnlineFrom(state: NetInfoState): boolean {
  return Boolean(state.isConnected) && state.isInternetReachable !== false;
}

/**
 * Call once at startup.
 *
 * `setEventListener` returns nothing: `onlineManager` keeps the unsubscribe function
 * returned by the setup and calls it itself when another listener replaces it. There is
 * therefore no cleanup to hand back to the caller.
 */
export function setupOnlineManager(): void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(isOnlineFrom(state));
    }),
  );
}

/** Reactive read of the network state, backed by the same manager as the queries. */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
    () => true,
  );
}
