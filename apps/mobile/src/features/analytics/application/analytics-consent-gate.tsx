import { useEffect, useRef } from 'react';

import { sessionMayAskForConsent } from '@/features/analytics/domain/analytics-session';
import type { AnalyticsConsent } from '@/features/profile/domain/profile';

const PRESENT_DELAY_MS = 1_500;

export type AnalyticsConsentGateEligibility = Readonly<{
  analyticsConsent: AnalyticsConsent;
  onboardingCompleted: boolean;
  pathname: string;
  recommendationShown: boolean;
  sessionIndex: number;
}>;

export function isAnalyticsConsentGateEligible({
  analyticsConsent,
  onboardingCompleted,
  pathname,
  recommendationShown,
  sessionIndex,
}: AnalyticsConsentGateEligibility): boolean {
  return onboardingCompleted
    && analyticsConsent === 'undecided'
    && sessionMayAskForConsent(sessionIndex)
    && recommendationShown
    && pathname === '/';
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
