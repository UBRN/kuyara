import assert from 'node:assert/strict';
import test from 'node:test';

import { temperatureUnitFor } from './temperature-unit.ts';

// System reads the device's Temperature setting, which follows the region unless the person set
// it: Celsius on metric and UK devices (Apple's Foundation formats 20 °C for en_GB), Fahrenheit on
// US customary ones. A fixed choice wins on every device.
test('every temperature choice on every device measurement system', () => {
  const deviceUnit = { metric: 'celsius', us: 'fahrenheit', uk: 'celsius' };
  for (const [system, unit] of Object.entries(deviceUnit)) {
    assert.equal(temperatureUnitFor('system', unit), unit, `system on ${system}`);
    assert.equal(temperatureUnitFor('celsius', unit), 'celsius', `celsius on ${system}`);
    assert.equal(temperatureUnitFor('fahrenheit', unit), 'fahrenheit', `fahrenheit on ${system}`);
  }
});

test('System follows a device Temperature setting that overrides the region', () => {
  assert.equal(temperatureUnitFor('system', 'fahrenheit'), 'fahrenheit');
  assert.equal(temperatureUnitFor('celsius', 'fahrenheit'), 'celsius');
});
