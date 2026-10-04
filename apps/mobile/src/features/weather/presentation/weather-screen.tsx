import { weatherLocalDateKey } from '@kuyara/contracts';
import { useFocusEffect } from 'expo-router';
import { Fragment, useCallback, useState } from 'react';
import {
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { useAnimatedRef, useScrollOffset } from 'react-native-reanimated';

import {
  AppText,
  Button,
  Crossfade,
  Entrance,
  haptics,
  Icon,
  ListRow,
  ListRowGroup,
  Presence,
  RollingText,
  Screen,
  ScrollDepth,
  SectionHeader,
  Surface,
  useRefreshOutcomeHaptics,
  useTextScaling,
} from '@/components/ui';
import { Divider } from '@/components/ui/divider';
import { useSinglePush } from '@/components/ui/use-single-push';
import { useStatusAnnouncement } from '@/components/ui/use-status-announcement';
import { useWeatherInteractionEvents } from '@/features/analytics/application/use-interaction-events';
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
import { hourlyRailColumns } from '@/features/weather/presentation/hourly-rail-columns';
import { uvLevelOf } from '@/features/weather/presentation/uv-level';
import { WeatherGlyph } from '@/features/weather/presentation/weather-glyph';
import { dateKeyWeekday, percentage } from '@/features/weather/presentation/weather-format';
import { WeatherErrorState, WeatherLoadingState } from '@/features/weather/presentation/weather-states';
import { resolveAtmosphereState, resolveDaypart } from '@/features/today/domain/atmosphere-state';
import { numberFormat } from '@/domain/intl-format';
import { wholeWindSpeed } from '@/domain/wind-speed';
import { useForegroundClock } from '@/hooks/use-foreground-clock';
import { useLocalization } from '@/localization/use-messages';
import { localeTag } from '@/localization/locale-tag';
import { formatClockTime, formatLastUpdated } from '@/presentation/format-clock-time';
import { formatTemperature, formatTemperatureDifference, formatTemperatureValue } from '@/presentation/format-temperature';
import type { TemperatureUnit } from '@/localization/device-locale';
import type { SupportedLanguage } from '@/localization/messages';
import { PlateView } from '@/theme/plate-theme';
import { plateTheme, radii, spacing, typography } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

function decimal(value: number, language: SupportedLanguage): string {
  return numberFormat(localeTag(language), {
    maximumFractionDigits: 1,
    // A wind that rounds away to nothing must not read as blowing backwards.
  }).format(Math.round(Math.abs(value) * 10) === 0 ? 0 : value);
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
  language: SupportedLanguage,
  hour12: boolean,
  temperatureUnit: TemperatureUnit,
): string {
  // The dressing day is what "the rest of" means: before 18:00 local it is the rest of the
  // calendar day, and from 18:00 it runs to 04:00, which the copy calls the evening. The
  // boundary is a clock hour while the glyph beside it follows the real sun, so the word has
  // to hold with the sun still up. The period selects a whole sentence; nothing is assembled
  // from a translated fragment.
  if (outlook.kind === 'steady') {
    return outlook.period === 'evening' ? copy.outlook.steadyEvening : copy.outlook.steady;
  }
  const at = formatClockTime(outlook.atHour, language, hour12, timeZone);
  if (outlook.kind === 'temperature_change') {
    const values = {
      time: at,
      degrees: formatTemperatureDifference(
        Math.abs(outlook.toApparentCelsius - outlook.fromApparentCelsius),
        language, temperatureUnit
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

type WeatherScreenProps = Readonly<{
  /** False until the tab is first shown: the forecast cards arrive then, not while it is hidden. */
  shown?: boolean;
}>;

export function WeatherScreen({ shown = true }: WeatherScreenProps = {}) {
  const { hour12, language, messages, temperatureUnit, windSpeedUnit } = useLocalization();
  const theme = useKuyaraTheme();
  const { controlScale, usesStackedLayout } = useTextScaling();
  const copy = messages.weather;
  const application = useWeatherApplication();
  const { revalidateFreshness, state } = application;
  const weatherEvents = useWeatherInteractionEvents();
  const push = useSinglePush();
  // The title row has no native large title to give way as the forecast scrolls over it.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);
  // The control shows only a refresh the user pulled for. Binding it to the application's
  // `isRefreshing` also turned it on programmatically, and on iOS a RefreshControl that
  // starts while the screen is behind the location picker or freshly mounted keeps its
  // inset until the next pull (seen 2026-09-10 after a location change).
  const [pullInFlight, setPullInFlight] = useState(false);
  // The forecast's marks draw in only when its data reaches a screen that was showing none
  // (a first fetch, or a new place loading): a cached open and a refresh leave them still.
  // The cold `loading` status is the cache being read, so it does not count as empty.
  const [awaitingForecast, setAwaitingForecast] = useState(false);
  // The rail's clock: read once, then again whenever the tab regains focus, so a screen
  // left open across an hour boundary drops the ended hour on return without a timer.
  const now = useForegroundClock();
  // The same return re-evaluates freshness, which otherwise only moves on init,
  // foreground, selection and refresh, and leaves a screen left open labelled "Fresh".
  useFocusEffect(useCallback(() => { void revalidateFreshness(); }, [revalidateFreshness]));
  useRefreshOutcomeHaptics(
    state.status === 'ready' && state.isRefreshing,
    state.status === 'ready' && state.refreshFailure !== null,
  );
  // The same three announced states as Today (docs/product-decisions.md): refreshing,
  // refresh failed, or last updated, the last of which keeps Weather's fresh/stale split.
  const freshnessStatus = state.status !== 'ready'
    ? null
    : state.isRefreshing
      ? copy.refreshing
      : state.refreshFailure !== null
        ? copy.refreshFailed
        : state.freshness === 'fresh'
          ? copy.fresh
          : copy.stale;
  // Only the focused screen speaks, so a refresh Today shows as well is not said twice.
  // The freshness line's live region covers Android; VoiceOver hears each change once.
  useStatusAnnouncement(freshnessStatus);

  const refreshFailure = state.status === 'ready' ? state.refreshFailure : null;
  const failureCopy = refreshFailure === 'offline'
    ? {
        title: copy.offlineTitle,
        body: copy.offlineBody,
        notice: copy.offlineNotice,
      }
    : refreshFailure === 'unavailable' || refreshFailure === 'unknown'
      ? {
          title: copy.unavailableTitle,
          body: copy.unavailableBody,
          notice: copy.unavailableNotice,
        }
      : refreshFailure === 'rate-limited'
        ? {
            title: copy.rateLimitedTitle,
            body: copy.rateLimitedBody,
            notice: copy.rateLimitedNotice,
          }
        : null;
  // The stale notice keeps its words while it closes after a refresh succeeds.
  const [shownNotice, setShownNotice] = useState(failureCopy?.notice ?? null);
  if (failureCopy && failureCopy.notice !== shownNotice) setShownNotice(failureCopy.notice);

  // Every branch carries the scroll ref: Reanimated reads it when the first branch mounts, and
  // a branch without it leaves the offset unattached and warns on every cold launch.
  if (state.status === 'loading') {
    return (
      <Screen contentContainerStyle={styles.content} ref={scrollRef} testID="weather-screen">
        <SectionHeader title={copy.title} />
        <WeatherLoadingState label={copy.loading} />
      </Screen>
    );
  }

  if (state.status === 'error') {
    return (
      <Screen contentContainerStyle={styles.center} fill ref={scrollRef} testID="weather-screen">
        <WeatherErrorState
          body={copy.loadErrorBody}
          onRetry={() => void application.retry()}
          retryLabel={copy.retry}
          title={copy.loadErrorTitle}
        />
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
      weatherEvents.refreshFinished(wasFailing, outcome);
    });
  };

  const activeName = state.activeLocation ? locationName(state.activeLocation, copy) : copy.noLocation;
  const captionKey = locationCaptionKey(
    state.activeLocation,
    state.permission.kind === 'granted',
  );
  const locationCaption = captionKey ? copy[captionKey] : null;
  // After a location switch the controller keeps the previous place's snapshot as the last
  // valid result until the new place loads. It carries no name of its own, so its conditions
  // are held back rather than shown under the new place's label.
  const snapshot = state.snapshot !== null
    && state.snapshot.locationKey === state.activeLocation?.locationKey
    ? state.snapshot
    : null;
  if (snapshot === null && !awaitingForecast) setAwaitingForecast(true);
  // One reading of the daypart colours the stage and draws the glyph on it, so each condition
  // ink is only ever measured against the planes its own daypart can put behind it.
  const currentDaypart = snapshot
    ? resolveDaypart(new Date(now).toISOString(), snapshot.timeZone, state.activeLocation?.coordinates)
    : null;
  const stageColor = snapshot
    ? theme.atmosphere[resolveAtmosphereState(snapshot.current.condition, currentDaypart)]
    : theme.colors.stage;
  // What stands on the stage draws in the stage's own roles (`PlateView` provides them below).
  const plate = plateTheme(theme, stageColor);
  const uvLevel = snapshot ? copy.uvLevels[uvLevelOf(snapshot.current.uvIndex)] : '';
  const windSpeed = snapshot
    ? decimal(wholeWindSpeed(snapshot.current.windSpeedMetersPerSecond, windSpeedUnit), language)
    : '';
  const updatedAt = snapshot
    ? copy.updatedAt(formatLastUpdated(snapshot.fetchedAt, language, hour12, now))
    : '';
  const outlook = snapshot
    ? findWeatherOutlook({ snapshot, now: new Date(now).toISOString() })
    : null;
  // Lines that change in place on a refresh cross over instead of snapping (Law 7).
  const outlookLine = snapshot && outlook
    ? outlookSentence(outlook, copy, snapshot.timeZone, language, hour12, temperatureUnit)
    : null;
  const feelsLikeLine = snapshot
    ? `${copy.feelsLike(
      formatTemperature(snapshot.current.apparentTemperatureCelsius, language, temperatureUnit),
    )} · ${copy.range(
      formatTemperature(snapshot.minimumTemperatureCelsius, language, temperatureUnit),
      formatTemperature(snapshot.maximumTemperatureCelsius, language, temperatureUnit),
    )}`
    : '';
  // The viewer's own local day, read once: it both drops the days that have already
  // ended and marks the row the current temperature belongs to.
  const localDayKey = snapshot
    ? weatherLocalDateKey(new Date(now).toISOString(), snapshot.timeZone)
    : null;
  // Filtered at render time for the same reason the hourly rail is (remaining-hours.ts):
  // a snapshot kept across midnight, which is exactly what an offline device has, would
  // otherwise open on yesterday and lose the today mark with it. Date keys are
  // `YYYY-MM-DD`, so a string compare is a date compare. Five of the contract's seven
  // survive it: five fit without scrolling even at the largest
  // accessibility size, and the sixth is where confidence starts to fall.
  const dailyRows: readonly DailyOutlookRow[] = snapshot?.daily === undefined
    ? []
    : snapshot.daily
      .filter((day) => localDayKey === null || day.dateKey >= localDayKey)
      .slice(0, dailyOutlookDayCount).map((day) => {
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
          day: dateKeyWeekday(day.dateKey, language, 'long'),
          condition: copy.conditions[day.condition],
          unitName: messages.temperatureUnitNames[temperatureUnit],
          minimumTemperature: formatTemperatureValue(day.minimumTemperatureCelsius, language, temperatureUnit),
          maximumTemperature: formatTemperatureValue(day.maximumTemperatureCelsius, language, temperatureUnit),
          precipitationProbability: day.precipitationProbability,
          precipitationMillimetres: amount ?? undefined,
          currentTemperature: currentCelsius === null
            ? undefined
            : formatTemperatureValue(currentCelsius, language, temperatureUnit),
        }),
        condition: day.condition,
        currentCelsius,
        maximum: formatTemperature(day.maximumTemperatureCelsius, language, temperatureUnit),
        maximumCelsius: day.maximumTemperatureCelsius,
        minimum: formatTemperature(day.minimumTemperatureCelsius, language, temperatureUnit),
        minimumCelsius: day.minimumTemperatureCelsius,
        precipitation: amount !== null
          ? { line: copy.dailyPrecipitationValue(amount, chance), lines: copy.dailyPrecipitationStacked(amount, chance) }
          : day.precipitationProbability > 0 ? { line: chance, lines: chance } : null,
        weekday: dateKeyWeekday(day.dateKey, language, 'short'),
      };
    });
  const hourlyColumns = snapshot === null ? [] : hourlyRailColumns(
    snapshot,
    now,
    state.activeLocation?.coordinates,
    { copy, hour12, language, temperatureUnit, unitName: messages.temperatureUnitNames[temperatureUnit] },
  );
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
          onPress={() => push('/weather/location')}
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
      ref={scrollRef}
      testID="weather-screen">
      <ScrollDepth scrollOffset={scrollOffset}>
      <SectionHeader
        title={copy.title}
        trailingAction={state.activeLocation ? (
          <Button
            accessibilityLabel={copy.refreshAccessibilityLabel}
            icon="refresh"
            label={copy.refresh}
            loading={state.isRefreshing}
            onPress={() => void handleRefresh()}
            size="small"
            style={styles.refreshButton}
            testID="weather-refresh-button"
            variant="tonal"
          />
        ) : undefined}
      />
      </ScrollDepth>
      {state.activeLocation ? null : (
        <AppText colorRole="textSecondary">{copy.introduction}</AppText>
      )}

      {snapshot ? null : locationSection}

      {/* Law 7: the forecast cards arrive in reading order, one `motion.stagger` apart, while
          the current section holds the hero value and stays still (ADR 0020). Keyed on the
          place, so a new place brings them in again instead of snapping them back after the
          loading card; a refresh of the same place keeps them mounted and still. */}
      {snapshot ? (
        <Fragment key={snapshot.locationKey}>
          {snapshot.origin.kind === 'sample' ? (
            <Surface accessibilityLiveRegion="polite" style={styles.disclosure} variant="muted">
              <AppText variant="bodyStrong">{copy.sampleDisclosure}</AppText>
            </Surface>
          ) : null}

          <View style={styles.currentSection}>
            {/* The current conditions stand on the same weather-coloured stage as Today's
                outfit, from the same reading of condition and daypart; the forecast cards
                below stay plain. Everything on it takes the plate's roles and the primary
                ink, which is the role measured at AA on every atmosphere plane. */}
            <PlateView
              color={stageColor}
              style={styles.stage}
              testID="weather-current-card">
              <View
                accessible
                accessibilityLabel={copy.currentConditionsAccessibilityLabel({
                  condition: copy.conditions[snapshot.current.condition],
                  unitName: messages.temperatureUnitNames[temperatureUnit],
                  temperature: formatTemperatureValue(snapshot.current.temperatureCelsius, language, temperatureUnit),
                  apparentTemperature: formatTemperatureValue(
                    snapshot.current.apparentTemperatureCelsius,
                    language, temperatureUnit
                  ),
                  minimumTemperature: formatTemperatureValue(snapshot.minimumTemperatureCelsius, language, temperatureUnit),
                  maximumTemperature: formatTemperatureValue(snapshot.maximumTemperatureCelsius, language, temperatureUnit),
                  precipitationProbability: snapshot.current.precipitationProbability,
                })}
                style={[
                  styles.currentHero,
                  usesStackedLayout && styles.stackedCurrentHero,
                ]}>
                <View style={styles.currentConditionGroup}>
                  <View style={styles.currentConditionRow}>
                    <RollingText
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                      numberOfLines={1}
                      tabularNumbers
                      variant="display">
                      {formatTemperature(snapshot.current.temperatureCelsius, language, temperatureUnit)}
                    </RollingText>
                    <AppText variant="bodyStrong">
                      {copy.conditions[snapshot.current.condition]}
                    </AppText>
                  </View>
                  <Crossfade contentKey={feelsLikeLine}>
                    <AppText variant="caption">{feelsLikeLine}</AppText>
                  </Crossfade>
                </View>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants">
                  <WeatherGlyph
                    condition={snapshot.current.condition}
                    intensity={ambientIntensityOf(snapshot.current.condition)}
                    daypart={currentDaypart}
                  />
                </View>
              </View>

              {outlookLine ? (
                <Crossfade contentKey={outlookLine}>
                  <AppText
                    colorRole="textPrimary"
                    tabularNumbers
                    testID="weather-outlook"
                    variant="body">
                    {outlookLine}
                  </AppText>
                </Crossfade>
              ) : null}

              <Divider testID="weather-current-divider" />

              <View
                style={[
                  styles.statsGrid,
                  usesStackedLayout && styles.stackedStatsGrid,
                ]}>
                {([
                  {
                    accessibilityLabel: copy.wind[windSpeedUnit](windSpeed),
                    icon: 'wind',
                    label: copy.windLabel,
                    value: copy.windValue[windSpeedUnit](windSpeed),
                  },
                  {
                    accessibilityLabel: copy.humidity(snapshot.current.humidity),
                    icon: 'humidity',
                    label: copy.humidityLabel,
                    value: copy.humidityValue(snapshot.current.humidity),
                  },
                  {
                    accessibilityLabel: copy.uvIndex(
                      decimal(Math.round(snapshot.current.uvIndex), language),
                      uvLevel,
                    ),
                    icon: 'uv',
                    label: copy.uvIndexLabel,
                    value: uvLevel,
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
                    <Icon color={plate.colors.iconPrimary} name={stat.icon} size={16 * controlScale} />
                    <AppText variant="eyebrow">
                      {stat.label}
                    </AppText>
                    <AppText tabularNumbers variant="bodyStrong">{stat.value}</AppText>
                  </View>
                ))}
              </View>

            </PlateView>
            <View style={styles.headingRow}>
              {/* Each line crossfades when its words change rather than snapping; the leaving
                  words are out of the reading order, so the live region speaks only the new. */}
              <Crossfade contentKey={freshnessStatus ?? ''}>
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
              </Crossfade>
              <Crossfade contentKey={updatedAt}>
                <AppText colorRole="textSecondary" tabularNumbers variant="caption">
                  {updatedAt}
                </AppText>
              </Crossfade>
            </View>
          </View>

          {locationSection}

          {hourlyColumns.length > 0 && (
            <Entrance index={0} waiting={!shown}>
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
                <HourlyRail columns={hourlyColumns} drawIn={awaitingForecast} waiting={!shown} />
              </Surface>
            </Entrance>
          )}

          {dailyRows.length > 0 && (
            <Entrance index={1} waiting={!shown}>
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
                <DailyOutlook drawIn={awaitingForecast} rows={dailyRows} waiting={!shown} />
              </Surface>
            </Entrance>
          )}
        </Fragment>
      ) : failureCopy ? (
        <WeatherErrorState
          body={failureCopy.body}
          onRetry={() => void handleRefresh()}
          retryLabel={copy.retry}
          title={failureCopy.title}
        />
      ) : state.activeLocation ? (
        <WeatherLoadingState label={copy.loading} />
      ) : null}

      {/* The notice opens and closes in place (Law 7). Its slot takes back the screen's gap
          and the notice carries it inside, so a closed notice leaves no space behind. */}
      <View style={styles.presenceSlot}>
        <Presence testID="weather-stale-notice" visible={Boolean(snapshot && failureCopy)}>
          <View style={styles.presenceContent}>
            <Surface
              accessible
              accessibilityLabel={failureCopy?.notice ?? shownNotice ?? undefined}
              accessibilityLiveRegion="polite"
              style={styles.staleNotice}
              variant="muted">
              <Icon color={theme.colors.warningInk} name="warning" size={16 * controlScale} />
              <AppText colorRole="warningInk" style={styles.staleNoticeText} variant="caption">
                {failureCopy?.notice ?? shownNotice}
              </AppText>
            </Surface>
          </View>
        </Presence>
      </View>
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
  refreshButton: { alignSelf: 'flex-start' },
  currentHero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  stage: { borderRadius: radii.stage, gap: spacing.md, padding: spacing.lg },
  // Stretched, not flex-start: at accessibility sizes the 56-point hero needs the whole
  // stage width to lay out on one line (ADR 0017's recorded risk).
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
  presenceSlot: { marginTop: -spacing.md },
  presenceContent: { paddingTop: spacing.md },
  staleNotice: {
    alignItems: 'center',
    borderRadius: radii.control,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  // Beside the glyph the notice wraps inside the card instead of running past its edge.
  staleNoticeText: { flexShrink: 1, minWidth: 0 },
});
