// The default adapter until the PostHog integration lands. It satisfies the port and does
// nothing, so mounting the provider never captures, stores, or sends anything.
import type { ProductAnalytics } from '@/features/analytics/domain/product-analytics';

export const noopProductAnalytics: ProductAnalytics = {
  capture: () => undefined,
  optIn: () => Promise.resolve(),
  prepareGrant: () => Promise.resolve(),
  markCleanupPending: () => undefined,
  clearCleanupPending: () => undefined,
  isCleanupPending: () => false,
  decline: () => Promise.resolve(),
  withdraw: () => Promise.resolve(),
  isWithdrawalInProgress: () => false,
  flush: () => Promise.resolve(),
  getIdentifier: () => null,
  getSessionId: () => null,
  isApplied: () => true,
  whenReady: () => Promise.resolve(),
};
