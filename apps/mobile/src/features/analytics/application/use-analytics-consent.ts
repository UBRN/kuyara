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
  grant: (surface: AnalyticsConsentSurface) => Promise<void>;
  withdraw: () => Promise<void>;
  decline: () => Promise<void>;
}>;

export function useAnalyticsConsent(): AnalyticsConsentControls {
  const { analytics, errorEpisodes, firstUses, retries } = useProductAnalytics();
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
      // Native dispatch must stop before the final event. A failed disable leaves
      // the grant active and emits nothing, so the whole sequence can be retried.
      telemetry.setDispatching(false);

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
    grant: async (surface) => {
      if (state.profile.analyticsConsent === 'granted' && analytics.isWithdrawalInProgress()) {
        throw new Error('Complete the pending analytics withdrawal before granting again');
      }
      if (state.profile.analyticsConsent !== 'undecided') {
        // A previous withdrawal may have failed, even in an earlier app process. The
        // provider must be cleaned while opted out before the answer can change.
        await analytics.prepareGrant();
        // A withdrawn period has no analytics identity. Clear taxonomy 5.10 tracker state
        // accumulated during it, and taxonomy 5.11 first uses from the severed identity,
        // before the new identity starts.
        errorEpisodes.reset();
        retries.reset();
        await firstUses.clear();
      }
      await updateAnalyticsConsent('granted');
      // For the initial undecided window, keep the onboarding session's tracker state.
      // Resetting it would lose counts or permit a duplicate first use after buffered events.
      try {
        await analytics.optIn(surface);
        telemetry.setDispatching(telemetryDispatchingEnabled('granted'));
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
      telemetry.setDispatching(false);
      await updateAnalyticsConsent('withdrawn');
      await analytics.decline();
      await cleanWithdrawn();
    },
  };
}
