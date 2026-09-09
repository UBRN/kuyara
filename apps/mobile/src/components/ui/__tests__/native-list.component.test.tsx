import { fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Dimensions, View as RNView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  NativeList,
  NativeListSection,
  NativeListRow,
} from '@/components/ui/native-list';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));

jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

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

function mockFontScale(fontScale: number) {
  Dimensions.set({ window: { ...originalWindowDimensions, fontScale } });
}

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
  expect(result.getByRole('header', { name: 'About you' })).toHaveStyle({
    color: lightTheme.colors.textSecondary,
    paddingLeft: 16,
  });
  expect(result.getByText('Catalog selection')).toBeOnTheScreen();
  expect(result.getByText('Choose a catalog')).toBeOnTheScreen();
});
