import { act, fireEvent, render, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NotificationsSettingsScreen } from '@/features/profile/presentation/notifications-settings-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
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

function renderScreen(
  handlers: Readonly<{
    onToggle: (optIn: boolean) => Promise<void>;
    onToggleMorningBriefing: (optIn: boolean) => Promise<void>;
  }>,
  language: SupportedLanguage = 'en',
) {
  return render(
    <LocalizationContext value={{ language, messages: messages[language], hour12: false }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <NotificationsSettingsScreen
            blocked={false}
            isBusy={false}
            morningBriefingOptedIn={false}
            onOpenSystemSettings={() => undefined}
            optedIn={false}
            permission={{ kind: 'granted' }}
            {...handlers}
          />
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext>,
  );
}

// A failed write must not escape as an unhandled promise rejection with a silently
// reverting switch: the screen says so in the footer of the group that was touched, with
// the same sentence every other Settings control uses.
test.each([
  ['settings-notifications-toggle-row-toggle', 'settings-notifications-toggle-group'],
  ['settings-morning-briefing-toggle-row-toggle', 'settings-morning-briefing-group'],
] as const)('a rejected %s write shows the save error in its own group', async (toggleId, groupId) => {
  const unhandled = jest.fn();
  process.on('unhandledRejection', unhandled);
  try {
    const failing = jest.fn(async () => {
      throw new Error('disk full');
    });
    const result = await renderScreen({ onToggle: failing, onToggleMorningBriefing: failing });

    await act(async () => {
      fireEvent(await result.findByTestId(toggleId), 'valueChange', true);
    });
    await act(async () => {
      await new Promise<void>((resolve) => setImmediate(() => resolve()));
    });

    expect(failing).toHaveBeenCalledWith(true);
    expect(unhandled).not.toHaveBeenCalled();
    expect(
      within(result.getByTestId(groupId)).getByText(messages.en.settings.saveError),
    ).toBeOnTheScreen();
  } finally {
    process.off('unhandledRejection', unhandled);
  }
});

test('the save error clears on the next successful toggle', async () => {
  let fail = true;
  const onToggle = jest.fn(async () => {
    if (fail) throw new Error('disk full');
  });
  const result = await renderScreen({ onToggle, onToggleMorningBriefing: async () => undefined });
  const toggleId = 'settings-notifications-toggle-row-toggle';

  await act(async () => {
    fireEvent(await result.findByTestId(toggleId), 'valueChange', true);
  });
  expect(result.getByText(messages.en.settings.saveError)).toBeOnTheScreen();

  fail = false;
  await act(async () => {
    fireEvent(result.getByTestId(toggleId), 'valueChange', true);
  });
  expect(result.queryByText(messages.en.settings.saveError)).toBeNull();
});
