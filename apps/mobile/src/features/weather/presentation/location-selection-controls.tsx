import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  Icon,
  NativeList,
  NativeListRow,
  NativeListSection,
  NativeTextField,
  Surface,
} from '@/components/ui';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import { locationChangedMethodProperty } from '@/features/analytics/domain/analytics-mappers';
import { PlaceSearchController } from '@/features/weather/application/place-search-controller';
import {
  usePlaceSearchApplication,
  useWeatherApplication,
} from '@/features/weather/application/weather-application-context';
import type { WeatherApplicationState } from '@/features/weather/application/weather-application-controller';
import { useLocalization } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type LocationSelectionControlsProps = Readonly<{
  header?: ReactNode;
  testID: string;
  testIDPrefix: 'onboarding' | 'weather';
}>;

export function LocationSelectionControls({
  header,
  testID,
  testIDPrefix,
}: LocationSelectionControlsProps) {
  const application = useWeatherApplication();
  const { state } = application;
  const { searchPlaces, selectPlaceSearchResult } = usePlaceSearchApplication();
  const { analytics, firstUses } = useProductAnalytics();
  const changeContext = testIDPrefix === 'onboarding' ? 'onboarding' : 'weather_tab';
  // Taxonomy 5.4: `location_changed` fires only when the active location's identity
  // actually changed. `getSnapshot()` reads the controller's committed state directly, so
  // the "after" read here is never a stale, pre-await render.
  const captureIfLocationChanged = (before: WeatherApplicationState) => {
    const beforeKey = before.status === 'ready' ? before.activeLocation?.locationKey : undefined;
    const after = application.getSnapshot?.() ?? application.state;
    if (after.status !== 'ready' || !after.activeLocation) return;
    if (after.activeLocation.locationKey === beforeKey) return;
    analytics.capture('location_changed', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      method: locationChangedMethodProperty(after.activeLocation.source),
      change_context: changeContext,
    });
  };
  const { language, messages } = useLocalization();
  const copy = messages.weather;
  const theme = useKuyaraTheme();
  const [query, setQuery] = useState('');
  const controller = useMemo(() => new PlaceSearchController(searchPlaces), [searchPlaces]);
  const search = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    controller.search(query, language);
    return () => controller.cancel();
  }, [controller, language, query]);

  const statusCopy = search.status === 'loading'
    ? copy.placeSearchLoading
    : search.status === 'error'
      ? copy.placeSearchErrors[search.code]
      : search.status === 'ready' && search.places.length === 0
        ? copy.placeSearchEmpty
        : null;

  useEffect(() => {
    // React Native live regions cover Android; VoiceOver needs an explicit announcement.
    if (Platform.OS === 'ios' && statusCopy) {
      AccessibilityInfo.announceForAccessibility(statusCopy);
    }
  }, [statusCopy]);

  if (state.status !== 'ready') {
    return (
      <View style={styles.root} testID={testID}>
        <View style={styles.controls}>
          {header}
          <AppText accessibilityLiveRegion="polite">
            {state.status === 'loading' ? copy.loading : copy.loadErrorBody}
          </AppText>
          {state.status === 'error' ? (
            <Button label={copy.retry} onPress={() => void application.retry()} />
          ) : null}
        </View>
      </View>
    );
  }

  const flowMessages: Partial<Record<typeof state.locationFlow, string>> = {
    'denied-requestable': copy.placeDeniedBody,
    'denied-permanent': copy.placePermanentDeniedBody,
    'services-unavailable': copy.placeServicesUnavailableBody,
    'lookup-failed': copy.lookupFailedBody,
    'selection-failed': copy.selectionFailedBody,
  };
  const flowMessage = flowMessages[state.locationFlow];

  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.controls}>
        {header}
        <Button
          label={copy.useCurrentLocation}
          loading={state.isSelectingLocation}
          onPress={() => {
            const before = application.state;
            void application.beginDeviceLocationSelection().then(() => captureIfLocationChanged(before));
          }}
          testID={`${testIDPrefix}-location-device`}
          variant={state.locationFlow === 'rationale' ? 'secondary' : 'primary'}
        />
        {state.locationFlow === 'rationale' ? (
          <Surface accessibilityLiveRegion="polite" style={styles.card} variant="interactive">
            <AppText accessibilityRole="header" variant="title">
              {copy.locationRationaleTitle}
            </AppText>
            <AppText>{copy.locationRationaleBody}</AppText>
            <View style={styles.actions}>
              <Button
                label={copy.continuePermission}
                onPress={() => {
                  const before = application.state;
                  void application.confirmDeviceLocationRequest().then(() => captureIfLocationChanged(before));
                }}
              />
              <Button
                label={copy.cancel}
                onPress={application.dismissLocationFlow}
                variant="quiet"
              />
            </View>
          </Surface>
        ) : null}
        {flowMessage ? (
          <Surface accessibilityLiveRegion="polite" style={styles.card} variant="muted">
            <AppText>{flowMessage}</AppText>
            {state.locationFlow === 'denied-permanent' ? (
              <Button
                label={copy.openSettings}
                onPress={() => void application.openApplicationSettings()}
                variant="secondary"
              />
            ) : null}
            <Button
              label={copy.cancel}
              onPress={application.dismissLocationFlow}
              variant="quiet"
            />
          </Surface>
        ) : null}
        <NativeTextField
          label={copy.placeSearchLabel}
          maxLength={100}
          onChangeText={setQuery}
          placeholder={copy.placeSearchPlaceholder}
          testID={`${testIDPrefix}-place-search`}
        />
        {statusCopy ? (
          <View
            accessible
            accessibilityLabel={statusCopy}
            accessibilityLiveRegion="polite"
            style={styles.status}>
            {search.status === 'error' ? (
              <Icon color={theme.colors.warningInk} name="warning" size={16} />
            ) : null}
            <AppText
              colorRole={search.status === 'error' ? 'warningInk' : 'textSecondary'}
              style={styles.statusText}
              variant="caption">
              {statusCopy}
            </AppText>
          </View>
        ) : null}
      </View>
      <NativeList testID={`${testIDPrefix}-place-results`}>
        {search.status === 'ready' && search.places.length > 0 ? (
          <NativeListSection footer={copy.placeSearchAttribution}>
            {search.places.map((place) => (
              <NativeListRow
                key={place.id}
                chevron={false}
                label={copy.placeSearchResultLabel(place.displayName, place.region)}
                onPress={
                  state.isSelectingLocation
                    ? undefined
                    : () => {
                        const before = application.state;
                        void selectPlaceSearchResult(place).then(() => captureIfLocationChanged(before));
                        // A manual pick overrides the device location regardless of
                        // whether it ends up the same place, so first use gates on the
                        // action, not on `location_changed` firing.
                        void firstUses.markFirstUse('location_override').then((firstUse) => {
                          if (!firstUse) return;
                          analytics.capture('feature_used_first_time', {
                            schema_version: ANALYTICS_SCHEMA_VERSION,
                            feature_name: 'location_override',
                          });
                        });
                      }
                }
                testID={`${testIDPrefix}-place-${place.id}`}
                // ponytail: the existing native row exposes a trailing value, not a
                // selected trait; spoken selection still needs native verification.
                value={
                  state.activeLocation?.source === 'manual' &&
                  state.activeLocation.catalogId === place.id
                    ? copy.placeSearchSelected
                    : undefined
                }
              />
            ))}
          </NativeListSection>
        ) : null}
      </NativeList>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  controls: { padding: spacing.lg, gap: spacing.md },
  card: { gap: spacing.md, padding: spacing.lg },
  actions: { gap: spacing.sm },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusText: { flex: 1 },
});
