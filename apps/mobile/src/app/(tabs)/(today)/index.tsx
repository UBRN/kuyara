import { useState } from 'react';

import { useLaunchReveal, useLaunchScreenReady } from '@/components/ui/launch-curtain';
import { usePresentationHold } from '@/components/ui/presentation-hold';
import { useSingleTap } from '@/components/ui/use-single-push';
import { useFocusedErrorEpisode } from '@/features/analytics/application/use-focused-error-episode';
import { useScreenInteractive } from '@/features/analytics/application/use-screen-interactive';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { NameSheet } from '@/features/profile/presentation/name-sheet';
import { StyleAestheticsOptions } from '@/features/profile/presentation/style-aesthetics-options';
import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import { pieceColorsParam, type PaintedColors } from '@/features/today/application/piece-colors';
import { classifyTodayState } from '@/features/today/application/today-state';
import {
  isFirstDressingDay,
  pendingDayQuestion,
  showsLaterReadyLine,
  updatingDayType as dayTypeUpdating,
} from '@/features/today/application/today-surface';
import { useAskAgainSheet } from '@/features/today/application/use-ask-again-sheet';
import { useDayQuestionSheet } from '@/features/today/application/use-day-question-sheet';
import { useNamePrompt } from '@/features/today/application/use-name-prompt';
import { useTodayAlertOffer } from '@/features/today/application/use-today-alert-offer';
import { useTodayFocus } from '@/features/today/application/use-today-focus';
import { useTodayPullRefresh } from '@/features/today/application/use-today-pull-refresh';
import { useTodayReports } from '@/features/today/application/use-today-reports';
import { TodayScreen } from '@/features/today/presentation/today-screen';
import { eveningLaterReadyLine } from '@/features/today/presentation/today-presentation';
import { AskAgainSheet } from '@/features/today/presentation/ask-again-sheet';
import { DailyFormalitySheet } from '@/features/today/presentation/daily-formality-sheet';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { activeLocationSnapshot } from '@/features/weather/domain/weather';
import { isEveningDressingDayKey } from '@/features/weather/domain/wardrobe-day';
import { useForegroundClock } from '@/hooks/use-foreground-clock';
import { useLocalization } from '@/localization/use-messages';
import { getMessages } from '@/localization/messages';

// Opened from Today's band, the detail's pieces start from where the band drew them.
const outfitDetailHref = (id: string, fromBand?: boolean, colors?: PaintedColors) => ({
  pathname: '/[id]',
  params: { id, ...(fromBand ? { from: 'band' } : {}), ...(colors ? { colors: pieceColorsParam(colors) } : {}) },
}) as const;

export default function TodayRoute() {
  const { language, hour12 } = useLocalization();
  const clock = useForegroundClock();
  const tap = useSingleTap();
  const push = tap.push;
  const {
    state: recommendationState,
    dressingDayKey,
    dressingDayChoiceFailed,
    morningChoicePending,
    eveningChoicePending,
    resolvedDressStyle,
    activeDeparture,
  } = useRecommendationApplication();
  const { state: weatherState } = useWeatherApplication();
  const { state: profileState } = useProfileApplication();
  const namePrompt = useNamePrompt();
  const { alertOffer, alertOfferFinished } = useTodayAlertOffer(() => push('/settings/notifications'));
  const pullRefresh = useTodayPullRefresh();
  const [runwayVisible, setRunwayVisible] = useState(false);
  // Nothing opens over the launch curtain: the name prompt and the day question wait for it.
  const launch = useLaunchReveal();
  useScreenViewed('today');

  const placeSnapshot = weatherState.status === 'ready'
    ? activeLocationSnapshot(weatherState.snapshot, weatherState.activeLocation) : null;
  const placeTimeZone = placeSnapshot?.timeZone ?? null;
  const askAgain = useAskAgainSheet(placeTimeZone);
  const { state, todayFailure, recommendationFailure, launchReady } = classifyTodayState({
    weather: weatherState,
    recommendation: recommendationState,
    profile: profileState,
    dressingDayChoiceFailed,
    surface: 'today',
    isPullRefreshing: pullRefresh.refreshing,
    choosingWindow: askAgain.choosingWindow,
  });

  // Today is the first screen the shell mounts after bootstrap, and the app is usable once it
  // has drawn what it has to show. The kind is coarse: loaded or unavailable. A cold launch
  // waits only until Today has drawn what the device holds, so neither a day question nor a
  // generation keeps it waiting.
  useScreenInteractive(state.kind !== 'loading' ? { state: state.kind } : null);
  useLaunchScreenReady(launchReady);

  // Only the focused Today route can show these failures. A weather failure belongs to
  // the composite Today surface; a recommendation failure belongs to its distinct surface.
  useFocusedErrorEpisode('today', todayFailure);
  useFocusedErrorEpisode('recommendation', recommendationFailure);

  const focused = useTodayFocus();
  // `state` is handed to the hooks on its own: inside an object literal handed to a hook, React
  // Compiler would stop memoizing everything Today draws from it.
  const dayQuestion = useDayQuestionSheet(state, {
    focused,
    launchDone: launch.done,
    namePromptShown: namePrompt.due,
  });
  useTodayReports(state, {
    focused,
    runwayVisible,
    pullRefreshing: pullRefresh.refreshing,
    choosingWindow: askAgain.choosingWindow,
    namePromptShown: namePrompt.due,
    overlayOpen: dayQuestion.visible || askAgain.openedAt !== null || namePrompt.due,
    dayQuestionOpen: dayQuestion.visible,
  });
  // A pending day question is about to open over the focused Today, so it holds the screen
  // before its sheet does. The notification offer is a card in Today's page, not over it.
  usePresentationHold(focused && pendingDayQuestion(morningChoicePending, eveningChoicePending) !== null);

  const profile = profileState.status === 'ready' ? profileState.profile : null;
  const currentDressingDayKey = dressingDayKey ?? null;
  const copy = getMessages(language);
  const stylesStep = dayQuestion.stylesStep;
  return (
    <>
    <TodayScreen
      alertOffer={alertOffer}
      alertOfferFinished={alertOfferFinished}
      language={language}
      displayName={profile?.displayName ?? null}
      isRefreshing={pullRefresh.refreshing}
      onOpenOutfitDetail={(id, fromBand, colors) => push(outfitDetailHref(id, fromBand, colors))}
      outfitDetailLink={{ href: outfitDetailHref, onPress: tap.linkPress }}
      onOpenTomorrowDetail={(id) => push({ pathname: '/[id]', params: { id, day: 'tomorrow' } })}
      onRefresh={() => pullRefresh.refresh(state)}
      onRunwayVisibleChange={setRunwayVisible}
      onAskAgain={askAgain.open}
      laterReadyLine={showsLaterReadyLine(state, activeDeparture)
        ? eveningLaterReadyLine(activeDeparture ?? null, clock, language, hour12) : null}
      updatingDayType={dayTypeUpdating(recommendationState, resolvedDressStyle)}
      firstDressingDay={isFirstDressingDay(profile, currentDressingDayKey)}
      awaitingDayQuestion={morningChoicePending || eveningChoicePending}
      state={state}
    />
    <DailyFormalitySheet visible={dayQuestion.visible} language={language}
      period={dayQuestion.period} usual={dayQuestion.usual}
      error={dayQuestion.error} onChoose={dayQuestion.choose} onPickStyles={dayQuestion.pickStyles}
      onDismiss={dayQuestion.dismiss}
      step={stylesStep ? 'styles' : 'dayType'}
      styles={stylesStep ? (
        <StyleAestheticsOptions copy={copy.preferences}
          onChange={dayQuestion.draftStyles}
          selected={stylesStep.draft} testID="daily-formality-styles" />
      ) : null}
      stylesDayType={stylesStep?.dayType}
      onStylesDayType={dayQuestion.chooseStylesDayType}
      onConfirmStyles={dayQuestion.confirmStyles}
      confirmLabel={copy.preferences.stylePreferencesDone} />
    {placeTimeZone ? (
      <AskAgainSheet
        busy={askAgain.busy}
        departure={activeDeparture?.departureAt ?? null}
        error={askAgain.error}
        evening={currentDressingDayKey ? isEveningDressingDayKey(currentDressingDayKey) : false}
        hour12={hour12}
        language={language}
        now={askAgain.openedAt ?? clock}
        onConfirm={askAgain.confirm}
        onDismiss={askAgain.dismiss}
        selected={resolvedDressStyle}
        timeZone={placeTimeZone}
        visible={askAgain.openedAt !== null}
      />
    ) : null}
    <NameSheet
      initialName={null}
      mode="prompt"
      onDismiss={namePrompt.dismiss}
      onSave={namePrompt.save}
      visible={namePrompt.due && launch.done}
    />
    </>
  );
}
