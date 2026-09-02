import { useLocalSearchParams, useRouter } from 'expo-router';

import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import type { TodayScreenState } from '@/features/today/model';
import { OutfitDetailScreen } from '@/features/today/presentation/outfit-detail-screen';
import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';
import { resolveGarmentOwnership } from '@/features/wardrobe/domain/garment-type-ownership';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { weatherFreshness } from '@/features/weather/domain/weather';
import { useLocalization } from '@/localization/use-messages';

export default function OutfitDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const { language, messages } = useLocalization();
  const router = useRouter();
  const { state: recommendationState } = useRecommendationApplication();
  const wardrobe = useWardrobeApplication();
  const { state: weatherState } = useWeatherApplication();
  const suggestionId = Array.isArray(id) ? id[0] : id;
  const recommendation = recommendationState.status === 'ready'
    ? recommendationState.snapshot?.recommendation ?? null
    : null;
  const wardrobeItems = wardrobe.state.status === 'ready' ? wardrobe.state.items : null;
  const ownershipByGarmentType = wardrobeItems
    ? Object.fromEntries(
        wardrobeItems.flatMap(({ garmentTypeId }) =>
          garmentTypeId
            ? [[garmentTypeId, resolveGarmentOwnership(garmentTypeId, wardrobeItems).state]]
            : [],
        ),
      )
    : {};
  const onSetOwnership = (
    garmentTypeId: GarmentTypeId,
    next: 'owned' | 'wanted',
  ) => {
    if (wardrobe.state.status !== 'ready') return;

    const match = resolveGarmentOwnership(garmentTypeId, wardrobe.state.items);
    const operation = match.itemId
      ? wardrobe.updateItem(match.itemId, { entryState: next })
      : wardrobe.createItem({ garmentTypeId, entryState: next });

    void operation.catch(() => undefined);
  };

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
      isRefreshing: false,
      refreshFailed: false,
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
      onSetOwnership={onSetOwnership}
      ownershipByGarmentType={ownershipByGarmentType}
      state={state}
      suggestionId={suggestionId}
    />
  );
}
