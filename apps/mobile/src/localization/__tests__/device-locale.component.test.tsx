import { act, render } from '@testing-library/react-native';
import { AppState, NativeModules, Platform, Text } from 'react-native';

import { LocalizationProvider } from '@/localization/localization-provider';
import { useLocalization } from '@/localization/use-messages';
import {
  firstSupportedLocale,
  getDeviceHour12,
  getDeviceLocale,
  getDeviceTemperatureUnit,
  resolveDeviceHour12,
  resolveDeviceTemperatureUnit,
  useDeviceTemperatureUnit,
} from '@/localization/device-locale';

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

describe('resolveDeviceTemperatureUnit', () => {
  test.each([
    [{ AppleTemperatureUnit: 'Fahrenheit' }, [{ temperatureUnit: 'celsius' }], 'fahrenheit'],
    [{ AppleTemperatureUnit: 'Celsius' }, [{ temperatureUnit: 'fahrenheit' }], 'celsius'],
    [undefined, [{ temperatureUnit: 'fahrenheit' }], 'fahrenheit'],
    [undefined, [{ temperatureUnit: 'celsius' }], 'celsius'],
    [undefined, [{ temperatureUnit: null }], 'celsius'],
    [undefined, [{ temperatureUnit: undefined }], 'celsius'],
    [{ AppleTemperatureUnit: 'junk' }, [{ temperatureUnit: 'fahrenheit' }], 'fahrenheit'],
    [undefined, [{ temperatureUnit: 'junk' }], 'celsius'],
  ] as const)('resolves settings and locale values', (settings, locales, expected) => {
    expect(resolveDeviceTemperatureUnit(settings, locales)).toBe(expected);
  });
});

test('a mounted iOS unit reader follows fresh native settings on foregrounding', async () => {
  const originalOS = Platform.OS;
  const originalSettingsManager = NativeModules.SettingsManager;
  Platform.OS = 'ios';
  let override: 'Fahrenheit' | null = null;
  const getConstants = jest.fn(() => ({
    settings: override ? { AppleTemperatureUnit: override } : {},
  }));
  NativeModules.SettingsManager = {
    settings: { AppleTemperatureUnit: 'Fahrenheit' },
    getConstants,
  };
  let onAppStateChange: ((state: string) => void) | undefined;
  const remove = jest.fn();
  const appState = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    onAppStateChange = callback as (state: string) => void;
    return { remove };
  });

  function UnitReader() {
    return <Text testID="device-unit">{useDeviceTemperatureUnit()}</Text>;
  }

  try {
    const view = await render(<UnitReader />);
    expect(view.getByTestId('device-unit')).toHaveTextContent('celsius');
    expect(getDeviceTemperatureUnit()).toBe('celsius');
    expect(getConstants).toHaveBeenCalled();
    override = 'Fahrenheit';
    await act(async () => onAppStateChange?.('active'));
    expect(view.getByTestId('device-unit')).toHaveTextContent('fahrenheit');
    expect(getDeviceTemperatureUnit()).toBe('fahrenheit');
    override = null;
    await act(async () => onAppStateChange?.('active'));
    expect(view.getByTestId('device-unit')).toHaveTextContent('celsius');
    expect(getDeviceTemperatureUnit()).toBe('celsius');
    await view.unmount();
    expect(remove).toHaveBeenCalled();
    NativeModules.SettingsManager = { settings: { AppleTemperatureUnit: 'Fahrenheit' } };
    expect(getDeviceTemperatureUnit()).toBe('fahrenheit');
    Platform.OS = 'android';
    expect(getDeviceTemperatureUnit()).toBe('celsius');
  } finally {
    Platform.OS = originalOS;
    NativeModules.SettingsManager = originalSettingsManager;
    appState.mockRestore();
  }
});

test('the localization provider re-reads the 12/24-hour switch when the app returns to the foreground', async () => {
  const originalOS = Platform.OS;
  const originalSettingsManager = NativeModules.SettingsManager;
  Platform.OS = 'ios';
  let force24Hour = false;
  NativeModules.SettingsManager = {
    getConstants: () => ({
      settings: { AppleLanguages: ['en-US'], ...(force24Hour ? { AppleICUForce24HourTime: true } : {}) },
    }),
  };
  let onAppStateChange: ((state: string) => void) | undefined;
  const appState = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    onAppStateChange = callback as (state: string) => void;
    return { remove: jest.fn() };
  });

  function HourReader() {
    return <Text testID="hour12">{String(useLocalization().hour12)}</Text>;
  }

  try {
    const view = await render(<LocalizationProvider><HourReader /></LocalizationProvider>);
    expect(view.getByTestId('hour12')).toHaveTextContent('true');
    force24Hour = true;
    await act(async () => onAppStateChange?.('active'));
    expect(view.getByTestId('hour12')).toHaveTextContent('false');
    await view.unmount();
  } finally {
    Platform.OS = originalOS;
    NativeModules.SettingsManager = originalSettingsManager;
    appState.mockRestore();
  }
});

// The system language is the first of the device's preferred list that the app supports.
describe('the system language', () => {
  test.each([
    [['de-DE', 'tr-TR'], 'tr-TR'],
    [['fr-FR', 'de-DE', 'tr'], 'tr'],
    [['en-GB', 'tr-TR'], 'en-GB'],
    [['zh-Hans-CN', 'EN_us'], 'EN_us'],
    [['de-DE', 'fr-FR'], 'de-DE'],
    [[], undefined],
  ] as const)('%j resolves to %s', (candidates, expected) => {
    expect(firstSupportedLocale(candidates)).toBe(expected);
  });

  test('iOS reads the whole AppleLanguages list', () => {
    const originalOS = Platform.OS;
    const originalSettingsManager = NativeModules.SettingsManager;
    Platform.OS = 'ios';
    NativeModules.SettingsManager = { settings: { AppleLanguages: ['de-DE', 'tr-TR'] } };
    try {
      expect(getDeviceLocale()).toBe('tr-TR');
      NativeModules.SettingsManager = { settings: { AppleLanguages: ['de-DE', 'fr-FR'] } };
      expect(getDeviceLocale()).toBe('de-DE');
    } finally {
      Platform.OS = originalOS;
      NativeModules.SettingsManager = originalSettingsManager;
    }
  });
});

// The interface language and the clock are two decisions: the language is the first
// supported entry of the preferred list, the clock is the device's own setting or region.
describe('the 12/24-hour clock', () => {
  test.each([
    [['de-DE', 'en-US'], 'de_DE', undefined, false],
    [['tr-TR', 'en-US'], 'en_US', undefined, true],
    [['de-DE', 'en-US'], 'de_DE@calendar=gregorian', undefined, false],
    [['de-DE', 'en-US'], 'de_DE', { AppleICUForce12HourTime: true }, true],
    [['en-US'], 'en_US', { AppleICUForce24HourTime: true }, false],
    [['de-DE', 'en-US'], undefined, undefined, false],
    [['en-US', 'de-DE'], 'en', undefined, true],
  ] as const)('%j with AppleLocale %s and %j reads 12-hour: %s', (languages, locale, forced, expected) => {
    const originalOS = Platform.OS;
    const originalSettingsManager = NativeModules.SettingsManager;
    Platform.OS = 'ios';
    NativeModules.SettingsManager = {
      settings: { AppleLanguages: languages, ...(locale ? { AppleLocale: locale } : {}), ...forced },
    };
    try {
      expect(getDeviceHour12()).toBe(expected);
    } finally {
      Platform.OS = originalOS;
      NativeModules.SettingsManager = originalSettingsManager;
    }
  });

  test('the interface language still takes the first supported entry', () => {
    const originalOS = Platform.OS;
    const originalSettingsManager = NativeModules.SettingsManager;
    Platform.OS = 'ios';
    NativeModules.SettingsManager = {
      settings: { AppleLanguages: ['de-DE', 'en-US'], AppleLocale: 'de_DE' },
    };
    try {
      expect(getDeviceLocale()).toBe('en-US');
      expect(getDeviceHour12()).toBe(false);
    } finally {
      Platform.OS = originalOS;
      NativeModules.SettingsManager = originalSettingsManager;
    }
  });
});
