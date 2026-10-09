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
  for (const permission of ['granted', 'denied', 'undetermined']) {
    assert.equal(locationCaptionKey(manualLocation, permission), null);
    assert.equal(locationCaptionKey(null, permission), null);
    assert.equal(locationCaptionKey(undefined, permission), null);
  }
});

test('a device location reports its accuracy while access is granted', () => {
  assert.equal(locationCaptionKey(deviceLocation('full'), 'granted'), 'fullLocation');
  assert.equal(
    locationCaptionKey(deviceLocation('approximate'), 'granted'),
    'approximateLocation',
  );
});

test('denied access outranks the accuracy and says access is off', () => {
  assert.equal(locationCaptionKey(deviceLocation('full'), 'denied'), 'locationAccessOff');
  assert.equal(
    locationCaptionKey(deviceLocation('approximate'), 'denied'),
    'locationAccessOff',
  );
});

test('undetermined access shows the last known place without claiming access is off', () => {
  assert.equal(locationCaptionKey(deviceLocation('full'), 'undetermined'), 'lastKnownPlace');
  assert.equal(
    locationCaptionKey(deviceLocation('approximate'), 'undetermined'),
    'lastKnownPlace',
  );
});
