import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { mockNativeModules } from '../../../test/fakes/mock-native-modules.mjs';

// The mocked native module reads its behaviour from this global, so each test scripts the fix.
globalThis.__locationMock = {};

mockNativeModules({
  'expo-location': `
    export const Accuracy = { Low: 1 };
    export const PermissionStatus = { UNDETERMINED: 'undetermined' };
    const m = () => globalThis.__locationMock;
    export const hasServicesEnabledAsync = async () => true;
    export const getForegroundPermissionsAsync = async () => ({
      status: 'granted', granted: true, canAskAgain: true, ios: { accuracy: 'full' },
    });
    export const getCurrentPositionAsync = (...args) => m().getCurrentPositionAsync(...args);
    export const reverseGeocodeAsync = async () => [{ city: 'Kadıköy', timezone: 'Europe/Istanbul' }];
  `,
  'react-native': `
    export const Linking = { openSettings() { return Promise.resolve(); } };
  `,
});

const { ExpoDeviceLocationGateway } = await import('./data/expo-device-location-gateway.ts');

test('a fix that never arrives ends in lookup-failed instead of hanging the picker', { timeout: 5_000 }, async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    globalThis.__locationMock.getCurrentPositionAsync = () => new Promise(() => {});
    const pending = new ExpoDeviceLocationGateway().getCurrentLocation();
    // Let the awaited service and permission checks reach the position call.
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    mock.timers.tick(60_000);
    assert.deepEqual(await pending, { kind: 'lookup-failed' });
  } finally {
    mock.timers.reset();
  }
});

test('a fix that arrives in time still succeeds', async () => {
  globalThis.__locationMock.getCurrentPositionAsync = async () => ({
    coords: { latitude: 41.0123, longitude: 28.9789 },
  });
  const result = await new ExpoDeviceLocationGateway().getCurrentLocation();
  assert.equal(result.kind, 'success');
  assert.equal(result.location.locationKey, 'device:4101:2898');
});
