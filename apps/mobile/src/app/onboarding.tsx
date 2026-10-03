import { Redirect } from 'expo-router';
import type { DressStyle } from '@kuyara/contracts';
import type { ComponentProps } from 'react';

import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import type { OnboardingPreferences } from '@/features/profile/domain/profile';
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
      initialBirthDate={state.profile.birthDate}
      initialDisplayName={state.profile.displayName}
      initialDressStyle={state.profile.dressStyle}
      initialStyleAesthetics={state.profile.styleAesthetics}
      initialGender={state.profile.gender}
      onComplete={(preferences) => finishSetup(preferences, answerSetupDay, completeOnboarding)}
    />
  );
}

// The dressing day setup finishes on is answered by setup: its answer is recorded under the day
// the clock is in now, before the profile reads as finished, so the day's question is never
// opened for it.
async function finishSetup(
  preferences: OnboardingPreferences,
  answerSetupDay: ((formality: DressStyle) => Promise<void>) | undefined,
  completeOnboarding: (preferences: OnboardingPreferences) => Promise<void>,
) {
  try {
    await answerSetupDay?.(preferences.dressStyle);
  } catch {
    // Safe: a failed write only lets the day's question be asked, and setup still finishes.
  }
  await completeOnboarding(preferences);
}

type ReadyOnboardingProps = Omit<ComponentProps<typeof OnboardingScreen>, 'locationStep'>;

function ReadyOnboarding(props: ReadyOnboardingProps) {
  useScreenViewed('onboarding');
  return (
    <OnboardingScreen
      {...props}
      locationStep={({ header, testID }) => (
        <LocationSelectionControls header={header} testID={testID} testIDPrefix="onboarding" />
      )}
    />
  );
}
