import { styleAesthetics } from '@kuyara/contracts';
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

import {
  AppText,
  Button,
  ButtonPair,
  ChoiceTile,
  type ChoiceTileDrawing,
  ChoiceTileGrid,
  GarmentBoard,
  type GarmentOutfitPalette,
  Icon,
  NativeDatePicker,
  ProgressFill,
  Screen,
} from '@/components/ui';
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
  StyleAesthetic,
  OnboardingPreferences,
} from '@/features/profile/domain/profile';
import { displayNameIssue } from '@/features/profile/domain/profile';
import { NameInput } from '@/features/profile/presentation/name-input';
import { aestheticLabel } from '@/features/profile/presentation/style-aesthetics-options';
import { resolveConditionStyle } from '@/features/today/domain/condition-style';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { LocationSelectionControls } from '@/features/weather/presentation/location-selection-controls';
import { useLocalization } from '@/localization/use-messages';
import { useKuyaraTheme } from '@/theme/theme-context';
import { borderWidths, radii, spacing } from '@/theme/theme';

// O14 onboarding visuals: each step shows what it changes, drawn only from shipped
// silhouettes on the approved stages; no mascot, avatar or body, no new colour.
// Step 1's preview is a fixed sample: no location is known yet.
const welcomePreviewPieces = [
  { slot: 'outer_layer', garmentTypeId: 'light_jacket', category: 'outerwear' },
  { slot: 'primary_top', garmentTypeId: 't_shirt', category: 'top' },
  { slot: 'bottom', garmentTypeId: 'jeans', category: 'bottom' },
  { slot: 'footwear', garmentTypeId: 'sneakers', category: 'footwear' },
] as const;
const welcomePreviewPalette: GarmentOutfitPalette = {
  optionId: 'onboarding-welcome-preview',
  pieces: welcomePreviewPieces.map(({ garmentTypeId, slot }) => ({ garmentTypeId, slot })),
  temperatureC: 14,
  condition: 'cloudy',
  isNight: false,
  formality: 'casual',
};
const welcomePreviewCondition = resolveConditionStyle('cloudy', 'day');
// Each answer hints at the catalog it chooses, three pieces from it.
const genderHints: Readonly<Record<Gender, readonly ChoiceTileDrawing[]>> = {
  woman: [
    { garmentTypeId: 'cardigan', category: 'top' },
    { garmentTypeId: 'skirt', category: 'bottom' },
    { garmentTypeId: 'ballet_flats', category: 'footwear' },
  ],
  man: [
    { garmentTypeId: 'light_jacket', category: 'outerwear' },
    { garmentTypeId: 'trousers', category: 'bottom' },
    { garmentTypeId: 'closed_shoes', category: 'footwear' },
  ],
};
// The morning sheet's day-type drawings, so the answer is recognisable the next morning (M16).
const dressStyleDrawings: Readonly<Record<DressStyle, ChoiceTileDrawing>> = {
  casual: { garmentTypeId: 't_shirt', category: 'top' },
  smart: { garmentTypeId: 'shirt', category: 'top' },
  formal: { garmentTypeId: 'blazer', category: 'outerwear' },
};
const styleDrawings: Readonly<Record<StyleAesthetic, ChoiceTileDrawing>> = {
  minimal: { garmentTypeId: 'long_sleeve_t_shirt', category: 'top' },
  classic: { garmentTypeId: 'trench_coat', category: 'outerwear' },
  sporty: { garmentTypeId: 'sneakers', category: 'footwear' },
  streetwear: { garmentTypeId: 'hoodie', category: 'top' },
  relaxed: { garmentTypeId: 'sandals', category: 'footwear' },
};
const STYLE_LIMIT = 3;

type OnboardingScreenProps = Readonly<{
  initialGender: Gender | null;
  initialDressStyle: DressStyle | null;
  initialStyleAesthetics?: readonly StyleAesthetic[];
  initialBirthDate: string | null;
  initialDisplayName?: string | null;
  onComplete: (preferences: OnboardingPreferences) => Promise<void>;
}>;

const totalSteps = 7;

export function OnboardingScreen({
  initialBirthDate,
  initialDisplayName = null,
  initialDressStyle,
  initialStyleAesthetics = [],
  initialGender,
  onComplete,
}: OnboardingScreenProps) {
  const [draft, dispatch] = useReducer(
    reduceOnboardingDraft,
    createOnboardingDraft({
      displayName: initialDisplayName,
      gender: initialGender,
      dressStyle: initialDressStyle,
      styleAesthetics: initialStyleAesthetics,
      birthDate: initialBirthDate,
    }),
  );
  const [saveError, setSaveError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(0);
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
  const hasValidName = Boolean(draft.displayName?.trim())
    && !displayNameIssue(draft.displayName ?? '');
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
        ? copy.nameTitle
        : draft.step === 2
          ? copy.genderTitle
          : draft.step === 3
            ? copy.dressStyleTitle
            : draft.step === 4
              ? copy.stylePreferencesTitle
              : draft.step === 5 ? copy.birthDateTitle : copy.locationTitle;

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

    const nameInvalid = draft.step === 1 && !hasValidName;
    if (nameInvalid) return;
    const genderMissing = draft.step === 2 && !draft.gender;
    const dressStyleMissing = draft.step === 3 && !draft.dressStyle;
    if (genderMissing) {
      AccessibilityInfo.announceForAccessibility(copy.genderRequiredError);
    }
    if (dressStyleMissing) {
      AccessibilityInfo.announceForAccessibility(copy.dressStyleRequiredError);
    }
    // Taxonomy 5.2: only a step the user actually advances past is reported; a step the
    // reducer blocks for a missing required value stays silent.
    const stepName = onboardingStepNames[draft.step];
    if (!genderMissing && !dressStyleMissing && stepName) {
      const stepCompleted: AnalyticsEventProperties<'onboarding_step_completed'> = {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        step_name: stepName,
        step_index: (draft.step === 0 ? 1 : draft.step >= 5 ? draft.step - 1 : draft.step) as 1 | 2 | 3 | 4,
        // Only the birth date step is skippable here; the location step's own
        // `onboarding_step_completed` is reported from `complete()`.
        skipped: draft.step === 5 ? draft.birthDate === null : false,
      };
      analytics.capture(
        'onboarding_step_completed',
        draft.step === 3 && draft.dressStyle
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

  // The rationale is part of the welcome step's content, not the pinned bar (O14), so the
  // bar holds only its buttons and the step can still be read to its end.
  const locationRationale = (
    <AppText colorRole="textSecondary" variant="caption">
      {messages.weather.locationRationaleBody}
    </AppText>
  );
  const typedName = draft.displayName?.trim() ?? '';

  const heading = (
    <View style={styles.heading}>
      <AppText accessibilityRole="header" ref={headingRef} variant="titleLarge">
        {stepTitle}
      </AppText>
      <View
        accessible
        accessibilityLabel={copy.stepPosition(draft.step + 1, totalSteps)}
        accessibilityRole="progressbar"
        accessibilityValue={{ max: totalSteps, min: 0, now: draft.step + 1 }}
        style={styles.progress}>
        {Array.from({ length: totalSteps }, (_, index) => (
          <ProgressFill
            key={index}
            progress={index <= draft.step ? 1 : 0}
            style={styles.progressSegment}
          />
        ))}
      </View>
      <AppText colorRole="textSecondary">
        {draft.step === 0
          ? copy.welcomeBody
          : draft.step === 1
            ? copy.nameBody
            : draft.step === 2
              ? copy.genderBody
              : draft.step === 3
                ? copy.dressStyleBody
                : draft.step === 4
                  ? copy.stylePreferencesBody
                  : draft.step === 5 ? copy.birthDateBody : copy.locationBody}
      </AppText>
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {draft.step === 6 ? (
        <SafeAreaView edges={['top']} style={styles.screen}>
          <LocationSelectionControls
            header={heading}
            testID="onboarding-step-7"
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
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onLayout={({ nativeEvent }) => setPreviewWidth(nativeEvent.layout.width)}
            style={[styles.stage, { backgroundColor: theme.atmosphere.veiledDay }]}
            testID="onboarding-welcome-preview">
            <View style={styles.previewTitle}>
              <Icon
                color={theme.condition[welcomePreviewCondition.ink]}
                name={welcomePreviewCondition.shape}
                size={20}
              />
              <AppText tabularNumbers variant="bodyStrong">{copy.welcomePreviewTitle}</AppText>
            </View>
            {previewWidth > 0 ? (
              <GarmentBoard
                accessibilityLabel={copy.welcomePreviewCaption}
                decorative
                palette={welcomePreviewPalette}
                pieces={welcomePreviewPieces}
                preset="today"
                stageColor={theme.atmosphere.veiledDay}
                testID="onboarding-welcome-board"
                width={previewWidth}
              />
            ) : null}
          </View>
          <AppText>{copy.welcomePreviewCaption}</AppText>
          {locationRationale}
        </View>
      ) : null}

      {draft.step === 1 ? (
        <View style={styles.panel}>
          <View
            style={[styles.stage, styles.greeting, { backgroundColor: theme.atmosphere.veiledDay }]}
            testID="onboarding-name-preview">
            <AppText variant="title">
              {typedName && !displayNameIssue(typedName)
                ? messages.today.greetingFirstNamed(typedName)
                : copy.nameGreetingEmpty}
            </AppText>
            <AppText colorRole="textSecondary" variant="caption">{copy.nameGreetingCaption}</AppText>
          </View>
          <NameInput
            onChangeText={(value) => dispatch({ type: 'set-display-name', value })}
            testID="onboarding-name"
            value={draft.displayName ?? ''}
          />
        </View>
      ) : null}

      {draft.step === 2 ? (
        <View style={styles.section} accessibilityLabel={preferenceCopy.genderTitle}>
          <ChoiceTileGrid accessibilityRole="radiogroup" columns={2}>
            {(['woman', 'man'] as const).map((gender) => (
              <ChoiceTile
                drawings={genderHints[gender]}
                key={gender}
                label={gender === 'woman' ? preferenceCopy.genderWoman : preferenceCopy.genderMan}
                onPress={() => dispatch({ type: 'select-gender', value: gender })}
                role="radio"
                selected={draft.gender === gender}
                testID={`onboarding-gender-${gender}`}
              />
            ))}
          </ChoiceTileGrid>
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

      {draft.step === 3 ? (
        <View style={styles.section} accessibilityLabel={preferenceCopy.dressStyleTitle}>
          <ChoiceTileGrid accessibilityRole="radiogroup" columns={3}>
            {(['casual', 'smart', 'formal'] as const).map((style) => (
              <ChoiceTile
                drawings={[dressStyleDrawings[style]]}
                key={style}
                label={style === 'casual'
                  ? preferenceCopy.dressStyleCasual
                  : style === 'smart' ? preferenceCopy.dressStyleSmart : preferenceCopy.dressStyleFormal}
                onPress={() => dispatch({ type: 'select-dress-style', value: style })}
                role="radio"
                selected={draft.dressStyle === style}
                testID={`onboarding-dress-style-${style}`}
              />
            ))}
          </ChoiceTileGrid>
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

      {draft.step === 4 ? (
        <View style={styles.section}>
          <ChoiceTileGrid columns={2} testID="onboarding-style-option">
            {styleAesthetics.map((style) => {
              const checked = draft.styleAesthetics.includes(style);
              return (
                <ChoiceTile
                  disabled={!checked && draft.styleAesthetics.length >= STYLE_LIMIT}
                  drawings={[styleDrawings[style]]}
                  key={style}
                  label={aestheticLabel(preferenceCopy, style)}
                  onPress={() => dispatch({
                    type: 'select-style-aesthetics',
                    value: checked
                      ? draft.styleAesthetics.filter((value) => value !== style)
                      : [...draft.styleAesthetics, style].sort(),
                  })}
                  role="checkbox"
                  selected={checked}
                  testID={`onboarding-style-option-${style}`}
                />
              );
            })}
          </ChoiceTileGrid>
          {draft.styleAesthetics.length >= STYLE_LIMIT ? (
            <AppText variant="caption">{preferenceCopy.stylePreferencesLimit}</AppText>
          ) : null}
        </View>
      ) : null}

      {draft.step === 5 ? (
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
              variant="plain"
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
        {draft.step === 6 && saveError ? (
          <AppText
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            colorRole="textSecondary"
            testID="onboarding-save-error">
            {copy.saveError}
          </AppText>
        ) : null}
        <ButtonPair
          primary={draft.step === totalSteps - 1 ? (
            <View style={styles.primaryAction} testID="onboarding-location-skip">
              <Button
                label={hasActiveLocation ? copy.completeAction : copy.locationSkipAction}
                loading={isSaving}
                onPress={complete}
                style={styles.skipAction}
                testID="onboarding-complete"
                variant="tonal"
              />
            </View>
          ) : draft.step === 1 ? (
            <View style={styles.nameActions}>
              <Button
                label={copy.nameNotNow}
                onPress={() => {
                  dispatch({ type: 'set-display-name', value: null });
                  dispatch({ type: 'continue' });
                }}
                testID="onboarding-name-skip"
                variant="plain"
              />
              <Button
                disabled={!hasValidName}
                label={messages.common.continue}
                onPress={goForward}
                size="large"
                testID="onboarding-continue"
              />
            </View>
          ) : (
            <Button
              label={messages.common.continue}
              loading={isSaving}
              onPress={goForward}
              size="large"
              style={styles.primaryAction}
              testID="onboarding-continue"
            />
          )}
          secondary={draft.step > 0 ? (
            <Button
              disabled={isSaving}
              label={messages.common.back}
              onPress={() => {
                setSaveError(false);
                dispatch({ type: 'back' });
              }}
              size="large"
              testID="onboarding-back"
              variant="plain"
            />
          ) : null}
          testID="onboarding-actions-row"
        />
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
  stage: {
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  previewTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  greeting: {
    gap: spacing.xs,
    padding: spacing.lg,
  },
  section: {
    gap: spacing.md,
  },
  options: {
    gap: spacing.md,
  },
  primaryAction: {
    flexGrow: 1,
  },
  // O14: one footer row on every step; on the name step Not now and Continue share it.
  nameActions: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
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
  pinnedAction: {
    borderTopWidth: borderWidths.subtle,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
});
