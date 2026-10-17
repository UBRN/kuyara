import { useEffect, useRef } from 'react';

import { usePresentationHold } from '@/components/ui/presentation-hold';
import { sessionMayAskForConsent } from '@/features/analytics/domain/analytics-session';
import type { AnalyticsConsent } from '@/features/profile/domain/profile';

const PRESENT_DELAY_MS = 1_500;

type AnalyticsConsentSession = Readonly<{
  analyticsConsent: AnalyticsConsent;
  onboardingCompleted: boolean;
  sessionIndex: number | null;
}>;

export type AnalyticsConsentGateEligibility = AnalyticsConsentSession & Readonly<{
  pathname: string;
  recommendationShown: boolean;
}>;

/** The consent sheet is still to be asked for in this session, once Today allows it. */
export function analyticsConsentWillAsk({
  analyticsConsent,
  onboardingCompleted,
  sessionIndex,
}: AnalyticsConsentSession): boolean {
  return onboardingCompleted
    && analyticsConsent === 'undecided'
    && sessionMayAskForConsent(sessionIndex);
}

/** The consent sheet still to be asked for is presented over the app until it is answered. */
export function useAnalyticsConsentHold(session: AnalyticsConsentSession): void {
  usePresentationHold(analyticsConsentWillAsk(session));
}

export function isAnalyticsConsentGateEligible(eligibility: AnalyticsConsentGateEligibility): boolean {
  return analyticsConsentWillAsk(eligibility)
    && eligibility.recommendationShown
    && eligibility.pathname === '/';
}

export type AnalyticsConsentGateProps = Readonly<{
  shouldPresent: boolean;
  onPresent: () => void;
}>;

export function AnalyticsConsentGate({
  onPresent,
  shouldPresent,
}: AnalyticsConsentGateProps) {
  const hasPresented = useRef(false);

  useEffect(() => {
    if (!shouldPresent || hasPresented.current) return;
    const timeout = setTimeout(() => {
      hasPresented.current = true;
      onPresent();
    }, PRESENT_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [onPresent, shouldPresent]);

  return null;
}
