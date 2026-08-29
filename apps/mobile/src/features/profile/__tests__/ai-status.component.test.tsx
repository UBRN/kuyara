import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AiStatusSection } from '@/features/profile/presentation/ai-status-section';
import { SettingsScreen } from '@/features/profile/presentation/settings-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import {
  createKuyaraTheme,
  lightTheme,
  type KuyaraTheme,
} from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

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

function section(
  language: SupportedLanguage,
  overrides: Partial<React.ComponentProps<typeof AiStatusSection>> = {},
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
    rendered: render(providers(<AiStatusSection {...props} />, language, theme)),
  };
}

describe.each(['en', 'tr'] as const)('%s AI status section', (language) => {
  test('renders the localized action and sends the check intent', async () => {
    const { onCheckAiStatus, rendered } = section(language);
    const result = await rendered;
    const button = result.getByTestId('settings-ai-status-check');

    expect(button).toHaveTextContent(messages[language].settings.aiStatusCheckAction);
    await fireEvent.press(button);
    expect(onCheckAiStatus).toHaveBeenCalledTimes(1);
  });

  test.each([
    [{ kind: 'unavailable' }, 'aiStatusResultUnavailable'],
    [{ kind: 'rate-limited' }, 'aiStatusResultRateLimited'],
    [{ kind: 'error' }, 'aiStatusResultError'],
  ] as const)('announces a localized probe result', async (aiStatus, messageKey) => {
    const { rendered } = section(language, { aiStatus });
    const result = await rendered;
    const status = result.getByTestId('settings-ai-status-result');

    expect(status).toHaveTextContent(messages[language].settings[messageKey]);
    expect(status.props.accessibilityLiveRegion).toBe('polite');
  });

  test('announces a localized successful result with the checked time', async () => {
    const { rendered } = section(language, {
      aiStatus: { kind: 'ok', checkedAt },
    });
    const result = await rendered;
    const status = result.getByTestId('settings-ai-status-result');

    expect(status).toHaveTextContent(
      language === 'en' ? /^AI responded at .+/ : /^AI saat .+ yanıt verdi\.$/,
    );
    expect(status.props.accessibilityLiveRegion).toBe('polite');
  });

  test('disables unsupported checks and announces build availability', async () => {
    const { rendered } = section(language, { isProbeSupported: false });
    const result = await rendered;

    expect(
      result.getByTestId('settings-ai-status-check').props.accessibilityState.disabled,
    ).toBe(true);
    expect(result.getByTestId('settings-ai-status-result')).toHaveTextContent(
      messages[language].settings.aiStatusUnsupported,
    );
  });

  test('renders an assertive localized overlay while checking', async () => {
    const { rendered } = section(language, { aiStatus: { kind: 'checking' } });
    const result = await rendered;
    const overlay = result.getByTestId('settings-ai-status-overlay');

    expect(overlay.props.accessibilityLabel).toBe(
      messages[language].settings.aiStatusChecking,
    );
    expect(overlay.props.accessibilityLiveRegion).toBe('assertive');
    expect(overlay.props.accessibilityViewIsModal).toBe(true);
    expect(result.getByTestId('settings-ai-status-result', {
      includeHiddenElements: true,
    })).toHaveTextContent(
      messages[language].settings.aiStatusChecking,
    );
  });
});

test('checking overlay renders with standard and reduced motion', async () => {
  for (const theme of [lightTheme, createKuyaraTheme('light', true)]) {
    const { rendered } = section('en', { aiStatus: { kind: 'checking' } }, theme);
    const result = await rendered;

    expect(result.getByTestId('settings-ai-status-overlay')).toBeOnTheScreen();
    expect(result.getAllByText(messages.en.settings.aiStatusChecking).length).toBeGreaterThan(0);
    await result.unmount();
  }
});

test('Settings screen includes the AI status section', async () => {
  const result = await render(providers(
    <SettingsScreen
      aiStatus={{ kind: 'idle' }}
      isProbeSupported
      isSaving={false}
      lastGenerationMode="deterministic-fallback"
      onCheckAiStatus={() => undefined}
      profile={{
        id: 'profile-id',
        clothingPreference: 'womens',
        languagePreference: 'en',
        themePreference: 'light',
        onboardingCompleted: true,
        createdAt: checkedAt,
        updatedAt: checkedAt,
      }}
      updateClothingPreference={async () => undefined}
      updateLanguagePreference={async () => undefined}
      updateThemePreference={async () => undefined}
    />,
    'en',
  ));

  expect(result.getByTestId('settings-ai-status')).toBeOnTheScreen();
});
