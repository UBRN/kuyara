import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { LocalProfile } from '@/features/profile/domain/profile';
import { SettingsScreen } from '@/features/profile/presentation/settings-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/community/bottom-sheet', () => ({ BottomSheet: () => null }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0' }, platform: { ios: { buildNumber: '16' } } },
}));
jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};

const profile: LocalProfile = {
  id: 'profile-id',
  gender: 'woman',
  clothingPreference: 'womens',
  dressStyle: 'smart',
  styleAesthetics: [],
  morningSheetEnabled: true,
  easierToSee: false,
  birthDate: '1994-03-14',
  displayName: null,
  namePromptVersion: 1,
  walkthroughVersion: 1,
  languagePreference: 'en',
  themePreference: 'light',
  onboardingCompleted: true,
  notificationsOptIn: false,
  weatherAlertOfferShown: false,
  morningBriefingOptIn: false,
  analyticsConsent: 'granted',
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
};

async function renderSettings(language: SupportedLanguage) {
  const noop = async () => undefined;
  return render(
    <LocalizationContext value={{ language, messages: messages[language], hour12: false }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <SettingsScreen
            isSaving={false}
            notificationsOn={false}
            onAppearanceChange={noop}
            onDressStyleChange={noop}
            onGenderChange={noop}
            onLanguageChange={noop}
            onMorningSheetEnabledChange={noop}
            onNameChange={noop}
            onOpenBirthDate={jest.fn()}
            onOpenEasierToSee={jest.fn()}
            onOpenLicence={jest.fn()}
            onOpenNotifications={jest.fn()}
            onOpenPrivacy={jest.fn()}
            onOpenServiceProviders={jest.fn()}
            onOpenSupport={jest.fn()}
            onRate={jest.fn()}
            onShare={jest.fn()}
            onStyleAestheticsChange={noop}
            onTemperatureUnitChange={noop}
            onWindSpeedUnitChange={noop}
            profile={{ ...profile, languagePreference: language }}
            showRate={false}
          />
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext>,
  );
}

test.each([
  ['tr', '14 Mart 1994'],
  ['en', '14 March 1994'],
] as const)('the stored birth date row reads in the %s long date form', async (language, expected) => {
  const result = await renderSettings(language);

  expect(result.getByText(expected)).toBeOnTheScreen();
});
