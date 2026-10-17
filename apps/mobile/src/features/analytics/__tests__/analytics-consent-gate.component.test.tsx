import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { usePresentationHeld } from '@/components/ui/presentation-hold';
import {
  AnalyticsConsentGate,
  isAnalyticsConsentGateEligible,
  useAnalyticsConsentHold,
} from '@/features/analytics/application/analytics-consent-gate';
import type { AnalyticsConsent } from '@/features/profile/domain/profile';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('the sheet is presented after 1500 ms and at most once per process', async () => {
  const onPresent = jest.fn();
  const result = await render(
    <AnalyticsConsentGate onPresent={onPresent} shouldPresent={false} />,
  );

  expect(onPresent).not.toHaveBeenCalled();
  await result.rerender(<AnalyticsConsentGate onPresent={onPresent} shouldPresent />);
  await act(async () => jest.advanceTimersByTime(1_499));
  expect(onPresent).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(1));
  expect(onPresent).toHaveBeenCalledTimes(1);

  await result.rerender(<AnalyticsConsentGate onPresent={onPresent} shouldPresent={false} />);
  await result.rerender(<AnalyticsConsentGate onPresent={onPresent} shouldPresent />);
  await act(async () => jest.advanceTimersByTime(1_500));
  expect(onPresent).toHaveBeenCalledTimes(1);
});

test('the pending presentation is cancelled when eligibility changes', async () => {
  const onPresent = jest.fn();
  const result = await render(
    <AnalyticsConsentGate onPresent={onPresent} shouldPresent />,
  );

  await act(async () => jest.advanceTimersByTime(1_000));
  await result.rerender(
    <AnalyticsConsentGate onPresent={onPresent} shouldPresent={false} />,
  );
  await act(async () => jest.advanceTimersByTime(1_000));
  expect(onPresent).not.toHaveBeenCalled();

  await result.rerender(<AnalyticsConsentGate onPresent={onPresent} shouldPresent />);
  await act(async () => jest.advanceTimersByTime(1_500));
  expect(onPresent).toHaveBeenCalledTimes(1);
});

test('eligibility requires an undecided completed profile, a shown recommendation, and Today', () => {
  const eligible = {
    analyticsConsent: 'undecided' as const,
    onboardingCompleted: true,
    pathname: '/',
    recommendationShown: true,
    sessionIndex: 2,
  };

  expect(isAnalyticsConsentGateEligible(eligible)).toBe(true);
  expect(isAnalyticsConsentGateEligible({ ...eligible, pathname: '/weather' })).toBe(false);
  expect(isAnalyticsConsentGateEligible({ ...eligible, pathname: '/outfit-one' })).toBe(false);
  expect(isAnalyticsConsentGateEligible({ ...eligible, recommendationShown: false })).toBe(false);
  expect(isAnalyticsConsentGateEligible({ ...eligible, onboardingCompleted: false })).toBe(false);
  expect(isAnalyticsConsentGateEligible({ ...eligible, analyticsConsent: 'granted' })).toBe(false);
});

// ADR 0033 section 6: the first session belongs to the first recommendation.
test('the question is never asked in the first session and is asked from the second', () => {
  const eligible = {
    analyticsConsent: 'undecided' as const,
    onboardingCompleted: true,
    pathname: '/',
    recommendationShown: true,
    sessionIndex: 1,
  };

  expect(isAnalyticsConsentGateEligible(eligible)).toBe(false);
  expect(isAnalyticsConsentGateEligible({ ...eligible, sessionIndex: 2 })).toBe(true);
  expect(isAnalyticsConsentGateEligible({ ...eligible, sessionIndex: 5 })).toBe(true);
  // The second session still waits for that session's first recommendation.
  expect(isAnalyticsConsentGateEligible({
    ...eligible,
    recommendationShown: false,
    sessionIndex: 2,
  })).toBe(false);
});

// What must never appear over the consent sheet waits from the moment the session will ask for
// it, before it is presented, until it is answered.
test('a consent sheet still to be asked for in this session holds the screen until it is answered', async () => {
  function Shell({ analyticsConsent, sessionIndex }: Readonly<{ analyticsConsent: AnalyticsConsent; sessionIndex: number }>) {
    useAnalyticsConsentHold({ analyticsConsent, onboardingCompleted: true, sessionIndex });
    return <Text testID="held">{usePresentationHeld() ? 'held' : 'clear'}</Text>;
  }
  const result = await render(<Shell analyticsConsent="undecided" sessionIndex={1} />);
  expect(result.getByTestId('held')).toHaveTextContent('clear');
  await result.rerender(<Shell analyticsConsent="undecided" sessionIndex={2} />);
  expect(result.getByTestId('held')).toHaveTextContent('held');
  await result.rerender(<Shell analyticsConsent="granted" sessionIndex={2} />);
  expect(result.getByTestId('held')).toHaveTextContent('clear');
});
