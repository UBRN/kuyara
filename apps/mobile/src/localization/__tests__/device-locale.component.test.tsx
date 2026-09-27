import { act, render } from '@testing-library/react-native';
import { AppState, NativeModules, Platform, Text } from 'react-native';

import {
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
