import { useLocalSearchParams, useRouter } from 'expo-router';

import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import type { TodayScreenState } from '@/features/today/model';
import { OutfitDetailScreen } from '@/features/today/presentation/outfit-detail-screen';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { weatherFreshness } from '@/features/weather/domain/weather';
import { useLocalization } from '@/localization/use-messages';

export default function OutfitDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const { language, messages } = useLocalization();
  const router = useRouter();
  const { state: recommendationState } = useRecommendationApplication();
  const { state: weatherState } = useWeatherApplication();
  const suggestionId = Array.isArray(id) ? id[0] : id;
  const recommendation = recommendationState.status === 'ready'
    ? recommendationState.snapshot?.recommendation ?? null
    : null;

  let state: TodayScreenState;
  if (weatherState.status === 'loading' || recommendationState.status === 'loading') {
    state = { kind: 'loading' };
  } else if (
    weatherState.status === 'error' ||
    weatherState.snapshot === null ||
    weatherState.activeLocation === null ||
    recommendation === null
  ) {
    state = { kind: 'unavailable' };
  } else {
    state = {
      kind: 'loaded',
      snapshot: {
        weather: weatherState.snapshot,
        activeLocation: weatherState.activeLocation,
        freshness:
          weatherFreshness(
            weatherState.snapshot.fetchedAt,
            new Date().toISOString(),
          ) === 'fresh'
            ? 'fresh'
            : 'stale',
        recommendation,
      },
    };
  }

  return (
    <OutfitDetailScreen
      backLabel={messages.today.backAction}
      language={language}
      onBack={() => router.back()}
      state={state}
      suggestionId={suggestionId}
    />
  );
}
