import { requestStoreReview } from '@/features/feedback/data/store-review';

/** The one place the rating request reaches the system prompt's adapter. */
export function loadStoreReviewRequest(): () => Promise<void> {
  return requestStoreReview;
}
