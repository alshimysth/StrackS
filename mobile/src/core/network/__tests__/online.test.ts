/**
 * Network detection (#27/#41): the nuance that matters is the captive portal.
 */
import type { NetInfoState } from '@react-native-community/netinfo';

import { isOnlineFrom } from '../online';

function state(partial: Partial<NetInfoState>): NetInfoState {
  return { isConnected: true, isInternetReachable: true, ...partial } as NetInfoState;
}

describe('isOnlineFrom', () => {
  it('is online when the connection routes', () => {
    expect(isOnlineFrom(state({}))).toBe(true);
  });

  it('is offline without a connection', () => {
    expect(isOnlineFrom(state({ isConnected: false }))).toBe(false);
  });

  /**
   * Hotel Wi-Fi with a captive portal: the device is "connected" but reaches nothing.
   * Relying on `isConnected` would make the app think it's online and send its requests
   * nowhere.
   */
  it('is offline on a connection that does not route', () => {
    expect(isOnlineFrom(state({ isConnected: true, isInternetReachable: false }))).toBe(false);
  });

  /**
   * `null` = NetInfo hasn't decided yet. Staying optimistic avoids an "offline" banner
   * flashing at every app launch.
   */
  it('stays optimistic while reachability is undetermined', () => {
    expect(isOnlineFrom(state({ isConnected: true, isInternetReachable: null }))).toBe(true);
  });
});
