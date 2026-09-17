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
// 18:05 UTC reads as "18:05" on a 24-hour device and "6:05 PM" on a 12-hour one.
const eveningCheckedAt = '2026-08-29T18:05:00.000Z';
const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function providers(
  children: React.ReactNode,
  language: SupportedLanguage,
  theme: KuyaraTheme = lightTheme,
  hour12 = false,
) {
  return (
    <LocalizationContext.Provider value={{ language, messages: messages[language], hour12 }}>
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
  hour12 = false,
) {
  const props = {
    aiStatus: { kind: 'idle' } as const,
    isProbeSupported: true,
    lastGenerationMode: null,
    onDeviceAvailability: null,
    onCheckAiStatus: jest.fn(),
    ...overrides,
  };

  return {
    onCheckAiStatus: props.onCheckAiStatus,
    rendered: render(
      providers(<AiStatusSettingsScreen {...props} />, language, theme, hour12),
    ),
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

  // ADR 0034 section 4: the Today badge carries words only and no explanation of its own,
  // so the sentence that says what it means lives here, as the group's footer.
  test('explains the Today provenance badge in the generation mode group footer', async () => {
    const { rendered } = screen(language);
    const result = await rendered;

    expect(result.getByText(messages[language].settings.aiStatusProvenanceFooter))
      .toBeOnTheScreen();
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

  // The check time is a clock reading, so it wears the device's own 12/24-hour setting
  // rather than a fixed one; TZ=UTC keeps the expected strings deterministic.
  test.each([
    [false, '18:05'],
    [true, '6:05'],
  ] as const)('formats the checked time for hour12 %s', async (hour12, expected) => {
    const { rendered } = screen(
      language,
      { aiStatus: { kind: 'ok', checkedAt: eveningCheckedAt } },
      lightTheme,
      hour12,
    );
    const result = await rendered;

    expect(result.getByText(new RegExp(expected))).toBeOnTheScreen();
    expect(result.queryByText(new RegExp(hour12 ? '18:05' : '6:05'))).toBeNull();
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

// ADR 0034 section 5: the Apple Intelligence situation in plain words, read with no call
// and no quota. Every reason other than the switch being off or the model still downloading
// reads as a device that is not compatible.
describe.each(['en', 'tr'] as const)('%s on-device availability row', (language) => {
  test.each([
    [{ status: 'available' } as const, 'aiStatusOnDeviceRunning'],
    [
      { status: 'unavailable', reason: 'apple_intelligence_not_enabled' } as const,
      'aiStatusOnDeviceOff',
    ],
    [
      { status: 'unavailable', reason: 'model_not_ready' } as const,
      'aiStatusOnDeviceGettingReady',
    ],
    [
      { status: 'unavailable', reason: 'device_not_eligible' } as const,
      'aiStatusOnDeviceIncompatible',
    ],
    [{ status: 'unavailable', reason: 'unsupported_os' } as const, 'aiStatusOnDeviceIncompatible'],
    [null, 'aiStatusOnDeviceIncompatible'],
  ] as const)('reports the device state without probing', async (onDeviceAvailability, key) => {
    const { rendered } = screen(language, { onDeviceAvailability });
    const result = await rendered;

    expect(result.getByTestId('settings-ai-status-on-device')).toBeOnTheScreen();
    expect(result.getByText(messages[language].settings[key])).toBeOnTheScreen();
  });

  test('names the on-device tier as the last recommendation source', async () => {
    const { rendered } = screen(language, { lastGenerationMode: 'on-device-ai' });
    const result = await rendered;

    expect(
      result.getByText(messages[language].settings.aiStatusLastOnDeviceAi),
    ).toBeOnTheScreen();
  });
});

// ADR 0034 section 5: this screen is the only surface that names the provider and model
// behind the last check, and it names them only while a successful check is the last one.
describe.each(['en', 'tr'] as const)('%s assistant identity row', (language) => {
  test('names the provider and model that answered the last check', async () => {
    const { rendered } = screen(language, {
      aiStatus: {
        kind: 'ok',
        checkedAt,
        assistant: { providerId: 'openrouter', model: 'some/model:free' },
      },
    });
    const result = await rendered;

    expect(result.getByTestId('settings-ai-status-assistant-identity')).toBeOnTheScreen();
    expect(
      result.getByText(
        messages[language].settings.aiStatusAssistant('openrouter', 'some/model:free'),
      ),
    ).toBeOnTheScreen();
  });

  test.each([
    { kind: 'ok', checkedAt } as const,
    { kind: 'unavailable' } as const,
    { kind: 'idle' } as const,
  ])('omits the row when no provider answered', async (aiStatus) => {
    const { rendered } = screen(language, { aiStatus });
    const result = await rendered;

    expect(result.queryByTestId('settings-ai-status-assistant-identity')).not.toBeOnTheScreen();
  });
});
