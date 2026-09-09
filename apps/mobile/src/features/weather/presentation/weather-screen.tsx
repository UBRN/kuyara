import { Fragment } from 'react';
import { router } from 'expo-router';
import {
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import {
  AppText,
  Button,
  haptics,
  Icon,
  Pill,
  Screen,
  SectionHeader,
  Surface,
  useRefreshOutcomeHaptics,
  useTextScaling,
} from '@/components/ui';
import { Divider } from '@/components/ui/divider';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import type { ActiveLocation } from '@/features/weather/domain/weather';
import { WeatherGlyph } from '@/features/today/presentation/weather-glyph';
import { useLocalization } from '@/localization/use-messages';
import { interaction, layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

const weatherAttributionUrls: Readonly<Record<string, string>> = {
  'open-meteo': 'https://open-meteo.com/',
  openweather: 'https://openweathermap.org/',
  weatherkit: 'https://developer.apple.com/weatherkit/data-source-attribution/',
};

const PRECIPITATION_BAR_HEIGHT = 32;

function temperature(value: number, language: 'en' | 'tr'): string {
  return `${new Intl.NumberFormat(language === 'tr' ? 'tr-TR' : 'en-US', {
    maximumFractionDigits: 1,
  }).format(value)}°`;
}

function decimal(value: number, language: 'en' | 'tr'): string {
  return new Intl.NumberFormat(language === 'tr' ? 'tr-TR' : 'en-US', {
    maximumFractionDigits: 1,
  }).format(value);
}

function time(value: string, timeZone: string, language: 'en' | 'tr'): string {
  return new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-US', {
    hour: '2-digit', minute: '2-digit', timeZone,
  }).format(new Date(value));
}

function percentage(value: number, language: 'en' | 'tr'): string {
  return new Intl.NumberFormat(language === 'tr' ? 'tr-TR' : 'en-US', {
    maximumFractionDigits: 0,
    style: 'percent',
  }).format(value);
}

function accessibilitySentence(...parts: readonly (string | null)[]): string {
  return parts
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replace(/[.!?…]+$/u, ''))
    .join('. ');
}

function locationName(
  location: ActiveLocation,
  copy: ReturnType<typeof useLocalization>['messages']['weather'],
): string {
  return location.source === 'manual' ? location.displayName : copy.currentLocation;
}

export function WeatherScreen() {
  const { language, messages } = useLocalization();
  const theme = useKuyaraTheme();
  const { usesStackedLayout } = useTextScaling();
  const copy = messages.weather;
  const application = useWeatherApplication();
  const { state } = application;
  useRefreshOutcomeHaptics(
    state.status === 'ready' && state.isRefreshing,
    state.status === 'ready' && state.refreshFailure !== null,
  );

  if (state.status === 'loading') {
    return (
      <Screen contentContainerStyle={styles.center} testID="weather-screen">
        <AppText accessibilityRole="header" variant="titleLarge">{copy.title}</AppText>
        <AppText colorRole="textSecondary">{copy.refreshing}</AppText>
      </Screen>
    );
  }

  if (state.status === 'error') {
    return (
      <Screen contentContainerStyle={styles.center} testID="weather-screen">
        <AppText accessibilityRole="header" variant="titleLarge">{copy.loadErrorTitle}</AppText>
        <AppText colorRole="textSecondary">{copy.loadErrorBody}</AppText>
        <Button label={copy.retry} onPress={() => void application.retry()} />
      </Screen>
    );
  }

  const activeName = state.activeLocation ? locationName(state.activeLocation, copy) : copy.noLocation;
  const accuracy = state.activeLocation?.source === 'device'
    ? (state.activeLocation.accuracy === 'full' ? copy.fullLocation : copy.approximateLocation)
    : null;
  const snapshot = state.snapshot;
  const failureCopy = state.refreshFailure === 'offline'
    ? {
        title: copy.offlineTitle,
        body: copy.offlineBody,
        notice: copy.offlineNotice,
      }
    : state.refreshFailure === 'unavailable' || state.refreshFailure === 'unknown'
      ? {
          title: copy.unavailableTitle,
          body: copy.unavailableBody,
          notice: copy.unavailableNotice,
        }
      : state.refreshFailure === 'rate-limited'
        ? {
            title: copy.rateLimitedTitle,
            body: copy.rateLimitedBody,
            notice: copy.rateLimitedNotice,
          }
        : null;
  const locationAccessibilityLabel = accessibilitySentence(
    activeName,
    accuracy,
    copy.changeLocationAction,
  );
  const attributionLabels: Readonly<Record<string, string>> = {
    'open-meteo': copy.attributionOpenMeteo,
    openweather: copy.attributionOpenWeather,
    weatherkit: copy.attributionAppleWeather,
  };
  const attributionLabel = attributionLabels[snapshot?.origin.sourceId ?? ''] ?? null;
  return (
    <Screen
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          colors={[theme.colors.iconSecondary]}
          onRefresh={() => {
            haptics.impactLight();
            void application.refresh();
          }}
          refreshing={state.isRefreshing}
          tintColor={theme.colors.iconSecondary}
        />
      }
      testID="weather-screen">
      <SectionHeader
        title={copy.title}
        trailingAction={state.activeLocation ? (
          <Pressable
            accessibilityLabel={copy.refreshAccessibilityLabel}
            accessibilityRole="button"
            accessibilityState={{ busy: state.isRefreshing, disabled: state.isRefreshing }}
            disabled={state.isRefreshing}
            hitSlop={10}
            onPress={() => void application.refresh()}
            style={({ pressed }) => [
              styles.refreshButton,
              { backgroundColor: theme.colors.surface },
              pressed && styles.pressed,
            ]}
            testID="weather-refresh-button">
            <Pill
              icon={(color) => <Icon color={color} name="refresh" size={15} />}
              label={copy.refresh}
              tone="bordered"
            />
          </Pressable>
        ) : undefined}
      />
      <AppText colorRole="textSecondary">{copy.introduction}</AppText>

      <View style={styles.locationSection}>
        <Pressable
          accessibilityLabel={locationAccessibilityLabel}
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => router.push('/weather/location')}
          style={({ pressed }) => pressed && styles.pressed}
          testID="weather-change-location-button">
          <Surface
            pointerEvents="none"
            style={[
              styles.locationCard,
              usesStackedLayout && styles.stackedLocationCard,
              theme.elevation.raised,
            ]}
            testID="weather-location-card">
            {usesStackedLayout ? (
              <View style={styles.locationIdentityRow} testID="weather-location-identity-row">
                <Icon color={theme.colors.iconSecondary} name="location" size={20} />
                <View style={styles.locationNameGroup} testID="weather-location-name-group">
                  <AppText variant="bodyStrong">{activeName}</AppText>
                  {accuracy ? (
                    <AppText colorRole="textSecondary" variant="caption">{accuracy}</AppText>
                  ) : null}
                </View>
              </View>
            ) : (
              <>
                <Icon color={theme.colors.iconSecondary} name="location" size={20} />
                <View style={styles.locationNameGroup} testID="weather-location-name-group">
                  <AppText variant="bodyStrong">{activeName}</AppText>
                  {accuracy ? (
                    <AppText colorRole="textSecondary" variant="caption">{accuracy}</AppText>
                  ) : null}
                </View>
              </>
            )}
            <View
              style={[
                styles.locationAffordance,
                usesStackedLayout && styles.stackedLocationAffordance,
              ]}
              testID="weather-location-affordance">
              <AppText colorRole="textSecondary" variant="label">
                {copy.changeLocationAction}
              </AppText>
              <Icon color={theme.colors.iconSecondary} name="chevronRight" size={15} />
            </View>
          </Surface>
        </Pressable>

      </View>

      {snapshot?.origin.kind === 'sample' ? (
        <Surface accessibilityLiveRegion="polite" style={styles.disclosure} variant="muted">
          <AppText variant="bodyStrong">{copy.sampleDisclosure}</AppText>
        </Surface>
      ) : null}

      {snapshot ? (
        <>
          <View style={styles.currentSection}>
            <Surface
              style={[styles.card, theme.elevation.raised]}
              testID="weather-current-card">
              <View
                accessible
                accessibilityLabel={copy.currentConditionsAccessibilityLabel({
                  condition: copy.conditions[snapshot.current.condition],
                  temperature: temperature(snapshot.current.temperatureCelsius, language),
                  apparentTemperature: temperature(
                    snapshot.current.apparentTemperatureCelsius,
                    language,
                  ),
                  minimumTemperature: temperature(snapshot.minimumTemperatureCelsius, language),
                  maximumTemperature: temperature(snapshot.maximumTemperatureCelsius, language),
                  precipitationProbability: snapshot.current.precipitationProbability,
                })}
                style={[
                  styles.currentHero,
                  usesStackedLayout && styles.stackedCurrentHero,
                ]}>
                <View style={styles.currentConditionGroup}>
                  <View style={styles.currentConditionRow}>
                    <AppText tabularNumbers variant="display">
                      {temperature(snapshot.current.temperatureCelsius, language)}
                    </AppText>
                    <AppText variant="bodyStrong">
                      {copy.conditions[snapshot.current.condition]}
                    </AppText>
                  </View>
                  <AppText colorRole="textSecondary" variant="caption">
                    {copy.feelsLike(
                      temperature(snapshot.current.apparentTemperatureCelsius, language),
                    )}
                  </AppText>
                  <AppText colorRole="textSecondary" variant="caption">
                    {`${copy.range(
                      temperature(snapshot.minimumTemperatureCelsius, language),
                      temperature(snapshot.maximumTemperatureCelsius, language),
                    )} · ${copy.precipitation(snapshot.current.precipitationProbability)}`}
                  </AppText>
                </View>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants">
                  <WeatherGlyph />
                </View>
              </View>

              <Divider testID="weather-current-divider" />

              <View
                style={[
                  styles.statsGrid,
                  usesStackedLayout && styles.stackedStatsGrid,
                ]}>
                {([
                  {
                    accessibilityLabel: copy.wind(
                      decimal(snapshot.current.windSpeedMetersPerSecond, language),
                    ),
                    icon: 'wind',
                    label: copy.windLabel,
                    value: copy.windValue(
                      decimal(snapshot.current.windSpeedMetersPerSecond, language),
                    ),
                  },
                  {
                    accessibilityLabel: copy.humidity(snapshot.current.humidity),
                    icon: 'humidity',
                    label: copy.humidityLabel,
                    value: copy.humidityValue(snapshot.current.humidity),
                  },
                  {
                    accessibilityLabel: copy.uvIndex(
                      decimal(snapshot.current.uvIndex, language),
                    ),
                    icon: 'uv',
                    label: copy.uvIndexLabel,
                    value: decimal(snapshot.current.uvIndex, language),
                  },
                ] as const).map((stat) => (
                  <View
                    accessible
                    accessibilityLabel={stat.accessibilityLabel}
                    key={stat.label}
                    style={[
                      styles.stat,
                      usesStackedLayout && styles.stackedStat,
                    ]}>
                    <Icon color={theme.colors.iconSecondary} name={stat.icon} size={18} />
                    <AppText colorRole="textSecondary" variant="eyebrow">
                      {stat.label}
                    </AppText>
                    <AppText tabularNumbers variant="bodyStrong">{stat.value}</AppText>
                  </View>
                ))}
              </View>

              {attributionLabel ? (
                <Pressable
                  accessibilityRole="link"
                  hitSlop={13}
                  onPress={() => {
                    void Linking.openURL(weatherAttributionUrls[snapshot.origin.sourceId]);
                  }}
                  style={styles.attribution}>
                  <AppText colorRole="textSecondary" variant="caption">
                    {attributionLabel}
                  </AppText>
                </Pressable>
              ) : null}
            </Surface>
            <View style={styles.headingRow}>
              <AppText variant="label">{state.freshness === 'fresh' ? copy.fresh : copy.stale}</AppText>
              <AppText colorRole="textSecondary" variant="caption">{copy.updatedAt(time(snapshot.fetchedAt, snapshot.timeZone, language))}</AppText>
            </View>
          </View>

          <Surface
            style={[styles.card, theme.elevation.raised]}
            testID="weather-hourly-card">
            <AppText accessibilityRole="header" colorRole="textPrimary" variant="bodyStrong">
              {copy.hourlyHeading}
            </AppText>
            <View>
              {snapshot.hourly.map((hour, index) => (
                <Fragment key={hour.forecastAt}>
                  {index > 0 ? <Divider testID="weather-hour-divider" /> : null}
                  <View
                    accessible
                    accessibilityLabel={copy.hourlyForecastAccessibilityLabel({
                      time: time(hour.forecastAt, snapshot.timeZone, language),
                      temperature: temperature(hour.temperatureCelsius, language),
                      condition: copy.conditions[hour.condition],
                      precipitationProbability: hour.precipitationProbability,
                    })}
                    style={[
                      styles.hourRow,
                      usesStackedLayout && styles.stackedHourRow,
                    ]}>
                    <AppText
                      style={[
                        styles.hourTime,
                        usesStackedLayout && styles.stackedHourTime,
                      ]}
                      tabularNumbers
                      variant="bodyStrong">
                      {time(hour.forecastAt, snapshot.timeZone, language)}
                    </AppText>
                    <Icon color={theme.colors.iconSecondary} name="tabWeather" size={22} />
                    <View style={styles.precipitationGroup}>
                      <View
                        accessible={false}
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                        style={[
                          styles.precipitationBar,
                          { backgroundColor: theme.colors.surfaceMuted },
                        ]}
                        testID="weather-hour-precipitation-bar">
                        <View
                          style={[
                            styles.precipitationFill,
                            {
                              backgroundColor: theme.colors.brandAccent,
                              height: Math.max(
                                2,
                                hour.precipitationProbability * PRECIPITATION_BAR_HEIGHT,
                              ),
                            },
                          ]}
                        />
                      </View>
                      <AppText colorRole="textSecondary" tabularNumbers variant="caption">
                        {percentage(hour.precipitationProbability, language)}
                      </AppText>
                    </View>
                    <AppText
                      style={[
                        styles.hourTemperature,
                        usesStackedLayout && styles.stackedHourTemperature,
                      ]}
                      tabularNumbers
                      variant="bodyStrong">
                      {temperature(hour.temperatureCelsius, language)}
                    </AppText>
                  </View>
                </Fragment>
              ))}
            </View>
          </Surface>
        </>
      ) : (
        <Surface style={styles.card} variant="muted">
          {failureCopy && (
            <AppText accessibilityRole="header" variant="title">{failureCopy.title}</AppText>
          )}
          <AppText accessibilityLiveRegion={failureCopy ? 'polite' : undefined}>
            {failureCopy?.body ?? copy.noSnapshot}
          </AppText>
        </Surface>
      )}

      {snapshot && failureCopy && (
        <Surface
          accessible
          accessibilityLabel={failureCopy.notice}
          accessibilityLiveRegion="polite"
          style={styles.staleNotice}
          variant="muted">
          <Icon color={theme.colors.warningInk} name="warning" size={17} />
          <AppText colorRole="warningInk" variant="caption">
            {failureCopy.notice}
          </AppText>
        </Surface>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  center: { flexGrow: 1, justifyContent: 'center', gap: spacing.md },
  locationSection: { gap: spacing.md },
  currentSection: { gap: spacing.md },
  card: { gap: spacing.md, padding: spacing.lg },
  disclosure: { padding: spacing.md },
  refreshButton: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
  },
  locationCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: layout.minimumTouchTarget,
    padding: spacing.lg,
  },
  stackedLocationCard: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  locationIdentityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  locationNameGroup: { flex: 1, flexShrink: 1, gap: spacing.xs / 2 },
  locationAffordance: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: spacing.xs,
  },
  stackedLocationAffordance: {
    alignSelf: 'stretch',
  },
  pressed: { opacity: interaction.pressedOpacity },
  currentHero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
  },
  stackedCurrentHero: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  currentConditionGroup: { flex: 1, flexShrink: 1, gap: spacing.xs },
  currentConditionRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stackedStatsGrid: { flexDirection: 'column' },
  stat: {
    alignItems: 'flex-start',
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  stackedStat: { flex: 0, width: '100%' },
  attribution: { alignSelf: 'flex-start' },
  headingRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.md },
  hourRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: layout.minimumTouchTarget,
    paddingVertical: spacing.md,
  },
  stackedHourRow: { alignItems: 'flex-start', flexDirection: 'column' },
  hourTime: { width: 76 },
  stackedHourTime: { width: 'auto' },
  precipitationGroup: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minWidth: 48,
  },
  precipitationBar: {
    borderRadius: radii.pill,
    height: PRECIPITATION_BAR_HEIGHT,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    width: 4,
  },
  precipitationFill: { borderRadius: radii.pill, width: '100%' },
  hourTemperature: { minWidth: 52, textAlign: 'right' },
  stackedHourTemperature: { textAlign: 'left' },
  staleNotice: {
    alignItems: 'center',
    borderRadius: radii.control,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
});
