import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NameSheet } from '@/features/profile/presentation/name-sheet';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
const mockSheetSnapPoints = jest.fn();
jest.mock('@expo/ui/community/bottom-sheet', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    BottomSheet: ({ children, index, snapPoints }: {
      children: React.ReactNode; index: number; snapPoints?: readonly string[];
    }) => {
      mockSheetSnapPoints(snapPoints);
      return index >= 0 ? React.createElement(View, null, children) : null;
    },
  };
});

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

test('the editor is a content-sized sheet: Cancel and Done in its bar, the field focused', async () => {
  const screen = await renderSheet('edit', 'Utku');

  expect(mockSheetSnapPoints).toHaveBeenLastCalledWith(undefined);
  expect(screen.getByRole('header', { name: messages.en.profile.nameLabel })).toBeOnTheScreen();
  expect(screen.getByTestId('name-sheet-dismiss')).toHaveAccessibleName(messages.en.profile.nameCancel);
  expect(screen.getByTestId('name-sheet-done')).toHaveAccessibleName(messages.en.profile.nameDone);
  expect(screen.getByTestId('name-edit-input').props.autoFocus).toBe(true);
});

test('Remove name is an action that saves no name, shown only when a name exists', async () => {
  const onSave = jest.fn(async () => undefined);
  const screen = await renderSheet('edit', 'Utku', onSave);
  await fireEvent.press(screen.getByTestId('name-sheet-remove'));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(null));

  const empty = await renderSheet('edit', null);
  expect(empty.queryByTestId('name-sheet-remove')).toBeNull();
});

test('Settings Done still clears an emptied name, while invalid values disable Done', async () => {
  const onSave = jest.fn(async () => undefined);
  const screen = await renderSheet('edit', 'Utku', onSave);
  await fireEvent.press(screen.getByTestId('name-edit-input-clear'));
  await fireEvent.press(screen.getByTestId('name-sheet-done'));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
  await fireEvent.changeText(screen.getByTestId('name-edit-input'), 'A');
  expect(screen.getByTestId('name-sheet-done')).toBeDisabled();
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

  expect(screen.getByTestId('name-sheet-dismiss')).toHaveAccessibleName(messages.en.onboarding.nameNotNow);
  await fireEvent.press(screen.getByTestId('name-sheet-dismiss'));

  await waitFor(() => expect(screen.queryByTestId('name-prompt-input')).toBeNull());
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('name-save-error')).toBeNull();
});
