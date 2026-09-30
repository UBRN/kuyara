import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { appleWeatherMarkUrl } from './data/apple-weather-mark.ts';

const logos = {
  'logoLight@1x': '/light-1.png',
  'logoLight@2x': '/light-2.png',
  'logoLight@3x': '/light-3.png',
  'logoDark@1x': '/dark-1.png',
  'logoDark@2x': '/dark-2.png',
  'logoDark@3x': '/dark-3.png',
};

test('reads the attribution through the injected fetch and reuses it per language', async () => {
  const calls = [];
  const fetchAttribution = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ ...logos, extra: 'ignored' }) };
  };

  assert.equal(
    await appleWeatherMarkUrl('en', false, 2.6, fetchAttribution),
    'https://weatherkit.apple.com/light-3.png',
  );
  assert.equal(
    await appleWeatherMarkUrl('en', true, 1.8, fetchAttribution),
    'https://weatherkit.apple.com/dark-2.png',
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://weatherkit.apple.com/attribution/en');
});

test('aborts the attribution request after five seconds', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const fetchAttribution = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });

    const pending = appleWeatherMarkUrl('tr', false, 1, fetchAttribution);
    mock.timers.tick(5000);

    await assert.rejects(pending, /aborted/);
  } finally {
    mock.timers.reset();
  }
});

test('a failed attribution fetch is not cached: the next read fetches again', async () => {
  let calls = 0;
  const fetchAttribution = async () => {
    calls += 1;
    if (calls === 1) throw new Error('offline');
    return { ok: true, json: async () => logos };
  };

  await assert.rejects(appleWeatherMarkUrl('tr', false, 1, fetchAttribution), /offline/);
  assert.equal(
    await appleWeatherMarkUrl('tr', false, 1, fetchAttribution),
    'https://weatherkit.apple.com/light-1.png',
  );
  assert.equal(calls, 2);
});
