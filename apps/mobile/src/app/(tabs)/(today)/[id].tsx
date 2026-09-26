import { Stack, useFocusEffect, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useScreenInteractive } from '@/features/analytics/application/use-screen-interactive';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import {
  ageBucketProperty,
  dressStyleProperty,
  generationModeProperty,
} from '@/features/analytics/domain/analytics-mappers';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import { unavailableTodayState, type TodayScreenState } from '@/features/today/model';
import {
  historyDayKey,
  sameWornGarments,
  wornOutfitFrom,
  type WornOutfit,
} from '@/features/recommendation/domain/outfit-history';
import {
  OutfitDetailScreen,
  type OutfitWornState,
} from '@/features/today/presentation/outfit-detail-screen';
import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';
import { closetFieldsChanged } from '@/features/wardrobe/application/closet-field-changes';
import {
  PieceEditSheet,
  type PieceSheetTarget,
  type PieceSheetValues,
} from '@/features/wardrobe/presentation/piece-edit-sheet';
import { showWardrobeConfirmation } from '@/features/wardrobe/presentation/wardrobe-confirmation';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { activeLocationSnapshot, weatherFreshness } from '@/features/weather/domain/weather';
import { useLocalization } from '@/localization/use-messages';
import { useKuyaraTheme } from '@/theme/theme-context';

export default function OutfitDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const { language, messages } = useLocalization();
  const { dressingDayChoiceReady, dressingDayKey, outfitHistory, reevaluateLocalDay,
    resolvedDressStyle, state: recommendationState } = useRecommendationApplication();
  const theme = useKuyaraTheme();
  const wardrobe = useWardrobeApplication();
  const { revalidateFreshness: revalidateWeatherFreshness, state: weatherState } =
    useWeatherApplication();
  const { state: profileState } = useProfileApplication();
  const { analytics, firstUses } = useProductAnalytics();
  const [editing, setEditing] = useState<PieceSheetTarget | null>(null);
  const [wornGarments, setWornGarments] = useState<{ key: string; outfit: WornOutfit | null } | null>(null);
  const [wornBusy, setWornBusy] = useState(false);
  const [wornError, setWornError] = useState<string | null>(null);
  useScreenViewed('outfit_detail');
  const suggestionId = Array.isArray(id) ? id[0] : id;
  const recommendation = recommendationState.status === 'ready'
    ? recommendationState.snapshot?.recommendation ?? null
    : null;
  const wardrobeItems = wardrobe.state.status === 'ready' ? wardrobe.state.items : [];

  const dressStyle = dressStyleProperty(
    resolvedDressStyle ?? (profileState.status === 'ready' ? profileState.profile.dressStyle : null),
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
      !suggestionId || !position || !outfit || dressingDayChoiceReady === false ||
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
  }, [ageBucket, analytics, dressStyle, dressingDayChoiceReady, isFocused, outfit, position,
    recommendation, suggestionId]);

  // ADR 0038: the day's worn record, read once per dressing day, so the action knows whether
  // it records, repeats nothing, or replaces another look.
  const dayKey = dressingDayKey ? historyDayKey(dressingDayKey) : null;
  useEffect(() => {
    if (!dayKey || !outfitHistory) return;
    let live = true;
    void outfitHistory.get(dayKey).then(
      (record) => { if (live) setWornGarments({ key: dayKey, outfit: record?.outfit ?? null }); },
      () => { if (live) setWornGarments(null); },
    );
    return () => { live = false; };
  }, [dayKey, outfitHistory]);
  const thisWorn = useMemo(() => {
    try { return outfit ? wornOutfitFrom(outfit) : null; } catch { return null; }
  }, [outfit]);
  const dayWorn = wornGarments?.key === dayKey ? wornGarments : null;
  const worn: OutfitWornState = !dayWorn || !thisWorn
    ? 'unknown'
    : dayWorn.outfit === null ? 'none'
      : sameWornGarments(dayWorn.outfit, thisWorn) ? 'this' : 'other';
  const logWorn = () => {
    if (!dayKey || !thisWorn || !outfitHistory) return;
    setWornBusy(true);
    void outfitHistory.log(dayKey, thisWorn)
      .then((record) => setWornGarments({ key: dayKey, outfit: record.outfit }))
      .catch(() => setWornError(messages.today.wornSaveError))
      .finally(() => setWornBusy(false));
  };
  // Idempotent per dressing day: the day's row is read again at the tap, the same look is
  // never written twice, and another look replaces it only after the reader confirms.
  const onWoreThis = () => {
    if (!dayKey || !thisWorn || !outfitHistory || wornBusy) return;
    setWornBusy(true);
    setWornError(null);
    void outfitHistory.get(dayKey).then((record) => {
      setWornBusy(false);
      if (!record) { logWorn(); return; }
      setWornGarments({ key: dayKey, outfit: record.outfit });
      if (sameWornGarments(record.outfit, thisWorn)) return;
      showWardrobeConfirmation({
        title: messages.today.wornReplaceTitle,
        message: messages.today.wornReplaceBody,
        cancelLabel: messages.today.wornReplaceCancel,
        confirmLabel: messages.today.wornReplaceConfirm,
        destructive: true,
        colorScheme: theme.colorScheme,
      }, logWorn);
    }, () => {
      setWornBusy(false);
      setWornError(messages.today.wornSaveError);
    });
  };

  // O6: one sheet writes the piece's Closet record. Taxonomy 5.8's existing events, with
  // `entry_point: 'outfit_detail'`, and no new event.
  const savePiece = async ({ entryState, colorFamily, photoChange }: PieceSheetValues) => {
    if (!editing) return;
    const { match, garmentTypeId } = editing;
    const photo = photoChange.kind === 'unchanged' ? undefined : photoChange;
    if (match.kind === 'owned' || match.kind === 'wanted') {
      const submitted = { entryState, colorFamily };
      const fieldsChanged = closetFieldsChanged(match.item, submitted, photoChange.kind !== 'unchanged');
      if (fieldsChanged.length > 0) {
        const item = photo
          ? await wardrobe.updateItem(match.item.id, submitted, photo)
          : await wardrobe.updateItem(match.item.id, submitted);
        if (item.garmentTypeId) {
          analytics.capture('closet_item_updated', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            fields_changed: fieldsChanged,
            garment_type_id: item.garmentTypeId,
            entry_point: 'outfit_detail',
          });
        }
      }
      setEditing(null);
      return;
    }
    const input = { garmentTypeId, entryState, colorFamily };
    const item = photo ? await wardrobe.createItem(input, photo) : await wardrobe.createItem(input);
    setEditing(null);
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
  };

  const placeSnapshot = weatherState.status === 'ready'
    ? activeLocationSnapshot(weatherState.snapshot, weatherState.activeLocation) : null;
  let state: TodayScreenState;
  if (weatherState.status === 'loading' || recommendationState.status === 'loading') {
    state = { kind: 'loading' };
  } else if (weatherState.status === 'ready' && weatherState.activeLocation !== null &&
      weatherState.snapshot !== null && placeSnapshot === null && weatherState.refreshFailure === null) {
    // S3: the previous place's snapshot is still the last valid result; wait for the new one.
    state = { kind: 'loading' };
  } else if (
    weatherState.status === 'error' ||
    placeSnapshot === null ||
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
        weather: placeSnapshot,
        activeLocation: weatherState.activeLocation,
        freshness:
          weatherFreshness(
            placeSnapshot.fetchedAt,
            new Date().toISOString(),
          ) === 'fresh'
            ? 'fresh'
            : 'stale',
        recommendation,
        coverageStart: recommendationState.snapshot?.coverageStart,
        coverageEnd: recommendationState.snapshot?.coverageEnd,
        paletteBasis: recommendationState.snapshot?.paletteWeather
          ? { ...recommendationState.snapshot.paletteWeather,
              localDayKey: recommendationState.snapshot.localDayKey }
          : undefined,
      },
    };
  }

  useScreenInteractive(state.kind === 'loaded' ? { state: 'loaded' } : null);

  return (
    <>
      {/* O14: every pushed screen goes back the same way, through the system's glass back
          capsule with the parent's name; it stays in the bar instead of scrolling away. The
          Today stack hides its header, so this route turns it on and names Today itself. */}
      <Stack.Screen
        options={{
          headerBackTitle: messages.navigation.today,
          headerShown: true,
          headerTitle: '',
        }}
      />
      <OutfitDetailScreen
        language={language}
        onEditPiece={setEditing}
        onWoreThis={outfitHistory && dayKey ? onWoreThis : undefined}
        state={state}
        suggestionId={suggestionId}
        wardrobeItems={wardrobeItems}
        worn={worn}
        wornBusy={wornBusy}
        wornError={wornError}
      />
      <PieceEditSheet
        onDiscardStagedPhoto={wardrobe.discardStagedPhoto}
        onDismiss={() => setEditing(null)}
        onSave={savePiece}
        onSelectPhoto={wardrobe.preparePhoto}
        resolvePhotoUri={wardrobe.resolvePhotoUri}
        target={editing}
      />
    </>
  );
}
