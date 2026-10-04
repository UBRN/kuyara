import { fireEvent, render } from '@testing-library/react-native';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { todayScreenState } from '@/features/today/__tests__/fixtures';
import type { TodayScreenState } from '@/features/today/model';
import { OutfitDetailScreen } from '@/features/today/presentation/outfit-detail-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@expo/ui/community/bottom-sheet', () => ({ BottomSheet: () => null }));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(() => callback(), [callback]),
    Stack: { Toolbar: Object.assign(() => null, { Button: () => null }) },
  };
});

function renderDetail(language: SupportedLanguage, state: TodayScreenState, suggestionId: string, onBack = jest.fn()) {
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
              onBack={onBack}
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

describe.each(['en', 'tr'] as const)('%s outfit detail without an outfit', (language) => {
  const copy = messages[language].today;

  test('an outfit the snapshot no longer offers says so and offers the way back to Today', async () => {
    const onBack = jest.fn();
    const result = await renderDetail(language, todayScreenState as TodayScreenState, 'gone', onBack);
    expect(result.getByRole('header', { name: copy.noOutfitTitle })).toBeOnTheScreen();
    expect(result.getByText(copy.noOutfitBody)).toBeOnTheScreen();
    await fireEvent.press(result.getByRole('button', { name: copy.backToTodayAction }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test('a failed outfit reads its title and body, with the way back to Today', async () => {
    const onBack = jest.fn();
    const result = await renderDetail(language, { kind: 'unavailable' }, 'any', onBack);
    expect(result.getByRole('header', { name: copy.unavailableTitle })).toBeOnTheScreen();
    expect(result.getByText(copy.unavailableBody)).toBeOnTheScreen();
    await fireEvent.press(result.getByRole('button', { name: copy.backToTodayAction }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test('while the outfit is still coming, the body reads and no way back is pressed on it', async () => {
    const result = await renderDetail(language, { kind: 'loading' }, 'any');
    expect(result.getByText(copy.loadingBody)).toBeOnTheScreen();
    expect(result.queryByRole('button', { name: copy.backToTodayAction })).toBeNull();
  });
});
