import { render } from '@testing-library/react-native';
import { AppState, type AppStateStatus, Text } from 'react-native';
import { useEffect } from 'react';

import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import type { FirstUseTracker } from '@/features/analytics/application/first-use-tracker';
import type { ErrorEpisodeTracker } from '@/features/analytics/application/error-episode-tracker';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';

const addEventListener = jest.mocked(AppState.addEventListener);
let providedFirstUses: FirstUseTracker | null = null;
let providedErrorEpisodes: ErrorEpisodeTracker | null = null;

beforeEach(() => {
  providedFirstUses = null;
  providedErrorEpisodes = null;
  addEventListener.mockClear();
  addEventListener.mockReturnValue({ remove: () => undefined });
});

function FailingChild() {
  const { errorEpisodes, firstUses } = useProductAnalytics();
  useEffect(() => {
    providedFirstUses = firstUses;
    providedErrorEpisodes = errorEpisodes;
  }, [errorEpisodes, firstUses]);
  errorEpisodes.failed({ surface: 'today', failureCategory: 'offline' });
  return <Text>child</Text>;
}

async function renderProvider(analytics: RecordingProductAnalytics) {
  const view = await render(
    <ProductAnalyticsProvider
      analytics={analytics}
      firstUseStore={new InMemoryFirstUseStore()}>
      <FailingChild />
    </ProductAnalyticsProvider>,
  );
  const notify = (status: AppStateStatus) => {
    addEventListener.mock.calls.forEach(([, listener]) => listener(status));
  };
  return { view, background: () => { notify('active'); notify('background'); } };
}

test('mounting the provider captures nothing on its own', async () => {
  const analytics = new RecordingProductAnalytics();
  const { view } = await renderProvider(analytics);

  expect(view.getByText('child')).toBeTruthy();
  expect(analytics.captures).toEqual([]);
  expect(analytics.flushCount).toBe(0);
});

test('the provider exposes a first-use tracker that survives analytics withdrawal', async () => {
  const analytics = new RecordingProductAnalytics();
  await renderProvider(analytics);

  expect(providedFirstUses).not.toBeNull();
  await expect(providedFirstUses!.markFirstUse('closet')).resolves.toBe(true);
  await analytics.withdraw();
  await expect(providedFirstUses!.markFirstUse('closet')).resolves.toBe(false);
  expect(analytics.names()).toEqual(['analytics_consent_withdrawn']);
});

test('the background transition emits buffered failures before flushing', async () => {
  const analytics = new RecordingProductAnalytics();
  const { background } = await renderProvider(analytics);

  background();

  expect(analytics.names()).toEqual(['error_shown']);
  expect(analytics.captures[0].properties).toMatchObject({
    schema_version: 2,
    surface: 'today',
    failure_category: 'offline',
    occurrence_count: 1,
  });
  expect(analytics.flushCount).toBe(1);
});

test('the local consent gate drops a buffered failure before consent', async () => {
  const analytics = new RecordingProductAnalytics('undecided');
  const { background } = await renderProvider(analytics);

  background();

  expect(analytics.captures).toEqual([]);
  expect(analytics.flushCount).toBe(1);
});

test('a foreground transition neither flushes nor emits', async () => {
  const analytics = new RecordingProductAnalytics();
  await renderProvider(analytics);

  addEventListener.mock.calls.forEach(([, listener]) => listener('active'));

  expect(analytics.captures).toEqual([]);
  expect(analytics.flushCount).toBe(0);
});

test('a changed provider session flushes and clears finalised error pairs', async () => {
  const analytics = new RecordingProductAnalytics();
  const { background } = await renderProvider(analytics);
  background();
  analytics.startNewSession();
  addEventListener.mock.calls.forEach(([, listener]) => listener('active'));

  providedErrorEpisodes!.failed({ surface: 'today', failureCategory: 'offline' });
  providedErrorEpisodes!.recovered({ surface: 'today', failureCategory: 'offline' });

  expect(analytics.names()).toEqual([
    'error_shown',
    'error_shown',
    'error_recovered',
  ]);
});
