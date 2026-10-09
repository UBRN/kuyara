import { useEffect, useRef } from 'react';

import { loadStoreReviewRequest } from '@/features/feedback/application/store-review-loader';
import { reviewRequestDue } from '@/features/feedback/domain/review-request';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { useWalkthrough } from '@/features/walkthrough/application/walkthrough-context';
import { systemDate } from '@/infrastructure/system-clock';

// Launch-long facts, kept outside React so they outlive Today's remounts: an outfit detail was
// opened since Today was last focused, something else was put in front of the reader in this
// launch, and the request was already made.
let detailVisited = false;
let interrupted = false;
let requested = false;

const returnDelayMs = 1000;
const requestStoreReview = loadStoreReviewRequest();

/** Outfit detail calls this on focus; the next return to Today may request the rating. */
export function noteOutfitDetailVisit(): void {
  detailVisited = true;
}

/** Test seam: a fresh launch. */
export function resetReviewRequestLaunch(): void {
  detailVisited = false;
  interrupted = false;
  requested = false;
}

/**
 * Requests the system rating prompt about a second after the reader comes back to Today from an
 * outfit detail, at most once per launch and once per prompt version, and never in a launch in
 * which another sheet, prompt, offer or the tour was shown. `focused` is Today's focus;
 * `overlayOpen` says a sheet, prompt or offer of Today's is open now.
 */
export function useReviewRequestOnReturn(focused: boolean, overlayOpen: boolean): void {
  const { state, markReviewRequested } = useProfileApplication();
  const tourActive = useWalkthrough()?.active ?? false;
  const profile = state.status === 'ready' ? state.profile : null;
  useEffect(() => {
    if (overlayOpen || tourActive) interrupted = true;
  }, [overlayOpen, tourActive]);

  const latest = useRef({ focused, profile, markReviewRequested });
  useEffect(() => {
    latest.current = { focused, profile, markReviewRequested };
  });

  useEffect(() => {
    if (!focused || !detailVisited) return undefined;
    detailVisited = false;
    const timer = setTimeout(() => {
      const current = latest.current;
      if (requested || interrupted || !current.focused || !current.profile || !current.markReviewRequested) return;
      if (!reviewRequestDue(current.profile, systemDate().getTime())) return;
      requested = true;
      // The gate is stored first, so a request that fails or crashes is never repeated.
      current.markReviewRequested().then(requestStoreReview, () => {
        // An unstored gate leaves the request for a later launch.
      });
    }, returnDelayMs);
    return () => clearTimeout(timer);
  }, [focused]);
}
