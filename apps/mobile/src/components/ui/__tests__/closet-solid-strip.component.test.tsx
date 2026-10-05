import { fireEvent, render, within } from '@testing-library/react-native';

import { ClosetSolidStrip } from '@/components/ui/closet-solid-strip';
import { closetSolidSwatches, type ClosetColorOptionId } from '@/features/wardrobe/domain/closet-color-options';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const names = (id: string) => `name of ${id}`;

async function renderStrip(selectedId: ClosetColorOptionId | null, onSelect = jest.fn()) {
  const result = await render(
    <KuyaraThemeContext.Provider value={lightTheme}>
      <ClosetSolidStrip colorName={names} label="Colour of the top" onSelect={onSelect} selectedId={selectedId}
        testID="strip" />
    </KuyaraThemeContext.Provider>,
  );
  return { result, onSelect };
}

test('one horizontal row of the 33 Closet solids, a radio group named for its piece', async () => {
  const { result } = await renderStrip(null);
  const group = result.getByTestId('strip');
  expect(group.props.accessibilityRole).toBe('radiogroup');
  expect(group.props.accessibilityLabel).toBe('Colour of the top');
  expect(result.getByTestId('strip-scroll').props.horizontal).toBe(true);
  const radios = within(group).getAllByRole('radio');
  expect(radios.map((radio) => radio.props.accessibilityLabel)).toEqual(closetSolidSwatches.map(({ id }) => names(id)));
  expect(radios.every((radio) => !radio.props.accessibilityState.selected)).toBe(true);
});

test('the chosen solid is selected; a tap chooses another and a tap on the chosen one takes it away', async () => {
  const { result, onSelect } = await renderStrip('tomato_red');
  expect(result.getByTestId('strip-tomato_red').props.accessibilityState.selected).toBe(true);
  expect(result.getByTestId('strip-tomato_red-disc-check', { includeHiddenElements: true })).toBeTruthy();
  await fireEvent.press(result.getByTestId('strip-white'));
  expect(onSelect).toHaveBeenLastCalledWith('white');
  await fireEvent.press(result.getByTestId('strip-tomato_red'));
  expect(onSelect).toHaveBeenLastCalledWith(null);
});
