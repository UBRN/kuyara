import { render } from '@testing-library/react-native';

import OnboardingRoute from '@/app/onboarding';
import { launchVisibility } from '@/features/analytics/data/launch-visibility';
import { processClock } from '@/features/analytics/data/process-clock';
import { ProfileApplicationContext, type ProfileApplicationValue } from '@/features/profile/application/profile-context';
import {
  RecommendationApplicationContext,
  type RecommendationApplicationValue,
} from '@/features/recommendation/application/recommendation-application-context';

type CompleteProps = { onComplete: (preferences: unknown, analyticsConsent: 'granted' | 'withdrawn') => Promise<void> };
let mockScreenProps: CompleteProps | null = null;
const mockCalls: string[] = [];
const mockConsent = {
  consent: 'undecided' as 'undecided' | 'granted' | 'withdrawn',
  grant: jest.fn(async (surface: string) => { mockCalls.push(`grant:${surface}`); }),
  decline: jest.fn(async () => { mockCalls.push('decline'); }),
  withdraw: jest.fn(async () => { mockCalls.push('withdraw'); }),
};
jest.mock('expo-router', () => ({ Redirect: () => null }));
jest.mock('@/features/analytics/application/use-analytics-consent', () => ({
  useAnalyticsConsent: () => mockConsent,
}));
jest.mock('@/features/analytics/application/use-screen-viewed', () => ({ useScreenViewed: () => undefined }));
jest.mock('@/features/weather/presentation/location-selection-controls', () => ({
  LocationSelectionControls: () => null,
}));
jest.mock('@/features/profile/presentation/onboarding-screen', () => ({
  OnboardingScreen: (props: CompleteProps) => {
    mockScreenProps = props;
    return null;
  },
}));

const preferences = { gender: 'woman', dressStyle: 'formal', birthDate: null } as const;

beforeEach(() => {
  mockCalls.length = 0;
  mockConsent.consent = 'undecided';
});

async function renderRoute(answerSetupDay: RecommendationApplicationValue['answerSetupDay']) {
  const calls = mockCalls;
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

// The consent answer is stored before the profile reads as finished, so an app killed in
// between reopens onboarding rather than leaving a finished profile with no answer.
test('accepting on the last step grants from onboarding, answers the day, then completes', async () => {
  const { calls, completeOnboarding } = await renderRoute(async () => undefined);
  await mockScreenProps?.onComplete(preferences, 'granted');
  expect(calls).toEqual(['grant:onboarding', 'answer:formal', 'complete']);
  expect(completeOnboarding).toHaveBeenCalledWith(preferences);
});

test('declining on the last step stores the decline before setup finishes', async () => {
  const { calls } = await renderRoute(async () => undefined);
  await mockScreenProps?.onComplete(preferences, 'withdrawn');
  expect(calls).toEqual(['decline', 'answer:formal', 'complete']);
});

// An earlier Accept was stored but setup did not finish (a failed write, or the app was closed),
// so the identity is live: Decline now withdraws it, sending the last event and keeping the
// identifier copy for a deletion request.
test('declining after an earlier stored Accept withdraws the grant', async () => {
  mockConsent.consent = 'granted';
  const { calls } = await renderRoute(async () => undefined);
  await mockScreenProps?.onComplete(preferences, 'withdrawn');
  expect(calls).toEqual(['withdraw', 'answer:formal', 'complete']);
});

// A process whose session opens on onboarding times the setup, not the launch, so it reports
// no `recommendation.first_shown` and no interactive mark (the launch-nobody-saw rule).
test('showing onboarding leaves the process launch untimed', async () => {
  processClock.mark();
  await renderRoute(async () => undefined);
  expect(launchVisibility.isTimed()).toBe(false);
  expect(processClock.elapsedMs()).toBeNull();
});

test('a consent answer that cannot be stored leaves setup unfinished', async () => {
  mockConsent.decline.mockRejectedValueOnce(new Error('write failed'));
  const { calls, completeOnboarding } = await renderRoute(async () => undefined);
  await expect(mockScreenProps?.onComplete(preferences, 'withdrawn')).rejects.toThrow('write failed');
  expect(calls).toEqual([]);
  expect(completeOnboarding).not.toHaveBeenCalled();
});

test('a day answer that cannot be written never stops setup from finishing', async () => {
  const { calls } = await renderRoute(async () => { throw new Error('write failed'); });
  await mockScreenProps?.onComplete(preferences, 'withdrawn');
  expect(calls).toEqual(['decline', 'answer:formal', 'complete']);
});
