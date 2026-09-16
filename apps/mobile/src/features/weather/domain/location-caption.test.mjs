import assert from 'node:assert/strict';
import test from 'node:test';

import { locationCaptionKey } from './location-caption.ts';

const base = {
  locationKey: 'device.4101.2897',
  coordinates: { latitudeE2: 4101, longitudeE2: 2897 },
  timeZone: 'Europe/Istanbul',
};
const deviceLocation = (accuracy) => ({ ...base, source: 'device', accuracy });
const manualLocation = {
  ...base,
  source: 'manual',
  catalogId: 'place.745044',
  displayName: 'İstanbul',
};

test('a manual place is neither precise nor approximate, whatever the permission says', () => {
  assert.equal(locationCaptionKey(manualLocation, true), null);
  assert.equal(locationCaptionKey(manualLocation, false), null);
  assert.equal(locationCaptionKey(null, true), null);
  assert.equal(locationCaptionKey(undefined, false), null);
});

test('a device location reports its accuracy, and revoked access outranks it', () => {
  assert.equal(locationCaptionKey(deviceLocation('full'), true), 'fullLocation');
  assert.equal(
    locationCaptionKey(deviceLocation('approximate'), true),
    'approximateLocation',
  );
  assert.equal(locationCaptionKey(deviceLocation('full'), false), 'locationAccessOff');
  assert.equal(
    locationCaptionKey(deviceLocation('approximate'), false),
    'locationAccessOff',
  );
});
