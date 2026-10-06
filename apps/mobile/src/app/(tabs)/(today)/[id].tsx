import {
  Stack,
  useFocusEffect,
  useIsFocused,
  useLocalSearchParams,
  useNavigation,
  usePreventZoomTransitionDismissal,
} from 'expo-router';
import { StackActions } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import { useIsMember, useOpenSignIn } from '@/features/account/application/account-membership';
import { ACCOUNT_SCREENS_ENABLED } from '@/features/account/application/account-screens-flag';
import { AccountSheet } from '@/features/account/presentation/account-sheet';
import { useScreenInteractive } from '@/features/analytics/application/use-screen-interactive';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import { composeCatalog } from '@/features/today/application/compose-selection';
import {
  composePiecesOf,
  detailShowing,
  useDetailMix,
} from '@/features/today/application/composed-detail';
import { classifyTodayState } from '@/features/today/application/today-state';
import {
  detailOutfit,
  ideaDetail,
  tomorrowDetailIsThisMorning,
  tomorrowDetailState,
} from '@/features/today/application/outfit-detail-state';
import { useClosetSeed } from '@/features/today/application/use-closet-seed';
import { useDayWornLooks } from '@/features/today/application/use-day-worn-looks';
import { useOutfitDetailOpenedReport } from '@/features/today/application/use-outfit-detail-opened-report';
import { usePieceSheet } from '@/features/wardrobe/application/use-piece-sheet';
import { activeLocationRecommendation } from '@/features/today/model';
import { ComposeEntry, ComposeResultLine } from '@/features/today/presentation/compose-entry';
import { OutfitDetailScreen } from '@/features/today/presentation/outfit-detail-screen';
import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';
import { PieceEditSheet } from '@/features/wardrobe/presentation/piece-edit-sheet';
import { useTourPopReport } from '@/features/walkthrough/application/use-tour-pop-report';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { useForegroundClock } from '@/hooks/use-foreground-clock';
import { useLocalization } from '@/localization/use-messages';

export default function OutfitDetailRoute() {
  // `day=tomorrow` opens the evening preview of the next dressing day, read-only for the
  // day's worn record.
  const { day, id } = useLocalSearchParams<{ day?: string | string[]; id?: string | string[] }>();
  const tomorrow = (Array.isArray(day) ? day[0] : day) === 'tomorrow';
  const { language, messages } = useLocalization();
  const { dressingDayChoiceFailed, reevaluateLocalDay, resolvedDressStyle, state: recommendationState,
    tomorrowPreview = null } = useRecommendationApplication();
  const wardrobe = useWardrobeApplication();
  const { revalidateFreshness: revalidateWeatherFreshness, state: weatherState } =
    useWeatherApplication();
  const { markSwapHintShown, state: profileState } = useProfileApplication();
  const isMember = useIsMember();
  const openSignIn = useOpenSignIn();
  const pieceSheet = usePieceSheet();
  const [boardFocused, setBoardFocused] = useState(false);
  // Detail judges weather freshness itself; the clock moves on focus and on return to the
  // foreground, which is also when detail revalidates the weather.
  const clock = useForegroundClock();
  // Tomorrow's preview records no analytics, its screen view included.
  useScreenViewed('outfit_detail', !tomorrow);
  const suggestionId = Array.isArray(id) ? id[0] : id;
  const activeLocation = weatherState.status === 'ready' ? weatherState.activeLocation : null;
  const recommendation = tomorrow
    ? activeLocationRecommendation(tomorrowPreview, activeLocation)
    : recommendationState.status === 'ready'
      ? activeLocationRecommendation(recommendationState.snapshot, activeLocation)
      : null;
  const wardrobeItems = wardrobe.state.status === 'ready' ? wardrobe.state.items : [];

  const isFocused = useIsFocused();
  // The route is keyed by the outfit's stable option id, so a regeneration that finishes
  // while detail is open cannot swap another outfit under the user; an outfit the current
  // snapshot no longer offers renders the unavailable state instead. An outfit from Today's
  // "More ideas" opens alone, as kuyara composed it on the device, with no place among the three.
  const { outfit, position } = detailOutfit(recommendation, suggestionId,
    tomorrow ? null : recommendationState);
  // Phase 7: the reader's changes to this outfit live exactly as long as this route, so
  // leaving detail forgets them. The candidates keep the profile's gender
  // applicability the outfit was composed with.
  const preference = (tomorrow
    ? tomorrowPreview?.clothingPreference
    : recommendationState.status === 'ready' ? recommendationState.snapshot?.clothingPreference : undefined) ?? null;
  const requirements = recommendation?.status === 'recommended' ? recommendation.requirements : null;
  // Compose around chosen pieces (members only, today only): its result is shown, edited and
  // recorded through the same manual mix, as the reader's outfit from the start.
  const { composed, manualMix } = useDetailMix(outfit, requirements, preference,
    tomorrow || recommendationState.status !== 'ready' ? null : recommendationState.snapshot,
    resolvedDressStyle, clock);
  const option = composed.current;
  // Any edit makes the outfit the reader's, a finishing touch alone included, and so does a
  // composed result; each records as `manual` (ADR 0038).
  const { composed: composedView, worn: thisWorn } = useMemo(
    () => detailShowing(outfit, option, manualMix), [manualMix, option, outfit]);

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

  useOutfitDetailOpenedReport({ focused: isFocused, tomorrow, suggestionId, position, outfit, recommendation });
  const dayWorn = useDayWornLooks(thisWorn, tomorrow);
  const closetSeed = useClosetSeed((count) => {
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(messages.today.closetSeed.added(count));
  });

  const { state: todayState } = classifyTodayState({
    weather: weatherState,
    recommendation: recommendationState,
    profile: profileState,
    dressingDayChoiceFailed,
    surface: 'detail',
    now: new Date(clock).toISOString(),
  });
  const state = tomorrow ? tomorrowDetailState(weatherState, tomorrowPreview, new Date(clock).toISOString())
    : ideaDetail(todayState, suggestionId) ?? todayState;

  const previewTitle = tomorrowDetailIsThisMorning(state, clock)
    ? messages.today.tomorrow.morningHeading : messages.today.tomorrow.heading;

  useScreenInteractive(state.kind === 'loaded' ? { state: 'loaded' } : null);
  // On iOS an alternative on Today zooms this screen open, and the zoom's own drag closes it
  // from anywhere on screen. While a piece is focused that drag would take the board's
  // swipe, so it is held off, as the full-screen back swipe is, and the back control
  // still closes. Without the zoom the hook does nothing.
  usePreventZoomTransitionDismissal(
    boardFocused ? { unstable_dismissalBoundsRect: { maxX: 0, maxY: 0 } } : undefined,
  );

  // "Back to kuyara's pick" forgets the composed result too.
  const shownMix = manualMix && option
    ? { ...manualMix, reset: () => { composed.clear(); manualMix.reset(); } }
    : manualMix;

  return (
    <>
      {/* O14: every pushed screen goes back the same way, through the system's glass back
          capsule with the parent's name; it stays in the bar instead of scrolling away. The
          Today stack hides its header, so this route turns it on and names Today itself. */}
      <Stack.Screen
        options={{
          headerBackTitle: messages.navigation.today,
          headerShown: true,
          // Tomorrow's preview names its day in the bar, as the strip does ("This morning" in
          // the small hours); today's detail needs no title.
          headerTitle: tomorrow ? previewTitle : '',
          // Phase 7: iOS 26's full-screen back swipe would take a rightward drag on the
          // focused piece, so it is off while a piece is focused; the edge swipe stays, and
          // the platform default returns when the focus ends.
          fullScreenGestureEnabled: boardFocused ? false : undefined,
        }}
      />
      <OutfitDetailScreen
        closetSeed={closetSeed}
        // Today's primary board draws the first of the three; tomorrow's strip and the tiles never draw it.
        fromBand={!tomorrow && position === 1}
        language={language}
        composeEntry={!tomorrow && outfit && preference ? (palette) => (ACCOUNT_SCREENS_ENABLED ? (
          <ComposeEntry
            catalog={composeCatalog(preference)}
            isMember={isMember}
            onCompose={composed.compose}
            onSignIn={() => openSignIn('detail')}
            palette={palette}
            pieces={composePiecesOf(outfit)}
          />
        ) : null) : null}
        composeResult={composedView && composed.key ? {
          key: composed.key,
          line: (
            <ComposeResultLine index={composed.index} onShowAnother={composed.showAnother} total={composed.options.length} />
          ),
          subtitle: messages.today.compose.builtFrom,
          source: messages.today.compose.source,
          detail: composedView,
        } : null}
        manualMix={shownMix}
        pinnedSlots={composedView?.pinnedSlots}
        onBoardFocusChange={setBoardFocused}
        onEditPiece={pieceSheet.open}
        onSwipeHintShown={() => {
          void markSwapHintShown?.().catch(() => {
            // An unstored flag only lets the hint play once more on a later visit.
          });
        }}
        onWoreThis={dayWorn.wearThis}
        state={state}
        suggestionId={suggestionId}
        // The board's swipe hint plays until the profile says it has, once for life.
        swipeHint={profileState.status === 'ready' && profileState.profile.swapHintShown === false}
        wardrobeItems={wardrobeItems}
        worn={dayWorn.worn}
        wornBusy={dayWorn.busy}
        wornError={dayWorn.failed ? messages.today.wornSaveError : null}
      />
      {ACCOUNT_SCREENS_ENABLED ? <AccountSheet host="detail" /> : null}
      <PieceEditSheet
        onDiscardStagedPhoto={wardrobe.discardStagedPhoto}
        onDismiss={pieceSheet.close}
        onSave={pieceSheet.save}
        onSelectPhoto={wardrobe.preparePhoto}
        resolvePhotoUri={wardrobe.resolvePhotoUri}
        target={pieceSheet.target}
      />
    </>
  );
}
