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
  const { analytics } = useProductAnalytics();
  const { state, updateAnalyticsConsent } = useProfileApplication();

  if (state.status !== 'ready') {
    throw new Error('useAnalyticsConsent requires a ready local profile');
  }

  return {
    consent: state.profile.analyticsConsent,
    getIdentifier: () => analytics.getIdentifier(),
    grant: async (surface) => {
      await updateAnalyticsConsent('granted');
      await analytics.optIn(surface);
    },
    withdraw: async () => {
      await updateAnalyticsConsent('withdrawn');
      await analytics.withdraw();
    },
    decline: () => updateAnalyticsConsent('withdrawn'),
  };
}
