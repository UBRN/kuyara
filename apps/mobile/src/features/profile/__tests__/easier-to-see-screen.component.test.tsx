import { render, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { EasierToSeeScreen } from '@/features/profile/presentation/easier-to-see-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { EasierToSeeContext, SystemVisibilityContext, type SystemVisibility } from '@/theme/easier-to-see';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};
const originalWindowDimensions = Dimensions.get('window');

afterEach(() => {
  Dimensions.set({ window: originalWindowDimensions });
});

async function renderScreen(
  language: SupportedLanguage,
  system: SystemVisibility,
  enabled = false,
) {
  return render(
    <LocalizationContext value={{ language, messages: messages[language], hour12: false }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <EasierToSeeContext value={enabled}>
            <SystemVisibilityContext value={system}>
              <EasierToSeeScreen enabled={enabled} isSaving={false} onChange={async () => undefined} />
            </SystemVisibilityContext>
          </EasierToSeeContext>
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext>,
  );
}

/** The native row that carries a label: its headline's parent holds the trailing value. */
function rowOf(group: ReturnType<Awaited<ReturnType<typeof render>>['getByTestId']>, label: string) {
  return within(group).getByText(label).parent!;
}

// Renders 04 and 05 (layout A): the preview card, the one switch with its
// footer, then a read-only group naming the three iPhone settings kuyara follows with their
// state and a footer saying where to change them. kuyara never changes them.
test.each(['en', 'tr'] as const)('%s names the iPhone settings kuyara follows and their state', async (language) => {
  Dimensions.set({ window: { ...originalWindowDimensions, fontScale: 1.353 } });
  const copy = messages[language].settings.easierToSee;
  const result = await renderScreen(language, { boldText: true, increaseContrast: false });

  const group = result.getByTestId('settings-easier-to-see-system-group');
  expect(within(group).getByText(copy.systemHeading)).toBeOnTheScreen();
  expect(within(group).getByText(copy.systemFooter)).toBeOnTheScreen();
  const rows = [
    ['settings-easier-to-see-larger-text-row', copy.largerText, copy.textSizeLarger],
    ['settings-easier-to-see-bold-text-row', copy.boldText, copy.on],
    ['settings-easier-to-see-increase-contrast-row', copy.increaseContrast, copy.off],
  ] as const;
  for (const [testID, label, value] of rows) {
    expect(result.getByTestId(testID)).toBeOnTheScreen();
    expect(within(rowOf(group, label)).getByText(value)).toBeOnTheScreen();
  }
  // Read-only: no row in the group is a control.
  expect(within(group).queryAllByRole('button')).toHaveLength(0);
});

test.each([
  [1, 'textSizeDefault'],
  [0.941, 'textSizeSmaller'],
] as const)('at text scale %s the Larger Text row reads %s', async (fontScale, key) => {
  Dimensions.set({ window: { ...originalWindowDimensions, fontScale } });
  const result = await renderScreen('en', { boldText: false, increaseContrast: true });

  const copy = messages.en.settings.easierToSee;
  const group = result.getByTestId('settings-easier-to-see-system-group');
  expect(within(rowOf(group, copy.largerText)).getByText(copy[key])).toBeOnTheScreen();
  expect(within(rowOf(group, copy.increaseContrast)).getByText(copy.on)).toBeOnTheScreen();
});

// Render 05: the preview shows the board beside an outfit name and one
// insight line in Today's roles, so the switch's heavier text shows there too. It is one image
// for assistive tech.
test('the preview card draws the board beside an outfit name and an insight line', async () => {
  Dimensions.set({ window: { ...originalWindowDimensions, fontScale: 1 } });
  const copy = messages.en.settings.easierToSee;
  const off = await renderScreen('en', { boldText: false, increaseContrast: false });
  const preview = off.getByTestId('settings-easier-to-see-preview');
  expect(preview).toHaveProp('accessibilityRole', 'image');
  expect(preview).toHaveProp('accessibilityLabel', copy.previewLabelOff);
  const name = within(preview).getByTestId('settings-easier-to-see-preview-name', { includeHiddenElements: true });
  expect(name).toHaveTextContent(copy.previewOutfitName);
  expect(name).toHaveStyle({ fontWeight: '600' });
  expect(within(preview).getByTestId('settings-easier-to-see-preview-insight', { includeHiddenElements: true }))
    .toHaveTextContent(messages.en.today.dayInsight.sentences.cloudy_day_chilly);
  await off.unmount();

  const on = await renderScreen('en', { boldText: false, increaseContrast: false }, true);
  expect(on.getByTestId('settings-easier-to-see-preview')).toHaveProp('accessibilityLabel', copy.previewLabelOn);
  expect(on.getByTestId('settings-easier-to-see-preview-name', { includeHiddenElements: true }))
    .toHaveStyle({ fontWeight: '700' });
});
