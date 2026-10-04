import assert from 'node:assert/strict';
import test from 'node:test';

import { createNetworkState, isOnline } from './network-state.ts';

test('only a state that says there is no connection or no internet reads as offline', () => {
  assert.equal(isOnline({ type: 'WIFI', isConnected: true, isInternetReachable: true }), true);
  assert.equal(isOnline({ type: 'NONE', isConnected: false, isInternetReachable: false }), false);
  assert.equal(isOnline({ type: 'CELLULAR', isConnected: true, isInternetReachable: false }), false);
  // Unknown is not offline: the offline lines and the disabled deletion need a clear answer.
  assert.equal(isOnline({}), true);
  assert.equal(isOnline({ type: 'UNKNOWN' }), true);
});

test('the current state and each change arrive as online or offline, and the listener can be removed', async () => {
  let listener = null;
  let removed = 0;
  const state = createNetworkState({
    getNetworkStateAsync: async () => ({ isConnected: false }),
    addNetworkStateListener: (next) => {
      listener = next;
      return { remove: () => { removed += 1; } };
    },
  });
  assert.equal(await state.current(), false);
  const seen = [];
  const stop = state.onChange((online) => seen.push(online));
  listener({ isConnected: true, isInternetReachable: true });
  listener({ isConnected: true, isInternetReachable: false });
  stop();
  assert.deepEqual(seen, [true, false]);
  assert.equal(removed, 1);
});
