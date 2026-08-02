import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { canonicalTodayScreenState } from '@/features/today/fixtures';
import { TodayScreen } from '@/features/today/presentation/today-screen';
import { lightTheme, spacing } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};

test('loaded Today reserves measured overlay clearance and preserves settings intent', async () => {
  const onOpenSettings = jest.fn();
  const result = await render(
    <KuyaraThemeContext.Provider value={lightTheme}>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <TodayScreen
          language="en"
          onOpenSettings={onOpenSettings}
          state={canonicalTodayScreenState}
        />
      </SafeAreaProvider>
    </KuyaraThemeContext.Provider>,
  );

  await fireEvent(result.getByTestId('today-stretchy-header'), 'layout', {
    nativeEvent: { layout: { height: 179, width: 390, x: 0, y: 0 } },
  });

  const screenStyle = StyleSheet.flatten(
    result.getByTestId('today-screen').props.contentContainerStyle,
  );
  expect(screenStyle.paddingTop).toBe(179 + spacing['2xl']);
  expect(result.getByTestId('today-outfit-list').children).toHaveLength(3);

  await fireEvent.press(result.getByTestId('today-settings-button'));
  expect(onOpenSettings).toHaveBeenCalledTimes(1);
});

test('loading Today keeps its existing feedback layout without the loaded header', async () => {
  const result = await render(
    <KuyaraThemeContext.Provider value={lightTheme}>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <TodayScreen
          language="en"
          onOpenSettings={() => undefined}
          state={{ kind: 'loading' }}
        />
      </SafeAreaProvider>
    </KuyaraThemeContext.Provider>,
  );

  expect(result.getByTestId('today-loading-screen')).toBeOnTheScreen();
  expect(result.queryByTestId('today-stretchy-header')).not.toBeOnTheScreen();
});
