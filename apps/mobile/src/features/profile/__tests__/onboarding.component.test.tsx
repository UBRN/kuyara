import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OnboardingScreen } from '@/features/profile/presentation/onboarding-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@expo/ui/swift-ui', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

async function renderOnboarding(
  initialGender: 'woman' | 'man' | null,
  initialBirthDate: string | null,
  initialDressStyle: 'casual' | 'smart' | 'formal' | null = null,
  onComplete = jest.fn(async () => undefined),
) {
  return {
    onComplete,
    result: await render(
      <LocalizationContext.Provider value={{ language: 'en', messages: messages.en }}>
        <KuyaraThemeContext.Provider value={lightTheme}>
          <SafeAreaProvider initialMetrics={initialMetrics}>
            <OnboardingScreen
              initialBirthDate={initialBirthDate}
              initialDressStyle={initialDressStyle}
              initialGender={initialGender}
              onComplete={onComplete}
            />
          </SafeAreaProvider>
        </KuyaraThemeContext.Provider>
      </LocalizationContext.Provider>,
    ),
  };
}

test('gender and dress style are required and a null birth date completes honestly', async () => {
  const { onComplete, result } = await renderOnboarding(null, null);

  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-step-2')).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-gender-error')).toHaveTextContent(
    messages.en.onboarding.genderRequiredError,
  );
  await fireEvent.press(result.getByTestId('onboarding-gender-woman'));
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-step-3')).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-dress-style-error')).toHaveTextContent(
    messages.en.onboarding.dressStyleRequiredError,
  );
  await fireEvent.press(result.getByTestId('onboarding-dress-style-formal'));
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-step-4')).toBeOnTheScreen();
  expect(result.getByText(messages.en.onboarding.birthDateNotSet)).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-birth-date').props.accessibilityLabel).toBe(
    messages.en.onboarding.birthDateTitle,
  );

  await fireEvent.press(result.getByTestId('onboarding-complete'));
  await waitFor(() => expect(onComplete).toHaveBeenCalledWith({
    gender: 'woman',
    dressStyle: 'formal',
    birthDate: null,
  }));
});

test('existing profile values prefill the reopened onboarding steps', async () => {
  const { result } = await renderOnboarding('man', '1994-03-14', 'smart');

  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-gender-man').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-dress-style-smart').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.queryByText(messages.en.onboarding.birthDateNotSet)).toBeNull();
  expect(result.getByTestId('onboarding-birth-date').props.accessibilityValue.text).toContain(
    '1994-03-14',
  );
});
