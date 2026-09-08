import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';

import { AppText, Button, Icon, NativeList, NativeListRow, NativeListSection, NativeTextField, Surface } from '@/components/ui';
import { PlaceSearchController } from '@/features/weather/application/place-search-controller';
import { usePlaceSearchApplication, useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { useLocalization } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export function WeatherLocationScreen() {
  const application = useWeatherApplication();
  const { state } = application;
  const { searchPlaces, selectPlaceSearchResult } = usePlaceSearchApplication();
  const { language, messages } = useLocalization();
  const copy = messages.weather;
  const theme = useKuyaraTheme();
  const headerHeight = useHeaderHeight();
  const [query, setQuery] = useState('');
  const controller = useMemo(() => new PlaceSearchController(searchPlaces), [searchPlaces]);
  const search = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    controller.search(query, language);
    return () => controller.cancel();
  }, [controller, language, query]);
  const statusCopy = search.status === 'loading' ? copy.placeSearchLoading
    : search.status === 'error' ? copy.placeSearchErrors[search.code]
      : search.status === 'ready' && search.places.length === 0 ? copy.placeSearchEmpty : null;
  useEffect(() => {
    // React Native live regions cover Android; VoiceOver needs an explicit announcement.
    if (Platform.OS === 'ios' && statusCopy) AccessibilityInfo.announceForAccessibility(statusCopy);
  }, [statusCopy]);

  if (state.status !== 'ready') {
    return (
      <View style={styles.controls}>
        <AppText accessibilityLiveRegion="polite">{state.status === 'loading' ? copy.refreshing : copy.loadErrorBody}</AppText>
        {state.status === 'error' ? <Button label={copy.retry} onPress={() => void application.retry()} /> : null}
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      testID="weather-location-screen">
      <View style={styles.controls}>
        <Button
          label={copy.useCurrentLocation}
          loading={state.isSelectingLocation}
          variant={state.locationFlow === 'rationale' ? 'secondary' : 'primary'}
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
        <NativeTextField label={copy.placeSearchLabel} placeholder={copy.placeSearchPlaceholder} maxLength={100} onChangeText={setQuery} testID="weather-place-search" />
        {statusCopy ? (
          <View accessible accessibilityLabel={statusCopy} accessibilityLiveRegion="polite" style={styles.status}>
            {search.status === 'error' ? <Icon color={theme.colors.warningInk} name="warning" size={16} /> : null}
            <AppText colorRole={search.status === 'error' ? 'warningInk' : 'textSecondary'} style={styles.statusText} variant="caption">{statusCopy}</AppText>
          </View>
        ) : null}
      </View>
      <NativeList testID="weather-place-results">
        {search.status === 'ready' && search.places.length > 0 ? (
          <NativeListSection footer={copy.placeSearchAttribution}>
            {search.places.map((place) => (
              <NativeListRow
                key={place.id}
                chevron={false}
                label={copy.placeSearchResultLabel(place.displayName, place.region)}
                onPress={state.isSelectingLocation ? undefined : () => void selectPlaceSearchResult(place)}
                testID={`weather-place-${place.id}`}
                // ponytail: the existing native row exposes a trailing value, not a selected trait; spoken selection still needs native verification.
                value={state.activeLocation?.source === 'manual' && state.activeLocation.catalogId === place.id ? copy.placeSearchSelected : undefined}
              />
            ))}
          </NativeListSection>
        ) : null}
      </NativeList>
    </KeyboardAvoidingView>
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
