import type { AnalyticsConsentSurface } from '@/features/analytics/domain/product-analytics';
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

  return {
    consent: state.profile.analyticsConsent,
    getIdentifier: () => analytics.getIdentifier(),
    grant: async (surface) => {
      await updateAnalyticsConsent('granted');
      if (state.profile.analyticsConsent === 'withdrawn') {
        // A withdrawn period has no analytics identity. Clear taxonomy 5.10 tracker state
        // accumulated during it, and taxonomy 5.11 first uses from the severed identity,
        // before the new identity starts.
        errorEpisodes.reset();
        retries.reset();
        await firstUses.clear();
      }
      // For the initial undecided window, keep the onboarding session's tracker state.
      // Resetting it would lose counts or permit a duplicate first use after buffered events.
      await analytics.optIn(surface);
      telemetry.setDispatching(telemetryDispatchingEnabled('granted'));
    },
    withdraw: async () => {
      await updateAnalyticsConsent('withdrawn');
      // Observe's configuration is a full replacement the native side persists and reads at
      // dispatch time, so this stops dispatch in the same session rather than at the next
      // launch. Metrics already written to the on-device store before this call are marked
      // as sent without being dispatched.
      telemetry.setDispatching(telemetryDispatchingEnabled('withdrawn'));
      await analytics.withdraw();
      // The first-use set belongs to the severed identity (taxonomy 5.11).
      await firstUses.clear();
      errorEpisodes.reset();
      retries.reset();
    },
    decline: async () => {
      await updateAnalyticsConsent('withdrawn');
      telemetry.setDispatching(telemetryDispatchingEnabled('withdrawn'));
      await analytics.decline();
    },
  };
}
