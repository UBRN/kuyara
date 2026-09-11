import { resolveDeviceHour12 } from '@/localization/device-locale';

// The iOS settings dictionary carries one of these keys only while the user's 24-Hour Time
// switch disagrees with the region; the region decides in every other case, Android
// included, where no dictionary exists at all.
describe('resolveDeviceHour12', () => {
  test.each([
    [{ AppleICUForce24HourTime: true }, 'en-US', false],
    [{ AppleICUForce24HourTime: 1 }, 'en-US', false],
    [{ AppleICUForce12HourTime: true }, 'tr-TR', true],
    [{ AppleICUForce12HourTime: 1 }, 'en-GB', true],
  ] as const)('follows the forced setting over the locale', (settings, locale, expected) => {
    expect(resolveDeviceHour12(settings, locale)).toBe(expected);
  });

  test.each([
    ['en-US', true],
    ['en-GB', false],
    ['tr-TR', false],
  ] as const)('falls back to the region for %s', (locale, expected) => {
    expect(resolveDeviceHour12(undefined, locale)).toBe(expected);
    expect(resolveDeviceHour12({}, locale)).toBe(expected);
    expect(resolveDeviceHour12({ AppleLanguages: ['en'] }, locale)).toBe(expected);
  });
});
