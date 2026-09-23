import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ServiceProvidersRoute from '@/app/(tabs)/(profile)/settings/service-providers';
import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import type { AiProbeUiState } from '@/features/recommendation/application/ai-probe-state';
import { WeatherApplicationContext, type WeatherApplicationValue } from '@/features/weather/application/weather-application-context';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@/features/weather/data/apple-weather-mark', () => ({
  appleWeatherMarkUrl: jest.fn(async () => 'https://weatherkit.apple.com/mark.png'),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useFocusEffect: () => undefined,
}));

let mockCheck: jest.Mock<Promise<AiProbeUiState | null>, []>;

jest.mock('@/features/recommendation/application/use-ai-probe', () => ({
  useAiProbe: () => ({
    state: { kind: 'idle' },
    isSupported: true,
    check: () => mockCheck(),
  }),
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

async function renderRoute(analytics: RecordingProductAnalytics, sourceId?: string) {
  const weather = sourceId ? {
    state: { status: 'ready', snapshot: { origin: { sourceId } } },
  } as unknown as WeatherApplicationValue : null;
  return render(
    <LocalizationContext.Provider value={{ language: 'en', messages: messages.en , hour12: false }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ProductAnalyticsProvider
            analytics={analytics}
            firstUseStore={new InMemoryFirstUseStore()}>
            <WeatherApplicationContext.Provider value={weather}>
              <ServiceProvidersRoute />
            </WeatherApplicationContext.Provider>
          </ProductAnalyticsProvider>
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>,
  );
}

test.each([
  ['open-meteo', 'attributionOpenMeteo'],
  ['openweather', 'attributionOpenWeather'],
  ['weatherkit', 'attributionAppleWeather'],
] as const)('attributes the stored %s snapshot', async (sourceId, copyKey) => {
  mockCheck = jest.fn(async () => null);
  const result = await renderRoute(new RecordingProductAnalytics(), sourceId);
  expect(result.getByRole('link', { name: messages.en.weather[copyKey] }))
    .toBeOnTheScreen();
  expect(result.queryByText(messages.en.settings.weatherNoSnapshot)).toBeNull();
});

test('does not invent an attribution for an unknown snapshot source', async () => {
  mockCheck = jest.fn(async () => null);
  const result = await renderRoute(new RecordingProductAnalytics(), 'sample');
  expect(result.getByText(messages.en.settings.weatherNoSnapshot)).toBeOnTheScreen();
  expect(result.queryByRole('link')).toBeNull();
});

test('a completed probe reports the result and the first use', async () => {
  mockCheck = jest.fn(
    async (): Promise<AiProbeUiState | null> => (
      { kind: 'ok', checkedAt: '2026-09-10T09:00:00.000Z' }
    ),
  );
  const analytics = new RecordingProductAnalytics();
  const result = await renderRoute(analytics);

  await fireEvent.press(result.getByTestId('settings-service-providers-check'));

  await waitFor(() => expect(analytics.names()).toEqual([
    'ai_probe_triggered',
    'feature_used_first_time',
  ]));
  expect(analytics.captures.map((capture) => capture.properties)).toEqual([
    { schema_version: 3, result: 'ok' },
    { schema_version: 3, feature_name: 'ai_status_probe' },
  ]);
});

test('a rate-limited probe reports the mapped result without a repeat first-use event', async () => {
  mockCheck = jest.fn(async (): Promise<AiProbeUiState | null> => ({ kind: 'rate-limited' }));
  const analytics = new RecordingProductAnalytics();
  const result = await renderRoute(analytics);

  await fireEvent.press(result.getByTestId('settings-service-providers-check'));
  await waitFor(() => expect(analytics.captures).toHaveLength(2));

  await fireEvent.press(result.getByTestId('settings-service-providers-check'));
  await waitFor(() => expect(analytics.captures).toHaveLength(3));

  expect(analytics.names()).toEqual([
    'ai_probe_triggered',
    'feature_used_first_time',
    'ai_probe_triggered',
  ]);
  expect(analytics.captures[2].properties).toEqual({
    schema_version: 3,
    result: 'rate_limited',
  });
});
