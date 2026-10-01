import { act, fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { DailyOutlook, type DailyOutlookRow } from '@/features/weather/presentation/daily-outlook';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

function Providers({ children }: PropsWithChildren) {
  return <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>;
}

const row: DailyOutlookRow = {
  key: 'mon',
  accessibilityLabel: 'Monday, rain',
  weekday: 'Monday',
  condition: 'rain',
  precipitation: { line: '12 mm · 80%', lines: '12 mm\n80%' },
  minimum: '12°',
  maximum: '19°',
  minimumCelsius: 12,
  maximumCelsius: 19,
  currentCelsius: null,
};

const layout = (width: number, height = 20) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
const wrapped = { nativeEvent: { lines: [{ text: '12 mm ·' }, { text: '80%' }] } };

async function renderOutlook() {
  const result = await render(<Providers><DailyOutlook rows={[row]} /></Providers>);
  await act(() => fireEvent(result.getByTestId('weather-daily-precipitation-cell'), 'layout', layout(90)));
  return result;
}

test('the precipitation caption stacks when it wraps and tries the one-line form again once its column widens', async () => {
  const result = await renderOutlook();
  const caption = () => result.getByTestId('weather-daily-precipitation');
  const cell = () => result.getByTestId('weather-daily-precipitation-cell');
  expect(caption()).toHaveTextContent('12 mm · 80%');

  await act(() => fireEvent(caption(), 'textLayout', wrapped));
  expect(caption()).toHaveTextContent('12 mm 80%');

  // A column of the same width is no new information, so the stacked form stays.
  await act(() => fireEvent(cell(), 'layout', layout(90, 36)));
  expect(caption()).toHaveTextContent('12 mm 80%');

  await act(() => fireEvent(cell(), 'layout', layout(140)));
  expect(caption()).toHaveTextContent('12 mm · 80%');
});
