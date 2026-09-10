import { render } from '@testing-library/react-native';
import { AppState, type AppStateStatus, Text } from 'react-native';

import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';

const addEventListener = jest.mocked(AppState.addEventListener);

beforeEach(() => {
  addEventListener.mockClear();
  addEventListener.mockReturnValue({ remove: () => undefined });
});

function FailingChild() {
  const { errorEpisodes } = useProductAnalytics();
  errorEpisodes.failed({ surface: 'today', failureCategory: 'offline' });
  return <Text>child</Text>;
}

async function renderProvider(analytics: RecordingProductAnalytics) {
  const view = await render(
    <ProductAnalyticsProvider analytics={analytics}>
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

test('the background transition emits buffered failures before flushing', async () => {
  const analytics = new RecordingProductAnalytics();
  const { background } = await renderProvider(analytics);

  background();

  expect(analytics.names()).toEqual(['error_shown']);
  expect(analytics.captures[0].properties).toMatchObject({
    schema_version: 1,
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
