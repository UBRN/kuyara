/**
 * Phase 8's coach-mark tour: nine steps over the person's real screens (the design
 * prototype, `walkthrough/coach-tour/README.md`). Each step lights one area of a real screen;
 * a `tap` or `back` step also leaves one real control live, and the tour advances when it
 * observes that control's own navigation land. A `look` step leaves nothing live and carries
 * Continue, or Done on the last step. The tour never presses anything and never writes
 * anything but its gate.
 */

/** The controls a screen registers for the tour, named by the prototype. */
export type TourTargetId =
  | 'outfit'
  | 'badge'
  | 'piece'
  | 'sheet-area'
  | 'sheet-close'
  | 'worn'
  | 'nav-back'
  | 'again'
  | 'tab-profile'
  | 'closet-head'
  | 'rack'
  | 'history';

export type TourStepKey =
  | 'outfit'
  | 'piece'
  | 'sheet'
  | 'worn'
  | 'back'
  | 'again'
  | 'profileTab'
  | 'closet'
  | 'history';

/** The screen a step belongs to; the piece sheet sits on the detail route. */
export type TourScreen = 'today' | 'detail' | 'profile';

/** The navigation a live control makes, which the tour observes and never performs. */
export type TourAdvance = 'push' | 'sheet-open' | 'sheet-close' | 'pop' | 'tab';

/** `pill` rounds the area to half its height. */
export type TourRadius = number | 'pill';

export type TourStep = Readonly<{
  key: TourStepKey;
  screen: TourScreen;
  kind: 'tap' | 'back' | 'look';
  /** The areas the spotlight opens around, as one union. */
  lit: readonly TourTargetId[];
  /** The one live control (tap and back steps); saving controls are never live. */
  live?: TourTargetId;
  advanceOn?: TourAdvance;
  /**
   * `always`: the screen scrolls for this step whatever is in view (the prototype's
   * "scrolled to the end"). `if-hidden`: only when the lit area is not in view.
   */
  reveal?: 'always' | 'if-hidden';
  litRadius: TourRadius;
  ringRadius?: TourRadius;
  /** Shown only when its first lit control is on screen (the copy names that control). */
  optional?: true;
  /**
   * The step sits on a presented sheet, which dims the app itself and lays its content out in
   * its own space. The sheet draws the ring and blocks its own controls; the window layer keeps
   * the bubble and Skip above it.
   */
  inSheet?: true;
}>;

export const tourSteps: readonly TourStep[] = Object.freeze([
  { key: 'outfit', screen: 'today', kind: 'tap', lit: ['badge', 'outfit'], live: 'outfit',
    advanceOn: 'push', reveal: 'if-hidden', litRadius: 26, ringRadius: 26 },
  // Main-session decision: the piece sheet opens from the piece's row once Phase 7 lands, so
  // the lit and live target is the first piece's row control, not the board drawing.
  { key: 'piece', screen: 'detail', kind: 'tap', lit: ['piece'], live: 'piece',
    advanceOn: 'sheet-open', reveal: 'if-hidden', litRadius: 16, ringRadius: 14 },
  // The whole sheet is lit: its head, the ownership choice and Done are what the bubble names.
  { key: 'sheet', screen: 'detail', kind: 'back', lit: ['sheet-area'], live: 'sheet-close',
    advanceOn: 'sheet-close', litRadius: 0, ringRadius: 22, inSheet: true },
  { key: 'worn', screen: 'detail', kind: 'look', lit: ['worn'], litRadius: 'pill' },
  { key: 'back', screen: 'detail', kind: 'back', lit: ['nav-back'], live: 'nav-back',
    advanceOn: 'pop', litRadius: 'pill', ringRadius: 'pill' },
  // Main-session decision: exhausted recommendations draw no "Ask the stylist again", so the
  // step is left out and the counter counts the steps actually shown.
  { key: 'again', screen: 'today', kind: 'look', lit: ['again'], reveal: 'always',
    litRadius: 'pill', optional: true },
  { key: 'profileTab', screen: 'today', kind: 'tap', lit: ['tab-profile'], live: 'tab-profile',
    advanceOn: 'tab', litRadius: 27, ringRadius: 27 },
  { key: 'closet', screen: 'profile', kind: 'look', lit: ['closet-head', 'rack'], litRadius: 20 },
  { key: 'history', screen: 'profile', kind: 'look', lit: ['history'], reveal: 'always',
    litRadius: 14 },
] as const satisfies readonly TourStep[]);

export const tourStepCount = tourSteps.length;

/** The steps one run shows, as indexes into `tourSteps`, fixed when the tour opens. */
export type TourPlan = readonly number[];

export const fullTourPlan: TourPlan = tourSteps.map((_, index) => index);

export function planTour(isOnScreen: (id: TourTargetId) => boolean): TourPlan {
  return fullTourPlan.filter((index) => !tourSteps[index].optional || isOnScreen(tourSteps[index].lit[0]));
}
