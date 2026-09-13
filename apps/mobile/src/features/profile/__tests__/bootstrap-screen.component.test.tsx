import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ProfileBootstrapFailureReason } from '@/features/profile/application/profile-application-controller';
import { BootstrapScreen } from '@/features/profile/presentation/bootstrap-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

async function renderError(reason: ProfileBootstrapFailureReason) {
  const onReportProblem = jest.fn();
  const onRetry = jest.fn();
  const rendered = await render(
    <LocalizationContext value={{ language: 'en', messages: messages.en, hour12: false }}>
      <KuyaraThemeContext value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <BootstrapScreen
            onReportProblem={onReportProblem}
            onRetry={onRetry}
            reason={reason}
            status="error"
          />
        </SafeAreaProvider>
      </KuyaraThemeContext>
    </LocalizationContext>,
  );
  return { onReportProblem, onRetry, rendered };
}

test.each([
  'database-open',
  'migration',
  'profile-load',
] as const)('bootstrap error renders the %s body and retries', async (reason) => {
  const { onReportProblem, onRetry, rendered } = await renderError(reason);

  expect(rendered.getByText(messages.en.bootstrap.errorReasonBodies[reason])).toBeTruthy();
  // RNTL 14's `fireEvent` wraps an async act; two un-awaited presses overlap and leave the
  // next render empty.
  await fireEvent.press(rendered.getByRole('button', { name: messages.en.bootstrap.retryAction }));
  expect(onRetry).toHaveBeenCalledTimes(1);
  await fireEvent.press(rendered.getByRole('button', { name: messages.en.bootstrap.reportAction }));
  expect(onReportProblem).toHaveBeenCalledTimes(1);
});
