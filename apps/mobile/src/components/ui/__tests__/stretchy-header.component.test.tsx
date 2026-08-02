import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Text } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { SafeAreaInsetsContext, type EdgeInsets } from 'react-native-safe-area-context';

import {
  resolveStretchyHeaderGeometry,
  StretchyHeader,
} from '@/components/ui/stretchy-header';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

function TestProviders({
  children,
  insets,
}: PropsWithChildren<{ insets: EdgeInsets }>) {
  return (
    <KuyaraThemeContext.Provider value={lightTheme}>
      <SafeAreaInsetsContext.Provider value={insets}>
        {children}
      </SafeAreaInsetsContext.Provider>
    </KuyaraThemeContext.Provider>
  );
}

test.each([
  { offset: 12, expectedScale: 1, expectedRadius: 20 },
  { offset: 0, expectedScale: 1, expectedRadius: 20 },
  { offset: -30, expectedScale: 1.25, expectedRadius: 10 },
  { offset: -60, expectedScale: 1.5, expectedRadius: 0 },
  { offset: -90, expectedScale: 1.5, expectedRadius: 0 },
])(
  'resolves clamped geometry for offset $offset',
  ({ expectedRadius, expectedScale, offset }) => {
    expect(
      resolveStretchyHeaderGeometry({
        compactHeight: 120,
        compactRadius: 20,
        offset,
        topInset: 60,
      }),
    ).toEqual({ borderRadius: expectedRadius, scaleY: expectedScale });
  },
);

test('keeps compact geometry when the top inset is zero', () => {
  expect(
    resolveStretchyHeaderGeometry({
      compactHeight: 120,
      compactRadius: 20,
      offset: -80,
      topInset: 0,
    }),
  ).toEqual({ borderRadius: 20, scaleY: 1 });
});

test('reports safe-area-inclusive layout changes and leaves header children accessible', async () => {
  const onHeightChange = jest.fn();
  const scrollOffset = { get: () => 0, value: 0 } as SharedValue<number>;
  const insets = { top: 59, right: 0, bottom: 34, left: 0 };
  const result = await render(
    <TestProviders insets={insets}>
      <StretchyHeader
        onHeightChange={onHeightChange}
        scrollOffset={scrollOffset}
        testID="test-stretchy-header">
        <Text accessibilityRole="header">Today</Text>
      </StretchyHeader>
    </TestProviders>,
  );

  await fireEvent(result.getByTestId('test-stretchy-header'), 'layout', {
    nativeEvent: { layout: { height: 159, width: 390, x: 0, y: 0 } },
  });
  await fireEvent(result.getByTestId('test-stretchy-header'), 'layout', {
    nativeEvent: { layout: { height: 179, width: 844, x: 0, y: 0 } },
  });

  expect(onHeightChange).toHaveBeenCalledWith(159);
  expect(onHeightChange).toHaveBeenLastCalledWith(179);
  expect(result.getByRole('header', { name: 'Today' })).toBeOnTheScreen();
  expect(result.getByTestId('test-stretchy-header-background').props.pointerEvents).toBe(
    'none',
  );
  expect(result.getByTestId('test-stretchy-header-safe-area-mask')).toHaveStyle({
    backgroundColor: lightTheme.colors.background,
    height: 59,
  });
  expect(result.getByTestId('test-stretchy-header-content').props.style).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ transform: expect.anything() })]),
  );
});

test('recomputes reserved height when the safe-area inset changes', async () => {
  const onHeightChange = jest.fn();
  const scrollOffset = { get: () => 0, value: 0 } as SharedValue<number>;
  const renderHeader = (top: number) => (
    <TestProviders insets={{ top, right: 0, bottom: 0, left: 0 }}>
      <StretchyHeader
        onHeightChange={onHeightChange}
        scrollOffset={scrollOffset}
        testID="rotating-stretchy-header">
        <Text accessibilityRole="header">Wardrobe</Text>
      </StretchyHeader>
    </TestProviders>
  );
  const result = await render(renderHeader(59));

  await fireEvent(result.getByTestId('rotating-stretchy-header'), 'layout', {
    nativeEvent: { layout: { height: 159, width: 390, x: 0, y: 0 } },
  });
  await result.rerender(renderHeader(20));

  await waitFor(() => expect(onHeightChange).toHaveBeenLastCalledWith(120));
});
