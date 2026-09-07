import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Dimensions, StyleSheet } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { ListRow, ListRowGroup } from '@/components/ui/list-row';
import { darkTheme, lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

function TestProviders({ children }: PropsWithChildren) {
  return <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>;
}

function DarkTestProviders({ children }: PropsWithChildren) {
  return <KuyaraThemeContext.Provider value={darkTheme}>{children}</KuyaraThemeContext.Provider>;
}

const locationGlyph = ({ color, size }: { color: string; size: number }) => (
  <Icon color={color} name="location" size={size} />
);

const originalWindowDimensions = Dimensions.get('window');

// `useWindowDimensions` seeds its initial state from `Dimensions.get('window')`, so
// setting it before render, the way `react-native`'s own test utilities do, is what
// actually reaches the hook; a jest.spyOn of the exported hook function does not.
function mockFontScale(fontScale: number) {
  Dimensions.set({ window: { ...originalWindowDimensions, fontScale } });
}

afterEach(() => {
  Dimensions.set({ window: originalWindowDimensions });
});

test('renders the tile, glyph, and separator geometry from ADR 0028 section 2 at the default text size', async () => {
  mockFontScale(1);

  const result = await render(
    <TestProviders>
      <ListRowGroup testID="group">
        <ListRow glyph={locationGlyph} label="Wanted" onPress={() => {}} testID="row-1" value="3" />
        <ListRow glyph={locationGlyph} label="Location" testID="row-2" />
      </ListRowGroup>
    </TestProviders>,
  );

  const tileStyle = StyleSheet.flatten(result.getByTestId('row-1-tile').props.style);
  const separatorStyle = StyleSheet.flatten(
    result.getByTestId('group-separator-0').props.style,
  );

  expect(tileStyle.width).toBe(28);
  expect(tileStyle.height).toBe(28);
  expect(tileStyle.borderRadius).toBe(7);
  expect(separatorStyle.marginStart).toBe(56);
  expect(result.getByTestId('row-1-value-inline')).toBeTruthy();
  expect(result.queryByTestId('row-1-value-stacked')).toBeNull();
});

test('at exactly fontScale 1.5 the controls reach their cap while the value stays on the label line', async () => {
  mockFontScale(1.5);

  const result = await render(
    <TestProviders>
      <ListRowGroup testID="group">
        <ListRow glyph={locationGlyph} label="Wanted" onPress={() => {}} testID="row-1" value="3" />
        <ListRow glyph={locationGlyph} label="Location" testID="row-2" />
      </ListRowGroup>
    </TestProviders>,
  );

  const tileStyle = StyleSheet.flatten(result.getByTestId('row-1-tile').props.style);
  const separatorStyle = StyleSheet.flatten(result.getByTestId('group-separator-0').props.style);

  expect(tileStyle.width).toBe(42);
  expect(separatorStyle.marginStart).toBe(70);
  expect(result.getByTestId('row-1-value-inline')).toBeTruthy();
  expect(result.queryByTestId('row-1-value-stacked')).toBeNull();
});

test('scales the tile, glyph, and separator to the ADR 0028 section 3 values at the largest accessibility size and stacks the value', async () => {
  mockFontScale(3.12);

  const result = await render(
    <TestProviders>
      <ListRowGroup testID="group">
        <ListRow glyph={locationGlyph} label="Wanted" onPress={() => {}} testID="row-1" value="3" />
        <ListRow glyph={locationGlyph} label="Location" testID="row-2" />
      </ListRowGroup>
    </TestProviders>,
  );

  const tileStyle = StyleSheet.flatten(result.getByTestId('row-1-tile').props.style);
  const separatorStyle = StyleSheet.flatten(
    result.getByTestId('group-separator-0').props.style,
  );

  expect(tileStyle.width).toBe(42);
  expect(tileStyle.height).toBe(42);
  expect(separatorStyle.marginStart).toBe(70);
  expect(result.queryByTestId('row-1-value-inline')).toBeNull();
  expect(result.getByTestId('row-1-value-stacked')).toBeTruthy();
});

test('a pressable row is a button whose accessible name is the label, plus the value when there is one; a non-pressable row carries no button role', async () => {
  mockFontScale(1);

  const result = await render(
    <TestProviders>
      <ListRow glyph={locationGlyph} label="Wanted" onPress={() => {}} testID="pressable-row" />
      <ListRow glyph={locationGlyph} label="Language" onPress={() => {}} testID="valued-row" value="System" />
      <ListRow glyph={locationGlyph} label="Location" testID="static-row" />
    </TestProviders>,
  );

  const pressableRow = result.getByTestId('pressable-row');
  expect(pressableRow.props.accessibilityRole).toBe('button');
  expect(pressableRow.props.accessibilityLabel).toBe('Wanted');
  expect(result.getByTestId('valued-row').props.accessibilityLabel).toBe('Language, System');

  const staticRow = result.getByTestId('static-row');
  expect(staticRow.props.accessibilityRole).toBeUndefined();
});

test('an explicit accessibilityLabel is passed through rather than assembled from the label and value', async () => {
  mockFontScale(1);

  const result = await render(
    <TestProviders>
      <ListRow
        accessibilityLabel="Wanted, 3 items"
        glyph={locationGlyph}
        label="Wanted"
        onPress={() => {}}
        testID="row"
        value="3"
      />
    </TestProviders>,
  );

  expect(result.getByTestId('row').props.accessibilityLabel).toBe('Wanted, 3 items');
});

test('a kuyara-drawn group is a hairline outline in light and the Night Layer surface step with no border in dark', async () => {
  mockFontScale(1);

  const light = await render(
    <TestProviders>
      <ListRowGroup testID="group">
        <ListRow glyph={locationGlyph} label="Location" testID="row" />
      </ListRowGroup>
    </TestProviders>,
  );
  const lightStyle = StyleSheet.flatten(light.getByTestId('group-group').props.style);

  expect(lightStyle.backgroundColor).toBe('transparent');
  expect(lightStyle.borderWidth).toBe(1);
  expect(lightStyle.borderColor).toBe(lightTheme.colors.borderDefined);

  const dark = await render(
    <DarkTestProviders>
      <ListRowGroup testID="group">
        <ListRow glyph={locationGlyph} label="Location" testID="row" />
      </ListRowGroup>
    </DarkTestProviders>,
  );
  const darkStyle = StyleSheet.flatten(dark.getByTestId('group-group').props.style);

  expect(darkStyle.backgroundColor).toBe(darkTheme.colors.backgroundElevated);
  expect(darkStyle.borderWidth).toBe(0);
});

test('labelWeight renders the label at body by default and bodyStrong when requested, for ADR 0028 section 1\'s Location row', async () => {
  mockFontScale(1);

  const result = await render(
    <TestProviders>
      <ListRow glyph={locationGlyph} label="Wanted" testID="default-row" />
      <ListRow glyph={locationGlyph} label="Istanbul" labelWeight="bodyStrong" testID="strong-row" />
    </TestProviders>,
  );

  const defaultLabel = StyleSheet.flatten(
    result.getByText('Wanted').props.style,
  );
  const strongLabel = StyleSheet.flatten(
    result.getByText('Istanbul').props.style,
  );

  expect(defaultLabel.fontWeight).toBe(lightTheme.typography.body.fontWeight);
  expect(strongLabel.fontWeight).toBe(lightTheme.typography.bodyStrong.fontWeight);
  expect(strongLabel.fontSize).toBe(lightTheme.typography.bodyStrong.fontSize);
});

test('the group heading is sentence case bodyStrong in textSecondary and exposes heading semantics', async () => {
  mockFontScale(1);

  const result = await render(
    <TestProviders>
      <ListRowGroup heading="Wanted" testID="group">
        <ListRow glyph={locationGlyph} label="Location" testID="row" />
      </ListRowGroup>
    </TestProviders>,
  );

  const heading = result.getByRole('header');
  const headingStyle = StyleSheet.flatten(heading.props.style);

  expect(heading.props.children).toBe('Wanted');
  expect(headingStyle.color).toBe(lightTheme.colors.textSecondary);
  expect(headingStyle.fontWeight).toBe(lightTheme.typography.bodyStrong.fontWeight);
  expect(headingStyle.fontSize).toBe(lightTheme.typography.bodyStrong.fontSize);
});
