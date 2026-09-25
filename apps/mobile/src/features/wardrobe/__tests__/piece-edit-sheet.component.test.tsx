import { fireEvent, render, within } from '@testing-library/react-native';

import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import { PieceEditSheet, type PieceSheetTarget } from '@/features/wardrobe/presentation/piece-edit-sheet';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@expo/ui/community/bottom-sheet', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { BottomSheet: ({ children, index }: { children: React.ReactNode; index: number }) =>
    index >= 0 ? React.createElement(View, null, children) : null };
});

const yours: WardrobeItem = {
  id: 'yours', localProfileId: 'profile-one', name: null, category: 'bottom', entryState: 'owned',
  garmentTypeId: 'jeans', color: null, colorFamily: 'black', thermalLevelOverride: null,
  waterProtectionOverride: null, windProtectionOverride: null, breathabilityOverride: null,
  armCoverageOverride: null, legCoverageOverride: null, tractionSuitabilityOverride: null,
  photoRelativePath: null, createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z', deletedAt: null,
};

// O7: a similar piece opens as a new record beside the user's own one, which the sheet shows
// with its colour; the suggested colour is preselected and Done waits for "Is it yours?".
test('a similar piece is added as a new record, shown beside the user\'s own', async () => {
  const onSave = jest.fn(async () => undefined);
  const target: PieceSheetTarget = {
    garmentTypeId: 'jeans', category: 'bottom', name: 'Jeans', slot: 'Bottom',
    suggestedColorFamily: 'blue', match: { kind: 'similar', item: yours },
  };
  const result = await render(
    <LocalizationContext value={{ language: 'en', messages: messages.en, hour12: false }}>
      <KuyaraThemeContext value={lightTheme}>
        <PieceEditSheet onDiscardStagedPhoto={jest.fn(async () => undefined)} onDismiss={jest.fn()}
          onSave={onSave} onSelectPhoto={jest.fn(async () => null)} resolvePhotoUri={() => null}
          target={target} />
      </KuyaraThemeContext>
    </LocalizationContext>,
  );

  const copy = messages.en;
  expect(result.getByRole('header', { name: copy.wardrobe.pieceSheetAddTitle })).toBeOnTheScreen();
  const similar = within(result.getByTestId('piece-edit-similar'));
  expect(similar.getByText(copy.today.ownershipSimilarLabel)).toBeOnTheScreen();
  expect(result.getByTestId('piece-edit-similar-yours')).toHaveTextContent(
    `${copy.wardrobe.pieceSheetYours}${copy.catalog['catalog.color_family.black']}`);
  expect(result.getByTestId('wardrobe-color-blue').props.accessibilityState.selected).toBe(true);

  await fireEvent.press(result.getByTestId('piece-edit-done'));
  expect(onSave).not.toHaveBeenCalled();
  await fireEvent.press(result.getByTestId('piece-edit-wanted'));
  await fireEvent.press(result.getByTestId('piece-edit-done'));
  expect(onSave).toHaveBeenCalledWith({
    entryState: 'wanted', colorFamily: 'blue', photoChange: { kind: 'unchanged' },
  });
});
