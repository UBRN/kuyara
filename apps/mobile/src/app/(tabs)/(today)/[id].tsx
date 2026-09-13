import { useFocusEffect, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useScreenInteractive } from '@/features/analytics/application/use-screen-interactive';
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

export default function OutfitDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const { language, messages } = useLocalization();
  const router = useRouter();
  const { reevaluateLocalDay, state: recommendationState } = useRecommendationApplication();
  const wardrobe = useWardrobeApplication();
  const { revalidateFreshness: revalidateWeatherFreshness, state: weatherState } =
    useWeatherApplication();
  const { state: profileState } = useProfileApplication();
  const { analytics, firstUses } = useProductAnalytics();
  const [ownershipError, setOwnershipError] = useState<string | null>(null);
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
  // The route is keyed by the outfit's stable option id, so a regeneration that finishes
  // while detail is open cannot swap another outfit under the user; an outfit the current
  // snapshot no longer offers renders the unavailable state instead.
  const outfits = recommendation?.status === 'recommended' ? recommendation.outfits : [];
  const outfitIndex = outfits.findIndex(({ optionId }) => optionId === suggestionId);
  const outfit = outfits[outfitIndex] ?? null;
  const position = outfit ? ((outfitIndex + 1) as 1 | 2 | 3) : null;

  useFocusEffect(useCallback(() => {
    reevaluateLocalDay();
    void revalidateWeatherFreshness();
  }, [reevaluateLocalDay, revalidateWeatherFreshness]));

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
  ): boolean => {
    if (wardrobe.state.status !== 'ready') return false;

    const activeItems = wardrobe.state.items;
    const match = resolveGarmentOwnership(garmentTypeId, activeItems);
    if (match.state === next) return false;
    setOwnershipError(null);

    // Taxonomy 5.8: the same event shape Closet itself emits, with `entry_point:
    // 'outfit_detail'`; no shared file with the Closet feature's own capture.
    if (match.itemIds.length > 0) {
      void (async () => {
        try {
          for (const current of activeItems) {
            if (current.garmentTypeId !== garmentTypeId || current.entryState === next) continue;
            const item = await wardrobe.updateItem(current.id, { entryState: next });
            if (!item.garmentTypeId) continue;
            analytics.capture('closet_item_updated', {
              schema_version: ANALYTICS_SCHEMA_VERSION,
              fields_changed: ['state'],
              garment_type_id: item.garmentTypeId,
              entry_point: 'outfit_detail',
            });
          }
        } catch {
          setOwnershipError(messages.wardrobe.updateError);
        }
      })();
      return true;
    }

    void wardrobe.createItem({ garmentTypeId, entryState: next }).then((item) => {
      if (!item.garmentTypeId) return;
      analytics.capture('closet_item_created', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        state: item.entryState,
        garment_type_id: item.garmentTypeId,
        has_photo: item.photoRelativePath !== null,
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
    }).catch(() => setOwnershipError(messages.wardrobe.createError));
    return true;
  };

  const onBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
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
      isRefreshing: weatherState.isRefreshing || recommendationState.isRefreshing,
      refreshFailed:
        weatherState.refreshFailure !== null || recommendationState.lastFailure !== null,
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

  useScreenInteractive(state.kind === 'loaded' ? { state: 'loaded' } : null);

  return (
    <OutfitDetailScreen
      backLabel={messages.today.backAction}
      language={language}
      onBack={onBack}
      onSetOwnership={onSetOwnership}
      ownershipByGarmentType={ownershipByGarmentType}
      ownershipError={ownershipError}
      state={state}
      suggestionId={suggestionId}
    />
  );
}
