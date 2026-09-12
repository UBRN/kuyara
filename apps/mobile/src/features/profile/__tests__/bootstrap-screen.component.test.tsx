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
  const onRetry = jest.fn();
  const rendered = await render(
    <LocalizationContext value={{ language: 'en', messages: messages.en, hour12: false }}>
      <KuyaraThemeContext value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <BootstrapScreen
            onRetry={onRetry}
            reason={reason}
            status="error"
          />
        </SafeAreaProvider>
      </KuyaraThemeContext>
    </LocalizationContext>,
  );
  return { onRetry, rendered };
}

test.each([
  'database-open',
  'migration',
  'profile-load',
] as const)('bootstrap error renders the %s body and retries', async (reason) => {
  const { onRetry, rendered } = await renderError(reason);

  expect(rendered.getByText(messages.en.bootstrap.errorReasonBodies[reason])).toBeTruthy();
  fireEvent.press(rendered.getByRole('button', { name: messages.en.bootstrap.retryAction }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});
