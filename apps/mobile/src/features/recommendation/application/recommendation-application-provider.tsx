import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import {
  type PropsWithChildren,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';

import {
  RecommendationApplicationController,
  localDayVariant,
  recommendationRefreshTrigger,
  type RecommendationSignals,
} from '@/features/recommendation/application/recommendation-application-controller';
import {
  RecommendationApplicationContext,
  type RecommendationApplicationValue,
} from '@/features/recommendation/application/recommendation-application-context';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { failureCategoryProperty } from '@/features/analytics/domain/analytics-mappers';
import type { FailureCategory } from '@/domain/failure-category';
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
  const { state: weatherState } = useWeatherApplication();
  const { analytics, errorEpisodes } = useProductAnalytics();
  const dayVariant = localDayVariant();
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
  const shownFailureRef = useRef<FailureCategory | null>(null);
  const currentFailure = state.status === 'ready' ? state.lastFailure : null;

  // Taxonomy 5.10: `error_shown`/`error_recovered` for the `recommendation` surface, gated
  // on the failure category's own value so an unrelated re-render does not double-count.
  useEffect(() => {
    if (currentFailure) {
      shownFailureRef.current = currentFailure;
      errorEpisodes.failed({
        surface: 'recommendation',
        failureCategory: failureCategoryProperty(currentFailure),
      });
    } else if (shownFailureRef.current) {
      errorEpisodes.recovered({
        surface: 'recommendation',
        failureCategory: failureCategoryProperty(shownFailureRef.current),
      });
      shownFailureRef.current = null;
    }
  }, [currentFailure, errorEpisodes]);
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
      clothingPreference,
      dressStyle: profileState.status === 'ready'
        ? profileState.profile.dressStyle ?? 'smart'
        : 'smart',
      dayVariant,
    };
  }, [dayVariant, profileState, weatherState]);
  const staleRefreshSnapshotId = useRef<string | null>(null);

  useEffect(() => {
    void controller.initialize();
  }, [controller]);

  useEffect(() => {
    if (
      weatherState.status === 'ready' &&
      weatherState.snapshot &&
      weatherState.freshness === 'stale' &&
      weatherState.isRefreshing
    ) {
      staleRefreshSnapshotId.current = weatherState.snapshot.id;
    }
  }, [weatherState]);

  useEffect(() => {
    if (state.status !== 'ready' || !input) return;
    const current: RecommendationSignals = {
      weatherSnapshotId: input.snapshot.id,
      locationKey: input.snapshot.locationKey,
      clothingPreference: input.clothingPreference,
      dressStyle: input.dressStyle ?? 'smart',
      dayVariant: input.dayVariant,
    };
    const previous: RecommendationSignals | null = persistedSnapshot
      ? {
          weatherSnapshotId: persistedSnapshot.weatherSnapshotId,
          locationKey: persistedSnapshot.locationKey,
          clothingPreference: persistedSnapshot.clothingPreference,
          dressStyle: persistedSnapshot.dressStyle,
          dayVariant: persistedSnapshot.dayVariant,
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
    refresh: () => input
      ? controller.refresh('explicit', input)
      : Promise.resolve(null),
  }), [controller, input, state]);

  return (
    <RecommendationApplicationContext value={value}>
      {children}
    </RecommendationApplicationContext>
  );
}
