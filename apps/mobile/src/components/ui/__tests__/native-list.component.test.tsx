import { act, fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Dimensions, PlatformColor, StyleSheet, View as RNView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  NativeList,
  NativeListSection,
  NativeListRow,
} from '@/components/ui/native-list';
import { EasierToSeeContext } from '@/theme/easier-to-see';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';
import { mockFontScale } from '../../../../test/font-scale';

function TestProviders({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 59, right: 0, bottom: 34, left: 0 } }}>
      <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>
    </SafeAreaProvider>
  );
}

function glyph({ color, size }: Readonly<{ color: string; size: number }>) {
  return <RNView style={{ width: size, height: size, backgroundColor: color }} />;
}

const originalWindowDimensions = Dimensions.get('window');

afterEach(() => {
  Dimensions.set({ window: originalWindowDimensions });
});

test('at fontScale 1 a navigable row keeps its value in trailing with the chevron', async () => {
  mockFontScale(1);
  const onPress = jest.fn();
  const result = await render(
    <TestProviders>
      <NativeList testID="group">
        <NativeListRow label="Language" onPress={onPress} testID="row" value="System" />
      </NativeList>
    </TestProviders>,
  );

  expect(result.getByText('Language')).toBeOnTheScreen();
  expect(result.getByText('System')).toBeOnTheScreen();
  expect(result.getByText('System').props.modifiers).toEqual([
    { $type: 'font', textStyle: 'body' },
    { $type: 'foregroundStyle', style: { type: 'hierarchical', style: 'secondary' } },
  ]);
  expect(result.queryByTestId('row-value-stacked')).toBeNull();
  expect(result.getAllByTestId('expo-ui-icon')).toHaveLength(1);
  expect(result.getByTestId('expo-ui-icon')).toHaveStyle({ backgroundColor: 'tertiaryLabel' });

  fireEvent.press(result.getByTestId('row'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('at exactly fontScale 1.5 a navigable row keeps its value in trailing', async () => {
  mockFontScale(1.5);

  const result = await render(
    <TestProviders>
      <NativeList testID="group">
        <NativeListRow label="Language" onPress={() => {}} testID="row" value="System" />
      </NativeList>
    </TestProviders>,
  );

  expect(result.getByText('System')).toBeOnTheScreen();
  expect(result.queryByTestId('row-value-stacked')).toBeNull();
  expect(result.getAllByTestId('expo-ui-icon')).toHaveLength(1);
});

test('at fontScale 3.118 a navigable row stacks its value and keeps only the chevron trailing', async () => {
  mockFontScale(3.118);

  const result = await render(
    <TestProviders>
      <NativeList testID="group">
        <NativeListRow label="Language" onPress={() => {}} testID="row" value="System" />
      </NativeList>
    </TestProviders>,
  );

  expect(result.getByTestId('row-value-stacked').props.children).toBe('System');
  expect(result.getByTestId('row-value-stacked').props.modifiers).toEqual([
    { $type: 'font', textStyle: 'body' },
    { $type: 'foregroundStyle', style: { type: 'hierarchical', style: 'secondary' } },
  ]);
  expect(result.getAllByText('System')).toHaveLength(1);
  expect(result.getAllByTestId('expo-ui-icon')).toHaveLength(1);
});

test('a value-only row shows no chevron, and a plain informational row shows neither', async () => {
  const result = await render(
    <TestProviders>
      <NativeList testID="group">
        <NativeListRow label="Language" testID="value-only" value="System" />
        <NativeListRow label="Plain" testID="plain" />
      </NativeList>
    </TestProviders>,
  );

  expect(result.queryAllByTestId('expo-ui-icon')).toHaveLength(0);
});

test('an explicit chevron overrides the default for a value-only row', async () => {
  const result = await render(
    <TestProviders>
      <NativeList testID="group">
        <NativeListRow chevron label="Language" testID="row" value="System" />
      </NativeList>
    </TestProviders>,
  );

  expect(result.getAllByTestId('expo-ui-icon')).toHaveLength(1);
});

test('tinted renders the headline in brandPrimary and suppresses the default chevron', async () => {
  const onPress = jest.fn();
  const result = await render(
    <TestProviders>
      <NativeList testID="group">
        <NativeListRow label="Check AI status" onPress={onPress} testID="row" tinted />
      </NativeList>
    </TestProviders>,
  );

  expect(result.getByText('Check AI status').props.style.color).toBe(
    lightTheme.colors.brandPrimary,
  );
  expect(result.getByText('Check AI status').props.modifiers).toEqual([
    { $type: 'font', textStyle: 'body', weight: 'semibold' },
  ]);
  expect(result.queryAllByTestId('expo-ui-icon')).toHaveLength(0);
});

test('secondary renders the headline in the system secondary ink', async () => {
  const result = await render(
    <TestProviders>
      <NativeList testID="group">
        <NativeListRow label="AI responded" secondary testID="row" />
      </NativeList>
    </TestProviders>,
  );

  expect(result.getByText('AI responded').props.style.color).toBe('secondaryLabel');
  expect(result.getByText('AI responded').props.modifiers).toEqual([
    { $type: 'font', textStyle: 'body' },
    { $type: 'foregroundStyle', style: { type: 'hierarchical', style: 'secondary' } },
  ]);
});

test('a selected row receives the native iOS selected trait', async () => {
  const result = await render(
    <TestProviders>
      <NativeList testID="group">
        <NativeListRow label="Istanbul" selected testID="row" />
        <NativeListRow label="Ankara" testID="other-row" />
      </NativeList>
    </TestProviders>,
  );

  expect(result.getByTestId('row').props.modifiers).toEqual([
    { $type: 'accessibilityAddTraits', traits: ['isSelected'] },
  ]);
  expect(result.getByTestId('other-row').props.modifiers).toBeUndefined();
});

test('a toggle row stays unchanged at fontScale 3.118', async () => {
  mockFontScale(3.118);
  const onValueChange = jest.fn();
  const result = await render(
    <TestProviders>
      <NativeList testID="group">
        <NativeListRow
          label="Allow notifications"
          testID="row"
          toggle={{ disabled: true, onValueChange, value: true }}
          value="Ignored"
        />
      </NativeList>
    </TestProviders>,
  );

  const toggle = result.getByTestId('row-toggle');
  expect(toggle).toHaveAccessibleName('Allow notifications');
  expect(toggle.props.value).toBe(true);
  expect(toggle.props.disabled).toBe(true);
  expect(result.queryAllByTestId('expo-ui-icon')).toHaveLength(0);
  expect(result.queryByTestId('row-value-stacked')).toBeNull();
  expect(result.queryByText('Ignored')).toBeNull();

  fireEvent(toggle, 'valueChange', false);
  expect(onValueChange).toHaveBeenCalledWith(false);
});

test('at fontScale 3.118 a stacked value stays before existing supporting text', async () => {
  mockFontScale(3.118);

  const result = await render(
    <TestProviders>
      <NativeList testID="group">
        <NativeListRow
          label="Language"
          supportingText="Choose the app language"
          testID="row"
          value="System"
        />
      </NativeList>
    </TestProviders>,
  );

  expect(result.getByTestId('row-value-stacked').props.children).toBe('System');
  expect(result.getByText('Choose the app language')).toBeOnTheScreen();
});

test('a glyph renders the shared leading tile', async () => {
  const result = await render(
    <TestProviders>
      <NativeList testID="group">
        <NativeListRow glyph={glyph} label="Language" testID="row" />
      </NativeList>
    </TestProviders>,
  );

  expect(result.getByTestId('row')).toBeOnTheScreen();
});

test('sections share one full-height themed host and one inset grouped list', async () => {
  const result = await render(
    <TestProviders>
      <NativeList>
        <NativeListSection><NativeListRow label="Language" /></NativeListSection>
        <NativeListSection heading="About you" footer="Catalog selection">
          <NativeListRow label="Clothing preference" supportingText="Choose a catalog" />
        </NativeListSection>
      </NativeList>
    </TestProviders>,
  );

  expect(result.getAllByTestId('expo-ui-host')).toHaveLength(1);
  expect(result.getByTestId('expo-ui-host')).toHaveStyle({ flex: 1 });
  expect(result.getByTestId('expo-ui-host').props.useViewportSizeMeasurement).toBe(true);
  expect(result.getByTestId('expo-ui-host').props.colorScheme).toBe('light');
  expect(result.getAllByTestId('expo-ui-list')).toHaveLength(1);
  expect(result.getByTestId('expo-ui-list').props.modifiers).toEqual([
    { $type: 'listStyle', style: 'insetGrouped' },
    { $type: 'scrollContentBackground', visible: 'hidden' },
    { $type: 'tint', color: lightTheme.colors.brandPrimary },
  ]);
  expect(result.getAllByTestId('expo-ui-section')).toHaveLength(2);
  const heading = result.getByRole('header', { name: 'About you' });
  expect(heading).toHaveStyle({ color: lightTheme.colors.textSecondary });
  expect(headingFrame(heading)).toHaveStyle({ paddingLeft: 16 });
  expect(result.getByText('Catalog selection')).toBeOnTheScreen();
  expect(result.getByText('Choose a catalog')).toBeOnTheScreen();
});

// `RNHostView matchContents` sizes the host to whatever width its child asks for, so an
// unconstrained heading ran past the list and clipped at the largest accessibility size.
// The heading now owns the list width less one gutter and wraps inside it.
test('a section heading is bound to the list width so it wraps instead of clipping', async () => {
  const result = await render(
    <TestProviders>
      <NativeList>
        <NativeListSection
          heading="Recommendation source and Apple Intelligence status"
          testID="group">
          <NativeListRow label="Language" />
        </NativeListSection>
      </NativeList>
    </TestProviders>,
  );

  const heading = result.getByTestId('group-heading');
  const style = StyleSheet.flatten(headingFrame(heading).props.style);
  expect(style.width).toBe(Dimensions.get('window').width - 16);
  expect(style.paddingLeft).toBe(16);
  expect(heading.props.numberOfLines).toBeUndefined();
});

type HostElement = ReturnType<Awaited<ReturnType<typeof render>>['getByTestId']>;

/** The view the native host sizes itself from: the one it hosts directly. */
function headingFrame(heading: HostElement): HostElement {
  let node: HostElement | null = heading;
  while (node && node.parent?.props.testID !== 'expo-ui-rn-host') node = node.parent;
  if (!node) throw new Error('the heading is not hosted');
  return node;
}

// The native host follows the size of the view it first hosted. A changed text size replaces
// the heading text so it is measured again, so the text sits inside a view that stays: hosted
// directly, the replaced text left the host at the old size and the heading out of place.
test('a changed text size keeps the view the section heading host sizes itself from', async () => {
  mockFontScale(1);
  const result = await render(
    <TestProviders>
      <NativeList>
        <NativeListSection heading="Erişilebilirlik" testID="group">
          <NativeListRow label="Language" />
        </NativeListSection>
      </NativeList>
    </TestProviders>,
  );
  const heading = result.getByTestId('group-heading');
  const frame = headingFrame(heading);

  await act(async () => {
    mockFontScale(1.353);
  });

  const grown = result.getByTestId('group-heading');
  expect(grown).not.toBe(heading);
  expect(headingFrame(grown)).toBe(frame);
});

test('the rating row draws five grey 13-point stars that scale with the text', async () => {
  const result = await render(
    <TestProviders>
      <NativeList testID="group">
        <NativeListRow label="Rate kuyara" onPress={() => {}} ratingStars testID="row" />
      </NativeList>
    </TestProviders>,
  );

  const stars = result.getAllByTestId('expo-ui-image').filter((image) => image.props.systemName === 'star.fill');
  expect(stars).toHaveLength(5);
  for (const star of stars) {
    // `footnote` is 13 points at the default size and grows with Dynamic Type; the ink is
    // the hierarchical secondary style, because an Image `color` cannot name a system colour.
    expect(star.props.modifiers).toEqual([
      { $type: 'font', textStyle: 'footnote' },
      { $type: 'foregroundStyle', style: { type: 'hierarchical', style: 'secondary' } },
      { $type: 'accessibilityHidden', hidden: true },
    ]);
  }
});

test('a row reports its first appearance through the native onAppear modifier', async () => {
  const onAppear = jest.fn();
  const result = await render(
    <TestProviders>
      <NativeList testID="group">
        <NativeListRow label="Service providers" onAppear={onAppear} onPress={() => {}} testID="row" />
      </NativeList>
    </TestProviders>,
  );

  const modifier = (result.getByTestId('row').props.modifiers as { $type: string; handler?: () => void }[])
    .find((entry) => entry.$type === 'onAppear');
  modifier?.handler?.();
  expect(onAppear).toHaveBeenCalledTimes(1);
});

// O13: while "Easier to see" is on the native list changes its text only.
// Labels take one weight step; values, subtitles, footers and the chevron read in the system
// label ink. Row height, separators and the group edge stay the system's.
test('Easier to see makes labels heavier and values, footers and chevrons primary ink', async () => {
  mockFontScale(1);
  const result = await render(
    <TestProviders>
      <EasierToSeeContext value>
        <NativeList testID="group">
          <NativeListSection footer="Footer words" heading="Appearance">
            <NativeListRow label="Language" onPress={() => {}} testID="row" value="System" />
            <NativeListRow label="Support" onPress={() => {}} tinted />
            <NativeListRow label="Morning question" supportingText="Every morning" testID="subtitle-row" />
          </NativeListSection>
        </NativeList>
      </EasierToSeeContext>
    </TestProviders>,
  );

  const primaryInk = [
    { $type: 'font', textStyle: 'body', weight: 'semibold' },
    { $type: 'foregroundStyle', style: PlatformColor('label') },
  ];
  expect(result.getByText('Language').props.modifiers).toEqual([{ $type: 'font', textStyle: 'body', weight: 'semibold' }]);
  expect(result.getByText('System').props.modifiers).toEqual(primaryInk);
  expect(result.getByText('Every morning').props.modifiers).toEqual(primaryInk);
  expect(result.getByText('Support').props.modifiers).toEqual([{ $type: 'font', textStyle: 'body', weight: 'bold' }]);
  expect(result.getByText('Footer words').props.modifiers).toEqual([
    { $type: 'font', textStyle: 'subheadline', weight: 'medium' },
    { $type: 'foregroundStyle', style: PlatformColor('label') },
  ]);
  expect(result.getAllByTestId('expo-ui-icon')[0]).toHaveStyle({ backgroundColor: PlatformColor('label') });
});

test('with Easier to see off the list keeps the system text styles', async () => {
  mockFontScale(1);
  const result = await render(
    <TestProviders>
      <NativeList testID="group">
        <NativeListSection footer="Footer words" heading="Appearance">
          <NativeListRow label="Language" onPress={() => {}} testID="row" value="System" />
        </NativeListSection>
      </NativeList>
    </TestProviders>,
  );

  expect(result.getByText('Language').props.modifiers).toBeUndefined();
  expect(result.getByText('Footer words').props.modifiers).toBeUndefined();
  expect(result.getByTestId('expo-ui-icon')).toHaveStyle({ backgroundColor: 'tertiaryLabel' });
});
