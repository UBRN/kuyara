import { appleWeatherMarkUrl } from '@/features/weather/data/apple-weather-mark';

const logos = {
  'logoLight@1x': '/light-1.png',
  'logoLight@2x': '/light-2.png',
  'logoLight@3x': '/light-3.png',
  'logoDark@1x': '/dark-1.png',
  'logoDark@2x': '/dark-2.png',
  'logoDark@3x': '/dark-3.png',
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('validates and reuses the public attribution response per language', async () => {
  const fetchMock = jest.fn(async (_url: string) => ({ ok: true, json: async () => ({ ...logos, extra: 'ignored' }) }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  expect(await appleWeatherMarkUrl('en', false, 2.6))
    .toBe('https://weatherkit.apple.com/light-3.png');
  expect(await appleWeatherMarkUrl('en', true, 1.8))
    .toBe('https://weatherkit.apple.com/dark-2.png');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]?.[0]).toBe('https://weatherkit.apple.com/attribution/en');
});

test('rejects a partial or untrusted mark response', async () => {
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ ...logos, 'logoDark@2x': '//unexpected.example/mark.png' }),
  })) as unknown as typeof fetch;
  await expect(appleWeatherMarkUrl('tr', true, 2)).rejects.toThrow();
});
