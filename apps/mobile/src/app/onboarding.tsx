import { Redirect } from 'expo-router';
import type { ComponentProps } from 'react';

import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { OnboardingScreen } from '@/features/profile/presentation/onboarding-screen';
import { LocationSelectionControls } from '@/features/weather/presentation/location-selection-controls';

export default function OnboardingRoute() {
  const { completeOnboarding, state } = useProfileApplication();

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
      onComplete={completeOnboarding}
    />
  );
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
