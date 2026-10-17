import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useLaunchOpen } from '@/components/ui/launch-curtain';
import { usePresentationHeld } from '@/components/ui/presentation-hold';
import { loadStoreReviewRequest } from '@/features/feedback/application/store-review-loader';
import { reviewRequestDue } from '@/features/feedback/domain/review-request';
import { useProfileApplication } from '@/features/profile/application/profile-context';

/**
 * How long the screen stays clear before the request: a sheet that opens as a curtain goes,
 * or one that is still closing, is on screen by then.
 */
export const REVIEW_REQUEST_SETTLE_MS = 1000;

// The open the rating was asked for in, kept outside React so it is one fact for the process.
let requestedOpen: number | null = null;

const requestStoreReview = loadStoreReviewRequest();

/** Test seam: a fresh process. */
export function resetReviewRequestProcess(): void {
  requestedOpen = null;
}

/**
 * Asks iOS for its rating prompt once in every open of the app after onboarding: the cold
 * launch and each return that plays the launch, once its curtain has gone and nothing else is
 * presented over the screen. It reports nothing to analytics.
 */
export function ReviewRequestObserver() {
  const { state } = useProfileApplication();
  const onboardingCompleted = state.status === 'ready' && state.profile.onboardingCompleted;
  const open = useLaunchOpen();
  const presentationHeld = usePresentationHeld();
  // A request made while the app is not active has no window to show in: a system alert or a
  // passing overlay waits for the app to be active again.
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => setActive(next === 'active'));
    return () => subscription.remove();
  }, []);

  const due = reviewRequestDue({
    ios: Platform.OS === 'ios', onboardingCompleted, open, requestedOpen, presentationHeld, active,
  });
  useEffect(() => {
    if (!due) return undefined;
    const timer = setTimeout(() => {
      requestedOpen = open;
      void requestStoreReview();
    }, REVIEW_REQUEST_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [due, open]);
  return null;
}
