import { useEffect, useState } from 'react';
import { Image, Linking, PixelRatio, Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui';
import { appleWeatherMarkUrl } from '@/features/weather/data/apple-weather-mark';
import { useLocalization } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// The provider-neutral `origin.sourceId` is the only provider identity that crosses the
// mobile API (ADR 0002 section 8). Everything a user reads about the provider is built
// here, from localization keys, so no provider-authored string reaches a screen.
const attributionUrls: Readonly<Record<string, string>> = {
  'open-meteo': 'https://open-meteo.com/',
  openweather: 'https://openweathermap.org/',
  weatherkit: 'https://weatherkit.apple.com/legal-attribution.html',
};

const attributionHosts: Readonly<Record<string, string>> = {
  'open-meteo': 'open-meteo.com',
  openweather: 'openweathermap.org',
  weatherkit: 'weatherkit.apple.com',
};

// OpenWeather's attribution FAQ asks for three things together: the sentence, the link,
// and the logo from its own library. The two files are the library's Master and Negative
// lockups, unmodified, so the wordmark keeps its published colours on either appearance.
const openWeatherLogos = {
  light: require('../../../../assets/attribution/openweather-master.png'),
  dark: require('../../../../assets/attribution/openweather-negative.png'),
} as const;

// The published lockup is 600 x 340 with the artwork inset in its own clear space, so the
// drawn mark is 54% of the box. A 30-point box therefore draws 16 points of ink, which is
// Law 6's icon size for the `caption` line it sits beside.
const LOGO_HEIGHT = 30;
const LOGO_WIDTH = Math.round((LOGO_HEIGHT * 600) / 340);

type WeatherAttributionProps = Readonly<{
  sourceId: string;
  testID?: string;
}>;

export function WeatherAttribution({ sourceId, testID }: WeatherAttributionProps) {
  const { language, messages } = useLocalization();
  const theme = useKuyaraTheme();
  const markKey = `${language}:${theme.isDark}`;
  const [markState, setMarkState] = useState<{ key: string; uri: string; loaded: boolean } | null>(null);
  const appleMark = sourceId === 'weatherkit' && markState?.key === markKey ? markState : null;
  useEffect(() => {
    if (sourceId !== 'weatherkit') return;
    let active = true;
    void appleWeatherMarkUrl(language, theme.isDark, PixelRatio.get())
      .then((uri) => { if (active) setMarkState({ key: markKey, uri, loaded: false }); })
      .catch(() => { if (active) setMarkState(null); });
    return () => { active = false; };
  }, [language, sourceId, theme.isDark, markKey]);
  const copy = messages.weather;
  const labels: Readonly<Record<string, string>> = {
    'open-meteo': copy.attributionOpenMeteo,
    openweather: copy.attributionOpenWeather,
    weatherkit: copy.attributionAppleWeather,
  };
  const label = labels[sourceId] ?? null;
  const url = attributionUrls[sourceId];
  // `sample` and any legacy or unrecognized identifier render nothing rather than
  // inventing a provider (ADR 0002 section 8).
  if (!label || !url) return null;

  return (
    <Pressable
      accessibilityHint={copy.attributionHint(attributionHosts[sourceId])}
      accessibilityLabel={label}
      accessibilityRole="link"
      hitSlop={14}
      onPress={() => {
        void Linking.openURL(url);
      }}
      style={styles.row}
      testID={testID}>
      {sourceId !== 'weatherkit' || !appleMark?.loaded ? (
        <AppText colorRole="textSecondary" variant="caption">{label}</AppText>
      ) : null}
      {sourceId === 'weatherkit' && appleMark ? (
        <Image
          accessibilityElementsHidden
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          onError={() => setMarkState(null)}
          onLoad={() => setMarkState((current) => current?.key === markKey
            ? { ...current, loaded: true } : current)}
          resizeMode="contain"
          source={{ uri: appleMark.uri }}
          style={[styles.appleMark, !appleMark.loaded && styles.hiddenMark]}
          testID="weather-attribution-apple-mark"
        />
      ) : null}
      {sourceId === 'openweather' ? (
        <Image
          accessibilityElementsHidden
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          resizeMode="contain"
          source={theme.isDark ? openWeatherLogos.dark : openWeatherLogos.light}
          style={styles.logo}
          testID="weather-attribution-logo"
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The logo and the sentence it belongs to are one object, so they sit at `xs`; the
  // lockup's own clear space adds the rest of the optical gap.
  row: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  logo: { height: LOGO_HEIGHT, width: LOGO_WIDTH },
  appleMark: { height: 16, width: 112 },
  hiddenMark: { position: 'absolute', opacity: 0 },
});
