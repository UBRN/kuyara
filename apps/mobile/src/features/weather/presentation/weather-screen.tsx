import { weatherLocalDateKey } from '@kuyara/contracts';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  AppState,
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
  ListRow,
  ListRowGroup,
  Pill,
  Screen,
  SectionHeader,
  Surface,
  useRefreshOutcomeHaptics,
  useTextScaling,
} from '@/components/ui';
import { Divider } from '@/components/ui/divider';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { ambientIntensityOf } from '@/features/weather/domain/ambient-intensity';
import { locationCaptionKey } from '@/features/weather/domain/location-caption';
import type { ActiveLocation } from '@/features/weather/domain/weather';
import { findWeatherOutlook, type WeatherOutlook } from '@/features/weather/domain/weather-outlook';
import {
  DailyOutlook,
  type DailyOutlookRow,
} from '@/features/weather/presentation/daily-outlook';
import { HourlyRail } from '@/features/weather/presentation/hourly-rail';
import { remainingHourlyForecast } from '@/features/weather/presentation/remaining-hours';
import { WeatherAttribution } from '@/features/weather/presentation/weather-attribution';
import { WeatherGlyph } from '@/features/today/presentation/weather-glyph';
import { resolveDaypart } from '@/features/today/domain/atmosphere-state';
import { useLocalization } from '@/localization/use-messages';
import { formatTemperature, localeTag } from '@/presentation/format-temperature';
import { interaction, layout, radii, spacing, typography } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

function decimal(value: number, language: 'en' | 'tr'): string {
  return new Intl.NumberFormat(localeTag(language), {
    maximumFractionDigits: 1,
    // A wind that rounds away to nothing must not read as blowing backwards.
  }).format(Math.round(Math.abs(value) * 10) === 0 ? 0 : value);
}

function time(
  value: string,
  timeZone: string,
  language: 'en' | 'tr',
  hour12: boolean,
): string {
  return new Intl.DateTimeFormat(localeTag(language), {
    // A padded hour reads as a stopwatch in the 12-hour convention ("02:00 PM"), so the
    // 12-hour label drops the padding the 24-hour one keeps.
    hour: hour12 ? 'numeric' : '2-digit', minute: '2-digit', hour12, timeZone,
  }).format(new Date(value));
}

// "Last updated" answers "how old is this?", so it is read against the viewer's own clock
// and calendar rather than the selected city's: the device time zone, and the date as
// well as the time once the snapshot is no longer from the viewer's current local day.
function lastUpdated(
  value: string,
  language: 'en' | 'tr',
  hour12: boolean,
  now: number,
): string {
  const fetched = new Date(value);
  const isCurrentLocalDay = fetched.toDateString() === new Date(now).toDateString();
  return new Intl.DateTimeFormat(
    localeTag(language),
    isCurrentLocalDay
      ? { hour: hour12 ? 'numeric' : '2-digit', minute: '2-digit', hour12 }
      : { dateStyle: 'short', timeStyle: 'short', hour12 },
  ).format(fetched);
}

function weekday(
  value: string,
  timeZone: string,
  language: 'en' | 'tr',
  length: 'short' | 'long',
): string {
  return new Intl.DateTimeFormat(localeTag(language), {
    timeZone,
    weekday: length,
  }).format(new Date(value));
}

function percentage(value: number, language: 'en' | 'tr'): string {
  return new Intl.NumberFormat(localeTag(language), {
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

// ADR 0021 section 9's meaning line. The outlook module carries a closed `kind` and raw
// numbers only, so the sentence is chosen here from one key per state and never assembled
// from translated fragments; rounding and the clock convention are this screen's own.
function outlookSentence(
  outlook: WeatherOutlook,
  copy: ReturnType<typeof useLocalization>['messages']['weather'],
  timeZone: string,
  language: 'en' | 'tr',
  hour12: boolean,
): string {
  // The dressing day is what "the rest of" means: before 18:00 local it is the rest of the
  // calendar day, and from 18:00 it runs to 04:00, which the copy calls the evening. The
  // boundary is a clock hour while the glyph beside it follows the real sun, so the word has
  // to hold with the sun still up. The period selects a whole sentence; nothing is assembled
  // from a translated fragment.
  if (outlook.kind === 'steady') {
    return outlook.period === 'evening' ? copy.outlook.steadyEvening : copy.outlook.steady;
  }
  const at = time(outlook.atHour, timeZone, language, hour12);
  if (outlook.kind === 'temperature_change') {
    const values = {
      time: at,
      degrees: formatTemperature(
        Math.abs(outlook.toApparentCelsius - outlook.fromApparentCelsius),
        language,
      ),
    };
    return outlook.direction === 'drop'
      ? copy.outlook.temperatureDrop(values)
      : copy.outlook.temperatureRise(values);
  }
  const starting = outlook.kind === 'precipitation_onset';
  if (outlook.form === 'snow') {
    return starting ? copy.outlook.snowStarting(at) : copy.outlook.snowEasing(at);
  }
  return starting ? copy.outlook.rainStarting(at) : copy.outlook.rainEasing(at);
}

// Five of the seven the contract allows, so a seventh day would be a mobile change and
// not another route (packages/contracts/src/weather-v2.ts).
const dailyOutlookDayCount = 5;

function locationName(
  location: ActiveLocation,
  copy: ReturnType<typeof useLocalization>['messages']['weather'],
): string {
  // Both members of the union carry `displayName`; a device fix has one only when the
  // reverse geocode resolved a locality, and without one the generic copy still answers.
  return location.displayName ?? copy.currentLocation;
}

export function WeatherScreen() {
  const { hour12, language, messages } = useLocalization();
  const theme = useKuyaraTheme();
  const { usesStackedLayout } = useTextScaling();
  const copy = messages.weather;
  const application = useWeatherApplication();
  const { revalidateFreshness, state } = application;
  const { analytics, firstUses, retries } = useProductAnalytics();
  // The control shows only a refresh the user pulled for. Binding it to the application's
  // `isRefreshing` also turned it on programmatically, and on iOS a RefreshControl that
  // starts while the screen is behind the location picker or freshly mounted keeps its
  // inset until the next pull (seen 2026-09-10 after a location change).
  const [pullInFlight, setPullInFlight] = useState(false);
  // The rail's clock: read once, then again whenever the tab regains focus, so a screen
  // left open across an hour boundary drops the ended hour on return without a timer.
  // The same return re-evaluates freshness, which otherwise only moves on init,
  // foreground, selection and refresh, and leaves a screen left open labelled "Fresh".
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(useCallback(() => {
    setNow(Date.now());
    void revalidateFreshness();
  }, [revalidateFreshness]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') setNow(Date.now());
    });
    return () => subscription.remove();
  }, []);
  useRefreshOutcomeHaptics(
    state.status === 'ready' && state.isRefreshing,
    state.status === 'ready' && state.refreshFailure !== null,
  );

  if (state.status === 'loading') {
    return (
      <Screen contentContainerStyle={styles.center} fill testID="weather-screen">
        <AppText accessibilityRole="header" variant="titleLarge">{copy.title}</AppText>
        <AppText colorRole="textSecondary">{copy.loading}</AppText>
      </Screen>
    );
  }

  if (state.status === 'error') {
    return (
      <Screen contentContainerStyle={styles.center} fill testID="weather-screen">
        <AppText accessibilityRole="header" variant="titleLarge">{copy.loadErrorTitle}</AppText>
        <AppText colorRole="textSecondary">{copy.loadErrorBody}</AppText>
        <Button label={copy.retry} onPress={() => void application.retry()} />
      </Screen>
    );
  }

  // Taxonomy 5.7: the pull gesture and the visible control both call the same `refresh()`;
  // "weather" has no separate retry control, so a failure already on screen is the
  // discriminator between a manual refresh and a retry after failure.
  const handleRefresh = () => {
    const wasFailing = state.refreshFailure !== null;
    return application.refresh().then(() => {
      const after = application.getSnapshot?.() ?? application.state;
      const outcome = after.status !== 'ready'
        ? 'failure_no_snapshot' as const
        : after.refreshFailure === null
          ? 'success' as const
          : after.snapshot
            ? 'failure_kept_last_known' as const
            : 'failure_no_snapshot' as const;
      if (wasFailing) {
        analytics.capture('retry_after_failure_triggered', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
          surface: 'weather',
          attempt_number: retries.nextAttempt('weather'),
          result: outcome === 'success' ? 'success' : 'failure',
        });
        if (outcome === 'success') retries.reset('weather');
        return;
      }
      analytics.capture('manual_refresh_triggered', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        surface: 'weather',
        result: outcome,
      });
      void firstUses.markFirstUse('manual_refresh').then((firstUse) => {
        if (!firstUse) return;
        analytics.capture('feature_used_first_time', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
          feature_name: 'manual_refresh',
        });
      });
    });
  };

  const activeName = state.activeLocation ? locationName(state.activeLocation, copy) : copy.noLocation;
  const captionKey = locationCaptionKey(
    state.activeLocation,
    state.permission.kind === 'granted',
  );
  const locationCaption = captionKey ? copy[captionKey] : null;
  const snapshot = state.snapshot;
  const remainingHourly = snapshot ? remainingHourlyForecast(snapshot.hourly, now) : [];
  const outlook = snapshot
    ? findWeatherOutlook({ snapshot, now: new Date(now).toISOString() })
    : null;
  // The viewer's own local day, read once: it both drops the days that have already
  // ended and marks the row the current temperature belongs to.
  const localDayKey = snapshot
    ? weatherLocalDateKey(new Date(now).toISOString(), snapshot.timeZone)
    : null;
  // Filtered at render time for the same reason the hourly rail is (remaining-hours.ts):
  // a snapshot kept across midnight, which is exactly what an offline device has, would
  // otherwise open on yesterday and lose the today mark with it. Date keys are
  // `YYYY-MM-DD`, so a string compare is a date compare. Five of the contract's seven
  // survive it, the owner's count: five fit without scrolling even at the largest
  // accessibility size, and the sixth is where confidence starts to fall.
  const dailyRows: readonly DailyOutlookRow[] = snapshot?.daily === undefined
    ? []
    : snapshot.daily
      .filter((day) => localDayKey === null || day.dateKey >= localDayKey)
      .slice(0, dailyOutlookDayCount).map((day) => {
      // A `dateKey` is a calendar date, not an instant: it is read in UTC so a place west
      // of Greenwich cannot have its Thursday rendered as a Wednesday.
      const date = `${day.dateKey}T00:00:00.000Z`;
      const chance = percentage(day.precipitationProbability, language);
      // Whole millimetres: a day's total is a coarse figure, and a decimal in a row this
      // narrow costs the rail more width than the tenth is worth. Anything under half a
      // millimetre shows its chance alone rather than rounding down to a "0 mm" that would
      // read as a measurement of nothing.
      const amount = day.precipitationMillimetres !== null
        && Math.round(day.precipitationMillimetres) >= 1
        ? decimal(Math.round(day.precipitationMillimetres), language)
        : null;
      // Today's row is the only one carrying a current temperature, so the same value
      // names the day and states what the rail's mark stands for: a screen reader learns
      // which row is today, and the mark stops being the graphic's secret.
      const currentCelsius = day.dateKey === localDayKey
        ? snapshot.current.temperatureCelsius
        : null;
      return {
        key: day.dateKey,
        accessibilityLabel: copy.dailyForecastAccessibilityLabel({
          day: weekday(date, 'UTC', language, 'long'),
          condition: copy.conditions[day.condition],
          minimumTemperature: formatTemperature(day.minimumTemperatureCelsius, language),
          maximumTemperature: formatTemperature(day.maximumTemperatureCelsius, language),
          precipitationProbability: day.precipitationProbability,
          precipitationMillimetres: amount ?? undefined,
          currentTemperature: currentCelsius === null
            ? undefined
            : formatTemperature(currentCelsius, language),
        }),
        condition: day.condition,
        currentCelsius,
        maximum: formatTemperature(day.maximumTemperatureCelsius, language),
        maximumCelsius: day.maximumTemperatureCelsius,
        minimum: formatTemperature(day.minimumTemperatureCelsius, language),
        minimumCelsius: day.minimumTemperatureCelsius,
        precipitation: amount !== null
          ? copy.dailyPrecipitationValue(amount, chance)
          : day.precipitationProbability > 0 ? chance : null,
        weekday: weekday(date, 'UTC', language, 'short'),
      };
    });
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
  // The same three announced states as Today (docs/product-decisions.md): refreshing,
  // refresh failed, or last updated, the last of which keeps Weather's fresh/stale split.
  const freshnessStatus = state.isRefreshing
    ? copy.refreshing
    : state.refreshFailure !== null
      ? copy.refreshFailed
      : state.freshness === 'fresh'
        ? copy.fresh
        : copy.stale;
  const locationAccessibilityLabel = accessibilitySentence(
    activeName,
    locationCaption,
    copy.changeLocationAction,
  );
  // The location control sits below the current conditions once a snapshot exists
  // (ADR 0021 section 9), and stays the first block while there is nothing to show.
  const locationSection = (
    <View style={styles.locationSection} testID="weather-location-section">
      <ListRowGroup testID="weather-location-card">
        <ListRow
          accessibilityLabel={locationAccessibilityLabel}
          glyph={({ color, size }) => <Icon color={color} name="location" size={size} />}
          label={activeName}
          labelWeight="bodyStrong"
          onPress={() => router.push('/weather/location')}
          supportingText={locationCaption ?? undefined}
          testID="weather-change-location-button"
        />
      </ListRowGroup>
    </View>
  );

  return (
    <Screen
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          colors={[theme.colors.iconSecondary]}
          onRefresh={() => {
            haptics.impactLight();
            setPullInFlight(true);
            void handleRefresh().finally(() => setPullInFlight(false));
          }}
          refreshing={pullInFlight}
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
            onPress={() => void handleRefresh()}
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
      {state.activeLocation ? null : (
        <AppText colorRole="textSecondary">{copy.introduction}</AppText>
      )}

      {snapshot ? null : locationSection}

      {snapshot ? (
        <>
          {snapshot.origin.kind === 'sample' ? (
            <Surface accessibilityLiveRegion="polite" style={styles.disclosure} variant="muted">
              <AppText variant="bodyStrong">{copy.sampleDisclosure}</AppText>
            </Surface>
          ) : null}

          <View style={styles.currentSection}>
            <Surface
              style={[styles.card, theme.elevation.raised]}
              testID="weather-current-card">
              <View
                accessible
                accessibilityLabel={copy.currentConditionsAccessibilityLabel({
                  condition: copy.conditions[snapshot.current.condition],
                  temperature: formatTemperature(snapshot.current.temperatureCelsius, language),
                  apparentTemperature: formatTemperature(
                    snapshot.current.apparentTemperatureCelsius,
                    language,
                  ),
                  minimumTemperature: formatTemperature(snapshot.minimumTemperatureCelsius, language),
                  maximumTemperature: formatTemperature(snapshot.maximumTemperatureCelsius, language),
                  precipitationProbability: snapshot.current.precipitationProbability,
                })}
                style={[
                  styles.currentHero,
                  usesStackedLayout && styles.stackedCurrentHero,
                ]}>
                <View style={styles.currentConditionGroup}>
                  <View style={styles.currentConditionRow}>
                    <AppText
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                      numberOfLines={1}
                      tabularNumbers
                      variant="display">
                      {formatTemperature(snapshot.current.temperatureCelsius, language)}
                    </AppText>
                    <AppText variant="bodyStrong">
                      {copy.conditions[snapshot.current.condition]}
                    </AppText>
                  </View>
                  <AppText colorRole="textSecondary" variant="caption">
                    {`${copy.feelsLike(
                      formatTemperature(snapshot.current.apparentTemperatureCelsius, language),
                    )} · ${copy.range(
                      formatTemperature(snapshot.minimumTemperatureCelsius, language),
                      formatTemperature(snapshot.maximumTemperatureCelsius, language),
                    )}`}
                  </AppText>
                </View>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants">
                  <WeatherGlyph
                    condition={snapshot.current.condition}
                    intensity={ambientIntensityOf(snapshot.current.condition)}
                    daypart={resolveDaypart(
                      new Date(now).toISOString(),
                      snapshot.timeZone,
                      state.activeLocation?.coordinates,
                    )}
                  />
                </View>
              </View>

              {outlook ? (
                <AppText
                  colorRole="textPrimary"
                  tabularNumbers
                  testID="weather-outlook"
                  variant="body">
                  {outlookSentence(outlook, copy, snapshot.timeZone, language, hour12)}
                </AppText>
              ) : null}

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
                ] as const)
                  // A UV index of 0 is every night and every overcast winter day: the row
                  // would read as a measurement when it is the absence of one. Wind and
                  // humidity keep their places.
                  .filter(({ icon }) => icon !== 'uv' || snapshot.current.uvIndex > 0)
                  .map((stat) => (
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

              <WeatherAttribution sourceId={snapshot.origin.sourceId} />
            </Surface>
            <View style={styles.headingRow}>
              <AppText
                accessibilityLiveRegion={
                  state.isRefreshing || state.refreshFailure !== null || state.freshness !== 'fresh'
                    ? 'polite'
                    : 'none'
                }
                testID="weather-freshness"
                variant="label">
                {freshnessStatus}
              </AppText>
              <AppText colorRole="textSecondary" tabularNumbers variant="caption">
                {copy.updatedAt(lastUpdated(snapshot.fetchedAt, language, hour12, now))}
              </AppText>
            </View>
          </View>

          {locationSection}

          {remainingHourly.length > 0 && (
            <Surface
              style={[styles.card, theme.elevation.raised]}
              testID="weather-hourly-card">
              <AppText
                accessibilityRole="header"
                colorRole="textPrimary"
                style={styles.sectionHeading}
                variant="bodyStrong">
                {copy.hourlyHeading}
              </AppText>
              <HourlyRail
                columns={remainingHourly.map((hour, index) => {
                  const localDate = weatherLocalDateKey(hour.forecastAt, snapshot.timeZone);
                  const previousLocalDate = index === 0
                    ? localDate
                    : weatherLocalDateKey(remainingHourly[index - 1].forecastAt, snapshot.timeZone);
                  const startsNewLocalDay = localDate !== previousLocalDate;
                  const hourLabel = time(hour.forecastAt, snapshot.timeZone, language, hour12);
                  return {
                    key: hour.forecastAt,
                    accessibilityLabel: copy.hourlyForecastAccessibilityLabel({
                      day: startsNewLocalDay
                        ? weekday(hour.forecastAt, snapshot.timeZone, language, 'long')
                        : undefined,
                      time: hourLabel,
                      temperature: formatTemperature(hour.temperatureCelsius, language),
                      condition: copy.conditions[hour.condition],
                      precipitationProbability: hour.precipitationProbability,
                    }),
                    condition: hour.condition,
                    daypart: resolveDaypart(
                      hour.forecastAt,
                      snapshot.timeZone,
                      state.activeLocation?.coordinates,
                    ),
                    precipitationProbability: hour.precipitationProbability,
                    precipitation: percentage(hour.precipitationProbability, language),
                    temperature: formatTemperature(hour.temperatureCelsius, language),
                    temperatureCelsius: hour.temperatureCelsius,
                    time: startsNewLocalDay
                      ? weekday(hour.forecastAt, snapshot.timeZone, language, 'short')
                      : hourLabel,
                  };
                })}
              />
            </Surface>
          )}

          {dailyRows.length > 0 && (
            <Surface
              style={[styles.card, theme.elevation.raised]}
              testID="weather-daily-card">
              <AppText
                accessibilityRole="header"
                colorRole="textPrimary"
                style={styles.sectionHeading}
                variant="bodyStrong">
                {copy.dailyHeading}
              </AppText>
              <DailyOutlook rows={dailyRows} />
            </Surface>
          )}
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
  center: { justifyContent: 'center', gap: spacing.md },
  locationSection: { gap: spacing.md },
  currentSection: { gap: spacing.md },
  card: { gap: spacing.md, padding: spacing.lg },
  sectionHeading: { lineHeight: typography.bodyStrong.lineHeight },
  disclosure: { padding: spacing.md },
  // The Pill is shorter than 44, so the pressable carries the touch target the way
  // IconButton and ListRow do rather than borrowing it from a hitSlop the layout cannot
  // see. The Pill keeps its own size and sits centred in it.
  refreshButton: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
  },
  pressed: { opacity: interaction.pressedOpacity },
  currentHero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  // Stretched, not flex-start: at accessibility sizes the 56-point hero needs the whole
  // card width to lay out on one line (ADR 0017's recorded risk).
  stackedCurrentHero: {
    alignItems: 'stretch',
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
  headingRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.md },
  staleNotice: {
    alignItems: 'center',
    borderRadius: radii.control,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
});
