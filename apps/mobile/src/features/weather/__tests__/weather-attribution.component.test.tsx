import { fireEvent, isHiddenFromAccessibility, render, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Linking } from 'react-native';

import { WeatherAttribution } from '@/features/weather/presentation/weather-attribution';
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
  ])('names %s in one caption link that opens its attribution page', async (
    sourceId,
    label,
    url,
    host,
  ) => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const result = await render(
      <Providers language={language}><WeatherAttribution sourceId={sourceId} /></Providers>,
    );

    const link = result.getByRole('link', { name: label });
    expect(link).toBeOnTheScreen();
    expect(link.props.accessibilityHint).toBe(copy.attributionHint(host));
    if (sourceId !== 'weatherkit') expect(result.getByText(label)).toBeOnTheScreen();
    await fireEvent.press(link);
    expect(openUrl).toHaveBeenCalledWith(url);
    openUrl.mockRestore();
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

  test('shows the Apple text fallback until its combined mark loads', async () => {
    const result = await render(
      <Providers language={language}><WeatherAttribution sourceId="weatherkit" /></Providers>,
    );
    expect(result.getByText(copy.attributionAppleWeather)).toBeOnTheScreen();
    const mark = await result.findByTestId('weather-attribution-apple-mark', { includeHiddenElements: true });
    fireEvent(mark, 'load');
    await waitFor(() => expect(result.queryByText(copy.attributionAppleWeather)).toBeNull());
    await fireEvent(mark, 'error');
    await waitFor(() => expect(result.getByText(copy.attributionAppleWeather)).toBeOnTheScreen());
  });

  // ADR 0002 section 8: an unrecognized or legacy identifier names no provider at all.
  test.each(['sample', 'kuyara-worker-weather-v1', 'unknown-source'])(
    'renders nothing for the %s source',
    async (sourceId) => {
      const result = await render(
        <Providers language={language}><WeatherAttribution sourceId={sourceId} /></Providers>,
      );

      expect(result.toJSON()).toBeNull();
    },
  );
});
