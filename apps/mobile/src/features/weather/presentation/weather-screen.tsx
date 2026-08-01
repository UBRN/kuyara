import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Screen, SectionHeader, Surface } from '@/components/ui';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { manualLocationCatalog } from '@/features/weather/data/manual-location-catalog';
import type { ActiveLocation, ManualLocationId } from '@/features/weather/domain/weather';
import { useLocalization } from '@/localization/use-messages';
import { borderWidths, layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

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
  const copy = messages.weather;
  const application = useWeatherApplication();
  const { state } = application;

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
      : null;

  return (
    <Screen contentContainerStyle={styles.content} testID="weather-screen">
      <SectionHeader title={copy.title} supportingText={copy.introduction} />

      <Surface style={styles.card} variant="elevated">
        <AppText accessibilityRole="header" variant="title">{copy.activeLocationHeading}</AppText>
        <AppText variant="bodyStrong">{activeName}</AppText>
        {accuracy && <AppText colorRole="textSecondary">{accuracy}</AppText>}
        <Button
          label={copy.useCurrentLocation}
          loading={state.isSelectingLocation}
          onPress={() => void application.beginDeviceLocationSelection()}
        />
      </Surface>

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
        <AppText accessibilityRole="header" variant="title">{copy.manualHeading}</AppText>
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

      <Surface accessibilityLiveRegion="polite" style={styles.disclosure} variant="muted">
        <AppText variant="bodyStrong">{copy.sampleDisclosure}</AppText>
      </Surface>

      {snapshot ? (
        <>
          <Surface style={styles.card} variant="elevated">
            <View style={styles.headingRow}>
              <AppText accessibilityRole="header" variant="title">{copy.currentHeading}</AppText>
              <AppText variant="label">{state.freshness === 'fresh' ? copy.fresh : copy.stale}</AppText>
            </View>
            <AppText variant="display">{temperature(snapshot.current.temperatureCelsius, language)}</AppText>
            <AppText variant="bodyStrong">{copy.conditions[snapshot.current.condition]}</AppText>
            <AppText colorRole="textSecondary">{copy.feelsLike(temperature(snapshot.current.apparentTemperatureCelsius, language))}</AppText>
            <AppText colorRole="textSecondary">{copy.range(
              temperature(snapshot.minimumTemperatureCelsius, language),
              temperature(snapshot.maximumTemperatureCelsius, language),
            )}</AppText>
            <AppText colorRole="textSecondary">{copy.precipitation(snapshot.current.precipitationProbability)}</AppText>
            <AppText colorRole="textSecondary">{copy.wind(decimal(snapshot.current.windSpeedMetersPerSecond, language))}</AppText>
            <AppText colorRole="textSecondary">{copy.humidity(snapshot.current.humidity)}</AppText>
            <AppText colorRole="textSecondary">{copy.uvIndex(decimal(snapshot.current.uvIndex, language))}</AppText>
            <AppText variant="caption">{copy.updatedAt(time(snapshot.fetchedAt, snapshot.timeZone, language))}</AppText>
          </Surface>

          <Surface style={styles.card}>
            <AppText accessibilityRole="header" variant="title">{copy.hourlyHeading}</AppText>
            {snapshot.hourly.map((hour) => (
              <View
                accessible
                accessibilityLabel={[
                  time(hour.forecastAt, snapshot.timeZone, language),
                  temperature(hour.temperatureCelsius, language),
                  copy.conditions[hour.condition],
                  copy.precipitation(hour.precipitationProbability),
                ].join('. ')}
                key={hour.forecastAt}
                style={styles.hourRow}>
                <AppText variant="bodyStrong">{time(hour.forecastAt, snapshot.timeZone, language)}</AppText>
                <View style={styles.hourDetails}>
                  <AppText>{temperature(hour.temperatureCelsius, language)}</AppText>
                  <AppText colorRole="textSecondary">{copy.conditions[hour.condition]}</AppText>
                  <AppText colorRole="textSecondary">{copy.precipitation(hour.precipitationProbability)}</AppText>
                </View>
              </View>
            ))}
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
        <AppText accessibilityLiveRegion="polite">{failureCopy.notice}</AppText>
      )}
      {state.activeLocation && (
        <Button
          label={state.isRefreshing ? copy.refreshing : (failureCopy ? copy.retry : copy.refresh)}
          loading={state.isRefreshing}
          onPress={() => void application.refresh()}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing['2xl'] },
  center: { flexGrow: 1, justifyContent: 'center', gap: spacing.lg },
  card: { gap: spacing.md, padding: spacing.lg },
  disclosure: { padding: spacing.md },
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
  pressed: { opacity: 0.72 },
  headingRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.md },
  hourRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, paddingVertical: spacing.sm },
  hourDetails: { flex: 1, minWidth: 180, gap: spacing.xs },
});
