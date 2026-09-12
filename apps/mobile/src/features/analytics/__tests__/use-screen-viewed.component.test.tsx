import { act, render } from '@testing-library/react-native';
import type { EffectCallback } from 'react';
import { Text } from 'react-native';

import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';

let focusEffect: EffectCallback | null = null;
const mockUseFocusEffect = jest.fn((effect: EffectCallback) => {
  focusEffect = effect;
});

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: EffectCallback) => mockUseFocusEffect(effect),
}));

function Screen() {
  useScreenViewed('today');
  return <Text>Today</Text>;
}

async function renderScreen(analytics: RecordingProductAnalytics) {
  return render(
    <ProductAnalyticsProvider
      analytics={analytics}
      firstUseStore={new InMemoryFirstUseStore()}>
      <Screen />
    </ProductAnalyticsProvider>,
  );
}

beforeEach(() => {
  focusEffect = null;
  mockUseFocusEffect.mockClear();
});

test('captures one screen view each time the route gains focus', async () => {
  const analytics = new RecordingProductAnalytics();
  const view = await renderScreen(analytics);

  expect(view.getByText('Today')).toBeTruthy();
  expect(analytics.captures).toEqual([]);
  expect(mockUseFocusEffect).toHaveBeenCalledTimes(1);

  await act(async () => {
    focusEffect?.();
  });
  expect(analytics.captures).toEqual([
    {
      name: 'screen_viewed',
      properties: { schema_version: 2, screen_name: 'today' },
      options: undefined,
    },
  ]);

  await act(async () => {
    focusEffect?.();
  });
  expect(analytics.names()).toEqual(['screen_viewed', 'screen_viewed']);
});

test('the consent boundary drops a focused screen view before consent', async () => {
  const analytics = new RecordingProductAnalytics('undecided');
  await renderScreen(analytics);

  await act(async () => {
    focusEffect?.();
  });

  expect(analytics.captures).toEqual([]);
});
