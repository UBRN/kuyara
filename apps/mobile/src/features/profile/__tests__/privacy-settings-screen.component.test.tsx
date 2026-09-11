import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PrivacySettingsScreen } from '@/features/profile/presentation/privacy-settings-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

async function renderScreen(
  consent: 'undecided' | 'granted' | 'withdrawn',
  overrides: Partial<React.ComponentProps<typeof PrivacySettingsScreen>> = {},
) {
  const props = {
    consent,
    identifier: consent === 'granted' ? 'identifier-1' : null,
    privacyPolicyUrl: null,
    onGrant: jest.fn(async () => undefined),
    onWithdraw: jest.fn(async () => undefined),
    onOpenPrivacyPolicy: jest.fn(),
    ...overrides,
  };
  const rendered = await render(
    <LocalizationContext.Provider value={{ language: 'en', messages: messages.en , hour12: false }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <PrivacySettingsScreen {...props} />
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>,
  );
  return { ...props, rendered };
}

test('the consent toggle withdraws and the identifier is selectable while enabled', async () => {
  const result = await renderScreen('granted');

  expect(result.rendered.getByTestId('settings-privacy-identifier').props.selectable).toBe(true);
  expect(result.rendered.queryByTestId('settings-privacy-policy-row')).toBeNull();
  await act(async () => {
    fireEvent(
      result.rendered.getByTestId('settings-privacy-toggle-row-toggle'),
      'valueChange',
      false,
    );
  });

  await waitFor(() => expect(result.onWithdraw).toHaveBeenCalledTimes(1));
  expect(result.onGrant).not.toHaveBeenCalled();
});

test('the disabled consent state can grant from Privacy', async () => {
  const result = await renderScreen('withdrawn');

  expect(result.rendered.queryByTestId('settings-privacy-identifier-group')).toBeNull();
  await act(async () => {
    fireEvent(
      result.rendered.getByTestId('settings-privacy-toggle-row-toggle'),
      'valueChange',
      true,
    );
  });

  await waitFor(() => expect(result.onGrant).toHaveBeenCalledTimes(1));
  expect(result.onWithdraw).not.toHaveBeenCalled();
});

test('a failed consent change returns the controlled toggle to the profile value', async () => {
  const onWithdraw = jest.fn(async () => {
    throw new Error('provider unavailable');
  });
  const result = await renderScreen('granted', { onWithdraw });

  await act(async () => {
    fireEvent(
      result.rendered.getByTestId('settings-privacy-toggle-row-toggle'),
      'valueChange',
      false,
    );
  });

  await waitFor(() => expect(onWithdraw).toHaveBeenCalledTimes(1));
  const toggle = result.rendered.getByTestId('settings-privacy-toggle-row-toggle');
  expect(toggle.props.value).toBe(true);
  expect(toggle.props.disabled).toBe(false);
});

test('the policy row renders only for a real URL and opens it', async () => {
  const onOpenPrivacyPolicy = jest.fn();
  const result = await renderScreen('withdrawn', {
    privacyPolicyUrl: 'https://example.com/privacy',
    onOpenPrivacyPolicy,
  });

  fireEvent.press(result.rendered.getByTestId('settings-privacy-policy-row'));
  expect(onOpenPrivacyPolicy).toHaveBeenCalledTimes(1);
});
