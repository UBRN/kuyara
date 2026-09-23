import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NameSheet } from '@/features/profile/presentation/name-sheet';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function renderSheet(
  mode: 'prompt' | 'edit',
  initialName: string | null,
  onSave = jest.fn(async () => undefined),
  onDismiss = jest.fn(async () => undefined),
) {
  return render(
    <LocalizationContext value={{ language: 'en', messages: messages.en, hour12: false }}>
      <KuyaraThemeContext value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <NameSheet initialName={initialName} mode={mode} onDismiss={onDismiss}
            onSave={onSave} visible />
        </SafeAreaProvider>
      </KuyaraThemeContext>
    </LocalizationContext>,
  );
}

test('Settings Done clears an existing name, while invalid values disable Done', async () => {
  const onSave = jest.fn(async () => undefined);
  const screen = await renderSheet('edit', 'Utku', onSave);
  await fireEvent.press(screen.getByTestId('name-edit-input-clear'));
  expect(screen.getByText(messages.en.profile.nameRemoveHint)).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('name-sheet-done'));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
  await fireEvent.changeText(screen.getByTestId('name-edit-input'), 'A');
  expect(screen.getByTestId('name-sheet-done').props.accessibilityState.disabled).toBe(true);
  expect(screen.getByTestId('name-edit-input-error')).toHaveTextContent(messages.en.onboarding.nameShortError);
});

test('a failed edit leaves the saved name active and shows localized feedback', async () => {
  const onSave = jest.fn(async () => { throw new Error('database failed'); });
  const screen = await renderSheet('edit', 'Utku', onSave);
  await fireEvent.changeText(screen.getByTestId('name-edit-input'), 'Deniz');
  await fireEvent.press(screen.getByTestId('name-sheet-done'));
  await waitFor(() => expect(screen.getByTestId('name-save-error')).toHaveTextContent(
    messages.en.profile.nameSaveError,
  ));
  expect(screen.getByTestId('name-edit-input').props.value).toBe('Deniz');
});

test('a failed prompt dismissal closes the sheet without showing an error', async () => {
  const onDismiss = jest.fn(async () => { throw new Error('database failed'); });
  const screen = await renderSheet('prompt', null, undefined, onDismiss);

  await fireEvent.press(screen.getByTestId('name-sheet-dismiss'));

  await waitFor(() => expect(screen.queryByTestId('name-prompt-input')).toBeNull());
  expect(screen.queryByTestId('name-save-error')).toBeNull();
});
