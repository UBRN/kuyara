import * as Crypto from 'expo-crypto';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  RecommendationApplicationController,
  localDayKey,
  localDayVariant,
  recommendationRefreshTrigger,
  type RecommendationSignals,
} from '@/features/recommendation/application/recommendation-application-controller';
import {
  RecommendationApplicationContext,
  type RecommendationApplicationValue,
} from '@/features/recommendation/application/recommendation-application-context';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { LocalRecommendationRepository } from '@/features/recommendation/data/recommendation-repository';
import { SqliteRecommendationLocalDataSource } from '@/features/recommendation/data/sqlite-recommendation-local-data-source';
import {
  WorkerAiClient,
  WorkerAiClientError,
} from '@/features/recommendation/data/worker-ai-client';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { resolveWorkerBaseUrl, WorkerBaseUrlConfigurationError } from '@/config/worker-base-url';
import { openKuyaraDatabase } from '@/infrastructure/sqlite/expo-sqlite-database';
import { migrateDatabase } from '@/infrastructure/sqlite/migrations';

const now = () => new Date().toISOString();

function deviceLocalDay() {
  const date = new Date();
  return { key: localDayKey(date), variant: localDayVariant(date) };
}

export function createRecommendationClient(): Pick<WorkerAiClient, 'recommend'> {
  try {
    return new WorkerAiClient({
      baseUrl: resolveWorkerBaseUrl({
        configuredUrl: process.env.EXPO_PUBLIC_KUYARA_WORKER_BASE_URL,
        isDevelopment: __DEV__,
        platform: Platform.OS === 'android' ? 'android' : Platform.OS === 'web' ? 'web' : 'ios',
      }),
    });
  } catch (error) {
    if (!(error instanceof WorkerBaseUrlConfigurationError)) throw error;
    return {
      recommend: () => Promise.reject(new WorkerAiClientError('service')),
    };
  }
}

async function loadRepository() {
  const database = await openKuyaraDatabase();
  await migrateDatabase(database);
  return new LocalRecommendationRepository(
    new SqliteRecommendationLocalDataSource(database),
    { createId: () => Crypto.randomUUID(), now },
  );
}

export function RecommendationApplicationProvider({
  children,
  localProfileId,
}: PropsWithChildren<{ localProfileId: string }>) {
  const { state: profileState } = useProfileApplication();
  const weatherApplication = useWeatherApplication();
  const weatherState = weatherApplication.state;
  const { analytics } = useProductAnalytics();
  const [localDay, setLocalDay] = useState(deviceLocalDay);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const reevaluateLocalDay = useCallback(() => {
    const next = deviceLocalDay();
    setLocalDay((current) => current.key === next.key ? current : next);
  }, []);
  const client = useMemo(() => createRecommendationClient(), []);
  const controller = useMemo(
    () => new RecommendationApplicationController(localProfileId, {
      loadRepository,
      client,
      captureAnalyticsEvent: (name, properties, options) => analytics.capture(name, properties, options),
    }),
    [analytics, client, localProfileId],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const persistedSnapshot = state.status === 'ready' ? state.snapshot : null;
  const input = useMemo(() => {
    const clothingPreference = profileState.status === 'ready'
      ? profileState.profile.clothingPreference
      : null;
    if (
      weatherState.status !== 'ready' ||
      !weatherState.snapshot ||
      !clothingPreference
    ) return null;
    return {
      snapshot: weatherState.snapshot,
      // The requirement engine reads the local day and the hours left in it from here, not
      // from the snapshot's observation time. It is re-read whenever the day, the profile
      // or the weather changes, which is every moment a recommendation is generated.
      now: now(),
      clothingPreference,
      dressStyle: profileState.status === 'ready'
        ? profileState.profile.dressStyle ?? 'smart'
        : 'smart',
      dayVariant: localDay.variant,
      localDayKey: localDay.key,
    };
  }, [localDay, profileState, weatherState]);
  const staleRefreshSnapshotId = useRef<string | null>(null);

  useEffect(() => {
    void controller.initialize();
  }, [controller]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const wasInactive = appState.current !== 'active';
      appState.current = next;
      if (wasInactive && next === 'active') reevaluateLocalDay();
    });
    return () => subscription.remove();
  }, [reevaluateLocalDay]);

  useEffect(() => {
    if (
      weatherState.status === 'ready' &&
      weatherState.snapshot &&
      weatherState.freshness === 'stale' &&
      weatherState.isRefreshing
    ) {
      staleRefreshSnapshotId.current = weatherState.snapshot.id;
      return;
    }
    if (
      weatherState.status === 'ready' &&
      !weatherState.isRefreshing &&
      weatherState.refreshFailure !== null
    ) {
      staleRefreshSnapshotId.current = null;
    }
  }, [weatherState]);

  useEffect(() => {
    if (state.status !== 'ready' || !input) return;
    const current: RecommendationSignals = {
      weatherSnapshotId: input.snapshot.id,
      locationKey: input.snapshot.locationKey,
      clothingPreference: input.clothingPreference,
      dressStyle: input.dressStyle ?? 'smart',
      localDayKey: input.localDayKey,
    };
    const previous: RecommendationSignals | null = persistedSnapshot
      ? {
          weatherSnapshotId: persistedSnapshot.weatherSnapshotId,
          locationKey: persistedSnapshot.locationKey,
          clothingPreference: persistedSnapshot.clothingPreference,
          dressStyle: persistedSnapshot.dressStyle,
          localDayKey: persistedSnapshot.localDayKey,
        }
      : null;

    const trigger = recommendationRefreshTrigger(
      previous,
      current,
      staleRefreshSnapshotId.current,
    );
    if (trigger === 'stale-weather-refreshed') {
      staleRefreshSnapshotId.current = null;
    }

    if (trigger) void controller.refresh(trigger, input);
  }, [controller, input, persistedSnapshot, state.status]);

  const value = useMemo<RecommendationApplicationValue>(() => ({
    state,
    refresh: () => {
      const currentDay = deviceLocalDay();
      setLocalDay((previous) => previous.key === currentDay.key ? previous : currentDay);
      const currentWeather = weatherApplication.getSnapshot?.() ?? weatherState;
      const clothingPreference = profileState.status === 'ready'
        ? profileState.profile.clothingPreference
        : null;
      if (
        currentWeather.status !== 'ready' ||
        !currentWeather.snapshot ||
        profileState.status !== 'ready' ||
        !clothingPreference
      ) return Promise.resolve(null);
      return controller.refresh('explicit', {
        snapshot: currentWeather.snapshot,
        now: now(),
        clothingPreference,
        dressStyle: profileState.profile.dressStyle ?? 'smart',
        dayVariant: currentDay.variant,
        localDayKey: currentDay.key,
      });
    },
    reevaluateLocalDay,
  }), [controller, profileState, reevaluateLocalDay, state, weatherApplication, weatherState]);

  return (
    <RecommendationApplicationContext value={value}>
      {children}
    </RecommendationApplicationContext>
  );
}
