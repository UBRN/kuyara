import { placeSearchQueryMaxLength } from '@kuyara/contracts';
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import {
  AppText,
  Button,
  Crossfade,
  fadeTo,
  Icon,
  NativeList,
  NativeListRow,
  NativeListSection,
  NativeTextField,
  Presence,
  Surface,
} from '@/components/ui';
import { useErrorAnnouncement } from '@/components/ui/use-error-announcement';
import { useKeyboardVisible } from '@/components/ui/use-keyboard-visible';
import { useWeatherInteractionEvents } from '@/features/analytics/application/use-interaction-events';
import { PlaceSearchController } from '@/features/weather/application/place-search-controller';
import type { WeatherApplicationState } from '@/features/weather/application/weather-application-controller';
import type { ActiveLocation } from '@/features/weather/domain/weather';
import {
  usePlaceSearchApplication,
  useWeatherApplication,
} from '@/features/weather/application/weather-application-context';
import { useLocalization } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type LocationFlow = Extract<WeatherApplicationState, { status: 'ready' }>['locationFlow'];

type LocationSelectionControlsProps = Readonly<{
  header?: ReactNode;
  /** Called once a pick has become the active location, so a picker screen can close. */
  onLocationSelected?: () => void;
  testID: string;
  testIDPrefix: 'onboarding' | 'weather';
}>;

export function LocationSelectionControls({
  header,
  onLocationSelected,
  testID,
  testIDPrefix,
}: LocationSelectionControlsProps) {
  const application = useWeatherApplication();
  const { state } = application;
  const { searchPlaces, selectPlaceSearchResult } = usePlaceSearchApplication();
  const weatherEvents = useWeatherInteractionEvents();
  const changeContext = testIDPrefix === 'onboarding' ? 'onboarding' : 'weather_tab';
  // Taxonomy 5.4: `location_changed` fires only when the active location's identity
  // actually changed. `getSnapshot()` reads the controller's committed state directly, so
  // the "after" read here is never a stale, pre-await render.
  const reportLocationSelection = (before: typeof application.state) => {
    weatherEvents.locationSelectionFinished(
      before,
      application.getSnapshot?.() ?? application.state,
      changeContext,
    );
  };
  // A pick is done only when it is the active location and nothing is left to answer: a
  // permission rationale, a denial or a failed lookup keeps the picker open with its card.
  const finishSelection = (
    before: typeof application.state,
    isChosen: (location: ActiveLocation) => boolean,
  ) => {
    reportLocationSelection(before);
    const after = application.getSnapshot?.() ?? application.state;
    if (after.status === 'ready' && after.locationFlow === 'idle' && !after.isSelectingLocation
      && after.activeLocation && isChosen(after.activeLocation)) {
      onLocationSelected?.();
    }
  };
  const isDevice = (location: ActiveLocation) => location.source === 'device';
  const { language, messages } = useLocalization();
  const copy = messages.weather;
  const theme = useKuyaraTheme();
  const [query, setQuery] = useState('');
  // With the keyboard up the results are the point of the screen: the onboarding heading, its
  // progress bar and its long body step aside so the list keeps room above the keyboard.
  const keyboardVisible = useKeyboardVisible();
  const shownHeader = keyboardVisible ? null : header;
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

  // The results arrive with a fade on `motion.fast` rather than popping in (Law 7). With
  // nothing to show the list is empty, so it waits unseen for the next results.
  const hasResults = search.status === 'ready' && search.places.length > 0;
  const resultsOpacity = useSharedValue(hasResults ? 1 : 0);
  useEffect(() => {
    resultsOpacity.set(hasResults ? fadeTo(1, theme.motion.fast, theme.motion) : 0);
  }, [hasResults, resultsOpacity, theme.motion]);
  const resultsFade = useAnimatedStyle(() => ({ opacity: resultsOpacity.get() }));

  useEffect(() => {
    // React Native live regions cover Android; VoiceOver needs an explicit announcement.
    if (Platform.OS === 'ios' && statusCopy) {
      AccessibilityInfo.announceForAccessibility(statusCopy);
    }
  }, [statusCopy]);

  // The cards under the main button carry live regions for Android; VoiceOver ignores them,
  // so the outcome of the button is spoken here, once each time a message appears.
  const flowMessages: Partial<Record<LocationFlow, string>> = {
    'denied-requestable': copy.placeDeniedBody,
    'denied-permanent': copy.placePermanentDeniedBody,
    'services-unavailable': copy.placeServicesUnavailableBody,
    'lookup-failed': copy.lookupFailedBody,
    'selection-failed': copy.selectionFailedBody,
  };
  const locationFlow = state.status === 'ready' ? state.locationFlow : 'idle';
  const flowMessage = flowMessages[locationFlow];
  useErrorAnnouncement(
    locationFlow === 'rationale'
      ? `${copy.locationRationaleTitle} ${copy.locationRationaleBody}`
      : flowMessage ?? null,
  );

  if (state.status !== 'ready') {
    return (
      <View style={styles.root} testID={testID}>
        <View style={styles.controls}>
          {shownHeader}
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

  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.controls}>
        {shownHeader}
        <Button
          label={copy.useCurrentLocation}
          loading={state.isSelectingLocation}
          onPress={() => {
            const before = application.state;
            void application.beginDeviceLocationSelection().then(() => finishSelection(before, isDevice));
          }}
          testID={`${testIDPrefix}-location-device`}
          variant={state.locationFlow === 'rationale' ? 'tonal' : 'prominent'}
        />
        {/* The rationale opens and closes in place under its button (Law 7). Its slot takes
            back the column's gap and the card carries it inside, so no space stays behind. */}
        <View style={styles.presenceSlot}>
          <Presence testID={`${testIDPrefix}-location-rationale`} visible={state.locationFlow === 'rationale'}>
            <View style={styles.presenceContent}>
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
                      void application.confirmDeviceLocationRequest().then(() => finishSelection(before, isDevice));
                    }}
                  />
                  <Button
                    label={copy.cancel}
                    onPress={application.dismissLocationFlow}
                    variant="plain"
                  />
                </View>
              </Surface>
            </View>
          </Presence>
        </View>
        {flowMessage ? (
          <Surface accessibilityLiveRegion="polite" style={styles.card} variant="muted">
            <AppText>{flowMessage}</AppText>
            {state.locationFlow === 'denied-permanent' ? (
              <Button
                label={copy.openSettings}
                onPress={() => void application.openApplicationSettings()}
                variant="tonal"
              />
            ) : null}
            <Button
              label={copy.cancel}
              onPress={application.dismissLocationFlow}
              variant="plain"
            />
          </Surface>
        ) : null}
        <NativeTextField
          label={copy.placeSearchLabel}
          maxLength={placeSearchQueryMaxLength}
          onChangeText={setQuery}
          placeholder={copy.placeSearchPlaceholder}
          testID={`${testIDPrefix}-place-search`}
        />
        {/* A new status crossfades in over the old rather than snapping (Law 7). */}
        {statusCopy ? (
          <Crossfade contentKey={statusCopy}>
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
          </Crossfade>
        ) : null}
      </View>
      <Animated.View style={[styles.root, resultsFade]}>
      <NativeList testID={`${testIDPrefix}-place-results`}>
        {hasResults ? (
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
                        void selectPlaceSearchResult(place).then(() => finishSelection(
                          before,
                          (location) => location.source === 'manual' && location.catalogId === place.id,
                        ));
                        // A manual pick overrides the device location regardless of
                        // whether it ends up the same place, so first use gates on the
                        // action, not on `location_changed` firing.
                        weatherEvents.manualLocationSelected();
                      }
                }
                selected={
                  state.activeLocation?.source === 'manual' &&
                  state.activeLocation.catalogId === place.id
                }
                testID={`${testIDPrefix}-place-${place.id}`}
              />
            ))}
          </NativeListSection>
        ) : null}
      </NativeList>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  controls: { padding: spacing.lg, gap: spacing.md },
  card: { gap: spacing.md, padding: spacing.lg },
  presenceSlot: { marginTop: -spacing.md },
  presenceContent: { paddingTop: spacing.md },
  actions: { gap: spacing.sm },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusText: { flex: 1 },
});
