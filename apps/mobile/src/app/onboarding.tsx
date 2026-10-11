import { Redirect } from 'expo-router';
import type { DressStyle } from '@kuyara/contracts';
import { type ComponentProps, useEffect } from 'react';

import {
  type AnalyticsConsentControls,
  useAnalyticsConsent,
} from '@/features/analytics/application/use-analytics-consent';
import { launchVisibility } from '@/features/analytics/data/launch-visibility';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import type { AnalyticsConsent, OnboardingPreferences } from '@/features/profile/domain/profile';
import { OnboardingScreen } from '@/features/profile/presentation/onboarding-screen';
import { LocationSelectionControls } from '@/features/weather/presentation/location-selection-controls';

export default function OnboardingRoute() {
  const { completeOnboarding, state } = useProfileApplication();
  const { answerSetupDay } = useRecommendationApplication();

  if (state.status !== 'ready') {
    return null;
  }

  if (state.profile.onboardingCompleted) {
    return <Redirect href="/" />;
  }

  return (
    <ReadyOnboarding
      completeOnboarding={completeOnboarding}
      answerSetupDay={answerSetupDay}
      initialBirthDate={state.profile.birthDate}
      initialDisplayName={state.profile.displayName}
      initialDressStyle={state.profile.dressStyle}
      initialStyleAesthetics={state.profile.styleAesthetics}
      initialGender={state.profile.gender}
    />
  );
}

// The consent answer is stored first, through the same consent path as every other surface, so
// a profile never reads as finished with the question unanswered: a failed write rejects and
// setup stays open, and an app killed before completion reopens onboarding (ADR 0033 section 6).
// The dressing day setup finishes on is answered by setup: its answer is recorded under the day
// the clock is in now, before the profile reads as finished, so the day's question is never
// opened for it.
async function finishSetup(
  preferences: OnboardingPreferences,
  analyticsConsent: Exclude<AnalyticsConsent, 'undecided'>,
  consent: AnalyticsConsentControls,
  answerSetupDay: ((formality: DressStyle) => Promise<void>) | undefined,
  completeOnboarding: (preferences: OnboardingPreferences) => Promise<void>,
) {
  // An earlier Accept may be stored already (setup did not finish after it), and its identity is
  // live, so Decline then withdraws: the last event is sent and the identifier copy is kept.
  if (analyticsConsent === 'granted') await consent.grant('onboarding');
  else if (consent.consent === 'granted') await consent.withdraw();
  else await consent.decline();
  try {
    await answerSetupDay?.(preferences.dressStyle);
  } catch {
    // Safe: a failed write only lets the day's question be asked, and setup still finishes.
  }
  await completeOnboarding(preferences);
}

type ReadyOnboardingProps = Omit<ComponentProps<typeof OnboardingScreen>, 'locationStep' | 'onComplete'> & Readonly<{
  answerSetupDay: ((formality: DressStyle) => Promise<void>) | undefined;
  completeOnboarding: (preferences: OnboardingPreferences) => Promise<void>;
}>;

// The consent controls need a ready profile, which only this branch has.
function ReadyOnboarding({ answerSetupDay, completeOnboarding, ...props }: ReadyOnboardingProps) {
  const consent = useAnalyticsConsent();
  // Launch metrics count from the process start, so a session that shows setup would time the
  // setup: like a launch nobody saw, it reports no first recommendation and no interactive mark.
  useEffect(() => launchVisibility.markUntimed(), []);
  return (
    <OnboardingScreen
      {...props}
      onComplete={(preferences, analyticsConsent) => finishSetup(
        preferences, analyticsConsent, consent, answerSetupDay, completeOnboarding)}
      locationStep={({ header, testID }) => (
        <LocationSelectionControls header={header} reportsSelection={false} testID={testID} testIDPrefix="onboarding" />
      )}
    />
  );
}
