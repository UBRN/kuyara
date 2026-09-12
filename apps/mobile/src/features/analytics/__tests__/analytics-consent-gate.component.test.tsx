import { act, render } from '@testing-library/react-native';

import {
  AnalyticsConsentGate,
  isAnalyticsConsentGateEligible,
} from '@/features/analytics/application/analytics-consent-gate';

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
  };

  expect(isAnalyticsConsentGateEligible(eligible)).toBe(true);
  expect(isAnalyticsConsentGateEligible({ ...eligible, pathname: '/weather' })).toBe(false);
  expect(isAnalyticsConsentGateEligible({ ...eligible, pathname: '/outfit-one' })).toBe(false);
  expect(isAnalyticsConsentGateEligible({ ...eligible, recommendationShown: false })).toBe(false);
  expect(isAnalyticsConsentGateEligible({ ...eligible, onboardingCompleted: false })).toBe(false);
  expect(isAnalyticsConsentGateEligible({ ...eligible, analyticsConsent: 'granted' })).toBe(false);
});
