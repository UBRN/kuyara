import {
  Stack,
  useFocusEffect,
  useIsFocused,
  useLocalSearchParams,
  useNavigation,
  usePreventZoomTransitionDismissal,
} from 'expo-router';
import { StackActions } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useScreenInteractive } from '@/features/analytics/application/use-screen-interactive';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import {
  ageBucketProperty,
  dressStyleProperty,
  generationModeProperty,
} from '@/features/analytics/domain/analytics-mappers';
import { isClothingPreference } from '@/domain/preferences';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import { useManualMix } from '@/features/recommendation/application/use-manual-mix';
import { classifyTodayState } from '@/features/today/application/today-state';
import { activeLocationRecommendation, type TodayScreenState } from '@/features/today/model';
import {
  historyDayKey,
  sameWornGarments,
  wornOutfitFrom,
  type WornOutfit,
  type WornPieceColors,
} from '@/features/recommendation/domain/outfit-history';
import {
  OutfitDetailScreen,
  type ClosetSeedOffer,
  type OutfitWornState,
} from '@/features/today/presentation/outfit-detail-screen';
import { tomorrowForecastDay } from '@/features/today/presentation/today-presentation';
import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';
import { closetFieldsChanged } from '@/features/wardrobe/application/closet-field-changes';
import { closetSeedInputs, type ClosetSeedPiece } from '@/features/wardrobe/application/closet-seed';
import type { WardrobeEntryState } from '@/features/wardrobe/domain/wardrobe-item';
import {
  PieceEditSheet,
  type PieceSheetTarget,
  type PieceSheetValues,
} from '@/features/wardrobe/presentation/piece-edit-sheet';
import { showWardrobeConfirmation } from '@/features/wardrobe/presentation/wardrobe-confirmation';
import { useTourPopReport } from '@/features/walkthrough/application/use-tour-pop-report';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import type { WeatherApplicationState } from '@/features/weather/application/weather-application-controller';
import { activeLocationSnapshot, weatherFreshness } from '@/features/weather/domain/weather';
import { useForegroundClock } from '@/hooks/use-foreground-clock';
import { useLocalization } from '@/localization/use-messages';
import { useKuyaraTheme } from '@/theme/theme-context';

// The worn record for an outfit, or none when it does not parse. Outside the route because
// React Compiler skips a component that holds a value block inside try/catch.
function wornOutfitOrNull(...args: Parameters<typeof wornOutfitFrom>): WornOutfit | null {
  try {
    return wornOutfitFrom(...args);
  } catch {
    return null;
  }
}

// Detail of the evening preview reads its own outfit and the active place's forecast.
function tomorrowState(
  weather: WeatherApplicationState,
  preview: ReturnType<typeof useRecommendationApplication>['tomorrowPreview'],
  now: string,
): TodayScreenState {
  if (weather.status !== 'ready' || !preview || !weather.activeLocation) return { kind: 'unavailable' };
  const placeSnapshot = activeLocationSnapshot(weather.snapshot, weather.activeLocation);
  if (!placeSnapshot) return { kind: 'unavailable' };
  const forecastDay = tomorrowForecastDay(preview, placeSnapshot);
  if (!forecastDay || !activeLocationRecommendation(preview, weather.activeLocation)) {
    return { kind: 'unavailable' };
  }
  return {
    kind: 'loaded',
    snapshot: {
      weather: placeSnapshot,
      activeLocation: weather.activeLocation,
      freshness: weatherFreshness(placeSnapshot.fetchedAt, now) === 'fresh' ? 'fresh' : 'stale',
      recommendation: preview.recommendation,
      coverageStart: preview.coverageStart,
      coverageEnd: preview.coverageEnd,
    },
    isRefreshing: weather.isRefreshing,
    refreshFailed: weather.refreshFailure !== null,
    forecastDay,
  };
}

export default function OutfitDetailRoute() {
  // `day=tomorrow` opens the evening preview of the next dressing day, read-only for the
  // day's worn record.
  const { day, id } = useLocalSearchParams<{ day?: string | string[]; id?: string | string[] }>();
  const tomorrow = (Array.isArray(day) ? day[0] : day) === 'tomorrow';
  const { language, messages } = useLocalization();
  const { dressingDayChoiceReady, dressingDayChoiceFailed, dressingDayKey, outfitHistory, reevaluateLocalDay,
    resolvedDressStyle, state: recommendationState, tomorrowPreview = null } = useRecommendationApplication();
  const theme = useKuyaraTheme();
  const wardrobe = useWardrobeApplication();
  const { revalidateFreshness: revalidateWeatherFreshness, state: weatherState } =
    useWeatherApplication();
  const { markSwapHintShown, state: profileState } = useProfileApplication();
  const { analytics, firstUses } = useProductAnalytics();
  const [editing, setEditing] = useState<PieceSheetTarget | null>(null);
  const [wornGarments, setWornGarments] = useState<{ key: string; outfit: WornOutfit | null } | null>(null);
  const [wornBusy, setWornBusy] = useState(false);
  const [wornError, setWornError] = useState<string | null>(null);
  const [boardFocused, setBoardFocused] = useState(false);
  const [seed, setSeed] = useState<Readonly<{ status: 'busy' | 'failed' } | { status: 'added'; count: number }> | null>(null);
  // Detail judges weather freshness itself; the clock moves on focus and on return to the
  // foreground, which is also when detail revalidates the weather.
  const clock = useForegroundClock();
  useScreenViewed('outfit_detail');
  const suggestionId = Array.isArray(id) ? id[0] : id;
  const activeLocation = weatherState.status === 'ready' ? weatherState.activeLocation : null;
  const recommendation = tomorrow
    ? activeLocationRecommendation(tomorrowPreview, activeLocation)
    : recommendationState.status === 'ready'
      ? activeLocationRecommendation(recommendationState.snapshot, activeLocation)
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
  // Phase 7: the reader's changes to this outfit live exactly as long as this route, so
  // leaving detail forgets them (owner answer 4). The candidates keep the profile's gender
  // applicability the outfit was composed with.
  const snapshotPreference = tomorrow
    ? tomorrowPreview?.clothingPreference
    : recommendationState.status === 'ready' ? recommendationState.snapshot?.clothingPreference : undefined;
  const manualMix = useManualMix(
    outfit,
    recommendation?.status === 'recommended' ? recommendation.requirements : null,
    isClothingPreference(snapshotPreference) ? snapshotPreference : null,
  );
  const changedOutfit = manualMix && manualMix.changedSlots.length > 0 ? manualMix.outfit : null;

  // A regeneration that lands while the reader is on another tab and no longer offers this
  // outfit leaves nothing to come back to, so the Today stack returns to its root rather
  // than keeping an "Outfit unavailable" page for the next Today tap. While detail is in
  // view it stays put, with the unavailable state and the back capsule, so nothing moves
  // under the reader.
  const navigation = useNavigation();
  const outfitGone = recommendation !== null && outfit === null;
  useEffect(() => {
    if (!isFocused && outfitGone) navigation.dispatch(StackActions.popToTop());
  }, [isFocused, navigation, outfitGone]);
  useTourPopReport();

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
      // Tomorrow's preview records no analytics.
      tomorrow || !suggestionId || !position || !outfit || dressingDayChoiceReady === false ||
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
    recommendation, suggestionId, tomorrow]);

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
  // A changed outfit records as `manual` (ADR 0038); the schema already carries the source.
  const thisWorn = useMemo(
    () => changedOutfit ? wornOutfitOrNull(changedOutfit, 'manual') : outfit ? wornOutfitOrNull(outfit) : null,
    [changedOutfit, outfit],
  );
  const dayWorn = wornGarments?.key === dayKey ? wornGarments : null;
  const worn: OutfitWornState = tomorrow || !dayWorn || !thisWorn
    ? 'unknown'
    : dayWorn.outfit === null ? 'none'
      : sameWornGarments(dayWorn.outfit, thisWorn) ? 'this' : 'other';
  const logWorn = (pieceColors: WornPieceColors) => {
    if (!dayKey || !thisWorn || !outfitHistory) return;
    setWornBusy(true);
    void outfitHistory.log(dayKey, thisWorn, pieceColors)
      .then((record) => setWornGarments({ key: dayKey, outfit: record.outfit }))
      .catch(() => setWornError(messages.today.wornSaveError))
      .finally(() => setWornBusy(false));
  };
  // Idempotent per dressing day: the day's row is read again at the tap, the same look is
  // never written twice, and another look replaces it only after the reader confirms. The
  // colours are the ones the detail board drew, so History draws the day as it was seen.
  const onWoreThis = (pieceColors: WornPieceColors) => {
    if (!dayKey || !thisWorn || !outfitHistory || wornBusy) return;
    setWornBusy(true);
    setWornError(null);
    void outfitHistory.get(dayKey).then((record) => {
      setWornBusy(false);
      if (!record) { logWorn(pieceColors); return; }
      setWornGarments({ key: dayKey, outfit: record.outfit });
      if (sameWornGarments(record.outfit, thisWorn)) return;
      showWardrobeConfirmation({
        title: messages.today.wornReplaceTitle,
        message: messages.today.wornReplaceBody,
        cancelLabel: messages.today.wornReplaceCancel,
        confirmLabel: messages.today.wornReplaceConfirm,
        destructive: true,
        colorScheme: theme.colorScheme,
      }, () => logWorn(pieceColors));
    }, () => {
      setWornBusy(false);
      setWornError(messages.today.wornSaveError);
    });
  };

  // O6: one sheet writes the piece's Closet record. Taxonomy 5.8's existing events, with
  // `entry_point: 'outfit_detail'`, and no new event.
  const savePiece = async ({ entryState, colorFamily, colorChoice, photoChange }: PieceSheetValues) => {
    if (!editing) return;
    const { match, garmentTypeId } = editing;
    const photo = photoChange.kind === 'unchanged' ? undefined : photoChange;
    // O8: the sheet sends a palette choice only when the user picked a new one; without it
    // the repository keeps the stored choice. The choice itself never enters analytics.
    const choice = colorChoice ? { colorChoice } : {};
    if (match.kind === 'owned' || match.kind === 'wanted') {
      const submitted = { entryState, colorFamily, ...choice };
      const fieldsChanged = closetFieldsChanged(match.item, submitted, photoChange.kind !== 'unchanged');
      if (fieldsChanged.length > 0 || colorChoice) {
        const item = photo
          ? await wardrobe.updateItem(match.item.id, submitted, photo)
          : await wardrobe.updateItem(match.item.id, submitted);
        if (item.garmentTypeId && fieldsChanged.length > 0) {
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
    const input = { garmentTypeId, entryState, colorFamily, ...choice };
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

  // The empty Closet's one tap. The controller reads the Closet again inside its one change,
  // so a second tap, or a tap from a stale screen, adds nothing; no analytics event.
  const closetEmpty = wardrobe.state.status === 'ready' && wardrobe.state.items.length === 0;
  const seedCloset = (pieces: readonly ClosetSeedPiece[], entryState: WardrobeEntryState) => {
    if (seed?.status === 'busy') return;
    setSeed({ status: 'busy' });
    void wardrobe.seedEmptyCloset(closetSeedInputs(pieces, entryState)).then((created) => {
      setSeed(created.length > 0 ? { status: 'added', count: created.length } : null);
      if (created.length > 0 && Platform.OS === 'ios') {
        AccessibilityInfo.announceForAccessibility(messages.today.closetSeed.added(created.length));
      }
    }, () => setSeed({ status: 'failed' }));
  };
  const closetSeed: ClosetSeedOffer | null = seed?.status === 'added'
    ? { status: 'added', addedCount: seed.count, onSeed: seedCloset }
    : closetEmpty ? { status: seed?.status ?? 'offer', addedCount: 0, onSeed: seedCloset } : null;

  const { state: todayState } = classifyTodayState({
    weather: weatherState,
    recommendation: recommendationState,
    profile: profileState,
    dressingDayChoiceFailed,
    surface: 'detail',
    now: new Date(clock).toISOString(),
  });
  const state = tomorrow ? tomorrowState(weatherState, tomorrowPreview, new Date(clock).toISOString()) : todayState;

  useScreenInteractive(state.kind === 'loaded' ? { state: 'loaded' } : null);
  // On iOS an alternative on Today zooms this screen open, and the zoom's own drag closes it
  // from anywhere on screen. While a piece is focused that drag would take the board's
  // swipe, so it is held off, as the full-screen back swipe is, and the back control
  // still closes. Without the zoom the hook does nothing.
  usePreventZoomTransitionDismissal(
    boardFocused ? { unstable_dismissalBoundsRect: { maxX: 0, maxY: 0 } } : undefined,
  );

  return (
    <>
      {/* O14: every pushed screen goes back the same way, through the system's glass back
          capsule with the parent's name; it stays in the bar instead of scrolling away. The
          Today stack hides its header, so this route turns it on and names Today itself. */}
      <Stack.Screen
        options={{
          headerBackTitle: messages.navigation.today,
          headerShown: true,
          // Tomorrow's preview names its day in the bar; today's detail needs no title.
          headerTitle: tomorrow ? messages.today.tomorrow.heading : '',
          // Phase 7: iOS 26's full-screen back swipe would take a rightward drag on the
          // focused piece, so it is off while a piece is focused; the edge swipe stays, and
          // the platform default returns when the focus ends.
          fullScreenGestureEnabled: boardFocused ? false : undefined,
        }}
      />
      <OutfitDetailScreen
        closetSeed={closetSeed}
        language={language}
        manualMix={manualMix}
        onBoardFocusChange={setBoardFocused}
        onEditPiece={setEditing}
        onSwipeHintShown={() => {
          void markSwapHintShown?.().catch(() => {
            // An unstored flag only lets the hint play once more on a later visit.
          });
        }}
        onWoreThis={outfitHistory && dayKey && !tomorrow ? onWoreThis : undefined}
        state={state}
        suggestionId={suggestionId}
        // The board's swipe hint plays until the profile says it has, once for life.
        swipeHint={profileState.status === 'ready' && profileState.profile.swapHintShown === false}
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
