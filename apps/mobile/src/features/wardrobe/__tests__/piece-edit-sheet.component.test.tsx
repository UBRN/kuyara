import { fireEvent, render, within } from '@testing-library/react-native';

import {
  closetColorOptions,
  closetSolidSwatches,
  nearestFamilyForHex,
} from '@/features/wardrobe/domain/closet-color-options';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import { PieceEditSheet, type PieceSheetTarget } from '@/features/wardrobe/presentation/piece-edit-sheet';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
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

// The system colour well is the `components/ui` wrapper's business (its own suite drives the
// SwiftUI picker); here a press stands in for the user picking `mockPickedHex` in it.
let mockPickedHex = '#3C8D2F';
jest.mock('@/components/ui/native-color-well', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Pressable } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    NativeColorWell: (props: {
      accessibilityLabel: string; accessibilityValue?: string; disabled?: boolean; selected: boolean;
      value: string | null; onChange: (hex: string) => void; testID: string;
    }) => React.createElement(Pressable, {
      accessibilityLabel: props.accessibilityLabel,
      accessibilityRole: 'radio',
      accessibilityState: { disabled: props.disabled, selected: props.selected },
      accessibilityValue: { text: props.accessibilityValue },
      onPress: () => props.onChange(mockPickedHex),
      testID: props.testID,
      ...{ value: props.value },
    }),
  };
});

const hidden = { includeHiddenElements: true };

const yours: WardrobeItem = {
  id: 'yours', localProfileId: 'profile-one', name: null, category: 'bottom', entryState: 'owned',
  garmentTypeId: 'jeans', color: null, colorFamily: 'black', thermalLevelOverride: null,
  waterProtectionOverride: null, windProtectionOverride: null, breathabilityOverride: null,
  armCoverageOverride: null, legCoverageOverride: null, tractionSuitabilityOverride: null,
  photoRelativePath: null, createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z', deletedAt: null,
};

function renderSheet(target: PieceSheetTarget, onSave = jest.fn(async () => undefined), language: SupportedLanguage = 'en') {
  return render(
    <LocalizationContext value={{ language, messages: messages[language], hour12: false }}>
      <KuyaraThemeContext value={lightTheme}>
        <PieceEditSheet onDiscardStagedPhoto={jest.fn(async () => undefined)} onDismiss={jest.fn()}
          onSave={onSave} onSelectPhoto={jest.fn(async () => null)} resolvePhotoUri={() => null}
          target={target} />
      </KuyaraThemeContext>
    </LocalizationContext>,
  );
}

const selectedIds = (result: Awaited<ReturnType<typeof render>>) => result
  .getAllByRole('radio')
  .filter((radio) => radio.props.accessibilityState?.selected)
  .map((radio) => radio.props.testID as string);

// A pattern paints the drawing's main fill with a repeat: some path refers to a paint server.
type HostNode = { type: unknown; props: Record<string, unknown>; children: readonly (HostNode | string)[] };
function drawsPattern(node: unknown): boolean {
  const host = node as HostNode;
  const fill = host.props?.fill as { brushRef?: string } | undefined;
  if (typeof fill === 'object' && fill?.brushRef != null && String(host.type).includes('Path')) return true;
  return (host.children ?? []).some((child) => typeof child !== 'string' && drawsPattern(child));
}

// O7: a similar piece opens as a new record beside the user's own one, which the sheet shows
// with its colour; the suggested family is preselected and Done waits for "Is it yours?".
test('a similar piece is added as a new record, shown beside the user\'s own', async () => {
  const onSave = jest.fn(async () => undefined);
  const target: PieceSheetTarget = {
    garmentTypeId: 'jeans', category: 'bottom', name: 'Jeans', slot: 'Bottom',
    suggestedColorFamily: 'blue', match: { kind: 'similar', item: yours },
  };
  const result = await renderSheet(target, onSave);

  const copy = messages.en;
  expect(result.getByRole('header', { name: copy.wardrobe.pieceSheetAddTitle })).toBeOnTheScreen();
  const similar = within(result.getByTestId('piece-edit-similar'));
  expect(similar.getByText(copy.today.ownershipSimilarLabel)).toBeOnTheScreen();
  expect(result.getByTestId('piece-edit-similar-yours')).toHaveTextContent(
    `${copy.wardrobe.pieceSheetYours}${copy.catalog['catalog.color_family.black']}`);
  // The suggested family carries no palette shade: it is named and drawn, and no swatch is.
  expect(result.getByTestId('piece-edit-color-name')).toHaveTextContent(copy.catalog['catalog.color_family.blue']);
  expect(selectedIds(result)).toEqual([]);

  await fireEvent.press(result.getByTestId('piece-edit-done'));
  expect(onSave).not.toHaveBeenCalled();
  await fireEvent.press(result.getByTestId('piece-edit-wanted'));
  await fireEvent.press(result.getByTestId('piece-edit-done'));
  expect(onSave).toHaveBeenCalledWith({
    entryState: 'wanted', colorFamily: 'blue', photoChange: { kind: 'unchanged' },
  });
  expect(onSave.mock.calls[0]).not.toHaveProperty('0.colorChoice');
});

// O8: the adopted palette. 33 solids in the approved order then the colour well, 14 fixed
// two-colour and pattern options, each a radio named in the app's language, and one choice
// at a time across both grids and the custom colour.
test.each(['en', 'tr'] as const)('the %s palette offers every option once, by name, as radios', async (language) => {
  const target: PieceSheetTarget = {
    garmentTypeId: 't_shirt', category: 'top', name: 'T-shirt', slot: 'Top',
    suggestedColorFamily: null, match: { kind: 'none' },
  };
  const result = await renderSheet(target, undefined, language);
  const copy = messages[language].wardrobe;

  const solids = within(result.getByLabelText(copy.solidColorsLabel));
  expect(result.getByLabelText(copy.solidColorsLabel)).toHaveProp('accessibilityRole', 'radiogroup');
  expect(solids.getAllByRole('radio').map((radio) => radio.props.testID)).toEqual([
    ...closetSolidSwatches.map(({ id }) => `wardrobe-color-${id}`), 'wardrobe-color-custom',
  ]);
  expect(solids.getAllByRole('radio').map((radio) => radio.props.accessibilityLabel)).toEqual([
    ...closetSolidSwatches.map(({ id }) => copy.colorOptionNames[id]), copy.moreColorsLabel,
  ]);
  const patterns = within(result.getByLabelText(copy.patternColorsLabel));
  expect(patterns.getAllByRole('radio').map((radio) => radio.props.accessibilityLabel))
    .toEqual(closetColorOptions.map(({ id }) => copy.colorOptionNames[id]));
  expect(result.getByText(copy.solidColorsLabel)).toBeOnTheScreen();
  expect(result.getByText(copy.patternColorsLabel)).toBeOnTheScreen();
});

test('every palette option has an English and a Turkish name, and nothing else does', () => {
  const ids = [...closetSolidSwatches, ...closetColorOptions].map(({ id }) => id).sort();
  expect(ids).toHaveLength(47);
  for (const language of ['en', 'tr'] as const) {
    const names = messages[language].wardrobe.colorOptionNames;
    expect(Object.keys(names).sort()).toEqual(ids);
    expect(new Set(Object.values(names)).size).toBe(47);
  }
  expect(messages.tr.wardrobe.colorOptionNames.blue_gingham).toBe('Mavi pötikare');
  expect(messages.en.wardrobe.colorOptionNames.light_wash_denim).toBe('Light-wash denim');
});

test('one choice at a time across the solids, the options and the custom colour, drawn on the piece', async () => {
  const onSave = jest.fn(async () => undefined);
  const target: PieceSheetTarget = {
    garmentTypeId: 't_shirt', category: 'top', name: 'T-shirt', slot: 'Top',
    suggestedColorFamily: 'white', match: { kind: 'none' },
  };
  const result = await renderSheet(target, onSave);
  const copy = messages.en.wardrobe;
  const hero = () => result.getByTestId('piece-edit-silhouette', hidden);

  await fireEvent.press(result.getByTestId('wardrobe-color-navy'));
  expect(selectedIds(result)).toEqual(['wardrobe-color-navy']);
  expect(result.getByTestId('piece-edit-color-name')).toHaveTextContent(copy.colorOptionNames.navy);
  expect(drawsPattern(hero())).toBe(false);
  // The selected disc carries a check, so the ring's colour is not the only signal.
  expect(result.getByTestId('wardrobe-color-navy-disc-check', hidden)).toBeOnTheScreen();
  expect(result.queryByTestId('wardrobe-color-white-disc-check', hidden)).toBeNull();

  await fireEvent.press(result.getByTestId('wardrobe-color-blue_gingham'));
  expect(selectedIds(result)).toEqual(['wardrobe-color-blue_gingham']);
  expect(result.getByTestId('piece-edit-color-name')).toHaveTextContent(copy.colorOptionNames.blue_gingham);
  expect(drawsPattern(hero())).toBe(true);

  mockPickedHex = '#3C8D2F';
  await fireEvent.press(result.getByTestId('wardrobe-color-custom'));
  expect(selectedIds(result)).toEqual(['wardrobe-color-custom']);
  const family = nearestFamilyForHex('#3C8D2F');
  const familyName = messages.en.catalog[`catalog.color_family.${family}`];
  expect(result.getByTestId('wardrobe-color-custom')).toHaveProp('value', '#3C8D2F');
  expect(result.getByTestId('wardrobe-color-custom')).toHaveAccessibilityValue({ text: familyName });
  expect(result.getByTestId('piece-edit-color-name')).toHaveTextContent(familyName);
  expect(drawsPattern(hero())).toBe(false);

  await fireEvent.press(result.getByTestId('piece-edit-owned'));
  await fireEvent.press(result.getByTestId('piece-edit-done'));
  expect(onSave).toHaveBeenCalledWith({
    entryState: 'owned', colorFamily: family, colorChoice: { kind: 'custom', hex: '#3C8D2F' },
    photoChange: { kind: 'unchanged' },
  });
});

// An owned record keeps its stored choice unless the user picks another one: Done with an
// untouched colour sends no choice, so the repository keeps what is stored.
test('an owned record opens on its stored choice and an untouched colour sends none', async () => {
  const onSave = jest.fn(async () => undefined);
  const record: WardrobeItem = { ...yours, colorFamily: 'white', colorChoice: { kind: 'option', id: 'navy_stripes' } };
  const target: PieceSheetTarget = {
    garmentTypeId: 'jeans', category: 'bottom', name: 'Jeans', slot: 'Bottom',
    suggestedColorFamily: 'white', match: { kind: 'owned', item: record },
  };
  const result = await renderSheet(target, onSave);
  expect(selectedIds(result)).toEqual(['piece-edit-owned', 'wardrobe-color-navy_stripes']);
  expect(result.getByTestId('piece-edit-color-name')).toHaveTextContent(
    messages.en.wardrobe.colorOptionNames.navy_stripes);
  expect(drawsPattern(result.getByTestId('piece-edit-silhouette', hidden))).toBe(true);

  await fireEvent.press(result.getByTestId('piece-edit-wanted'));
  await fireEvent.press(result.getByTestId('piece-edit-done'));
  expect(onSave).toHaveBeenCalledWith({
    entryState: 'wanted', colorFamily: 'white', photoChange: { kind: 'unchanged' },
  });
  expect(onSave.mock.calls[0]).not.toHaveProperty('0.colorChoice');
});

// A record saved before build 16 has only a family: it is named and drawn in it, no swatch is
// selected, and it saves without a choice.
test('a legacy family-only record keeps its family', async () => {
  const onSave = jest.fn(async () => undefined);
  const target: PieceSheetTarget = {
    garmentTypeId: 'jeans', category: 'bottom', name: 'Jeans', slot: 'Bottom',
    suggestedColorFamily: 'black', match: { kind: 'owned', item: yours },
  };
  const result = await renderSheet(target, onSave);
  expect(result.getByTestId('piece-edit-color-name')).toHaveTextContent(
    messages.en.catalog['catalog.color_family.black']);
  expect(selectedIds(result)).toEqual(['piece-edit-owned']);
  await fireEvent.press(result.getByTestId('piece-edit-done'));
  expect(onSave).toHaveBeenCalledWith({
    entryState: 'owned', colorFamily: 'black', photoChange: { kind: 'unchanged' },
  });
});

// O8: the similar card's "Yours" draws the user's own piece in its saved pattern and names it.
test('the similar card draws and names the user\'s own pattern', async () => {
  const record: WardrobeItem = { ...yours, colorFamily: 'red', colorChoice: { kind: 'option', id: 'tartan' } };
  const target: PieceSheetTarget = {
    garmentTypeId: 'jeans', category: 'bottom', name: 'Jeans', slot: 'Bottom',
    suggestedColorFamily: 'blue', match: { kind: 'similar', item: record },
  };
  const result = await renderSheet(target);
  const copy = messages.en.wardrobe;
  expect(result.getByTestId('piece-edit-similar-yours')).toHaveTextContent(
    `${copy.pieceSheetYours}${copy.colorOptionNames.tartan}`);
  expect(drawsPattern(result.getByTestId('piece-edit-similar-yours-silhouette', hidden))).toBe(true);
  expect(drawsPattern(result.getByTestId('piece-edit-similar-suggested-silhouette', hidden))).toBe(false);
});

// O8 follow-up 2 and 5: the two grids are radio groups named by their headings, which are
// headers; the well is one of the solid group's radios, and it is empty again (no colour, not
// selected) once another option replaces the custom colour.
test('the grids are named groups and the well empties when an option replaces the custom colour', async () => {
  const target: PieceSheetTarget = {
    garmentTypeId: 't_shirt', category: 'top', name: 'T-shirt', slot: 'Top',
    suggestedColorFamily: null, match: { kind: 'none' },
  };
  const result = await renderSheet(target);
  const copy = messages.en.wardrobe;
  for (const [label, group] of [[copy.solidColorsLabel, 'solid'], [copy.patternColorsLabel, 'pattern']] as const) {
    expect(result.getByRole('header', { name: label })).toHaveProp('nativeID', `wardrobe-color-${group}-heading`);
    const container = result.getByTestId(`wardrobe-color-${group}-group`);
    expect(container).toHaveProp('accessibilityRole', 'radiogroup');
    expect(container).toHaveProp('accessibilityLabel', label);
    expect(container).toHaveProp('accessibilityLabelledBy', `wardrobe-color-${group}-heading`);
  }
  expect(within(result.getByTestId('wardrobe-color-solid-group'))
    .getByRole('radio', { name: copy.moreColorsLabel })).toBeOnTheScreen();

  mockPickedHex = '#3C8D2F';
  await fireEvent.press(result.getByTestId('wardrobe-color-custom'));
  expect(result.getByTestId('wardrobe-color-custom')).toHaveProp('value', '#3C8D2F');
  await fireEvent.press(result.getByTestId('wardrobe-color-floral'));
  expect(result.getByTestId('wardrobe-color-custom')).toHaveProp('value', null);
  expect(result.getByTestId('wardrobe-color-custom').props.accessibilityState.selected).toBe(false);
  expect(selectedIds(result)).toEqual(['wardrobe-color-floral']);
});
