import { act, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import { Button } from '@/components/ui/button';
import {
  GarmentBoard,
  layoutGarmentBoard,
  measureGarmentBoardHeight,
  type GarmentBoardPiece,
} from '@/components/ui/garment-board/garment-board';
import type { GarmentOutfitPalette } from '@/components/ui/garment-board/garment-palette';
import { silhouettes } from '@/components/ui/garment-board/silhouettes';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { ListRow } from '@/components/ui/list-row';
import { EasierToSeeContext, SystemVisibilityContext, useSystemVisibility } from '@/theme/easier-to-see';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';
import { KuyaraThemeProvider } from '@/theme/theme-provider';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/components/ui/haptics', () => ({ haptics: { impactLight: jest.fn() } }));

// O13, ADR 0030 section 2: "Easier to see" enlarges the garment board by 1.3 with a 2.8 pt
// outline and enlarges kuyara-drawn targets (primary actions 56, rows 60). Off, nothing moves.
function wrapper(on: boolean) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <KuyaraThemeContext.Provider value={lightTheme}>
        <EasierToSeeContext value={on}>{children}</EasierToSeeContext>
      </KuyaraThemeContext.Provider>
    );
  };
}

const pieces: readonly GarmentBoardPiece[] = [
  { slot: 'primary_top', garmentTypeId: 'shirt', category: 'top' },
  { slot: 'bottom', garmentTypeId: 'trousers', category: 'bottom' },
  { slot: 'outer_layer', garmentTypeId: 'light_jacket', category: 'outerwear' },
  { slot: 'footwear', garmentTypeId: 'ankle_boots', category: 'footwear' },
];
const palette: GarmentOutfitPalette = {
  optionId: 'outfit-a', formality: 'smart', temperatureC: 12, condition: 'cloudy', isNight: false,
  pieces: pieces.map(({ slot, garmentTypeId }) => ({ slot, garmentTypeId })),
};

type Rendered = Awaited<ReturnType<typeof render>>;

/** The shirt's outline stroke width, in the drawing units the board paints it in. */
function shirtOutlineWidth(result: Rendered): number {
  const outline = silhouettes['g-shirt'].groups[0].outline;
  const [width] = result.container
    .queryAll((node) => node.props.d === outline && typeof node.props.strokeWidth === 'number'
      && node.props.strokeOpacity == null)
    .map((node) => node.props.strokeWidth as number);
  return width;
}

describe.each(['today', 'detail'] as const)('the %s board', (preset) => {
  test('draws every piece 1.3 times larger with a 2.8 pt outline while Easier to see is on', async () => {
    const offLayout = layoutGarmentBoard(pieces, 349, preset);
    const onLayout = layoutGarmentBoard(pieces, 349, preset, true);
    onLayout.boxes.forEach((box, index) => {
      expect(box.width / offLayout.boxes[index].width).toBeCloseTo(1.3, 5);
      expect(box.height / offLayout.boxes[index].height).toBeCloseTo(1.3, 5);
    });
    expect(onLayout.height).toBeGreaterThan(offLayout.height);

    const board = <GarmentBoard accessibilityLabel="Outfit" palette={palette} pieces={pieces} preset={preset} width={349} />;
    const off = await render(board, { wrapper: wrapper(false) });
    const offWidth = shirtOutlineWidth(off);
    await off.unmount();
    const on = await render(board, { wrapper: wrapper(true) });
    // A stroke is authored in points and divided by the drawing's own scale, so the ratio
    // of the drawn widths is the ratio of the outlines over the ratio of the scales.
    expect(shirtOutlineWidth(on) / offWidth).toBeCloseTo((2.8 / 1.9) / 1.3, 5);
    expect(on.getByRole('image')).toHaveProp('height', measureGarmentBoardHeight(pieces, 349, preset, false, true));
  });
});

test.each([
  ['large', 50],
  ['medium', 44],
  ['small', 36],
] as const)('a %s button is a 56 pt target only while Easier to see is on', async (size, height) => {
  const button = <Button label="Ask the stylist again" onPress={() => undefined} size={size} testID="button" />;
  const off = await render(button, { wrapper: wrapper(false) });
  expect(StyleSheet.flatten(off.getByTestId('button').props.style).minHeight).toBe(height);
  await off.unmount();
  const on = await render(button, { wrapper: wrapper(true) });
  expect(StyleSheet.flatten(on.getByTestId('button').props.style).minHeight).toBe(56);
  expect(on.getByTestId('button')).toHaveProp('hitSlop', 0);
});

test('a kuyara-drawn row is 60 pt tall only while Easier to see is on', async () => {
  const row = (
    <ListRow
      glyph={({ color, size }) => <Icon color={color} name="clothing" size={size} />}
      label="Closet"
      onPress={() => undefined}
      testID="row"
    />
  );
  const off = await render(row, { wrapper: wrapper(false) });
  expect(StyleSheet.flatten(off.getByTestId('row').props.style).minHeight).toBe(44);
  await off.unmount();
  const on = await render(row, { wrapper: wrapper(true) });
  expect(StyleSheet.flatten(on.getByTestId('row').props.style).minHeight).toBe(60);
});

// Heavier text follows the switch or iOS Bold Text; higher contrast follows
// the switch or iOS Increase Contrast, so secondary text reads in the primary ink.
test.each([
  ['the switch', true, { boldText: false, increaseContrast: false }],
  ['Bold Text and Increase Contrast', false, { boldText: true, increaseContrast: true }],
] as const)('%s: text is heavier and secondary text primary', async (_name, on, system) => {
  const text = <AppText colorRole="textSecondary" testID="text" variant="caption">Last updated 09:41</AppText>;
  const off = await render(text, { wrapper: wrapper(false) });
  expect(StyleSheet.flatten(off.getByTestId('text').props.style)).toMatchObject({
    color: lightTheme.colors.textSecondary, fontSize: 13, fontWeight: '400',
  });
  await off.unmount();
  const onResult = await render(
    <KuyaraThemeContext.Provider value={lightTheme}>
      <EasierToSeeContext value={on}>
        <SystemVisibilityContext value={system}>{text}</SystemVisibilityContext>
      </EasierToSeeContext>
    </KuyaraThemeContext.Provider>,
  );
  expect(StyleSheet.flatten(onResult.getByTestId('text').props.style)).toMatchObject({
    color: lightTheme.colors.textPrimary, fontSize: 15, fontWeight: '600',
  });
});

// A button that is not already a dark fill takes the 2-point strong edge
// while higher contrast applies, in its inert ink when disabled; the prominent fill is
// already its own boundary and keeps no edge.
test.each([
  ['tonal', false, { borderColor: lightTheme.colors.borderStrong, borderWidth: 2 }],
  ['plain', false, { borderColor: lightTheme.colors.borderStrong, borderWidth: 2 }],
  ['tonal', true, { borderColor: lightTheme.colors.borderDefined, borderWidth: 2 }],
  ['prominent', false, null],
] as const)('a %s button (disabled %s) takes its strong edge only while Easier to see is on', async (variant, disabled, edge) => {
  const button = <Button disabled={disabled} label="Not now" onPress={() => undefined} testID="button" variant={variant} />;
  const off = await render(button, { wrapper: wrapper(false) });
  expect(StyleSheet.flatten(off.getByTestId('button').props.style).borderWidth).toBeUndefined();
  await off.unmount();
  const on = await render(button, { wrapper: wrapper(true) });
  const style = StyleSheet.flatten(on.getByTestId('button').props.style);
  if (edge) expect(style).toMatchObject(edge);
  else expect(style.borderWidth).toBeUndefined();
});

// "One weight step up" also reaches a weight the caller sets itself, such as Today's 700
// title or the Pill's label; an unknown or already heavy weight is left alone.
test.each([
  ['700', '800'],
  ['600', '700'],
  ['800', '800'],
] as const)('heavier text steps a caller weight of %s to %s', async (weight, heavier) => {
  const text = <AppText style={{ fontWeight: weight }} testID="text" variant="title">Today</AppText>;
  const off = await render(text, { wrapper: wrapper(false) });
  expect(StyleSheet.flatten(off.getByTestId('text').props.style).fontWeight).toBe(weight);
  await off.unmount();
  const on = await render(text, { wrapper: wrapper(true) });
  expect(StyleSheet.flatten(on.getByTestId('text').props.style).fontWeight).toBe(heavier);
});

// The provider follows the two iOS settings through their change events. An
// initial read still in flight when a change arrives is older than it, so resolving late it
// must not put the stale value back.
test('a late initial read of Bold Text or Increase Contrast never overwrites a newer change', async () => {
  const handlers = new Map<string, (value: boolean) => void>();
  const listen = jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((event: string, handler: (value: boolean) => void) => {
    handlers.set(event, handler);
    return { remove: jest.fn() };
  }) as unknown as typeof AccessibilityInfo.addEventListener);
  const reads: Record<string, (value: boolean) => void> = {};
  const bold = jest.spyOn(AccessibilityInfo, 'isBoldTextEnabled')
    .mockImplementation(() => new Promise((resolve) => { reads.bold = resolve; }));
  const contrast = jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled')
    .mockImplementation(() => new Promise((resolve) => { reads.contrast = resolve; }));
  let seen = { boldText: false, increaseContrast: false };
  function Probe() {
    seen = useSystemVisibility();
    return null;
  }

  try {
    await render(<KuyaraThemeProvider><Probe /></KuyaraThemeProvider>);
    await act(async () => {
      handlers.get('boldTextChanged')?.(true);
      handlers.get('darkerSystemColorsChanged')?.(false);
    });
    await act(async () => {
      reads.bold(false);
      reads.contrast(true);
    });
    expect(seen).toEqual({ boldText: true, increaseContrast: false });
  } finally {
    listen.mockRestore();
    bold.mockRestore();
    contrast.mockRestore();
  }
});

test('an initial read that resolves before any change sets both settings', async () => {
  const listen = jest.spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation((() => ({ remove: jest.fn() })) as unknown as typeof AccessibilityInfo.addEventListener);
  const bold = jest.spyOn(AccessibilityInfo, 'isBoldTextEnabled').mockResolvedValue(true);
  const contrast = jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true);
  let seen = { boldText: false, increaseContrast: false };
  function Probe() {
    seen = useSystemVisibility();
    return null;
  }

  try {
    await render(<KuyaraThemeProvider><Probe /></KuyaraThemeProvider>);
    await act(async () => undefined);
    expect(seen).toEqual({ boldText: true, increaseContrast: true });
  } finally {
    listen.mockRestore();
    bold.mockRestore();
    contrast.mockRestore();
  }
});
