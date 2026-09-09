import { render, screen, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus, Text } from 'react-native';

import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import type { AnalyticsConsent } from '@/features/profile/domain/profile';

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

type Handle = ReturnType<typeof useProductAnalytics>;

function ConsentChild({ onReady }: { onReady: (handle: Handle) => void }) {
  const handle = useProductAnalytics();
  onReady(handle);
  return <Text>{handle.consent}</Text>;
}

async function renderProvider(
  analytics: RecordingProductAnalytics,
  consent: AnalyticsConsent = 'undecided',
  persistConsent: (value: AnalyticsConsent) => Promise<void> = () => Promise.resolve(),
) {
  const view = await render(
    <ProductAnalyticsProvider
      analytics={analytics}
      consent={consent}
      persistConsent={persistConsent}>
      <FailingChild />
    </ProductAnalyticsProvider>,
  );
  const notify = (status: AppStateStatus) => {
    addEventListener.mock.calls.forEach(([, listener]) => listener(status));
  };
  return { view, background: () => { notify('active'); notify('background'); } };
}

async function renderConsentProvider(analytics: RecordingProductAnalytics) {
  const persisted: AnalyticsConsent[] = [];
  let handle: Handle | null = null;
  let consent: AnalyticsConsent = 'undecided';
  const persistConsent = async (value: AnalyticsConsent) => {
    persisted.push(value);
    consent = value;
  };
  const tree = (value: AnalyticsConsent) => (
    <ProductAnalyticsProvider
      analytics={analytics}
      consent={value}
      persistConsent={persistConsent}>
      <ConsentChild onReady={(next) => { handle = next; }} />
    </ProductAnalyticsProvider>
  );
  const view = await render(tree('undecided'));
  return {
    persisted,
    // The route above the provider re-renders with the persisted answer, as `_layout` does.
    settle: async () => { await view.rerender(tree(consent)); },
    handle: () => {
      if (!handle) throw new Error('the provider did not mount');
      return handle;
    },
  };
}

test('mounting the tree captures nothing and does not opt in on its own', async () => {
  const analytics = new RecordingProductAnalytics();
  const { view } = await renderProvider(analytics);

  expect(view.getByText('child')).toBeTruthy();
  expect(analytics.captures).toEqual([]);
  expect(analytics.optInCount).toBe(0);
  expect(analytics.flushCount).toBe(0);
});

test('a profile that already granted consent opts the adapter in once, silently', async () => {
  const analytics = new RecordingProductAnalytics();
  await renderProvider(analytics, 'granted');

  await waitFor(() => expect(analytics.optInCount).toBe(1));
  expect(analytics.captures).toEqual([]);
});

test('the background transition emits the buffered failures, then flushes', async () => {
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

test('a foreground transition neither flushes nor emits', async () => {
  const analytics = new RecordingProductAnalytics();
  await renderProvider(analytics);

  addEventListener.mock.calls.forEach(([, listener]) => listener('active'));

  expect(analytics.captures).toEqual([]);
  expect(analytics.flushCount).toBe(0);
});

test('declining persists the withdrawal and captures nothing at all', async () => {
  const analytics = new RecordingProductAnalytics();
  const provider = await renderConsentProvider(analytics);

  await provider.handle().declineConsent();
  await provider.settle();

  expect(provider.persisted).toEqual(['withdrawn']);
  expect(analytics.captures).toEqual([]);
  expect(analytics.optInCount).toBe(0);
  expect(analytics.withdrawCount).toBe(0);
  expect(screen.getByText('withdrawn')).toBeTruthy();
});

test('granting opts in once and makes the grant the first event on the identity', async () => {
  const analytics = new RecordingProductAnalytics();
  const provider = await renderConsentProvider(analytics);

  await provider.handle().grantConsent('first_launch_sheet');
  await provider.settle();

  expect(provider.persisted).toEqual(['granted']);
  expect(analytics.optInCount).toBe(1);
  expect(analytics.names()).toEqual(['analytics_consent_granted']);
  expect(analytics.captures[0].properties).toEqual({
    schema_version: 1,
    surface: 'first_launch_sheet',
  });
});

test('withdrawing captures, flushes, severs the identity, then persists the answer', async () => {
  const analytics = new RecordingProductAnalytics();
  const provider = await renderConsentProvider(analytics);

  await provider.handle().grantConsent('first_launch_sheet');
  await provider.settle();
  const grantedIdentity = provider.handle().distinctId();
  await provider.handle().withdrawConsent();
  await provider.settle();

  expect(provider.persisted).toEqual(['granted', 'withdrawn']);
  expect(analytics.names()).toEqual([
    'analytics_consent_granted',
    'analytics_consent_withdrawn',
  ]);
  expect(analytics.captures[1].properties).toEqual({ schema_version: 1 });
  expect(analytics.flushCount).toBe(1);
  expect(analytics.withdrawCount).toBe(1);
  expect(provider.handle().distinctId()).not.toBe(grantedIdentity);
});

test('re-consenting from the privacy surface starts a fresh identity', async () => {
  const analytics = new RecordingProductAnalytics();
  const provider = await renderConsentProvider(analytics);

  await provider.handle().grantConsent('first_launch_sheet');
  await provider.settle();
  const firstIdentity = provider.handle().distinctId();
  await provider.handle().withdrawConsent();
  await provider.settle();
  await provider.handle().grantConsent('settings_privacy');
  await provider.settle();

  expect(provider.handle().distinctId()).not.toBe(firstIdentity);
  expect(analytics.optInCount).toBe(2);
  expect(analytics.names()).toEqual([
    'analytics_consent_granted',
    'analytics_consent_withdrawn',
    'analytics_consent_granted',
  ]);
  expect(analytics.captures[2].properties).toEqual({
    schema_version: 1,
    surface: 'settings_privacy',
  });
});
