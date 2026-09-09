import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BirthDateSettingsScreen } from '@/features/profile/presentation/birth-date-settings-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import type { SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

async function renderScreen(language: SupportedLanguage, birthDate: string | null) {
  return render(
    <LocalizationContext.Provider value={{ language, messages: messages[language] }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <BirthDateSettingsScreen
            birthDate={birthDate}
            isSaving={false}
            onChange={jest.fn(async () => undefined)}
          />
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>,
  );
}

test.each(['tr', 'en'] as const)(
  'the settings picker takes the app language %s and keeps the unset presentation',
  async (language) => {
    const result = await renderScreen(language, null);
    const picker = result.getByTestId('settings-birth-date-picker');

    expect(picker.props.modifiers).toEqual([
      { $type: 'environment', key: 'locale', value: language },
    ]);
    expect(picker.props.accessibilityLabel).toBe(messages[language].preferences.birthDateTitle);
    // Unset stays as it is: the row still says so in words while the picker shows today.
    expect(result.getByText(messages[language].onboarding.birthDateNotSet)).toBeOnTheScreen();
    expect(result.queryByTestId('settings-birth-date-clear')).toBeNull();
  },
);

test('a stored birth date keeps the ISO contract and offers the clear action', async () => {
  const result = await renderScreen('tr', '1994-03-14');

  expect(result.getByTestId('settings-birth-date-picker').props.accessibilityValue.text)
    .toContain('1994-03-14');
  expect(result.queryByText(messages.tr.onboarding.birthDateNotSet)).toBeNull();
  expect(result.getByTestId('settings-birth-date-clear')).toBeOnTheScreen();
});
