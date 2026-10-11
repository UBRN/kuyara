import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BirthDateSettingsScreen } from '@/features/profile/presentation/birth-date-settings-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import type { SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

// The native identifiers of the one English convention (en-GB) and of Turkish; a bare `en` draws
// the US month-first, Sunday-first picker.
const nativeLocale = { en: 'en_GB', tr: 'tr_TR' } as const;

jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

async function renderScreen(
  language: SupportedLanguage,
  birthDate: string | null,
  onChange = jest.fn(async () => undefined),
) {
  return render(
    <LocalizationContext.Provider value={{ language, messages: messages[language], hour12: false }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <BirthDateSettingsScreen
            birthDate={birthDate}
            isSaving={false}
            onChange={onChange}
          />
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>,
  );
}

// An unset birth date draws no date at all: a picker always shows one, which read as a value
// beside "Not set". One Add row opens the wheel at 1 January, 25 years back, and nothing is
// stored until the wheel is turned.
test.each(['tr', 'en'] as const)(
  'an unset birth date in %s shows only Add, which opens the wheel 25 years back without saving',
  async (language) => {
    const onChange = jest.fn(async () => undefined);
    const result = await renderScreen(language, null, onChange);

    expect(result.queryByTestId('settings-birth-date-picker')).toBeNull();
    expect(result.queryByText(messages[language].onboarding.birthDateNotSet)).toBeNull();
    expect(result.queryByTestId('settings-birth-date-clear')).toBeNull();
    await fireEvent.press(result.getByTestId('settings-birth-date-add'));

    const picker = result.getByTestId('settings-birth-date-picker');
    expect(picker.props.modifiers).toEqual([
      { $type: 'environment', key: 'locale', value: nativeLocale[language] },
      { $type: 'datePickerStyle', style: 'wheel' },
      { $type: 'labelsHidden' },
    ]);
    expect(picker.props.accessibilityLabel).toBe(messages[language].preferences.birthDateTitle);
    expect(picker.props.accessibilityValue.text).toContain(`${new Date().getFullYear() - 25}-01-01`);
    expect(onChange).not.toHaveBeenCalled();
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

test('the settings picker cannot select a date the birth date rule refuses', async () => {
  const result = await renderScreen('en', null);
  await fireEvent.press(result.getByTestId('settings-birth-date-add'));

  expect(result.getByTestId('settings-birth-date-picker').props.range.start.getFullYear())
    .toBe(1900);
});

// Removing the date closes the wheel again, so no date stands on screen while none is stored.
test('Remove saves no birth date and leaves only Add', async () => {
  const onChange = jest.fn(async () => undefined);
  const result = await renderScreen('en', '1994-03-14', onChange);
  await fireEvent.press(result.getByTestId('settings-birth-date-clear'));
  expect(onChange).toHaveBeenCalledWith(null);
  await result.rerender(
    <LocalizationContext.Provider value={{ language: 'en', messages: messages.en, hour12: false }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <BirthDateSettingsScreen birthDate={null} isSaving={false} onChange={onChange} />
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>,
  );
  expect(result.queryByTestId('settings-birth-date-picker')).toBeNull();
  expect(result.getByTestId('settings-birth-date-add')).toBeOnTheScreen();
});
