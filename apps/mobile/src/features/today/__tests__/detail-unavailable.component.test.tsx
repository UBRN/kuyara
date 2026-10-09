import { render } from '@testing-library/react-native';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { todayScreenState } from '@/features/today/__tests__/fixtures';
import type { TodayScreenState } from '@/features/today/model';
import { OutfitDetailScreen } from '@/features/today/presentation/outfit-detail-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui/community/bottom-sheet', () => ({ BottomSheet: () => null }));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(() => callback(), [callback]),
    Stack: { Toolbar: Object.assign(() => null, { Button: () => null }) },
  };
});

function renderDetail(language: SupportedLanguage, state: TodayScreenState, suggestionId: string) {
  return render(
    <LocalizationContext value={{ language, messages: messages[language], hour12: false, temperatureUnit: 'celsius' }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 59, right: 0, bottom: 34, left: 0 },
        }}>
          <HeaderHeightContext value={undefined}>
            <OutfitDetailScreen
              language={language}
              onEditPiece={jest.fn()}
              state={state}
              suggestionId={suggestionId}
              wardrobeItems={[]}
            />
          </HeaderHeightContext>
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext>,
  );
}

// O14: the way back is the system's back capsule in the bar; the page itself says what happened.
describe.each(['en', 'tr'] as const)('%s outfit detail without an outfit', (language) => {
  const copy = messages[language].today;

  test('an outfit the snapshot no longer offers says it was replaced', async () => {
    const result = await renderDetail(language, todayScreenState as TodayScreenState, 'gone');
    expect(result.getByRole('header', { name: copy.replacedOutfitTitle })).toBeOnTheScreen();
    expect(result.getByText(copy.replacedOutfitBody)).toBeOnTheScreen();
  });

  test('a failed outfit reads its title and body', async () => {
    const result = await renderDetail(language, { kind: 'unavailable' }, 'any');
    expect(result.getByRole('header', { name: copy.unavailableTitle })).toBeOnTheScreen();
    expect(result.getByText(copy.unavailableBody)).toBeOnTheScreen();
  });

  test('while the outfit is still coming, its body reads under the title', async () => {
    const result = await renderDetail(language, { kind: 'loading' }, 'any');
    expect(result.getByRole('header', { name: copy.loadingTitle })).toBeOnTheScreen();
    expect(result.getByText(copy.loadingBody)).toBeOnTheScreen();
  });
});
