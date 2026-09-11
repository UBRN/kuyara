import {
  AccessibilityInfo,
  findNodeHandle,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Icon, NativeDatePicker, Screen, useTextScaling } from '@/components/ui';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import {
  ANALYTICS_SCHEMA_VERSION,
  type AnalyticsEventProperties,
} from '@/features/analytics/domain/analytics-events';
import {
  ageBucketProperty,
  onboardingLocationMethodProperty,
} from '@/features/analytics/domain/analytics-mappers';
import {
  createOnboardingDraft,
  onboardingPreferencesFromDraft,
  onboardingStepNames,
  reduceOnboardingDraft,
} from '@/features/profile/application/onboarding-state';
import type {
  DressStyle,
  Gender,
  OnboardingPreferences,
} from '@/features/profile/domain/profile';
import { PreferenceOption } from '@/features/profile/presentation/preference-option';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { LocationSelectionControls } from '@/features/weather/presentation/location-selection-controls';
import { useLocalization } from '@/localization/use-messages';
import { useKuyaraTheme } from '@/theme/theme-context';
import { borderWidths, radii, spacing } from '@/theme/theme';

type OnboardingScreenProps = Readonly<{
  initialGender: Gender | null;
  initialDressStyle: DressStyle | null;
  initialBirthDate: string | null;
  onComplete: (preferences: OnboardingPreferences) => Promise<void>;
}>;

const totalSteps = 5;

export function OnboardingScreen({
  initialBirthDate,
  initialDressStyle,
  initialGender,
  onComplete,
}: OnboardingScreenProps) {
  const [draft, dispatch] = useReducer(
    reduceOnboardingDraft,
    createOnboardingDraft({
      gender: initialGender,
      dressStyle: initialDressStyle,
      birthDate: initialBirthDate,
    }),
  );
  const [saveError, setSaveError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { usesStackedLayout } = useTextScaling();
  const announcedStep = useRef(false);
  const headingRef = useRef<Text>(null);
  const maximumBirthDate = useMemo(() => new Date(), []);
  const { language, messages } = useLocalization();
  const copy = messages.onboarding;
  const preferenceCopy = messages.preferences;
  const theme = useKuyaraTheme();
  const weatherState = useWeatherApplication().state;
  const activeLocationSource =
    weatherState.status === 'ready' ? weatherState.activeLocation?.source ?? null : null;
  const hasActiveLocation = activeLocationSource !== null;
  const { analytics } = useProductAnalytics();
  useScreenViewed('onboarding');

  useEffect(() => {
    analytics.capture('onboarding_started', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
    });
    // Fires once, when the welcome step first shows; not tied to `analytics`'s identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stepTitle =
    draft.step === 0
      ? copy.welcomeTitle
      : draft.step === 1
        ? copy.genderTitle
        : draft.step === 2
          ? copy.dressStyleTitle
          : draft.step === 3
            ? copy.birthDateTitle
            : copy.locationTitle;

  useEffect(() => {
    if (announcedStep.current) {
      AccessibilityInfo.announceForAccessibility(stepTitle);
      const animationFrame = requestAnimationFrame(() => {
        const headingNode = findNodeHandle(headingRef.current);
        if (headingNode) {
          AccessibilityInfo.setAccessibilityFocus(headingNode);
        }
      });
      return () => cancelAnimationFrame(animationFrame);
    } else {
      announcedStep.current = true;
    }
  }, [stepTitle]);

  const goForward = () => {
    setSaveError(false);

    const genderMissing = draft.step === 1 && !draft.gender;
    const dressStyleMissing = draft.step === 2 && !draft.dressStyle;
    if (genderMissing) {
      AccessibilityInfo.announceForAccessibility(copy.genderRequiredError);
    }
    if (dressStyleMissing) {
      AccessibilityInfo.announceForAccessibility(copy.dressStyleRequiredError);
    }
    // Taxonomy 5.2: only a step the user actually advances past is reported; a step the
    // reducer blocks for a missing required value stays silent.
    if (!genderMissing && !dressStyleMissing) {
      const stepCompleted: AnalyticsEventProperties<'onboarding_step_completed'> = {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        step_name: onboardingStepNames[draft.step],
        step_index: (draft.step + 1) as 1 | 2 | 3 | 4,
        // Only the birth date step is skippable here; the location step's own
        // `onboarding_step_completed` is reported from `complete()`.
        skipped: draft.step === 3 ? draft.birthDate === null : false,
      };
      analytics.capture(
        'onboarding_step_completed',
        draft.step === 2 && draft.dressStyle
          ? { ...stepCompleted, dress_style: draft.dressStyle }
          : stepCompleted,
      );
    }
    dispatch({ type: 'continue' });
  };

  const complete = async () => {
    const preferences = onboardingPreferencesFromDraft(draft);
    if (!preferences || isSaving) {
      AccessibilityInfo.announceForAccessibility(
        draft.gender ? copy.dressStyleRequiredError : copy.genderRequiredError,
      );
      return;
    }

    setIsSaving(true);
    setSaveError(false);
    try {
      await onComplete(preferences);
      analytics.capture('onboarding_step_completed', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        step_name: 'location',
        step_index: 5,
        skipped: !hasActiveLocation,
      });
      analytics.capture('onboarding_completed', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        dress_style: preferences.dressStyle,
        age_bucket: ageBucketProperty(preferences.birthDate),
        location_method: onboardingLocationMethodProperty(activeLocationSource),
      });
    } catch {
      setSaveError(true);
      AccessibilityInfo.announceForAccessibility(copy.saveError);
    } finally {
      setIsSaving(false);
    }
  };

  // Above the shared stacked threshold the pinned bar holds nothing but its stacked
  // buttons, so it cannot grow over the step; the rationale moves into the scrollable
  // content, where it can still be read to its end (ADR 0028 section 3).
  const locationRationale = (
    <AppText colorRole="textSecondary" variant="caption">
      {messages.weather.locationRationaleBody}
    </AppText>
  );

  const promises = [
    ['location', copy.weatherPromise],
    ['sparkle', copy.outfitsPromise],
    ['heart', copy.wardrobePromise],
  ] as const;

  const heading = (
    <View style={styles.heading}>
      <AppText accessibilityRole="header" ref={headingRef} variant="titleLarge">
        {stepTitle}
      </AppText>
      <View
        accessible
        accessibilityLabel={copy.stepPosition(draft.step + 1, totalSteps)}
        accessibilityRole="progressbar"
        accessibilityValue={{ max: totalSteps, min: 1, now: draft.step + 1 }}
        style={styles.progress}>
        {Array.from({ length: totalSteps }, (_, index) => (
          <View
            key={index}
            style={[
              styles.progressSegment,
              {
                backgroundColor: index <= draft.step
                  ? theme.colors.brandPrimary
                  : theme.colors.borderSubtle,
              },
            ]}
          />
        ))}
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.illustration}>
        <View style={[styles.horizonRing, { borderColor: theme.colors.brandAccent }]} />
        <View
          style={[
            styles.horizonBar,
            styles.horizonBarLight,
            { backgroundColor: theme.colors.surfaceInteractive },
          ]}
        />
        <View
          style={[
            styles.horizonBar,
            styles.horizonBarMedium,
            { backgroundColor: theme.colors.brandAccent },
          ]}
        />
        <View
          style={[
            styles.horizonBar,
            styles.horizonBarHeavy,
            { backgroundColor: theme.colors.brandPrimary },
          ]}
        />
      </View>
      <AppText colorRole="textSecondary">
        {draft.step === 0
          ? copy.welcomeBody
          : draft.step === 1
            ? copy.genderBody
            : draft.step === 2
              ? copy.dressStyleBody
              : draft.step === 3
                ? copy.birthDateBody
                : copy.locationBody}
      </AppText>
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {draft.step === 4 ? (
        <SafeAreaView edges={['top']} style={styles.screen}>
          <LocationSelectionControls
            header={heading}
            testID="onboarding-step-5"
            testIDPrefix="onboarding"
          />
        </SafeAreaView>
      ) : (
        <Screen
          contentContainerStyle={styles.content}
          testID={`onboarding-step-${draft.step + 1}`}>
          {heading}

      {draft.step === 0 ? (
        <View style={styles.panel}>
          <AppText accessibilityRole="header" variant="bodyStrong">
            {copy.promiseHeading}
          </AppText>
          <View style={styles.promiseList}>
            {promises.map(([icon, promise]) => (
              <View
                accessible
                accessibilityLabel={promise}
                key={promise}
                style={styles.promiseRow}>
                <View style={[
                    styles.promiseChip,
                    { backgroundColor: theme.colors.surfaceInteractive },
                  ]}>
                  <Icon color={theme.colors.iconSecondary} name={icon} size={19} />
                </View>
                <AppText style={styles.promiseText}>{promise}</AppText>
              </View>
            ))}
          </View>
          {usesStackedLayout ? locationRationale : null}
        </View>
      ) : null}

      {draft.step === 1 ? (
        <View style={styles.section} accessibilityLabel={preferenceCopy.genderTitle}>
          <View style={styles.options}>
            <PreferenceOption
              label={preferenceCopy.genderWoman}
              onPress={() => {
                dispatch({ type: 'select-gender', value: 'woman' });
              }}
              selected={draft.gender === 'woman'}
              testID="onboarding-gender-woman"
            />
            <PreferenceOption
              label={preferenceCopy.genderMan}
              onPress={() => {
                dispatch({ type: 'select-gender', value: 'man' });
              }}
              selected={draft.gender === 'man'}
              testID="onboarding-gender-man"
            />
          </View>
          {draft.hasValidationError ? (
            <AppText
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              colorRole="textSecondary"
              testID="onboarding-gender-error">
              {copy.genderRequiredError}
            </AppText>
          ) : null}
        </View>
      ) : null}

      {draft.step === 2 ? (
        <View style={styles.section} accessibilityLabel={preferenceCopy.dressStyleTitle}>
          <View style={styles.options} accessibilityRole="radiogroup">
            <PreferenceOption
              label={preferenceCopy.dressStyleCasual}
              onPress={() => {
                dispatch({ type: 'select-dress-style', value: 'casual' });
              }}
              selected={draft.dressStyle === 'casual'}
              testID="onboarding-dress-style-casual"
            />
            <PreferenceOption
              label={preferenceCopy.dressStyleSmart}
              onPress={() => {
                dispatch({ type: 'select-dress-style', value: 'smart' });
              }}
              selected={draft.dressStyle === 'smart'}
              testID="onboarding-dress-style-smart"
            />
            <PreferenceOption
              label={preferenceCopy.dressStyleFormal}
              onPress={() => {
                dispatch({ type: 'select-dress-style', value: 'formal' });
              }}
              selected={draft.dressStyle === 'formal'}
              testID="onboarding-dress-style-formal"
            />
          </View>
          {draft.hasValidationError ? (
            <AppText
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              colorRole="textSecondary"
              testID="onboarding-dress-style-error">
              {copy.dressStyleRequiredError}
            </AppText>
          ) : null}
        </View>
      ) : null}

      {draft.step === 3 ? (
        <View style={styles.section}>
          {draft.birthDate === null ? (
            <AppText colorRole="textSecondary">{copy.birthDateNotSet}</AppText>
          ) : null}
          <NativeDatePicker
            accessibilityLabel={copy.birthDateTitle}
            language={language}
            maximumDate={maximumBirthDate}
            onChange={(value) => dispatch({ type: 'select-birth-date', value })}
            standalone
            testID="onboarding-birth-date"
            value={draft.birthDate}
          />
          {draft.birthDate !== null ? (
            <Button
              label={copy.birthDateClearAction}
              onPress={() => dispatch({ type: 'select-birth-date', value: null })}
              variant="quiet"
            />
          ) : null}
        </View>
      ) : null}

      {saveError ? (
        <AppText
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          colorRole="textSecondary"
          testID="onboarding-save-error">
          {copy.saveError}
        </AppText>
      ) : null}

        </Screen>
      )}

      <SafeAreaView
        edges={['bottom']}
        testID="onboarding-actions"
        style={[
          styles.pinnedAction,
          {
            backgroundColor: theme.colors.backgroundElevated,
            borderColor: theme.colors.borderSubtle,
          },
        ]}>
        {draft.step === 4 && saveError ? (
          <AppText
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            colorRole="textSecondary"
            testID="onboarding-save-error">
            {copy.saveError}
          </AppText>
        ) : null}
        {draft.step === 0 && !usesStackedLayout ? locationRationale : null}
        <View
          style={[styles.actions, usesStackedLayout && styles.stackedActions]}
          testID="onboarding-actions-row">
          {draft.step > 0 ? (
            <Button
              disabled={isSaving}
              label={messages.common.back}
              onPress={() => {
                setSaveError(false);
                dispatch({ type: 'back' });
              }}
              testID="onboarding-back"
              variant="quiet"
            />
          ) : null}
          {draft.step === totalSteps - 1 ? (
            <View style={styles.primaryAction} testID="onboarding-location-skip">
              <Button
                label={hasActiveLocation ? copy.completeAction : copy.locationSkipAction}
                loading={isSaving}
                onPress={complete}
                style={styles.skipAction}
                testID="onboarding-complete"
                variant="quiet"
              />
            </View>
          ) : (
            <Button
              label={messages.common.continue}
              loading={isSaving}
              onPress={goForward}
              style={styles.primaryAction}
              testID="onboarding-continue"
            />
          )}
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    gap: spacing.md,
  },
  heading: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  panel: {
    gap: spacing.md,
  },
  promiseList: {
    gap: spacing.md,
  },
  promiseRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  promiseChip: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  promiseText: {
    flex: 1,
    flexShrink: 1,
  },
  section: {
    gap: spacing.md,
  },
  options: {
    gap: spacing.md,
  },
  actions: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'flex-end',
  },
  stackedActions: {
    flexDirection: 'column-reverse',
  },
  primaryAction: {
    flexGrow: 1,
  },
  skipAction: {
    width: '100%',
  },
  progress: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  progressSegment: {
    borderRadius: radii.pill,
    flex: 1,
    height: 6,
  },
  illustration: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  horizonRing: {
    borderRadius: radii.pill,
    borderWidth: borderWidths.strong,
    height: 20,
    width: 20,
  },
  horizonBar: {
    borderRadius: radii.pill,
  },
  horizonBarLight: {
    height: 8,
    width: 104,
  },
  horizonBarMedium: {
    height: 12,
    width: 136,
  },
  horizonBarHeavy: {
    height: 16,
    width: 168,
  },
  pinnedAction: {
    borderTopWidth: borderWidths.subtle,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
});
