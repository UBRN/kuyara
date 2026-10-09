import { placeSearchQueryMaxLength } from '@kuyara/contracts';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import {
  AppText,
  Button,
  Crossfade,
  fadeTo,
  haptics,
  Icon,
  ListRow,
  ListRowGroup,
  NativeList,
  NativeListRow,
  NativeListSection,
  NativeTextField,
  Presence,
  Surface,
  useTextScaling,
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
import { locationCaption, locationName } from '@/features/weather/presentation/location-label';
import { useLocalization } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type LocationFlow = Extract<WeatherApplicationState, { status: 'ready' }>['locationFlow'];

type LocationSelectionControlsProps = Readonly<{
  header?: ReactNode;
  /** Called once a pick has become the active location, so a picker screen can close. */
  onLocationSelected?: () => void;
  /**
   * Whether a pick is reported to analytics. Onboarding runs before the consent question, so
   * it turns this off.
   */
  reportsSelection?: boolean;
  testID: string;
  testIDPrefix: 'onboarding' | 'weather';
}>;

export function LocationSelectionControls({
  header,
  onLocationSelected,
  reportsSelection = true,
  testID,
  testIDPrefix,
}: LocationSelectionControlsProps) {
  const application = useWeatherApplication();
  const { state } = application;
  const { searchPlaces, selectPlaceSearchResult } = usePlaceSearchApplication();
  const weatherEvents = useWeatherInteractionEvents();
  // Taxonomy 5.4: `location_changed` fires only when the active location's identity
  // actually changed. `getSnapshot()` reads the controller's committed state directly, so
  // the "after" read here is never a stale, pre-await render. Onboarding runs before the
  // consent question, so it reports nothing (`reportsSelection` off).
  const reportLocationSelection = (before: typeof application.state) => {
    if (!reportsSelection) return;
    weatherEvents.locationSelectionFinished(before, application.getSnapshot?.() ?? application.state);
  };
  // A pick is done only when it is the active location and nothing is left to answer: a
  // denial or a failed lookup keeps the picker open with its card.
  // Returns the chosen location once it is done.
  const finishSelection = (
    before: typeof application.state,
    isChosen: (location: ActiveLocation) => boolean,
  ): ActiveLocation | null => {
    reportLocationSelection(before);
    const after = application.getSnapshot?.() ?? application.state;
    if (after.status === 'ready' && after.locationFlow === 'idle' && !after.isSelectingLocation
      && after.activeLocation && isChosen(after.activeLocation)) {
      onLocationSelected?.();
      return after.activeLocation;
    }
    return null;
  };
  const { language, messages } = useLocalization();
  const copy = messages.weather;
  // A device lookup asked for on this screen, by the button or by the return from Settings:
  // its status line shows while the fix is taken, and the place it found is confirmed once,
  // spoken and felt, so the person knows it worked. Only the newest lookup reports.
  const [locatingHere, setLocatingHere] = useState(false);
  const lastLookup = useRef(0);
  const selectDeviceLocation = (select: () => Promise<void>) => {
    const before = application.state;
    const previous = before.status === 'ready' ? before.activeLocation : null;
    const lookup = ++lastLookup.current;
    setLocatingHere(true);
    void select().then(() => {
      if (lookup !== lastLookup.current) return;
      setLocatingHere(false);
      // Every selection stores a new location, so one still the same object was not looked up:
      // a Settings trip that ended without a lookup leaves the place in use as it was.
      const found = finishSelection(
        before,
        (location) => location.source === 'device' && location !== previous,
      );
      if (!found) return;
      haptics.success();
      // VoiceOver ignores live regions; Android hears the row as it opens.
      if (Platform.OS === 'ios') {
        AccessibilityInfo.announceForAccessibility(
          found.displayName ? copy.locationFoundNamed(found.displayName) : copy.locationFound,
        );
      }
    });
  };
  const theme = useKuyaraTheme();
  const [query, setQuery] = useState('');
  // With the keyboard up the results are the point of the screen: the onboarding heading, its
  // progress bar and its long body step aside, and so does a permission or failure card, so
  // the field and the list keep room above the keyboard instead of the list landing on them.
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
  // The previous-location sentence is only true once a location is active.
  const hasActiveLocation = state.status === 'ready' && state.activeLocation !== null;
  const flowMessages: Partial<Record<LocationFlow, string>> = {
    'denied-requestable': copy.placeDeniedBody,
    'denied-permanent': copy.placePermanentDeniedBody,
    'services-unavailable': copy.placeServicesUnavailableBody,
    'lookup-failed': hasActiveLocation ? copy.lookupFailedBody : copy.lookupFailedNoLocationBody,
    'selection-failed': hasActiveLocation ? copy.selectionFailedBody : copy.selectionFailedNoLocationBody,
  };
  const locationFlow = state.status === 'ready' ? state.locationFlow : 'idle';
  const flowMessage = flowMessages[locationFlow];
  useErrorAnnouncement(flowMessage ?? null);
  // The load error line has a live region for Android only; iOS speaks it here.
  useErrorAnnouncement(state.status === 'error' ? copy.loadErrorBody : null);
  // Only once permission is granted: under the system prompt nothing is being found yet.
  const locatingStatus = locatingHere && state.status === 'ready' && state.permission.kind === 'granted'
    && state.isSelectingLocation ? copy.locatingDevice : null;
  useErrorAnnouncement(locatingStatus);
  // The device location in use, named under the button with how it was resolved. The last one
  // shown stays drawn while its row closes, so the row never empties as it leaves.
  const currentDevice = state.status === 'ready' && state.locationFlow === 'idle'
    && state.activeLocation?.source === 'device' ? state.activeLocation : null;
  const [shownDevice, setShownDevice] = useState(currentDevice);
  if (currentDevice && currentDevice !== shownDevice) setShownDevice(currentDevice);

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

  const shownName = shownDevice ? locationName(shownDevice, copy) : '';
  const shownCaption = locationCaption(shownDevice, state.permission.kind === 'granted', copy);
  const isChosenPlace = (id: string) =>
    state.activeLocation?.source === 'manual' && state.activeLocation.catalogId === id;

  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.controls}>
        {shownHeader}
        <Button
          label={copy.useCurrentLocation}
          loading={state.isSelectingLocation}
          onPress={() => selectDeviceLocation(application.beginDeviceLocationSelection)}
          testID={`${testIDPrefix}-location-device`}
          // Once a location is in use the button steps down to locate again, so onboarding's
          // Continue stays the one prominent action (Law 1).
          variant={hasActiveLocation ? 'tonal' : 'prominent'}
        />
        {locatingStatus ? <StatusLine text={locatingStatus} /> : null}
        {/* The current place opens and closes in place under the button (Law 7). Its slot
            takes back the column's gap and the row carries it inside, so no space stays behind. */}
        <View style={styles.presenceSlot}>
          <Presence visible={currentDevice !== null && !keyboardVisible}>
            <View style={styles.presenceContent}>
              {shownDevice ? (
                <ListRowGroup>
                  <ListRow
                    accessibilityLabel={shownCaption ? `${shownName}, ${shownCaption}` : shownName}
                    glyph={({ color, size }) => <Icon color={color} name="location" size={size} />}
                    label={shownName}
                    labelWeight="bodyStrong"
                    selected
                    supportingText={shownCaption ?? undefined}
                    testID={`${testIDPrefix}-location-device-current`}
                  />
                </ListRowGroup>
              ) : null}
            </View>
          </Presence>
        </View>
        {flowMessage && !keyboardVisible ? (
          <Surface accessibilityLiveRegion="polite" style={styles.card} variant="muted">
            <AppText>{flowMessage}</AppText>
            {state.locationFlow === 'denied-permanent' ? (
              <Button
                label={copy.openSettings}
                onPress={() => selectDeviceLocation(application.openApplicationSettings)}
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
        {statusCopy ? <StatusLine text={statusCopy} warning={search.status === 'error'} /> : null}
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
                        // action, not on `location_changed` firing. Onboarding runs before
                        // the consent question, so it must not use up the first use either.
                        if (reportsSelection) weatherEvents.manualLocationSelected();
                      }
                }
                selected={isChosenPlace(place.id)}
                testID={`${testIDPrefix}-place-${place.id}`}
                trailingSymbol={isChosenPlace(place.id) ? { name: 'check', color: theme.colors.brandAccent } : undefined}
              />
            ))}
          </NativeListSection>
        ) : null}
      </NativeList>
      </Animated.View>
    </View>
  );
}

/** A status under a control; a new status crossfades in over the old rather than snapping (Law 7). */
function StatusLine({ text, warning = false }: Readonly<{ text: string; warning?: boolean }>) {
  const theme = useKuyaraTheme();
  const { controlScale } = useTextScaling();
  return (
    <Crossfade contentKey={text}>
      <View accessible accessibilityLabel={text} accessibilityLiveRegion="polite" style={styles.status}>
        {warning ? <Icon color={theme.colors.warningInk} name="warning" size={16 * controlScale} /> : null}
        <AppText colorRole={warning ? 'warningInk' : 'textSecondary'} style={styles.statusText} variant="caption">
          {text}
        </AppText>
      </View>
    </Crossfade>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  controls: { padding: spacing.lg, gap: spacing.md },
  card: { gap: spacing.md, padding: spacing.lg },
  presenceSlot: { marginTop: -spacing.md },
  presenceContent: { paddingTop: spacing.md },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusText: { flex: 1 },
});
