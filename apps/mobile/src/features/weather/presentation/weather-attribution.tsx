import { Image, Linking, Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui';
import { useLocalization } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// The provider-neutral `origin.sourceId` is the only provider identity that crosses the
// mobile API (ADR 0002 section 8). Everything a user reads about the provider is built
// here, from localization keys, so no provider-authored string reaches a screen.
const attributionUrls: Readonly<Record<string, string>> = {
  'open-meteo': 'https://open-meteo.com/',
  openweather: 'https://openweathermap.org/',
  weatherkit: 'https://developer.apple.com/weatherkit/data-source-attribution/',
};

const attributionHosts: Readonly<Record<string, string>> = {
  'open-meteo': 'open-meteo.com',
  openweather: 'openweathermap.org',
  weatherkit: 'developer.apple.com',
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
  const { messages } = useLocalization();
  const theme = useKuyaraTheme();
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
      hitSlop={13}
      onPress={() => {
        void Linking.openURL(url);
      }}
      style={styles.row}
      testID={testID}>
      <AppText colorRole="textSecondary" variant="caption">{label}</AppText>
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
});
