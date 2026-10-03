import { render } from '@testing-library/react-native';

import OnboardingRoute from '@/app/onboarding';
import { ProfileApplicationContext, type ProfileApplicationValue } from '@/features/profile/application/profile-context';
import {
  RecommendationApplicationContext,
  type RecommendationApplicationValue,
} from '@/features/recommendation/application/recommendation-application-context';

let mockScreenProps: { onComplete: (preferences: unknown) => Promise<void> } | null = null;
jest.mock('expo-router', () => ({ Redirect: () => null }));
jest.mock('@/features/analytics/application/use-screen-viewed', () => ({ useScreenViewed: () => undefined }));
jest.mock('@/features/weather/presentation/location-selection-controls', () => ({
  LocationSelectionControls: () => null,
}));
jest.mock('@/features/profile/presentation/onboarding-screen', () => ({
  OnboardingScreen: (props: { onComplete: (preferences: unknown) => Promise<void> }) => {
    mockScreenProps = props;
    return null;
  },
}));

const preferences = { gender: 'woman', dressStyle: 'formal', birthDate: null } as const;

async function renderRoute(answerSetupDay: RecommendationApplicationValue['answerSetupDay']) {
  const calls: string[] = [];
  const completeOnboarding = jest.fn(async () => { calls.push('complete'); });
  const answer = answerSetupDay
    ? jest.fn(async (formality: 'casual' | 'smart' | 'formal') => {
      calls.push(`answer:${formality}`);
      await answerSetupDay(formality);
    })
    : undefined;
  const profile = {
    state: { status: 'ready', isSaving: false, profile: { onboardingCompleted: false, birthDate: null,
      displayName: null, dressStyle: null, styleAesthetics: [], gender: null } },
    completeOnboarding,
  } as unknown as ProfileApplicationValue;
  await render(
    <ProfileApplicationContext value={profile}>
      <RecommendationApplicationContext value={{ answerSetupDay: answer } as unknown as RecommendationApplicationValue}>
        <OnboardingRoute />
      </RecommendationApplicationContext>
    </ProfileApplicationContext>,
  );
  return { calls, completeOnboarding };
}

test('finishing setup answers the dressing day first, then completes the profile', async () => {
  const { calls, completeOnboarding } = await renderRoute(async () => undefined);
  await mockScreenProps?.onComplete(preferences);
  expect(calls).toEqual(['answer:formal', 'complete']);
  expect(completeOnboarding).toHaveBeenCalledWith(preferences);
});

test('a day answer that cannot be written never stops setup from finishing', async () => {
  const { calls } = await renderRoute(async () => { throw new Error('write failed'); });
  await mockScreenProps?.onComplete(preferences);
  expect(calls).toEqual(['answer:formal', 'complete']);
});
