import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DressStyle, StyleAesthetic } from '@kuyara/contracts';

import type { FailureCategory } from '@/domain/failure-category';
import { useAnalyticsConsentTrigger } from '@/features/analytics/application/analytics-consent-trigger';
import { useFocusedErrorEpisode } from '@/features/analytics/application/use-focused-error-episode';
import { useScreenInteractive } from '@/features/analytics/application/use-screen-interactive';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import {
  ANALYTICS_SCHEMA_VERSION,
} from '@/features/analytics/domain/analytics-events';
import {
  ageBucketProperty,
  dressStyleProperty,
  generationModeProperty,
} from '@/features/analytics/domain/analytics-mappers';
import { useNotificationApplication } from '@/features/notifications/application/notification-context';
import { useWeatherAlertOffer } from '@/features/notifications/application/use-weather-alert-offer';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { namePromptVersion } from '@/features/profile/domain/profile';
import { NameSheet } from '@/features/profile/presentation/name-sheet';
import { StyleAestheticsOptions } from '@/features/profile/presentation/style-aesthetics-options';
import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import { localDayKey } from '@/features/recommendation/application/recommendation-application-controller';
import { outfitCoverage } from '@/features/recommendation/domain/outfit-coverage';
import { activeLocationRecommendation, unavailableTodayState, type TodayScreenState } from '@/features/today/model';
import { TodayScreen } from '@/features/today/presentation/today-screen';
import { AskAgainSheet, type AskAgainChoice } from '@/features/today/presentation/ask-again-sheet';
import { DailyFormalitySheet } from '@/features/today/presentation/daily-formality-sheet';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { activeLocationSnapshot } from '@/features/weather/domain/weather';
import { useForegroundClock } from '@/hooks/use-foreground-clock';
import { useLocalization } from '@/localization/use-messages';
import { getMessages } from '@/localization/messages';

export default function TodayRoute() {
  const { language, hour12 } = useLocalization();
  const clock = useForegroundClock();
  const router = useRouter();
  const {
    state: recommendationState,
    getSnapshot: getRecommendationSnapshot,
    refresh: refreshRecommendation,
    evaluateApprovedTriggers,
    reevaluateLocalDay,
    dressingDayKey,
    dressingDayChoiceReady,
    morningChoicePending,
    eveningChoicePending,
    resolvedDressStyle,
    resolvedStyleAesthetics,
    chooseFormality,
    reask,
    activeDeparture,
  } = useRecommendationApplication();
  const weatherApplication = useWeatherApplication();
  const { revalidateFreshness: revalidateWeatherFreshness, state: weatherState } =
    weatherApplication;
  const { state: profileState, updateDisplayName } = useProfileApplication();
  const [namePromptDismissed, setNamePromptDismissed] = useState(false);
  const currentDressingDayKey = dressingDayKey ?? null;
  // The morning question or the 18:00 evening question: one sheet, two openers. During the
  // day the day type changes inside "Ask the stylist again" (O2, O3).
  const [sheetTarget, setSheetTargetState] = useState<'morning' | 'evening' | null>(null);
  // The sheet reports a programmatic close as a dismissal too. Read live, so the close that
  // follows an answer is never taken for a dismissal that would overwrite that answer.
  const openSheet = useRef<'morning' | 'evening' | null>(null);
  const setSheetTarget = useCallback((target: 'morning' | 'evening' | null) => {
    openSheet.current = target;
    setSheetTargetState(target);
  }, []);
  // The re-ask sheet opens on the clock it was pressed at; its window is read against it.
  const [askOpenedAt, setAskOpenedAt] = useState<number | null>(null);
  const [askBusy, setAskBusy] = useState(false);
  const [askError, setAskError] = useState(false);
  const [choosingWindow, setChoosingWindow] = useState<Readonly<{ start: string; end: string }> | null>(null);
  const [sheetError, setSheetError] = useState(false);
  // M18 step 2: the day type chosen on step 1 and the styles on screen. Nothing is written
  // until the sheet closes, so both answers land in one write and one generation.
  const [stylesStep, setStylesStep] = useState<Readonly<{
    style: DressStyle; initial: readonly StyleAesthetic[]; draft: readonly StyleAesthetic[];
  }> | null>(null);
  const offeredKey = useRef<string | null>(null);
  const savingChoice = useRef(false);
  const showNamePrompt = profileState.status === 'ready'
    && profileState.profile.onboardingCompleted
    && !namePromptDismissed
    && profileState.profile.namePromptVersion < namePromptVersion;
  const { analytics, firstUses, retries } = useProductAnalytics();
  const { markRecommendationShown } = useAnalyticsConsentTrigger();
  // ADR 0004: the one contextual offer. The reason, the durable flag and the opt-in flow all
  // live behind the hook, so the route only hands Today a decided offer and its actions. The
  // hook persists; it emits nothing, so this route reports the same events the Settings
  // Notifications route reports for the same opt-in, plus taxonomy 5.13's
  // `weather_alert_offer_resolved` for how the offer itself was answered.
  const { acceptOffer, dismissOffer, offer } = useWeatherAlertOffer();
  const { openApplicationSettings } = useNotificationApplication();
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  useScreenViewed('today');

  const recommendation = recommendationState.status === 'ready'
    ? activeLocationRecommendation(recommendationState.snapshot, weatherState.status === 'ready'
      ? weatherState.activeLocation : null)
    : null;
  // S3: after a place switch the weather controller keeps the previous place's snapshot as the
  // last valid result until the new one loads. It never renders under the new place's name:
  // Today waits, or states the failure, exactly as it does with no snapshot at all.
  const placeSnapshot = weatherState.status === 'ready'
    ? activeLocationSnapshot(weatherState.snapshot, weatherState.activeLocation) : null;

  let state: TodayScreenState;
  let todayFailure: FailureCategory | null | undefined;
  let recommendationFailure: FailureCategory | null | undefined;
  if (weatherState.status === 'loading' || recommendationState.status === 'loading') {
    state = { kind: 'loading' };
    todayFailure = undefined;
    recommendationFailure = undefined;
  } else if (weatherState.status === 'ready' && weatherState.snapshot !== null &&
      weatherState.activeLocation !== null && placeSnapshot === null &&
      weatherState.refreshFailure === null) {
    state = { kind: 'loading' };
    todayFailure = undefined;
    recommendationFailure = undefined;
  } else if (
    weatherState.status === 'error' ||
    placeSnapshot === null ||
    weatherState.activeLocation === null ||
    weatherState.freshness === null
  ) {
    // Weather is the reason here, so its category classifies the failure. Nothing
    // renders this; it only carries the cause the analytics taxonomy asks for.
    state = unavailableTodayState(
      weatherState.status === 'ready' ? weatherState.refreshFailure : null,
    );
    todayFailure = weatherState.status === 'ready'
      ? weatherState.refreshFailure ?? 'unknown'
      : 'unknown';
    recommendationFailure = null;
  } else if (recommendation === null && (recommendationState.isRefreshing ||
      (recommendationState.snapshot !== null && recommendationState.lastFailure === null) ||
      (morningChoicePending && !recommendationState.lastFailure))) {
    // M16: a first recommendation held for the morning answer is a wait, so the morning
    // sheet opens over it. A real failure still takes the unavailable branch below and is
    // reported, and the sheet never opens over that card.
    state = { kind: 'loading', phase: recommendationState.phase };
    todayFailure = undefined;
    recommendationFailure = undefined;
  } else if (recommendation === null) {
    state = unavailableTodayState(recommendationState.lastFailure);
    todayFailure = null;
    recommendationFailure = recommendationState.lastFailure ?? 'unknown';
  } else {
    state = {
      kind: 'loaded',
      snapshot: {
        weather: placeSnapshot,
        activeLocation: weatherState.activeLocation,
        freshness: weatherState.freshness,
        recommendation,
        coverageStart: recommendationState.snapshot?.coverageStart,
        coverageEnd: recommendationState.snapshot?.coverageEnd,
        paletteBasis: recommendationState.snapshot?.paletteWeather
          ? { ...recommendationState.snapshot.paletteWeather,
              localDayKey: recommendationState.snapshot.localDayKey }
          : undefined,
      },
      isRefreshing:
        isPullRefreshing || weatherState.isRefreshing || recommendationState.isRefreshing,
      refreshFailed:
        weatherState.refreshFailure !== null || recommendationState.lastFailure !== null,
      phase: recommendationState.phase,
      choosingWindow,
    };
    todayFailure = weatherState.refreshFailure;
    recommendationFailure = recommendationState.lastFailure;
  }

  // Today is the first screen the shell mounts after bootstrap, so its first presentation
  // is the moment the app is usable. The kind is coarse: loading, loaded or unavailable.
  useScreenInteractive({ state: state.kind });

  // Only the focused Today route can show these failures. A weather failure belongs to
  // the composite Today surface; a recommendation failure belongs to its distinct surface.
  useFocusedErrorEpisode('today', todayFailure);
  useFocusedErrorEpisode('recommendation', recommendationFailure);

  // Taxonomy 5.5: `recommendation_viewed`, once per focus appearance while a real
  // three-outfit recommendation is visible (an AI/fallback failure inside a `loaded` state
  // does not count).
  const [isFocused, setIsFocused] = useState(false);
  const evaluateOnFocus = useRef(evaluateApprovedTriggers);
  useEffect(() => { evaluateOnFocus.current = evaluateApprovedTriggers; }, [evaluateApprovedTriggers]);
  const isRecommendationShown = state.kind === 'loaded'
    && state.snapshot.recommendation.status === 'recommended';
  useFocusEffect(useCallback(() => {
    reevaluateLocalDay();
    void evaluateOnFocus.current(true);
    // Today's freshness line ages with the clock, so returning to the tab re-evaluates it
    // and starts the stale refresh the existing coalescing then shares.
    void revalidateWeatherFreshness();
    setIsFocused(true);
    return () => {
      setIsFocused(false);
      retries.reset('today');
    };
  }, [reevaluateLocalDay, retries, revalidateWeatherFreshness]));
  // M16 and N20: the first foreground open of a bare-date day asks the morning question, and
  // the first one after 18:00 asks the evening question, starting empty.
  const pendingQuestion = morningChoicePending ? 'morning' : eveningChoicePending ? 'evening' : null;
  useEffect(() => {
    if (!isFocused || !pendingQuestion || showNamePrompt || !currentDressingDayKey ||
        state.kind === 'unavailable' || offeredKey.current === currentDressingDayKey) return;
    offeredKey.current = currentDressingDayKey;
    setSheetTarget(pendingQuestion);
  }, [currentDressingDayKey, isFocused, pendingQuestion, setSheetTarget, showNamePrompt, state.kind]);
  const profile = profileState.status === 'ready' ? profileState.profile : null;
  const profileDressStyle = profile?.dressStyle ?? 'smart';
  // f25 and M16: the first dressing day is the one the profile was set up on. Its greeting
  // is a welcome, and its morning question opens on the answer given in setup.
  const firstDressingDay = Boolean(profile?.onboardingCompleted && currentDressingDayKey &&
    localDayKey(new Date(profile.createdAt)).slice(0, 10) === currentDressingDayKey.slice(0, 10));
  // f7: the outfit on screen was made for another day type, and its replacement is running.
  const snapshotDressStyle = recommendationState.status === 'ready'
    ? recommendationState.snapshot?.dressStyle ?? null : null;
  const updatingDayType = recommendationState.status === 'ready' && recommendationState.isRefreshing &&
    resolvedDressStyle && snapshotDressStyle !== null && snapshotDressStyle !== resolvedDressStyle
    ? resolvedDressStyle : null;
  // The one write that answers the sheet. `styles` is left out unless step 2 changed them,
  // so an untouched step keeps the Settings defaults following Settings (N4).
  const answerSheet = async (style: DressStyle, styles?: readonly StyleAesthetic[]) => {
    if (!sheetTarget || savingChoice.current || !currentDressingDayKey) return;
    savingChoice.current = true;
    setSheetError(false);
    try {
      await chooseFormality?.(currentDressingDayKey, style, 'morning', styles);
      setStylesStep(null);
      setSheetTarget(null);
    } catch {
      setSheetError(true);
    } finally {
      savingChoice.current = false;
    }
  };
  const handleChoice = (style: DressStyle) => {
    if (!sheetTarget || savingChoice.current) return;
    const initial = resolvedStyleAesthetics ?? [];
    setStylesStep({ style, initial, draft: initial });
  };
  const confirmStyles = () => {
    if (!stylesStep) return;
    const changed = JSON.stringify([...stylesStep.draft].sort()) !==
      JSON.stringify([...stylesStep.initial].sort());
    void answerSheet(stylesStep.style, changed ? stylesStep.draft : undefined);
  };
  // P6: closing the question answers it with the profile's own dress style, through the same
  // write an answer makes, so it starts no generation the answer would not. Closed on step 2,
  // it answers with the day type already chosen and leaves the styles as they were.
  const dismissChoice = () => {
    const target = openSheet.current;
    if (savingChoice.current || !target || !currentDressingDayKey) return;
    const chosen = stylesStep;
    savingChoice.current = true;
    setSheetTarget(null);
    void (chooseFormality?.(currentDressingDayKey, chosen?.style ?? profileDressStyle, 'morning')
      ?? Promise.resolve())
      .then(() => setStylesStep(null))
      .catch(() => { setSheetError(true); setSheetTarget(target); })
      .finally(() => { savingChoice.current = false; });
  };
  const placeTimeZone = placeSnapshot?.timeZone ?? null;
  const confirmAskAgain = async ({ formality, departureAt }: AskAgainChoice) => {
    if (askBusy || !placeTimeZone || !reask) return;
    setAskBusy(true);
    setAskError(false);
    try {
      const { settled } = await reask({ formality, departureAt, timeZone: placeTimeZone });
      setChoosingWindow(outfitCoverage(departureAt ?? new Date().toISOString(), placeTimeZone));
      void settled.finally(() => setChoosingWindow(null));
      setAskOpenedAt(null);
    } catch {
      setAskError(true);
    } finally {
      setAskBusy(false);
    }
  };
  const viewedThisFocusRef = useRef(false);
  useEffect(() => {
    if (!isFocused) {
      viewedThisFocusRef.current = false;
      return;
    }
    if (viewedThisFocusRef.current || morningChoicePending || dressingDayChoiceReady === false) return;
    if (state.kind !== 'loaded' || state.snapshot.recommendation.status !== 'recommended') return;
    viewedThisFocusRef.current = true;
    const cacheState = state.isRefreshing
      ? 'refreshing'
      : state.snapshot.freshness === 'stale'
        ? 'stale_shown'
        : 'fresh';
    analytics.capture('recommendation_viewed', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      generation_mode: generationModeProperty(state.snapshot.recommendation.generationMode),
      cache_state: cacheState,
      outfit_count: 3,
      dress_style: dressStyleProperty(
        resolvedDressStyle ?? (profileState.status === 'ready' ? profileState.profile.dressStyle : null),
      ),
      age_bucket: ageBucketProperty(
        profileState.status === 'ready' ? profileState.profile.birthDate : null,
      ),
    });
  }, [analytics, dressingDayChoiceReady, isFocused, morningChoicePending, profileState, resolvedDressStyle, state]);

  useEffect(() => {
    if (!isFocused || !isRecommendationShown || showNamePrompt || morningChoicePending ||
        dressingDayChoiceReady === false) return;
    markRecommendationShown();
  }, [dressingDayChoiceReady, isFocused, isRecommendationShown, markRecommendationShown,
    morningChoicePending, showNamePrompt]);

  // Taxonomy 5.7: Today's pull gesture doubles as the retry action when a failure is
  // already shown (there is no separate retry control).
  const handleRefresh = async () => {
    if (isPullRefreshing) return;
    const wasFailing = state.kind === 'unavailable' || (state.kind === 'loaded' && state.refreshFailed);
    setIsPullRefreshing(true);
    try {
      await weatherApplication.refresh();
      const currentRecommendation = getRecommendationSnapshot();
      if (currentRecommendation.status === 'ready' &&
          currentRecommendation.snapshot?.recommendation.status !== 'recommended') {
        await refreshRecommendation();
      } else if (currentRecommendation.status === 'ready') {
        await evaluateApprovedTriggers();
      }

      const after = weatherApplication.getSnapshot?.() ?? weatherApplication.state;
      const recommendationAfter = getRecommendationSnapshot();
      const outcome = after.status !== 'ready'
        ? ('failure_no_snapshot' as const)
        : after.refreshFailure === null
          ? ('success' as const)
          : after.snapshot
            ? ('failure_kept_last_known' as const)
            : ('failure_no_snapshot' as const);
      if (wasFailing) {
        const retrySucceeded = after.status === 'ready' && after.refreshFailure === null &&
          after.snapshot !== null && after.activeLocation !== null && after.freshness !== null &&
          recommendationAfter.status === 'ready' && recommendationAfter.lastFailure === null &&
          recommendationAfter.snapshot?.recommendation.status === 'recommended';
        analytics.capture('retry_after_failure_triggered', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
          surface: 'today',
          attempt_number: retries.nextAttempt('today'),
          result: retrySucceeded ? 'success' : 'failure',
        });
        if (retrySucceeded) retries.reset('today');
        return;
      }
      analytics.capture('manual_refresh_triggered', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        surface: 'today',
        result: outcome,
      });
      void firstUses.markFirstUse('manual_refresh').then((firstUse) => {
        if (!firstUse) return;
        analytics.capture('feature_used_first_time', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
          feature_name: 'manual_refresh',
        });
      });
    } finally {
      setIsPullRefreshing(false);
    }
  };

  return (
    <>
    <TodayScreen
      alertOffer={offer.kind === 'offer' ? {
        ruleId: offer.ruleId,
        onAccept: async () => {
          // Read before the accept runs: it turns the briefing on, and taxonomy 5.9 only
          // records a setting that really changed.
          const briefingWasOn = profileState.status === 'ready'
            && profileState.profile.morningBriefingOptIn;
          const result = await acceptOffer();
          analytics.capture('weather_alert_offer_resolved', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            outcome: 'accepted',
            kind: offer.ruleId,
          });
          if (result.outcome === 'blocked') {
            analytics.capture('notification_permission_resolved', {
              schema_version: ANALYTICS_SCHEMA_VERSION,
              outcome: 'blocked',
              can_request_again: result.canRequestAgain,
            });
            return result;
          }
          if (result.outcome !== 'enabled') return result;
          analytics.capture('notification_permission_resolved', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            outcome: 'enabled',
          });
          // The offer only exists while weather alerts are off, so that preference really
          // changed; the briefing may already have been on from Settings.
          analytics.capture('setting_changed', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            setting_name: 'notifications_enabled',
            new_value: true,
          });
          if (!briefingWasOn) {
            analytics.capture('setting_changed', {
              schema_version: ANALYTICS_SCHEMA_VERSION,
              setting_name: 'morning_briefing_enabled',
              new_value: true,
            });
          }
          if (await firstUses.markFirstUse('notifications')) {
            analytics.capture('feature_used_first_time', {
              schema_version: ANALYTICS_SCHEMA_VERSION,
              feature_name: 'notifications',
            });
          }
          // ADR 0004: an accepted offer ends on the Notifications surface, where both kinds
          // are now on and either can be turned off in one tap. A refused permission stays
          // on Today, where the row explains itself.
          router.push('/settings/notifications');
          return result;
        },
        onDismiss: async () => {
          await dismissOffer();
          analytics.capture('weather_alert_offer_resolved', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            outcome: 'dismissed',
            kind: offer.ruleId,
          });
        },
        onOpenSystemSettings: () => void openApplicationSettings(),
      } : null}
      language={language}
      displayName={profileState.status === 'ready' ? profileState.profile.displayName : null}
      isRefreshing={isPullRefreshing}
      onOpenOutfitDetail={(id) => router.push({ pathname: '/[id]', params: { id } })}
      onRefresh={handleRefresh}
      onAskAgain={() => { setAskError(false); setAskOpenedAt(Date.now()); }}
      updatingDayType={updatingDayType}
      firstDressingDay={firstDressingDay}
      state={state}
    />
    <DailyFormalitySheet visible={sheetTarget !== null} language={language}
      question={sheetTarget === 'evening'
        ? getMessages(language).today.dailyStyle.questionEvening
        : getMessages(language).today.dailyStyle.question}
      selected={sheetTarget === 'evening' ? null : resolvedDressStyle ?? profileDressStyle}
      firstDay={sheetTarget === 'morning' && firstDressingDay}
      error={sheetError} onChoose={handleChoice} onDismiss={dismissChoice}
      step={stylesStep ? 'styles' : 'dayType'}
      styles={stylesStep ? (
        <StyleAestheticsOptions copy={getMessages(language).preferences}
          onChange={(draft) => setStylesStep({ ...stylesStep, draft })}
          selected={stylesStep.draft} testID="daily-formality-styles" />
      ) : null}
      onConfirmStyles={confirmStyles}
      confirmLabel={getMessages(language).preferences.stylePreferencesDone} />
    {placeTimeZone ? (
      <AskAgainSheet
        busy={askBusy}
        departure={activeDeparture?.departureAt ?? null}
        error={askError}
        evening={currentDressingDayKey?.endsWith(':evening') ?? false}
        hour12={hour12}
        language={language}
        now={askOpenedAt ?? clock}
        onConfirm={(choice) => { void confirmAskAgain(choice); }}
        onDismiss={() => { if (!askBusy) setAskOpenedAt(null); }}
        selected={resolvedDressStyle ?? profileDressStyle}
        timeZone={placeTimeZone}
        visible={askOpenedAt !== null}
      />
    ) : null}
    <NameSheet
      initialName={null}
      mode="prompt"
      onDismiss={() => {
        setNamePromptDismissed(true);
        return updateDisplayName(
          profileState.status === 'ready' ? profileState.profile.displayName : null,
        );
      }}
      onSave={updateDisplayName}
      visible={showNamePrompt}
    />
    </>
  );
}
