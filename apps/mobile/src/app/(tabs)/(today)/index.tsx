import { useRouter } from 'expo-router';

import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import type { TodayScreenState } from '@/features/today/model';
import { TodayScreen } from '@/features/today/presentation/today-screen';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { useLocalization } from '@/localization/use-messages';

export default function TodayRoute() {
  const { language } = useLocalization();
  const router = useRouter();
  const { state: recommendationState } = useRecommendationApplication();
  const { state: weatherState } = useWeatherApplication();
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
    weatherState.freshness === null ||
    recommendation === null
  ) {
    state = { kind: 'unavailable' };
  } else {
    state = {
      kind: 'loaded',
      snapshot: {
        weather: weatherState.snapshot,
        activeLocation: weatherState.activeLocation,
        freshness: weatherState.freshness,
        recommendation,
      },
    };
  }

  return (
    <TodayScreen
      language={language}
      onOpenOutfitDetail={(id) => router.push(`/${id}`)}
      onOpenSettings={() => router.push('/settings')}
      state={state}
    />
  );
}
