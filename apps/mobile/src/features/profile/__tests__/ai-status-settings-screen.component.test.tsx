import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AiStatusSettingsScreen } from '@/features/profile/presentation/ai-status-settings-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import {
  createKuyaraTheme,
  lightTheme,
  type KuyaraTheme,
} from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({
  SymbolView: (props: Record<string, unknown>) => {
    const React = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');
    return React.createElement(View, props);
  },
}));

jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));

const checkedAt = '2026-08-29T12:34:00.000Z';
const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function providers(
  children: React.ReactNode,
  language: SupportedLanguage,
  theme: KuyaraTheme = lightTheme,
) {
  return (
    <LocalizationContext.Provider value={{ language, messages: messages[language] }}>
      <KuyaraThemeContext.Provider value={theme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          {children}
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>
  );
}

function screen(
  language: SupportedLanguage,
  overrides: Partial<React.ComponentProps<typeof AiStatusSettingsScreen>> = {},
  theme: KuyaraTheme = lightTheme,
) {
  const props = {
    aiStatus: { kind: 'idle' } as const,
    isProbeSupported: true,
    lastGenerationMode: null,
    onCheckAiStatus: jest.fn(),
    ...overrides,
  };

  return {
    onCheckAiStatus: props.onCheckAiStatus,
    rendered: render(providers(<AiStatusSettingsScreen {...props} />, language, theme)),
  };
}

describe.each(['en', 'tr'] as const)('%s AI status settings screen', (language) => {
  test('renders the localized action and sends the check intent', async () => {
    const { onCheckAiStatus, rendered } = screen(language);
    const result = await rendered;
    const row = result.getByTestId('settings-ai-status-check');

    expect(result.getByText(messages[language].settings.aiStatusCheckAction)).toBeOnTheScreen();
    await fireEvent.press(row);
    expect(onCheckAiStatus).toHaveBeenCalledTimes(1);
  });

  test.each([
    [{ kind: 'unavailable' }, 'aiStatusResultUnavailable'],
    [{ kind: 'rate-limited' }, 'aiStatusResultRateLimited'],
    [{ kind: 'error' }, 'aiStatusResultError'],
  ] as const)('announces a localized probe result', async (aiStatus, messageKey) => {
    const { rendered } = screen(language, { aiStatus });
    const result = await rendered;

    expect(result.getByTestId('settings-ai-status-result')).toBeOnTheScreen();
    expect(result.getByText(messages[language].settings[messageKey])).toBeOnTheScreen();
  });

  test('announces a localized successful result with the checked time', async () => {
    const { rendered } = screen(language, {
      aiStatus: { kind: 'ok', checkedAt },
    });
    const result = await rendered;

    expect(
      result.getByText(language === 'en' ? /^AI responded at .+/ : /^AI saat .+ yanıt verdi\.$/),
    ).toBeOnTheScreen();
  });

  test('disables unsupported checks and announces build availability', async () => {
    const { rendered } = screen(language, { isProbeSupported: false });
    const result = await rendered;

    expect(result.getByTestId('settings-ai-status-check').props.onPress).toBeUndefined();
    expect(
      result.getByText(messages[language].settings.aiStatusUnsupported),
    ).toBeOnTheScreen();
  });

  test('shows the checking overlay while a check is in flight', async () => {
    const { rendered } = screen(language, { aiStatus: { kind: 'checking' } });
    const result = await rendered;
    const overlay = result.getByTestId('settings-ai-status-overlay');

    expect(overlay.props.accessibilityLabel).toBe(messages[language].settings.aiStatusChecking);
    expect(overlay.props.accessibilityLiveRegion).toBe('assertive');
    expect(overlay.props.accessibilityViewIsModal).toBe(true);
  });
});

test('checking overlay renders with standard and reduced motion', async () => {
  for (const theme of [lightTheme, createKuyaraTheme('light', true)]) {
    const { rendered } = screen('en', { aiStatus: { kind: 'checking' } }, theme);
    const result = await rendered;

    expect(result.getByTestId('settings-ai-status-overlay')).toBeOnTheScreen();
    await result.unmount();
  }
});

test('shows the last recommendation generation mode as its own group', async () => {
  const { rendered } = screen('en', { lastGenerationMode: 'ai-assisted' });
  const result = await rendered;

  expect(result.getByTestId('settings-ai-status-last-mode')).toBeOnTheScreen();
  expect(
    result.getByText(messages.en.settings.aiStatusLastAiAssisted),
  ).toBeOnTheScreen();
});
