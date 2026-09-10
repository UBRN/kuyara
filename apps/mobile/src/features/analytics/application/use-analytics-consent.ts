import type { AnalyticsConsentSurface } from '@/features/analytics/domain/product-analytics';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
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
  const { state, updateAnalyticsConsent } = useProfileApplication();

  if (state.status !== 'ready') {
    throw new Error('useAnalyticsConsent requires a ready local profile');
  }

  return {
    consent: state.profile.analyticsConsent,
    getIdentifier: () => analytics.getIdentifier(),
    grant: async (surface) => {
      await updateAnalyticsConsent('granted');
      // Start the new, unjoinable identity with no pre-consent buffered or persisted state.
      errorEpisodes.reset();
      retries.reset();
      await firstUses.clear();
      await analytics.optIn(surface);
    },
    withdraw: async () => {
      await updateAnalyticsConsent('withdrawn');
      await analytics.withdraw();
      // The first-use set belongs to the severed identity (taxonomy 5.11).
      await firstUses.clear();
      errorEpisodes.reset();
      retries.reset();
    },
    decline: () => updateAnalyticsConsent('withdrawn'),
  };
}
