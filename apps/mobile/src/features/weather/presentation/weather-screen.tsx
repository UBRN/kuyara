import { Fragment, useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { AppText, Button, Icon, Pill, Screen, SectionHeader, Surface } from '@/components/ui';
import { Divider } from '@/components/ui/divider';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { manualLocationCatalog } from '@/features/weather/data/manual-location-catalog';
import type { ActiveLocation, ManualLocationId } from '@/features/weather/domain/weather';
import { WeatherGlyph } from '@/features/today/presentation/weather-glyph';
import { useLocalization } from '@/localization/use-messages';
import { borderWidths, interaction, layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

const weatherAttributionUrls: Readonly<Record<string, string>> = {
  'open-meteo': 'https://open-meteo.com/',
  openweather: 'https://openweathermap.org/',
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
  return location.source === 'manual' ? copy.locations[location.catalogId] : copy.currentLocation;
}

function LocationOption({
  id,
  label,
  selected,
  disabled,
  onSelect,
}: Readonly<{
  id: ManualLocationId;
  label: string;
  selected: boolean;
  disabled: boolean;
  onSelect: (id: ManualLocationId) => void;
}>) {
  const theme = useKuyaraTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={() => onSelect(id)}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: selected ? theme.colors.surfaceInteractive : theme.colors.surface,
          borderColor: selected ? theme.colors.focusRing : theme.colors.borderSubtle,
        },
        pressed && styles.pressed,
      ]}>
      <AppText variant="bodyStrong">{label}</AppText>
    </Pressable>
  );
}

export function WeatherScreen() {
  const { language, messages } = useLocalization();
  const theme = useKuyaraTheme();
  const { fontScale } = useWindowDimensions();
  const copy = messages.weather;
  const application = useWeatherApplication();
  const { state } = application;
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);

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
  const isLocationPickerVisible = isLocationPickerOpen || state.locationFlow !== 'idle';
  const flowMessages: Partial<Record<typeof state.locationFlow, string>> = {
    'denied-requestable': copy.deniedBody,
    'denied-permanent': copy.permanentDeniedBody,
    'services-unavailable': copy.servicesUnavailableBody,
    'lookup-failed': copy.lookupFailedBody,
    'selection-failed': copy.selectionFailedBody,
  };
  const flowMessage = flowMessages[state.locationFlow];
  const snapshot = state.snapshot;
  const failureCopy = state.refreshFailure === 'offline'
    ? {
        title: copy.offlineTitle,
        body: copy.offlineBody,
        notice: copy.offlineNotice,
      }
    : state.refreshFailure === 'unavailable'
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
  const attributionLabel = snapshot?.origin.sourceId === 'open-meteo'
    ? copy.attributionOpenMeteo
    : snapshot?.origin.sourceId === 'openweather'
      ? copy.attributionOpenWeather
      : null;
  const usesAccessibilityLayout = fontScale > 1.5;

  return (
    <Screen
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          colors={[theme.colors.iconSecondary]}
          onRefresh={() => void application.refresh()}
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
          accessibilityState={{ expanded: isLocationPickerVisible }}
          hitSlop={10}
          onPress={() => setIsLocationPickerOpen((open) => !open)}
          style={({ pressed }) => pressed && styles.pressed}
          testID="weather-change-location-button">
          <Surface pointerEvents="none" style={[styles.locationCard, theme.elevation.raised]}>
            <Icon color={theme.colors.iconSecondary} name="location" size={20} />
            <View style={styles.locationNameGroup}>
              <AppText variant="bodyStrong">{activeName}</AppText>
              {accuracy ? (
                <AppText colorRole="textSecondary" variant="caption">{accuracy}</AppText>
              ) : null}
            </View>
            <View style={styles.locationAffordance}>
              <AppText colorRole="textSecondary" variant="label">
                {copy.changeLocationAction}
              </AppText>
              <Icon color={theme.colors.iconSecondary} name="chevronRight" size={15} />
            </View>
          </Surface>
        </Pressable>

        {isLocationPickerVisible ? (
          <View style={styles.locationPicker} testID="weather-location-picker">
            <Button
              label={copy.useCurrentLocation}
              loading={state.isSelectingLocation}
              onPress={() => void application.beginDeviceLocationSelection()}
            />

            {state.locationFlow === 'rationale' && (
              <Surface accessibilityLiveRegion="polite" style={styles.card} variant="interactive">
                <AppText accessibilityRole="header" variant="title">{copy.locationRationaleTitle}</AppText>
                <AppText>{copy.locationRationaleBody}</AppText>
                <View style={styles.actions}>
                  <Button label={copy.continuePermission} onPress={() => void application.confirmDeviceLocationRequest()} />
                  <Button label={copy.cancel} variant="quiet" onPress={application.dismissLocationFlow} />
                </View>
              </Surface>
            )}

            {flowMessage && (
              <Surface accessibilityLiveRegion="polite" style={styles.card} variant="muted">
                <AppText>{flowMessage}</AppText>
                {state.locationFlow === 'denied-permanent' && (
                  <Button label={copy.openSettings} variant="secondary" onPress={() => void application.openApplicationSettings()} />
                )}
                <Button label={copy.cancel} variant="quiet" onPress={application.dismissLocationFlow} />
              </Surface>
            )}

            <Surface style={styles.card}>
              <AppText accessibilityRole="header" colorRole="textPrimary" variant="bodyStrong">
                {copy.manualHeading}
              </AppText>
              <AppText colorRole="textSecondary">{copy.manualBody}</AppText>
              <View accessibilityRole="radiogroup" style={styles.options}>
                {manualLocationCatalog.map((entry) => (
                  <LocationOption
                    key={entry.catalogId}
                    id={entry.catalogId}
                    label={copy.locations[entry.catalogId]}
                    selected={state.activeLocation?.source === 'manual' && state.activeLocation.catalogId === entry.catalogId}
                    disabled={state.isSelectingLocation}
                    onSelect={(id) => void application.selectManualLocation(id)}
                  />
                ))}
              </View>
            </Surface>
          </View>
        ) : null}
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
                  usesAccessibilityLayout && styles.stackedCurrentHero,
                ]}>
                <View style={styles.currentConditionGroup}>
                  <View style={styles.currentConditionRow}>
                    <AppText variant="display">
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
                  usesAccessibilityLayout && styles.stackedStatsGrid,
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
                      usesAccessibilityLayout && styles.stackedStat,
                    ]}>
                    <Icon color={theme.colors.iconSecondary} name={stat.icon} size={18} />
                    <AppText colorRole="textSecondary" variant="eyebrow">
                      {stat.label}
                    </AppText>
                    <AppText variant="bodyStrong">{stat.value}</AppText>
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
                      usesAccessibilityLayout && styles.stackedHourRow,
                    ]}>
                    <AppText
                      style={[
                        styles.hourTime,
                        usesAccessibilityLayout && styles.stackedHourTime,
                      ]}
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
                      <AppText colorRole="textSecondary" variant="caption">
                        {percentage(hour.precipitationProbability, language)}
                      </AppText>
                    </View>
                    <AppText
                      style={[
                        styles.hourTemperature,
                        usesAccessibilityLayout && styles.stackedHourTemperature,
                      ]}
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
          <Icon color={theme.colors.iconSecondary} name="warning" size={17} />
          <AppText colorRole="textSecondary" variant="caption">
            {failureCopy.notice}
          </AppText>
        </Surface>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl, paddingBottom: spacing['2xl'] },
  center: { flexGrow: 1, justifyContent: 'center', gap: spacing.lg },
  locationSection: { gap: spacing.lg },
  currentSection: { gap: spacing.md },
  card: { gap: spacing.lg, padding: spacing.lg },
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
  locationNameGroup: { flex: 1, flexShrink: 1, gap: spacing.xs / 2 },
  locationAffordance: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: spacing.xs,
  },
  locationPicker: { gap: spacing.md },
  actions: { gap: spacing.sm },
  options: { gap: spacing.sm },
  option: {
    minHeight: layout.minimumTouchTarget,
    justifyContent: 'center',
    borderRadius: radii.control,
    borderWidth: borderWidths.strong,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
