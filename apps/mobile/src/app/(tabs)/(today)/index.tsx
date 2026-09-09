import { useRouter } from 'expo-router';

import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import { unavailableTodayState, type TodayScreenState } from '@/features/today/model';
import { TodayScreen } from '@/features/today/presentation/today-screen';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { useLocalization } from '@/localization/use-messages';

export default function TodayRoute() {
  const { language } = useLocalization();
  const router = useRouter();
  const { state: recommendationState } = useRecommendationApplication();
  const weatherApplication = useWeatherApplication();
  const weatherState = weatherApplication.state;
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
    weatherState.freshness === null
  ) {
    // Weather is the reason here, so its category classifies the failure. Nothing
    // renders this; it only carries the cause the analytics taxonomy asks for.
    state = unavailableTodayState(
      weatherState.status === 'ready' ? weatherState.refreshFailure : null,
    );
  } else if (recommendation === null) {
    state = unavailableTodayState(recommendationState.lastFailure);
  } else {
    state = {
      kind: 'loaded',
      snapshot: {
        weather: weatherState.snapshot,
        activeLocation: weatherState.activeLocation,
        freshness: weatherState.freshness,
        recommendation,
      },
      isRefreshing: weatherState.isRefreshing,
      refreshFailed: weatherState.refreshFailure !== null,
    };
  }

  return (
    <TodayScreen
      language={language}
      onOpenOutfitDetail={(id) => router.push(`/${id}`)}
      onRefresh={() => void weatherApplication.refresh()}
      state={state}
    />
  );
}
