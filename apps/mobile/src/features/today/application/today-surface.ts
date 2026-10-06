import type { DressStyle, StyleAesthetic } from '@kuyara/contracts';

import type { ProfileApplicationState } from '@/features/profile/application/profile-application-controller';
import { namePromptVersion, sameStyleAesthetics } from '@/features/profile/domain/profile';
import {
  localDayKey,
  type RecommendationApplicationState,
} from '@/features/recommendation/application/recommendation-application-controller';
import type { DressingDayDeparture } from '@/features/recommendation/domain/dressing-day-departure';
import { mayOfferDayQuestion } from '@/features/today/application/today-state';
import { morningBriefingLocalHour } from '@/features/notifications/domain/morning-briefing';
import type { WeatherAlertOfferReason } from '@/features/notifications/domain/weather-alert-offer';
import type { AppMessages } from '@/localization/messages';
import type { NotificationOptInOutcome } from '@/features/notifications/application/notification-application-controller';
import type { TodayScreenState } from '@/features/today/model';
import { dressingDayDateKey } from '@/features/weather/domain/wardrobe-day';
import type { WeatherApplicationState } from '@/features/weather/application/weather-application-controller';
import type { RecommendationSnapshot } from '@/features/recommendation/application/recommendation-repository';

export { manualRefreshOutcome } from '@/features/weather/domain/manual-refresh-outcome';

type Profile = Extract<ProfileApplicationState, { status: 'ready' }>['profile'];

/** The name prompt opens once per prompt version, after onboarding, until it is dismissed. */
export function namePromptDue(profile: ProfileApplicationState, dismissed: boolean): boolean {
  return profile.status === 'ready'
    && profile.profile.onboardingCompleted
    && !dismissed
    && profile.profile.namePromptVersion < namePromptVersion;
}

/**
 * M16 and N20: the first foreground open of a bare-date day asks the morning question, and
 * the first one after 18:00 asks the evening question.
 */
export function pendingDayQuestion(
  morningChoicePending: boolean | undefined,
  eveningChoicePending: boolean | undefined,
): 'morning' | 'evening' | null {
  return morningChoicePending ? 'morning' : eveningChoicePending ? 'evening' : null;
}

/**
 * Whether the pending day question opens now. Nothing opens over the launch curtain, the
 * name prompt or the Phase 8 tour (one overlay at a time), and a dressing day asks once.
 */
export function mayOpenDayQuestion(input: Readonly<{
  focused: boolean;
  launchDone: boolean;
  pending: 'morning' | 'evening' | null;
  namePromptShown: boolean;
  tourActive: boolean;
  dressingDayKey: string | null;
  offeredDayKey: string | null;
  weather: WeatherApplicationState;
  state: TodayScreenState;
}>): boolean {
  return input.focused && input.launchDone && input.pending !== null && !input.namePromptShown &&
    !input.tourActive && input.dressingDayKey !== null && input.dressingDayKey !== '' &&
    mayOfferDayQuestion(input.weather, input.state) && input.offeredDayKey !== input.dressingDayKey;
}

/**
 * f25: the first dressing day is the one the profile was set up on. Its greeting is a welcome.
 */
export function isFirstDressingDay(profile: Profile | null, dressingDayKey: string | null): boolean {
  return Boolean(profile?.onboardingCompleted && dressingDayKey &&
    dressingDayDateKey(localDayKey(new Date(profile.createdAt))) === dressingDayDateKey(dressingDayKey));
}

/** f7: the outfit on screen was made for another day type, and its replacement is running. */
export function updatingDayType(
  recommendation: RecommendationApplicationState,
  resolvedDressStyle: DressStyle | null | undefined,
): DressStyle | null {
  const snapshotDressStyle = recommendation.status === 'ready'
    ? recommendation.snapshot?.dressStyle ?? null : null;
  return recommendation.status === 'ready' && recommendation.isRefreshing &&
    resolvedDressStyle && snapshotDressStyle !== null && snapshotDressStyle !== resolvedDressStyle
    ? resolvedDressStyle : null;
}

/** Step 2 of the day question writes the styles only when the reader changed the set. */
export function styleAestheticsChanged(
  initial: readonly StyleAesthetic[],
  draft: readonly StyleAesthetic[],
): boolean {
  return !sameStyleAesthetics(draft, initial);
}

/** The evening's "ready later" line stands only under the settled outfit made for that departure. */
export function showsLaterReadyLine(
  state: TodayScreenState,
  departure: DressingDayDeparture | null | undefined,
): boolean {
  return state.kind === 'loaded' && !state.isRefreshing &&
    state.snapshot.recommendation.status === 'recommended' &&
    state.snapshot.coverageStart === departure?.departureAt;
}

/** Taxonomy 5.5's `cache_state` of a shown recommendation. */
export function recommendationCacheState(
  state: Extract<TodayScreenState, { kind: 'loaded' }>,
): 'refreshing' | 'stale_shown' | 'fresh' {
  return state.isRefreshing
    ? 'refreshing'
    : state.snapshot.freshness === 'stale'
      ? 'stale_shown'
      : 'fresh';
}

/**
 * Phase 8: Today's outfit has settled when a recommendation stands still on the focused
 * screen and nothing else is about to replace or cover it.
 */
export function todayOutfitSettled(input: Readonly<{
  focused: boolean;
  state: TodayScreenState;
  runwayVisible: boolean;
  pullRefreshing: boolean;
  dayQuestionPending: boolean | undefined;
  dressingDayChoiceReady: boolean | undefined;
  updatingDayType: DressStyle | null;
  choosingWindow: unknown;
}>): boolean {
  return input.focused && input.state.kind === 'loaded' &&
    input.state.snapshot.recommendation.status === 'recommended' && !input.state.isRefreshing &&
    !input.runwayVisible && !input.pullRefreshing && !input.dayQuestionPending &&
    input.dressingDayChoiceReady !== false && input.updatingDayType === null &&
    input.choosingWindow === null;
}

/** A retry from a failure succeeded only when both the weather and a recommendation stand. */
export function todayRetrySucceeded(
  after: WeatherApplicationState,
  recommendation: RecommendationApplicationState,
): boolean {
  return after.status === 'ready' && after.refreshFailure === null &&
    after.snapshot !== null && after.activeLocation !== null && after.freshness !== null &&
    recommendation.status === 'ready' && recommendation.lastFailure === null &&
    recommendation.snapshot?.recommendation.status === 'recommended';
}

/** Today reads an unavailable state without an active place as the "choose a place" state. */
export function todayPresentationState(state: TodayScreenState, weather: WeatherApplicationState): TodayScreenState {
  return state.kind === 'unavailable' && weather.status === 'ready' && weather.activeLocation === null
    ? { ...state, reason: 'no-active-location' }
    : state;
}

/** The first outfit of a recommendation made for the current local day, or none. */
export function settledFirstOutfit(snapshot: RecommendationSnapshot | null | undefined, now: number) {
  return snapshot?.localDayKey === localDayKey(new Date(now)) && snapshot.recommendation.status === 'recommended'
    ? snapshot.recommendation.outfits[0] ?? null
    : null;
}

/** Generation counts as running while Today is loading, except while a day question waits: that wait is on the person. */
export function isGenerationRunning(presentationKind: string, awaitingDayQuestion: boolean | undefined): boolean {
  return presentationKind === 'loading' && !awaitingDayQuestion;
}

/**
 * Which alert offer Today draws: a refused one stays to explain itself, an answered one is
 * gone at once, and otherwise the offer the route handed down.
 */
export function alertOfferToRender<Offer>(
  blockedOffer: Offer | null,
  answered: boolean,
  offered: Offer | null,
): Offer | null {
  return blockedOffer ?? (answered ? null : offered);
}

/** Accepting spends the once-only offer whatever the OS answers; a refusal keeps it to explain itself. */
export function alertOfferAfterAccept(outcome: NotificationOptInOutcome): 'blocked' | 'answered' {
  return outcome.outcome === 'blocked' ? 'blocked' : 'answered';
}

/** Today is updating while a day-type change regenerates the outfit or a window choice is being made. */
export function isUpdatingOutfit(
  dayType: DressStyle | null,
  choosingCaption: string | null,
): boolean {
  return dayType !== null || choosingCaption !== null;
}

/**
 * The evening's tomorrow strip: its preview and the way to open it, only while the preview is
 * ready and the screen can open its detail.
 */
export function tomorrowStrip<Tomorrow, Open>(
  tomorrow: Tomorrow | null,
  onOpenDetail: Open | undefined,
): Readonly<{ tomorrow: Tomorrow; onOpenDetail: Open }> | null {
  return tomorrow !== null && onOpenDetail !== undefined ? { tomorrow, onOpenDetail } : null;
}

/** The "Ask the stylist again" capsule shows with an outfit on screen, unless the alternatives are used up. */
export function showsAskAgain(primary: unknown, exhausted: boolean | undefined): boolean {
  return Boolean(primary) && !exhausted;
}

/**
 * The sentence the alert offer row shows: the refused permission's own hint after a refusal,
 * otherwise the rule's sentence, with the morning briefing's carrying its local hour.
 */
export function alertOfferMessage(
  copy: Pick<AppMessages['notifications'], 'offer' | 'permissionDeniedHint'>,
  blocked: boolean,
  ruleId: WeatherAlertOfferReason,
  formatTime: (time: Readonly<{ hour: number; minute: number }>) => string,
): string {
  return blocked
    ? copy.permissionDeniedHint
    : ruleId === 'morning_briefing'
      ? copy.offer.morningBriefingSentence(formatTime({ hour: morningBriefingLocalHour, minute: 0 }))
      : copy.offer.sentences[ruleId];
}
