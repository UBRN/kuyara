import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useMemo,
  useState,
} from 'react';

export type AnalyticsConsentTriggerValue = Readonly<{
  recommendationShown: boolean;
  markRecommendationShown: () => void;
}>;

export const AnalyticsConsentTriggerContext =
  createContext<AnalyticsConsentTriggerValue | null>(null);

export function AnalyticsConsentTriggerProvider({ children }: PropsWithChildren) {
  const [recommendationShown, setRecommendationShown] = useState(false);
  const markRecommendationShown = useCallback(() => setRecommendationShown(true), []);
  const value = useMemo(
    () => ({ recommendationShown, markRecommendationShown }),
    [markRecommendationShown, recommendationShown],
  );

  return (
    <AnalyticsConsentTriggerContext value={value}>
      {children}
    </AnalyticsConsentTriggerContext>
  );
}

export function useAnalyticsConsentTrigger(): AnalyticsConsentTriggerValue {
  const value = use(AnalyticsConsentTriggerContext);
  if (!value) {
    throw new Error(
      'useAnalyticsConsentTrigger must be used within AnalyticsConsentTriggerProvider',
    );
  }
  return value;
}
