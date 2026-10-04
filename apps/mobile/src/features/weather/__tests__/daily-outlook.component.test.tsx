import { act, fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { processColor, StyleSheet } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { resolveCardFill } from '@/components/ui';
import { DailyOutlook, type DailyOutlookRow } from '@/features/weather/presentation/daily-outlook';
import { temperatureStops } from '@/features/weather/presentation/temperature-gradient';
import { EasierToSeeContext, SystemVisibilityContext } from '@/theme/easier-to-see';
import { darkTheme, type KuyaraTheme, lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

function Providers({
  children,
  easierToSee = false,
  increaseContrast = false,
  theme = lightTheme,
}: PropsWithChildren<{ easierToSee?: boolean; increaseContrast?: boolean; theme?: KuyaraTheme }>) {
  return (
    <KuyaraThemeContext.Provider value={theme}>
      <EasierToSeeContext.Provider value={easierToSee}>
        <SystemVisibilityContext.Provider value={{ boldText: false, increaseContrast }}>
          {children}
        </SystemVisibilityContext.Provider>
      </EasierToSeeContext.Provider>
    </KuyaraThemeContext.Provider>
  );
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

const week: readonly DailyOutlookRow[] = [
  { ...row, key: 'mon', currentCelsius: 14 },
  { ...row, key: 'tue', minimum: '15°', maximum: '24°', minimumCelsius: 15.4, maximumCelsius: 23.6 },
  { ...row, key: 'wed', minimum: '9°', maximum: '9°', minimumCelsius: 9, maximumCelsius: 9 },
];

type Rendered = Awaited<ReturnType<typeof render>>;

async function renderWeek(props: Omit<Parameters<typeof Providers>[0], 'children'> = {}, play = false) {
  const result = await render(<Providers {...props}><DailyOutlook drawIn={play} rows={week} /></Providers>);
  // Each capsule draws its colours at its own measured width.
  for (const capsule of result.getAllByTestId('weather-daily-rail-fill', { includeHiddenElements: true })) {
    await act(() => fireEvent(capsule, 'layout', layout(120, 6)));
  }
  return result;
}

const gradients = (result: Rendered) => result.container.queryAll(
  (node) => node.type === 'RNSVGLinearGradient',
);
const paints = (result: Rendered) => result.getAllByTestId('weather-daily-rail-paint', { includeHiddenElements: true });
const asGradient = (stops: ReturnType<typeof temperatureStops>) => stops.flatMap(
  ({ offset, color }) => [offset, Number(processColor(color)) | 0],
);

test('each capsule is its own stretch of the temperature scale, a stop at every whole degree', async () => {
  const result = await renderWeek();
  const ramp = lightTheme.temperature.standard;

  const [monday, tuesday] = gradients(result);
  expect(monday.props.gradient).toEqual(asGradient(temperatureStops(ramp, 12, 19)));
  expect(monday.props.gradient).toHaveLength(8 * 2);
  expect(tuesday.props.gradient).toEqual(asGradient(temperatureStops(ramp, 15.4, 23.6)));
  expect(paints(result)[0].props.fill).toEqual({ type: 1, brushRef: monday.props.name });
  expect(monday.props.name).not.toBe(tuesday.props.name);
  // A day with no spread has no gradient to draw: it is its one temperature's colour.
  expect(gradients(result)).toHaveLength(2);
  expect(paints(result)[2].props.fill).toEqual({ type: 0, payload: processColor(temperatureStops(ramp, 9, 9)[0].color) });
});

test('higher contrast draws the strong ramp, and the dark appearance its own', async () => {
  const strong = await renderWeek({ increaseContrast: true });
  expect(gradients(strong)[0].props.gradient)
    .toEqual(asGradient(temperatureStops(lightTheme.temperature.strong, 12, 19)));
  await strong.unmount();

  const dark = await renderWeek({ theme: darkTheme });
  expect(gradients(dark)[0].props.gradient)
    .toEqual(asGradient(temperatureStops(darkTheme.temperature.standard, 12, 19)));
});

test('the rail is 6 points with a 10-point dot, and 8 with a 12-point dot when Easier to see is on', async () => {
  const sizes = async (props: Omit<Parameters<typeof Providers>[0], 'children'>) => {
    const result = await renderWeek(props);
    const rail = StyleSheet.flatten(result.getAllByTestId('weather-daily-rail', { includeHiddenElements: true })[0].props.style);
    const marker = StyleSheet.flatten(result.getByTestId('weather-daily-rail-marker', { includeHiddenElements: true }).props.style);
    await result.unmount();
    return { rail: rail.height, dot: Number(marker.width) - 2 * Number(marker.borderWidth), marker };
  };

  // iOS Increase Contrast changes the colours alone; the larger marks follow the switch.
  expect(await sizes({ increaseContrast: true })).toMatchObject({ rail: 6, dot: 10 });
  const easier = await sizes({ easierToSee: true });
  expect(easier).toMatchObject({ rail: 8, dot: 12 });
  // The primary ink, ringed in the card's own fill, centred on the rail.
  expect(easier.marker).toMatchObject({
    backgroundColor: lightTheme.colors.textPrimary,
    borderColor: resolveCardFill(lightTheme),
    borderWidth: 2,
    top: (8 - 16) / 2,
  });
});

test('the dot sits on today\'s row alone, and the row keeps its one spoken sentence', async () => {
  const result = await renderWeek();
  const rows = result.getAllByTestId('weather-daily-row');

  expect(result.getAllByTestId('weather-daily-rail-marker', { includeHiddenElements: true })).toHaveLength(1);
  expect(rows.map((day) => day.props.accessibilityLabel)).toEqual(week.map((day) => day.accessibilityLabel));
  // The graphics stay out of the reading order.
  expect(result.queryByTestId('weather-daily-rail-paint')).toBeNull();
});

test('a capsule is uncovered from its low end rather than stretched, so its colours never squeeze', async () => {
  // The test mock lands every spring at once; hold the landing to read the first frame.
  const withSpring = jest.spyOn(Reanimated, 'withSpring').mockImplementation((toValue) => toValue);
  const result = await renderWeek({}, true);

  const reveals = result.getAllByTestId('weather-daily-rail-reveal', { includeHiddenElements: true });
  expect(reveals).toHaveLength(week.length);
  for (const reveal of reveals) {
    expect(StyleSheet.flatten(reveal.props.style)).toMatchObject({ transform: [{ translateX: -120 }], width: 120 });
  }
  for (const capsule of result.getAllByTestId('weather-daily-rail-fill', { includeHiddenElements: true })) {
    expect(StyleSheet.flatten(capsule.props.style).transform).toBeUndefined();
  }
  withSpring.mockRestore();
});
