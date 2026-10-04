import type { NetworkState } from 'expo-network';

/** The part of `expo-network` the account session reads; the composition passes the module. */
export type NetworkModule = Readonly<{
  getNetworkStateAsync: () => Promise<NetworkState>;
  addNetworkStateListener: (listener: (state: NetworkState) => void) => Readonly<{ remove: () => void }>;
}>;

/** Whether the device is online, as the account screens and passes read it. */
export type AccountNetwork = Readonly<{
  current: () => Promise<boolean>;
  onChange: (listener: (online: boolean) => void) => () => void;
}>;

/**
 * Offline only when the device says so: no active connection, or one without internet. A
 * state it cannot determine reads as online, so the offline lines and the disabled deletion
 * never show on a guess (ADR 0041 sections 5 and 7).
 */
export function isOnline(state: NetworkState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

export function createNetworkState(network: NetworkModule): AccountNetwork {
  return {
    current: async () => isOnline(await network.getNetworkStateAsync()),
    onChange(listener) {
      const subscription = network.addNetworkStateListener((state) => listener(isOnline(state)));
      return () => subscription.remove();
    },
  };
}
