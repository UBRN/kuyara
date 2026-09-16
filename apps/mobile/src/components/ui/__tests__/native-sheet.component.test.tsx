import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Dimensions, Text } from 'react-native';

import { NativeSheet } from '@/components/ui/native-sheet';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

// ADR 0019: `@expo/ui` renders native views, which do not mount under Jest, so the
// wrapper is tested against a mock that records what the primitive asked the platform
// for and honours the presented/dismissed contract.
const sheetProps: Record<string, unknown>[] = [];

jest.mock('@expo/ui/community/bottom-sheet', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');

  return {
    BottomSheet: ({
      children,
      ...props
    }: PropsWithChildren<Record<string, unknown>>) => {
      sheetProps.push(props);
      return (props.index as number) >= 0
        ? React.createElement(View, { testID: 'sheet-host' }, children)
        : null;
    },
  };
});

const originalWindow = Dimensions.get('window');

afterEach(() => {
  sheetProps.length = 0;
  Dimensions.set({ window: originalWindow });
});

function renderSheet(visible: boolean) {
  return render(
    <KuyaraThemeContext.Provider value={lightTheme}>
      <NativeSheet onDismiss={() => undefined} testID="sheet" visible={visible}>
        <Text>Sheet body</Text>
      </NativeSheet>
    </KuyaraThemeContext.Provider>,
  );
}

test('the sheet mounts its content only while presented and is dismissable by gesture', async () => {
  Dimensions.set({ window: { ...originalWindow, fontScale: 1 } });
  const closed = await renderSheet(false);
  expect(closed.queryByTestId('sheet')).not.toBeOnTheScreen();
  expect(sheetProps.at(-1)).toEqual(
    expect.objectContaining({ enablePanDownToClose: true, index: -1 }),
  );

  const open = await renderSheet(true);
  expect(open.getByTestId('sheet')).toBeOnTheScreen();
  expect(open.getByText('Sheet body')).toBeOnTheScreen();
  expect(sheetProps.at(-1)).toEqual(expect.objectContaining({ index: 0 }));
});

test('the medium detent is dropped above the text-scaling threshold', async () => {
  Dimensions.set({ window: { ...originalWindow, fontScale: 1 } });
  const compact = await renderSheet(true);
  expect(sheetProps.at(-1)?.snapPoints).toEqual(['50%', '100%']);
  await compact.unmount();

  // Above the shared stacking threshold a medium detent shows barely one row, so the
  // sheet opens large and has nowhere smaller to snap back to.
  Dimensions.set({ window: { ...originalWindow, fontScale: 3.12 } });
  await renderSheet(true);
  expect(sheetProps.at(-1)?.snapPoints).toEqual(['100%']);
});
