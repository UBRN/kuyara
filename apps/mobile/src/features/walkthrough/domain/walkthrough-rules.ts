import { walkthroughVersion } from '@/features/profile/domain/profile';
import type { TourScreen, TourStep } from '@/features/walkthrough/domain/walkthrough-steps';

/**
 * ADR 0036's gate: the tour is offered while the stored value is below the tour's code
 * version. Skip, Done or any other close of the offered tour stores that version.
 */
export function isWalkthroughDue(storedVersion: number | undefined): boolean {
  return (storedVersion ?? 0) < walkthroughVersion;
}

export type TourRoute = TourScreen | 'other';

// Single-segment routes that are not an outfit detail (`(today)/[id]` resolves to `/<id>`).
const namedSingleSegments = new Set([
  'weather', 'profile', 'history', 'settings', 'wardrobe', 'onboarding', 'analytics-consent',
]);

/** The tour's view of where the person is, from the router's pathname. */
export function classifyTourRoute(pathname: string): TourRoute {
  if (pathname === '/') return 'today';
  if (pathname === '/profile') return 'profile';
  const single = /^\/([^/]+)$/.exec(pathname);
  return single && !namedSingleSegments.has(single[1]) ? 'detail' : 'other';
}

/**
 * A screen the Profile tab hosts below its root. The tab keeps its own stack, so a tap on it
 * can restore one of these instead of `/profile`.
 */
export function isProfileHostedPath(pathname: string): boolean {
  return /^\/(settings|wardrobe)(\/|$)/.test(pathname) || pathname === '/history';
}

/**
 * What claims a launch before the tour can (README "When it opens"): another overlay (the
 * morning or evening day-type sheet, the name prompt, the analytics consent sheet), or a
 * launch with a purpose of its own (a tapped notification, a deep link).
 */
export type LaunchClaim =
  | 'day-question'
  | 'name-prompt'
  | 'analytics-consent'
  | 'notification'
  | 'deep-link';

/** A deep link starts the router somewhere other than Today (or onboarding, for a new user). */
export function isDeepLinkLaunch(firstPathname: string): boolean {
  return firstPathname !== '/' && firstPathname !== '/onboarding';
}

export type WalkthroughOpeningInput = Readonly<{
  running: boolean;
  /** The stored gate is below the code version. */
  due: boolean;
  /** The offered tour already opened in this launch; an interrupted one waits for the next. */
  autoOpenedThisLaunch: boolean;
  /** Onboarding was completed in this launch: the person is new. */
  newUserSession: boolean;
  claims: ReadonlySet<LaunchClaim>;
  /** Settings, Help asked for the tour and it has not opened yet. */
  manualPending: boolean;
  onToday: boolean;
  /** Today shows a settled outfit: no runway, no refresh, no regeneration, no pending question. */
  todaySettled: boolean;
  /** A sheet or prompt is on screen over Today. */
  overlayOpen: boolean;
}>;

/**
 * Whether the tour opens now, and as which kind. Only on Today over a settled outfit with
 * nothing else on screen. The Help row's tour ignores the gate and the launch claims. The
 * offered tour opens once per launch at most: a new user's in the session that finished
 * onboarding, once the first outfit has arrived; an existing user's on a quiet launch, one
 * nothing else has claimed. The new user's first day-type question is part of setup (it
 * gates the first outfit), so it alone does not claim that session.
 */
export function walkthroughOpening(input: WalkthroughOpeningInput): 'auto' | 'manual' | null {
  if (input.running || !input.onToday || !input.todaySettled || input.overlayOpen) return null;
  if (input.manualPending) return 'manual';
  if (!input.due || input.autoOpenedThisLaunch) return null;
  const blocking = [...input.claims].filter(
    (claim) => !(input.newUserSession && claim === 'day-question'),
  );
  return blocking.length === 0 ? 'auto' : null;
}

export type TourOutcome = 'advance' | 'stay' | 'interrupt';

const routeAfter: Readonly<Partial<Record<NonNullable<TourStep['advanceOn']>, TourScreen>>> = {
  push: 'detail',
  pop: 'today',
  tab: 'profile',
};

/**
 * A route change during a step. The live control's own navigation advances the tour; any
 * other change (a deep link or a notification opened mid-tour) interrupts it, and an
 * interrupted tour stores nothing, so it starts over at the next quiet launch.
 */
export function routeOutcome(step: TourStep, route: TourRoute): TourOutcome {
  if (route === step.screen) return 'stay';
  const expected = step.advanceOn ? routeAfter[step.advanceOn] : undefined;
  return route === expected ? 'advance' : 'interrupt';
}

/** The piece sheet opening or closing; only the step that waits for it advances. */
export function sheetOutcome(step: TourStep, open: boolean): TourOutcome {
  return (open && step.advanceOn === 'sheet-open') || (!open && step.advanceOn === 'sheet-close')
    ? 'advance'
    : 'stay';
}
