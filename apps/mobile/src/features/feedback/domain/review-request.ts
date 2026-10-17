export type ReviewRequestMoment = Readonly<{
  /** The system rating prompt is asked for on iOS only. */
  ios: boolean;
  onboardingCompleted: boolean;
  /** Which open of the process this is: the cold launch, then each return that plays the launch. */
  open: number;
  /** The open the rating was last asked for in, in this process. */
  requestedOpen: number | null;
  /** Something is presented over the screen, or is about to be: a curtain, sheet, prompt, tour or modal. */
  presentationHeld: boolean;
  active: boolean;
}>;

/**
 * Whether the system rating prompt is asked for now: once in every open after onboarding,
 * as soon as nothing is presented over the screen and the app is active. iOS decides whether
 * it shows anything; no question of the app's own comes before it (App Store Review
 * Guideline 5.6.1).
 */
export function reviewRequestDue(moment: ReviewRequestMoment): boolean {
  return moment.ios
    && moment.onboardingCompleted
    && moment.open !== moment.requestedOpen
    && !moment.presentationHeld
    && moment.active;
}
