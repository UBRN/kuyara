import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AiStatusSettingsRoute from '@/app/(tabs)/(profile)/settings/ai-status';
import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import type { AiProbeUiState } from '@/features/recommendation/application/ai-probe-state';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));

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

async function renderRoute(analytics: RecordingProductAnalytics) {
  return render(
    <LocalizationContext.Provider value={{ language: 'en', messages: messages.en , hour12: false }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ProductAnalyticsProvider
            analytics={analytics}
            firstUseStore={new InMemoryFirstUseStore()}>
            <AiStatusSettingsRoute />
          </ProductAnalyticsProvider>
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>,
  );
}

test('a completed probe reports the result and the first use', async () => {
  mockCheck = jest.fn(
    async (): Promise<AiProbeUiState | null> => (
      { kind: 'ok', checkedAt: '2026-09-10T09:00:00.000Z' }
    ),
  );
  const analytics = new RecordingProductAnalytics();
  const result = await renderRoute(analytics);

  await fireEvent.press(result.getByTestId('settings-ai-status-check'));

  await waitFor(() => expect(analytics.names()).toEqual([
    'ai_probe_triggered',
    'feature_used_first_time',
  ]));
  expect(analytics.captures.map((capture) => capture.properties)).toEqual([
    { schema_version: 1, result: 'ok' },
    { schema_version: 1, feature_name: 'ai_status_probe' },
  ]);
});

test('a rate-limited probe reports the mapped result without a repeat first-use event', async () => {
  mockCheck = jest.fn(async (): Promise<AiProbeUiState | null> => ({ kind: 'rate-limited' }));
  const analytics = new RecordingProductAnalytics();
  const result = await renderRoute(analytics);

  await fireEvent.press(result.getByTestId('settings-ai-status-check'));
  await waitFor(() => expect(analytics.captures).toHaveLength(2));

  await fireEvent.press(result.getByTestId('settings-ai-status-check'));
  await waitFor(() => expect(analytics.captures).toHaveLength(3));

  expect(analytics.names()).toEqual([
    'ai_probe_triggered',
    'feature_used_first_time',
    'ai_probe_triggered',
  ]);
  expect(analytics.captures[2].properties).toEqual({
    schema_version: 1,
    result: 'rate_limited',
  });
});
