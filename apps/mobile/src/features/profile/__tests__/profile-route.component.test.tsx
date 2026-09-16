import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ProductAnalyticsContext } from '@/features/analytics/application/use-product-analytics';
import { ErrorEpisodeTracker } from '@/features/analytics/application/error-episode-tracker';
import { FirstUseTracker } from '@/features/analytics/application/first-use-tracker';
import { RetryCounter } from '@/features/analytics/application/retry-counter';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import {
  WardrobeApplicationContext,
  type WardrobeApplicationValue,
} from '@/features/wardrobe/application/wardrobe-application-context';
import {
  WeatherApplicationContext,
  type WeatherApplicationValue,
} from '@/features/weather/application/weather-application-context';
import type { ActiveLocation } from '@/features/weather/domain/weather';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => {
  const actualReact = jest.requireActual('react') as typeof import('react');
  return {
    Stack: { Screen: () => null },
    useFocusEffect: (callback: () => void | (() => void)) =>
      actualReact.useEffect(callback, [callback]),
    useRouter: () => ({ push: jest.fn() }),
  };
});
jest.mock('@/features/analytics/data/observe-performance-telemetry', () => ({
  ...jest.requireActual('@/features/analytics/data/observe-performance-telemetry'),
  useObserveInteractiveMark: () => jest.fn(),
}));

// eslint-disable-next-line import/first
import ProfileRoute from '@/app/(tabs)/(profile)/profile';

const wardrobe = {
  state: { status: 'ready', items: [], isRefreshing: false, isMutating: false, refreshFailure: null },
  refresh: async () => undefined,
  getItem: async () => null,
  preparePhoto: async () => null,
  discardStagedPhoto: async () => undefined,
  resolvePhotoUri: () => null,
} as unknown as WardrobeApplicationValue;

function weatherValue(activeLocation: ActiveLocation): WeatherApplicationValue {
  return {
    state: {
      status: 'ready',
      activeLocation,
      snapshot: null,
      freshness: null,
      permission: { kind: 'granted', accuracy: 'approximate' },
      locationFlow: 'idle',
      isSelectingLocation: false,
      isRefreshing: false,
      refreshFailure: null,
    },
    retry: jest.fn(async () => undefined),
    dismissLocationFlow: jest.fn(),
    beginDeviceLocationSelection: jest.fn(async () => undefined),
    confirmDeviceLocationRequest: jest.fn(async () => undefined),
    openApplicationSettings: jest.fn(async () => undefined),
    selectManualLocation: jest.fn(async () => undefined),
    refresh: jest.fn(async () => undefined),
    revalidateFreshness: jest.fn(async () => undefined),
  } as unknown as WeatherApplicationValue;
}

const deviceLocation = {
  source: 'device',
  accuracy: 'approximate',
  coordinates: { latitudeE2: 4101, longitudeE2: 2898 },
  locationKey: 'device:4101:2898',
  timeZone: 'Europe/Istanbul',
} as const satisfies ActiveLocation;

function Providers({ children, activeLocation }: PropsWithChildren<{ activeLocation: ActiveLocation }>) {
  const analytics = new RecordingProductAnalytics();
  return (
    <LocalizationContext value={{ language: 'en', messages: messages.en, hour12: false }}>
      <KuyaraThemeContext value={lightTheme}>
        <ProductAnalyticsContext value={{
          analytics,
          errorEpisodes: new ErrorEpisodeTracker(
            (name, properties, options) => analytics.capture(name, properties, options),
            () => new Date().toISOString(),
          ),
          firstUses: new FirstUseTracker(new InMemoryFirstUseStore()),
          retries: new RetryCounter(),
        }}>
          <WeatherApplicationContext value={weatherValue(activeLocation)}>
            <WardrobeApplicationContext value={wardrobe}>
              <SafeAreaProvider initialMetrics={{
                frame: { x: 0, y: 0, width: 390, height: 844 },
                insets: { top: 47, right: 0, bottom: 34, left: 0 },
              }}>
                {children}
              </SafeAreaProvider>
            </WardrobeApplicationContext>
          </WeatherApplicationContext>
        </ProductAnalyticsContext>
      </KuyaraThemeContext>
    </LocalizationContext>
  );
}

test('the Location row names a device location that resolved a locality', async () => {
  const result = await render(
    <Providers activeLocation={{ ...deviceLocation, displayName: 'Kadıköy' }}>
      <ProfileRoute />
    </Providers>,
  );

  // The name replaces the generic copy; the accuracy caption is unchanged by it.
  expect(result.getByTestId('profile-location-row').props.accessibilityLabel).toBe(
    `Kadıköy, ${messages.en.weather.approximateLocation}`,
  );
  expect(result.queryByText(messages.en.weather.currentLocation)).toBeNull();
});

test('the Location row keeps the generic copy for a device location with no locality', async () => {
  const result = await render(
    <Providers activeLocation={deviceLocation}>
      <ProfileRoute />
    </Providers>,
  );

  expect(result.getByTestId('profile-location-row').props.accessibilityLabel).toBe(
    `${messages.en.weather.currentLocation}, ${messages.en.weather.approximateLocation}`,
  );
});
