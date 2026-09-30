import { fireEvent, isHiddenFromAccessibility, render, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Linking, StyleSheet } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { WeatherAttribution, weatherAttributionLink } from '@/features/weather/presentation/weather-attribution';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { darkTheme, lightTheme, type KuyaraTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const masterLogo = require('../../../../assets/attribution/openweather-master.png');
const negativeLogo = require('../../../../assets/attribution/openweather-negative.png');
jest.mock('@/features/weather/data/apple-weather-mark', () => ({
  appleWeatherMarkUrl: jest.fn(async () => 'https://weatherkit.apple.com/mark.png'),
}));

function Providers({
  children,
  language,
  theme = lightTheme,
}: PropsWithChildren<{ language: SupportedLanguage; theme?: KuyaraTheme }>) {
  return (
    <LocalizationContext value={{ language, messages: messages[language], hour12: false }}>
      <KuyaraThemeContext.Provider value={theme}>{children}</KuyaraThemeContext.Provider>
    </LocalizationContext>
  );
}

describe.each(['en', 'tr'] as const)('%s weather attribution', (language) => {
  const copy = messages[language].weather;

  test.each([
    ['open-meteo', copy.attributionOpenMeteo, 'https://open-meteo.com/', 'open-meteo.com'],
    ['openweather', copy.attributionOpenWeather, 'https://openweathermap.org/', 'openweathermap.org'],
    [
      'weatherkit',
      copy.attributionAppleWeather,
      'https://weatherkit.apple.com/legal-attribution.html',
      'weatherkit.apple.com',
    ],
  ])('names %s and gives its row the attribution page to open', async (
    sourceId,
    label,
    url,
    host,
  ) => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const link = weatherAttributionLink(sourceId, copy);
    expect(link).toEqual({ hint: copy.attributionHint(host), label, open: expect.any(Function) });
    link?.open();
    expect(openUrl).toHaveBeenCalledWith(url);
    openUrl.mockRestore();

    // The hosting row owns the press, so the attribution itself is not a second target.
    const result = await render(
      <Providers language={language}><WeatherAttribution sourceId={sourceId} /></Providers>,
    );
    expect(result.getByText(label)).toBeOnTheScreen();
    expect(result.queryByRole('link')).toBeNull();
    expect(result.queryByRole('button')).toBeNull();
  });

  // OpenWeather's attribution FAQ asks for the sentence, the link and the logo together.
  test.each([[lightTheme, masterLogo], [darkTheme, negativeLogo]] as const)(
    'draws the OpenWeather logo for the appearance it is published for',
    async (theme, expectedSource) => {
      const result = await render(
        <Providers language={language} theme={theme}>
          <WeatherAttribution sourceId="openweather" />
        </Providers>,
      );

      const logo = result.getByTestId('weather-attribution-logo', { includeHiddenElements: true });
      expect(logo.props.source).toBe(expectedSource);
      // Law 6: the mark carries no meaning of its own, the adjacent sentence does.
      expect(isHiddenFromAccessibility(logo)).toBe(true);
      expect(result.getByText(copy.attributionOpenWeather)).toBeOnTheScreen();
    },
  );

  test('draws no logo for Open-Meteo', async () => {
    const result = await render(
      <Providers language={language}><WeatherAttribution sourceId="open-meteo" /></Providers>,
    );

    expect(result.queryByTestId('weather-attribution-logo', { includeHiddenElements: true }))
      .toBeNull();
  });

  test('crossfades the Apple caption into its combined mark in one box on the fast role', async () => {
    const withTiming = jest.spyOn(Reanimated, 'withTiming');
    const opacity = (testID: string) => StyleSheet.flatten(
      result.getByTestId(testID, { includeHiddenElements: true }).props.style,
    ).opacity;
    const result = await render(
      <Providers language={language}><WeatherAttribution sourceId="weatherkit" /></Providers>,
    );
    expect(result.getByText(copy.attributionAppleWeather)).toBeOnTheScreen();
    const mark = await result.findByTestId('weather-attribution-apple-mark', { includeHiddenElements: true });
    // Until the mark loads it is drawn at zero opacity under the full caption.
    expect(opacity('weather-attribution-caption')).toBe(1);
    expect(opacity('weather-attribution-apple-mark')).toBe(0);
    // Both layers share one box sized to the larger of the two, so the row keeps its height.
    const box = result.getByTestId('weather-attribution-apple-box', { includeHiddenElements: true });
    expect(StyleSheet.flatten(box.props.style)).toMatchObject({ minHeight: 16, minWidth: 112 });
    expect(box).toContainElement(mark);

    // The mock does not run the timing, so the fade is read from the call it makes: one
    // shared value drives the mark to 1 and the caption to 1 minus it, on the fast role.
    withTiming.mockClear();
    await fireEvent(mark, 'load');
    await waitFor(() => expect(result.queryByText(copy.attributionAppleWeather)).toBeNull());
    expect(withTiming).toHaveBeenCalledWith(1, { duration: lightTheme.motion.fast });

    withTiming.mockClear();
    await fireEvent(mark, 'error');
    await waitFor(() => expect(result.getByText(copy.attributionAppleWeather)).toBeOnTheScreen());
    expect(withTiming).toHaveBeenCalledWith(0, { duration: lightTheme.motion.fast });
    withTiming.mockRestore();
  });

  // ADR 0002 section 8: an unrecognized or legacy identifier names no provider at all.
  test.each(['sample', 'kuyara-worker-weather-v1', 'unknown-source'])(
    'renders nothing for the %s source',
    async (sourceId) => {
      const result = await render(
        <Providers language={language}><WeatherAttribution sourceId={sourceId} /></Providers>,
      );

      expect(result.toJSON()).toBeNull();
      expect(weatherAttributionLink(sourceId, copy)).toBeNull();
    },
  );
});
