import { act, fireEvent, render, within, type RenderResult } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { composeCatalog, type ComposePiece } from '@/features/today/application/compose-selection';
import { ComposeEntry, ComposeResultLine } from '@/features/today/presentation/compose-entry';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@expo/ui/community/bottom-sheet', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    BottomSheet: ({ children, index }: { children: React.ReactNode; index: number }) =>
      (index >= 0 ? React.createElement(View, { testID: 'sheet-host' }, children) : null),
  };
});

const en = messages.en.today.compose;
const tr = messages.tr.today.compose;
const name = (id: string) => messages.en.catalog[`catalog.garment_type.${id}.name` as keyof typeof messages.en.catalog];

// kuyara's pick on a mild day: shirt, trousers, light jacket, loafers.
const pieces: readonly ComposePiece[] = [
  { slot: 'primary_top', garmentTypeId: 'shirt' },
  { slot: 'bottom', garmentTypeId: 'trousers' },
  { slot: 'outer_layer', garmentTypeId: 'light_jacket' },
  { slot: 'footwear', garmentTypeId: 'loafers' },
];

function wrap(element: ReactNode, language: SupportedLanguage) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 59, right: 0, bottom: 34, left: 0 } }}>
      <LocalizationContext.Provider value={{ language, messages: messages[language], hour12: false }}>
        <KuyaraThemeContext.Provider value={lightTheme}>{element}</KuyaraThemeContext.Provider>
      </LocalizationContext.Provider>
    </SafeAreaProvider>
  );
}

type Setup = Readonly<{ accountsOpen?: boolean; isMember?: boolean; language?: SupportedLanguage }>;

async function renderEntry({ accountsOpen = true, isMember = true, language = 'en' }: Setup = {}) {
  const onCompose = jest.fn();
  const onSignIn = jest.fn();
  const screen = await render(wrap(
    <ComposeEntry
      accountsOpen={accountsOpen}
      catalog={composeCatalog('womens')}
      isMember={isMember}
      onCompose={onCompose}
      onSignIn={onSignIn}
      palette={null}
      pieces={pieces}
    />,
    language,
  ));
  return { screen, onCompose, onSignIn };
}

const openSheet = async (screen: RenderResult) => {
  await fireEvent.press(screen.getByTestId('compose-entry-row'));
  return screen.getByTestId('compose-sheet');
};
const tick = (screen: RenderResult, slot: string, id: string) => fireEvent.press(screen.getByTestId(`compose-piece-${slot}-${id}`));

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('the members-only row under "Wore this today"', () => {
  test.each([[true], [false]])('while the account screens are closed it is absent, row and sheet, for a member (%s) or not', async (isMember) => {
    const { screen } = await renderEntry({ accountsOpen: false, isMember });
    expect(screen.queryByTestId('compose-entry-row')).toBeNull();
    expect(screen.queryByText(en.entry)).toBeNull();
    expect(screen.queryByTestId('sheet-host')).toBeNull();
    expect(screen.queryByText(en.title)).toBeNull();
  });

  test('a member sees the plain row, and a tap opens the sheet', async () => {
    const { screen, onSignIn } = await renderEntry();
    const row = screen.getByTestId('compose-entry-row');
    expect(row.props.accessibilityLabel).toBe(en.entry);
    expect(screen.queryByTestId('compose-entry-row-chip')).toBeNull();
    expect(screen.queryByTestId('compose-sheet')).toBeNull();
    await openSheet(screen);
    expect(screen.getByText(en.title)).toBeTruthy();
    expect(screen.getByText(en.subtitle)).toBeTruthy();
    expect(onSignIn).not.toHaveBeenCalled();
  });

  test('a non-member sees it muted but legible with the Members chip, never disabled, and a tap asks for sign-in', async () => {
    const { screen, onSignIn } = await renderEntry({ isMember: false });
    const row = screen.getByTestId('compose-entry-row');
    expect(row.props.accessibilityLabel).toBe(`${en.entry}, ${en.membersChip}`);
    expect(row.props.accessibilityHint).toBe(en.membersHint);
    expect(row.props.accessibilityState?.disabled).toBeFalsy();
    expect(StyleSheet.flatten(screen.getByText(en.entry).props.style).color).toBe(lightTheme.colors.textGated);
    expect(screen.getByTestId('compose-entry-row-chip')).toHaveTextContent(en.membersChip);
    await fireEvent.press(row);
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('compose-sheet')).toBeNull();
  });
});

describe('"What do you want to wear today?"', () => {
  test('lists the outfit\'s pieces unticked, and building waits for a piece', async () => {
    const { screen } = await renderEntry();
    const sheet = await openSheet(screen);
    const rows = within(sheet).getAllByRole('checkbox');
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual(pieces.map(({ slot, garmentTypeId }) =>
      `${name(garmentTypeId)}, ${messages.en.today.slots[slot]}`));
    expect(rows.every((row) => row.props.accessibilityState.checked === false)).toBe(true);
    expect(screen.getByTestId('compose-count')).toHaveTextContent(en.chosenCount(0));
    expect(screen.getByTestId('compose-build')).toBeDisabled();
    expect(screen.queryByTestId('compose-color-primary_top')).toBeNull();
  });

  test('a tick opens the 33 solids for that piece; a colour names itself under the piece', async () => {
    const { screen } = await renderEntry();
    await openSheet(screen);
    await tick(screen, 'primary_top', 'shirt');
    expect(screen.getByTestId('compose-piece-primary_top-shirt').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('compose-count')).toHaveTextContent(en.chosenCount(1));
    const strip = screen.getByTestId('compose-color-primary_top');
    expect(strip.props.accessibilityLabel).toBe(en.colorLabel.primary_top);
    expect(within(strip).getAllByRole('radio')).toHaveLength(33);
    await fireEvent.press(screen.getByTestId('compose-color-primary_top-tomato_red'));
    const tomato = messages.en.wardrobe.colorOptionNames.tomato_red;
    expect(screen.getByTestId('compose-piece-primary_top-shirt').props.accessibilityLabel)
      .toBe(`${name('shirt')}, ${messages.en.today.slots.primary_top} · ${tomato}`);
  });

  test('at three pieces the others say why they wait and ignore a tick', async () => {
    const { screen } = await renderEntry();
    await openSheet(screen);
    await tick(screen, 'primary_top', 'shirt');
    await tick(screen, 'bottom', 'trousers');
    await tick(screen, 'footwear', 'loafers');
    expect(screen.getByTestId('compose-count')).toHaveTextContent(en.chosenCount(3));
    const jacket = screen.getByTestId('compose-piece-outer_layer-light_jacket');
    expect(jacket.props.accessibilityState).toEqual({ checked: false, disabled: true });
    expect(jacket.props.accessibilityHint).toBe(en.limitHint);
    await fireEvent.press(jacket);
    expect(screen.getByTestId('compose-count')).toHaveTextContent(en.chosenCount(3));
    // A ticked piece can still be let go.
    await tick(screen, 'footwear', 'loafers');
    expect(screen.getByTestId('compose-count')).toHaveTextContent(en.chosenCount(2));
  });

  test('"Choose another piece" lists the catalog by slot; a one-piece takes the top and the bottom\'s places', async () => {
    const { screen } = await renderEntry();
    await openSheet(screen);
    await tick(screen, 'primary_top', 'shirt');
    await tick(screen, 'bottom', 'trousers');
    await fireEvent.press(screen.getByTestId('compose-choose-another'));
    const catalog = screen.getByTestId('compose-catalog');
    expect(within(catalog).getByText(messages.en.today.slots.one_piece)).toBeTruthy();
    expect(within(catalog).getByTestId('compose-catalog-mid_layer-sweater')).toBeTruthy();
    expect(within(catalog).getByTestId('compose-catalog-primary_top-shirt').props.accessibilityState.checked).toBe(true);
    await fireEvent.press(within(catalog).getByTestId('compose-catalog-one_piece-dress'));
    // Back on the pieces, with the dress under "Your pieces" and the top and bottom let go.
    expect(screen.queryByTestId('compose-catalog')).toBeNull();
    expect(screen.getByText(en.yourPieces)).toBeTruthy();
    expect(screen.getByTestId('compose-piece-one_piece-dress').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('compose-piece-primary_top-shirt').props.accessibilityState.checked).toBe(false);
    expect(screen.getByTestId('compose-piece-bottom-trousers').props.accessibilityState.checked).toBe(false);
    expect(screen.getByTestId('compose-count')).toHaveTextContent(en.chosenCount(1));
  });

  test('the catalog page goes back without a choice', async () => {
    const { screen } = await renderEntry();
    await openSheet(screen);
    await fireEvent.press(screen.getByTestId('compose-choose-another'));
    await fireEvent.press(screen.getByTestId('compose-catalog-back'));
    expect(screen.getByText(en.title)).toBeTruthy();
  });

  test('"Build the outfit" shows it is busy, composes the pins with their board colours and closes the sheet', async () => {
    const { screen, onCompose } = await renderEntry();
    await openSheet(screen);
    await tick(screen, 'primary_top', 'shirt');
    await fireEvent.press(screen.getByTestId('compose-color-primary_top-tomato_red'));
    await tick(screen, 'footwear', 'loafers');
    await fireEvent.press(screen.getByTestId('compose-build'));
    expect(onCompose).not.toHaveBeenCalled();
    expect(screen.getByTestId('compose-build').props.accessibilityState).toMatchObject({ busy: true });
    await act(async () => { jest.runOnlyPendingTimers(); });
    expect(onCompose).toHaveBeenCalledWith([
      { slot: 'primary_top', garmentTypeId: 'shirt', swatchId: 'tomato' },
      { slot: 'footwear', garmentTypeId: 'loafers' },
    ]);
    expect(screen.queryByTestId('compose-sheet')).toBeNull();
    // The choice stays for the next visit to the sheet.
    await openSheet(screen);
    expect(screen.getByTestId('compose-count')).toHaveTextContent(en.chosenCount(2));
  });

  test('speaks Turkish', async () => {
    const { screen } = await renderEntry({ language: 'tr' });
    expect(screen.getByText(tr.entry)).toBeTruthy();
    await openSheet(screen);
    expect(screen.getByText(tr.title)).toBeTruthy();
    expect(screen.getByText(tr.subtitle)).toBeTruthy();
    expect(screen.getByText(tr.fromOutfit)).toBeTruthy();
    expect(screen.getByText(tr.chooseAnother)).toBeTruthy();
    expect(screen.getByTestId('compose-count')).toHaveTextContent(tr.chosenCount(0));
    expect(screen.getByLabelText(tr.build)).toBeTruthy();
  });
});

describe('the result line under the board', () => {
  async function renderLine(index: number, total: number, language: SupportedLanguage = 'en') {
    const onShowAnother = jest.fn();
    const screen = await render(wrap(<ComposeResultLine index={index} onShowAnother={onShowAnother} total={total} />, language));
    return { screen, onShowAnother };
  }

  test('reads "1 / 3" with Show another, which steps on', async () => {
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const { screen, onShowAnother } = await renderLine(0, 3);
    const position = screen.getByTestId('compose-result-position');
    expect(position).toHaveTextContent('1 / 3');
    expect(position.props.accessibilityLabel).toBe(en.positionAccessibilityLabel(1, 3));
    await fireEvent.press(screen.getByTestId('compose-show-another'));
    expect(onShowAnother).toHaveBeenCalledTimes(1);
    await screen.rerender(wrap(<ComposeResultLine index={1} onShowAnother={onShowAnother} total={3} />, 'en'));
    expect(screen.getByTestId('compose-result-position')).toHaveTextContent('2 / 3');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith(en.positionAccessibilityLabel(2, 3));
  });

  test('fewer are shown honestly, and one outfit has nothing more to show', async () => {
    expect((await renderLine(0, 2)).screen.getByTestId('compose-result-position')).toHaveTextContent('1 / 2');
    const single = await renderLine(0, 1);
    expect(single.screen.getByTestId('compose-result-position')).toHaveTextContent('1 / 1');
    expect(single.screen.queryByTestId('compose-show-another')).toBeNull();
  });

  test('speaks Turkish', async () => {
    const { screen } = await renderLine(0, 3, 'tr');
    expect(screen.getByLabelText(tr.showAnother)).toBeTruthy();
    expect(screen.getByTestId('compose-result-position').props.accessibilityLabel).toBe(tr.positionAccessibilityLabel(1, 3));
  });
});
