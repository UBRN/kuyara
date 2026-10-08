import type { AnalyticsConsentSurface } from '@/features/analytics/domain/product-analytics';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import { usePerformanceTelemetry } from '@/features/analytics/application/use-performance-telemetry';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { telemetryDispatchingEnabled } from '@/features/analytics/domain/performance-telemetry';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import type { AnalyticsConsent } from '@/features/profile/domain/profile';

export type AnalyticsConsentControls = Readonly<{
  consent: AnalyticsConsent;
  getIdentifier: () => string | null;
  // The identifier kept on this device after sharing was turned off, for a deletion request.
  getWithdrawnIdentifier: () => string | null;
  removeWithdrawnIdentifier: () => void;
  grant: (surface: AnalyticsConsentSurface) => Promise<void>;
  withdraw: () => Promise<void>;
  decline: () => Promise<void>;
}>;

/**
 * Whether sharing is on right now: false while the question is unanswered, after a decline or
 * a withdrawal, and while the profile is still loading. A surface that exists only to be
 * shared reads this, so it is never shown when nothing it records could leave the device.
 */
export function useAnalyticsConsentGranted(): boolean {
  const { state } = useProfileApplication();
  return state.status === 'ready' && state.profile.analyticsConsent === 'granted';
}

export function useAnalyticsConsent(): AnalyticsConsentControls {
  const { analytics, errorEpisodes, firstUses, retries, withdrawnIdentifiers } = useProductAnalytics();
  const telemetry = usePerformanceTelemetry();
  const { state, updateAnalyticsConsent } = useProfileApplication();

  if (state.status !== 'ready') {
    throw new Error('useAnalyticsConsent requires a ready local profile');
  }

  const cleanWithdrawn = async (): Promise<void> => {
    let failure: unknown;
    try { analytics.markCleanupPending(); } catch (error) { failure = error; }
    try { await analytics.withdraw(); } catch (error) { failure ??= error; }
    if (!failure) {
      try { analytics.clearCleanupPending(); } catch (error) { failure = error; }
    }
    // This tracker is device-only. A failed local clear cannot resume sharing;
    // every later re-grant clears it before the saved answer changes.
    try { await firstUses.clear(); } catch { /* Retry before any re-grant. */ }
    errorEpisodes.reset();
    retries.reset();
    if (failure) throw failure;
  };

  const withdrawGranted = async (): Promise<void> => {
    if (!analytics.isWithdrawalInProgress()) {
      // The identity is about to be severed. Keep its identifier on the device so a deletion
      // request can still name it; failing to keep it never blocks the withdrawal.
      try {
        withdrawnIdentifiers.clear();
        const identifier = analytics.getIdentifier();
        if (identifier) withdrawnIdentifiers.keep(identifier);
      } catch { /* The copy is a convenience; withdrawal continues. */ }

      // Native dispatch must stop before the final event. A failed disable leaves
      // the grant active and emits nothing, so the whole sequence can be retried.
      await telemetry.setDispatching(false);

      // Taxonomy 5.14 places this last event on the old identity before opt-out.
      // A failed send cannot prevent withdrawal; cleanup will discard its queue.
      try {
        analytics.capture('analytics_consent_withdrawn', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
        });
      } catch { /* Continue to disable sharing. */ }
      try { await analytics.flush(); } catch { /* Continue to disable sharing. */ }
    }

    // If this write fails, the provider's in-memory gate remains closed. A retry
    // only repeats the write and cleanup, never the final event.
    await updateAnalyticsConsent('withdrawn');
    await cleanWithdrawn();
  };

  return {
    consent: state.profile.analyticsConsent,
    getIdentifier: () => analytics.getIdentifier(),
    getWithdrawnIdentifier: () => withdrawnIdentifiers.read(),
    removeWithdrawnIdentifier: () => withdrawnIdentifiers.clear(),
    grant: async (surface) => {
      if (state.profile.analyticsConsent === 'granted' && analytics.isWithdrawalInProgress()) {
        throw new Error('Complete the pending analytics withdrawal before granting again');
      }
      if (state.profile.analyticsConsent === 'granted' && analytics.isApplied()) {
        if (telemetry.isApplied()) return;
        await telemetry.setDispatching(telemetryDispatchingEnabled('granted'));
        return;
      }
      if (state.profile.analyticsConsent !== 'undecided') {
        // A previous withdrawal may have failed, even in an earlier app process. The
        // provider must be cleaned while opted out before the answer can change.
        await analytics.prepareGrant();
      }
      // Neither an unanswered nor a withdrawn period belongs to the new identity.
      // Clear pending failures and retries, including first-use markers from older builds.
      errorEpisodes.reset();
      retries.reset();
      await firstUses.clear();
      // A new identifier starts, so the earlier one is no longer the one to quote.
      withdrawnIdentifiers.clear();
      // Observe recorded the unanswered period without sending it. The discard moves its stored
      // rows past the send cursor, and it runs before the answer is stored: if the app is killed
      // right after the write, the next launch reads `granted` and enables delivery.
      // Limit: the native dispatch checks an in-memory retry wait before it moves the cursor, so
      // after a failed send, a withdrawal and a re-grant in this same process while Observe
      // waits to retry, this does nothing and those rows are sent when the wait ends.
      await telemetry.discardPending();
      await updateAnalyticsConsent('granted');
      try {
        await analytics.optIn(surface);
        await telemetry.setDispatching(telemetryDispatchingEnabled('granted'));
      } catch (error) {
        // A partly applied grant follows the same safe withdrawal order.
        try {
          await withdrawGranted();
        } catch { /* The Privacy status keeps this failed change visible. */ }
        throw error;
      }
    },
    withdraw: async () => {
      await withdrawGranted();
    },
    decline: async () => {
      await telemetry.setDispatching(false);
      await updateAnalyticsConsent('withdrawn');
      await analytics.decline();
      await cleanWithdrawn();
    },
  };
}
