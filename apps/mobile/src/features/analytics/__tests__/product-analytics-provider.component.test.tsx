import { render } from '@testing-library/react-native';
import { AppState, type AppStateStatus, Text } from 'react-native';
import { useEffect } from 'react';

import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import type { FirstUseTracker } from '@/features/analytics/application/first-use-tracker';
import type { ErrorEpisodeTracker } from '@/features/analytics/application/error-episode-tracker';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import {
  ProfileApplicationContext,
  type ProfileApplicationValue,
} from '@/features/profile/application/profile-context';
import type { AnalyticsConsent } from '@/features/profile/domain/profile';

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

async function renderProvider(
  analytics: RecordingProductAnalytics,
  consent: AnalyticsConsent | null = 'granted',
  firstUseStore = new InMemoryFirstUseStore(),
) {
  const profileApplication = consent === null ? null : {
    state: {
      status: 'ready',
      profile: { analyticsConsent: consent },
      isSaving: false,
    },
  } as ProfileApplicationValue;
  const view = await render(
    <ProfileApplicationContext value={profileApplication}>
      <ProductAnalyticsProvider analytics={analytics} firstUseStore={firstUseStore}>
        <FailingChild />
      </ProductAnalyticsProvider>
    </ProfileApplicationContext>,
  );
  const notify = (status: AppStateStatus) => {
    addEventListener.mock.calls.forEach(([, listener]) => listener(status));
  };
  return { view, notify, background: () => { notify('active'); notify('background'); } };
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
  expect(analytics.names()).toEqual([]);
});

test('the background transition emits buffered failures before flushing', async () => {
  const analytics = new RecordingProductAnalytics();
  const { background } = await renderProvider(analytics);

  background();

  expect(analytics.names()).toEqual(['error_shown']);
  expect(analytics.captures[0].properties).toMatchObject({
    schema_version: 4,
    surface: 'today',
    failure_category: 'offline',
    occurrence_count: 1,
  });
  expect(analytics.flushCount).toBe(1);
});

test('iOS inactive then background flushes once, while a repeated background does not', async () => {
  const analytics = new RecordingProductAnalytics();
  const { notify } = await renderProvider(analytics);

  notify('active');
  notify('inactive');
  expect(analytics.flushCount).toBe(0);
  notify('background');
  notify('background');

  expect(analytics.names()).toEqual(['error_shown']);
  expect(analytics.flushCount).toBe(1);
});

test('the local consent gate drops a buffered failure before consent', async () => {
  const analytics = new RecordingProductAnalytics('undecided');
  const { background } = await renderProvider(analytics, 'undecided');

  background();

  expect(analytics.captures).toEqual([]);
  expect(analytics.flushCount).toBe(1);
});

test('granted consent tracks a failure and first use while adapter readiness is delayed', async () => {
  const analytics = new RecordingProductAnalytics('granted');
  const firstUseStore = new InMemoryFirstUseStore();
  const isApplied = jest.spyOn(analytics, 'isApplied').mockReturnValue(false);
  const whenReady = jest.spyOn(analytics, 'whenReady').mockImplementation(
    () => new Promise<void>(() => undefined),
  );
  const { background } = await renderProvider(analytics, 'granted', firstUseStore);

  await expect(providedFirstUses!.markFirstUse('closet')).resolves.toBe(true);
  expect(await firstUseStore.has('closet')).toBe(true);
  background();

  expect(analytics.names()).toEqual(['error_shown']);
  expect(isApplied).not.toHaveBeenCalled();
  expect(whenReady).not.toHaveBeenCalled();
});

test('an absent profile context cannot open episodes or write first-use markers', async () => {
  const analytics = new RecordingProductAnalytics('granted');
  const firstUseStore = new InMemoryFirstUseStore();
  const { background } = await renderProvider(analytics, null, firstUseStore);

  await expect(providedFirstUses!.markFirstUse('closet')).resolves.toBe(false);
  expect(await firstUseStore.has('closet')).toBe(false);
  background();
  expect(analytics.names()).toEqual([]);
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
