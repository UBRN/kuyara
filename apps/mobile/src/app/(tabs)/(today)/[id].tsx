import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import {
  ageBucketProperty,
  dressStyleProperty,
  generationModeProperty,
} from '@/features/analytics/domain/analytics-mappers';
import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import { unavailableTodayState, type TodayScreenState } from '@/features/today/model';
import { OutfitDetailScreen } from '@/features/today/presentation/outfit-detail-screen';
import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';
import { resolveGarmentOwnership } from '@/features/wardrobe/domain/garment-type-ownership';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { weatherFreshness } from '@/features/weather/domain/weather';
import { useLocalization } from '@/localization/use-messages';

// The presentation layer mints this id itself, `outfit-${1-based index}`
// (`features/today/presentation/today-presentation.ts`); it is not a domain identifier, so
// the position for `outfit_detail_opened` is read straight back out of it.
function outfitPositionFromSuggestionId(suggestionId: string | undefined): 1 | 2 | 3 | null {
  const match = suggestionId?.match(/^outfit-([1-3])$/);
  return match ? (Number(match[1]) as 1 | 2 | 3) : null;
}

export default function OutfitDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const { language, messages } = useLocalization();
  const router = useRouter();
  const { state: recommendationState } = useRecommendationApplication();
  const wardrobe = useWardrobeApplication();
  const { state: weatherState } = useWeatherApplication();
  const { state: profileState } = useProfileApplication();
  const { analytics, firstUses } = useProductAnalytics();
  useScreenViewed('outfit_detail');
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

  const dressStyle = dressStyleProperty(
    profileState.status === 'ready' ? profileState.profile.dressStyle : null,
  );
  const ageBucket = ageBucketProperty(
    profileState.status === 'ready' ? profileState.profile.birthDate : null,
  );

  const isFocused = useIsFocused();
  const openedSuggestionIdRef = useRef<string | null>(null);
  const position = outfitPositionFromSuggestionId(suggestionId);
  const outfit = position && recommendation?.status === 'recommended'
    ? recommendation.outfits[position - 1]
    : null;

  // One capture per suggestion opening. Recomputed recommendation/profile values update
  // the pending payload but cannot emit the same suggestion a second time while focused.
  useEffect(() => {
    if (!isFocused) {
      openedSuggestionIdRef.current = null;
      return;
    }
    if (
      !suggestionId || !position || !outfit ||
      recommendation?.status !== 'recommended' ||
      openedSuggestionIdRef.current === suggestionId
    ) return;
    openedSuggestionIdRef.current = suggestionId;
    analytics.capture('outfit_detail_opened', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      outfit_position: position,
      archetype: outfit.archetypeId,
      generation_mode: generationModeProperty(recommendation.generationMode),
      dress_style: dressStyle,
      age_bucket: ageBucket,
    });
  }, [ageBucket, analytics, dressStyle, isFocused, outfit, position, recommendation, suggestionId]);

  const onSetOwnership = (
    garmentTypeId: GarmentTypeId,
    next: 'owned' | 'wanted',
  ) => {
    if (wardrobe.state.status !== 'ready') return;

    const match = resolveGarmentOwnership(garmentTypeId, wardrobe.state.items);
    // Taxonomy 5.8: the same event shape Closet itself emits, with `entry_point:
    // 'outfit_detail'`; no shared file with the Closet feature's own capture.
    const operation = match.itemId
      ? wardrobe.updateItem(match.itemId, { entryState: next }).then((item) => {
          analytics.capture('closet_item_updated', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            fields_changed: ['state'],
            garment_type_id: garmentTypeId,
            entry_point: 'outfit_detail',
          });
          return item;
        })
      : wardrobe.createItem({ garmentTypeId, entryState: next }).then((item) => {
          analytics.capture('closet_item_created', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            state: next,
            garment_type_id: garmentTypeId,
            has_photo: false,
            entry_point: 'outfit_detail',
            dress_style: dressStyle,
            age_bucket: ageBucket,
          });
          void firstUses.markFirstUse('closet').then((firstUse) => {
            if (!firstUse) return;
            analytics.capture('feature_used_first_time', {
              schema_version: ANALYTICS_SCHEMA_VERSION,
              feature_name: 'closet',
            });
          });
          return item;
        });

    void operation.catch(() => undefined);
  };

  let state: TodayScreenState;
  if (weatherState.status === 'loading' || recommendationState.status === 'loading') {
    state = { kind: 'loading' };
  } else if (
    weatherState.status === 'error' ||
    weatherState.snapshot === null ||
    weatherState.activeLocation === null
  ) {
    // Same classification rule as the Today route; the detail surface renders neither.
    state = unavailableTodayState(
      weatherState.status === 'ready' ? weatherState.refreshFailure : null,
    );
  } else if (recommendation === null) {
    state = unavailableTodayState(recommendationState.lastFailure);
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
