import { render, waitFor } from '@testing-library/react-native';

import { AnalyticsConsentGate } from '@/features/analytics/application/analytics-consent-gate';

test('the sheet is presented once only after onboarding eligibility becomes true', async () => {
  const onPresent = jest.fn();
  const result = await render(
    <AnalyticsConsentGate onPresent={onPresent} shouldPresent={false} />,
  );

  expect(onPresent).not.toHaveBeenCalled();
  await result.rerender(<AnalyticsConsentGate onPresent={onPresent} shouldPresent />);
  await waitFor(() => expect(onPresent).toHaveBeenCalledTimes(1));

  await result.rerender(<AnalyticsConsentGate onPresent={onPresent} shouldPresent={false} />);
  await result.rerender(<AnalyticsConsentGate onPresent={onPresent} shouldPresent />);
  expect(onPresent).toHaveBeenCalledTimes(1);
});
