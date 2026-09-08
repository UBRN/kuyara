import { Redirect } from 'expo-router';

import { useProfileApplication } from '@/features/profile/application/profile-context';
import { OnboardingScreen } from '@/features/profile/presentation/onboarding-screen';

export default function OnboardingRoute() {
  const { completeOnboarding, state } = useProfileApplication();

  if (state.status !== 'ready') {
    return null;
  }

  if (state.profile.onboardingCompleted) {
    return <Redirect href="/" />;
  }

  return (
    <OnboardingScreen
      initialBirthDate={state.profile.birthDate}
      initialDressStyle={state.profile.dressStyle}
      initialGender={state.profile.gender}
      onComplete={completeOnboarding}
    />
  );
}
