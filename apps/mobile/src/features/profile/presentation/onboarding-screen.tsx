import {
  AccessibilityInfo,
  findNodeHandle,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { AppText, Button, Screen, SectionHeader, Surface } from '@/components/ui';
import type {
  ClothingPreference,
  LanguagePreference,
  ThemePreference,
} from '@/domain/preferences';
import {
  createOnboardingDraft,
  onboardingPreferencesFromDraft,
  reduceOnboardingDraft,
} from '@/features/profile/application/onboarding-state';
import type { OnboardingPreferences } from '@/features/profile/domain/profile';
import { PreferenceOption } from '@/features/profile/presentation/preference-option';
import { getDeviceLocale } from '@/localization/device-locale';
import { resolveLanguagePreference } from '@/localization/language-preference';
import { getMessages } from '@/localization/messages';
import { spacing } from '@/theme/theme';

type OnboardingScreenProps = Readonly<{
  initialClothingPreference: ClothingPreference | null;
  initialLanguagePreference: LanguagePreference;
  initialThemePreference: ThemePreference;
  onComplete: (preferences: OnboardingPreferences) => Promise<void>;
}>;

const totalSteps = 3;

export function OnboardingScreen({
  initialClothingPreference,
  initialLanguagePreference,
  initialThemePreference,
  onComplete,
}: OnboardingScreenProps) {
  const [draft, dispatch] = useReducer(
    reduceOnboardingDraft,
    createOnboardingDraft({
      clothingPreference: initialClothingPreference,
      languagePreference: initialLanguagePreference,
      themePreference: initialThemePreference,
    }),
  );
  const [saveError, setSaveError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { fontScale } = useWindowDimensions();
  const announcedStep = useRef(false);
  const headingRef = useRef<Text>(null);
  const deviceLocale = useMemo(() => getDeviceLocale(), []);
  const language = resolveLanguagePreference(draft.languagePreference, deviceLocale);
  const messages = getMessages(language);
  const copy = messages.onboarding;
  const preferenceCopy = messages.preferences;

  const stepTitle =
    draft.step === 0
      ? copy.welcomeTitle
      : draft.step === 1
        ? copy.clothingTitle
        : copy.detailsTitle;

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

    if (draft.step === 1 && !draft.clothingPreference) {
      AccessibilityInfo.announceForAccessibility(copy.clothingRequiredError);
    }
    dispatch({ type: 'continue' });
  };

  const complete = async () => {
    const preferences = onboardingPreferencesFromDraft(draft);
    if (!preferences || isSaving) {
      AccessibilityInfo.announceForAccessibility(copy.clothingRequiredError);
      return;
    }

    setIsSaving(true);
    setSaveError(false);
    try {
      await onComplete(preferences);
    } catch {
      setSaveError(true);
      AccessibilityInfo.announceForAccessibility(copy.saveError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Screen testID={`onboarding-step-${draft.step + 1}`} contentContainerStyle={styles.content}>
      <View style={styles.heading}>
        <AppText colorRole="textSecondary" variant="caption">
          {copy.stepPosition(draft.step + 1, totalSteps)}
        </AppText>
        <AppText accessibilityRole="header" ref={headingRef} variant="titleLarge">
          {stepTitle}
        </AppText>
        <AppText colorRole="textSecondary">
          {draft.step === 0
            ? copy.welcomeBody
            : draft.step === 1
              ? copy.clothingBody
              : copy.detailsBody}
        </AppText>
      </View>

      {draft.step === 0 ? (
        <Surface style={styles.panel} variant="elevated">
          <SectionHeader title={copy.promiseHeading} />
          <View style={styles.promiseList}>
            <AppText>{copy.weatherPromise}</AppText>
            <AppText>{copy.outfitsPromise}</AppText>
            <AppText>{copy.wardrobePromise}</AppText>
          </View>
        </Surface>
      ) : null}

      {draft.step === 1 ? (
        <View style={styles.section} accessibilityLabel={preferenceCopy.clothingTitle}>
          <SectionHeader
            title={preferenceCopy.clothingTitle}
            supportingText={preferenceCopy.clothingDescription}
          />
          <View style={styles.options}>
            <PreferenceOption
              label={preferenceCopy.womensClothing}
              onPress={() => {
                dispatch({ type: 'select-clothing', value: 'womens' });
              }}
              selected={draft.clothingPreference === 'womens'}
              testID="onboarding-clothing-womens"
            />
            <PreferenceOption
              label={preferenceCopy.mensClothing}
              onPress={() => {
                dispatch({ type: 'select-clothing', value: 'mens' });
              }}
              selected={draft.clothingPreference === 'mens'}
              testID="onboarding-clothing-mens"
            />
          </View>
          {draft.hasValidationError ? (
            <AppText
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              colorRole="textSecondary"
              testID="onboarding-clothing-error">
              {copy.clothingRequiredError}
            </AppText>
          ) : null}
        </View>
      ) : null}

      {draft.step === 2 ? (
        <View style={styles.details}>
          <View style={styles.section}>
            <SectionHeader
              title={preferenceCopy.languageTitle}
              supportingText={preferenceCopy.languageDescription}
            />
            <View style={styles.options}>
              {(
                [
                  ['system', preferenceCopy.languageSystem],
                  ['tr', preferenceCopy.languageTurkish],
                  ['en', preferenceCopy.languageEnglish],
                ] as const
              ).map(([value, label]) => (
                <PreferenceOption
                  key={value}
                  label={label}
                  onPress={() => dispatch({ type: 'select-language', value })}
                  selected={draft.languagePreference === value}
                  testID={`onboarding-language-${value}`}
                />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeader
              title={preferenceCopy.themeTitle}
              supportingText={preferenceCopy.themeDescription}
            />
            <View style={styles.options}>
              {(
                [
                  ['system', preferenceCopy.themeSystem],
                  ['light', preferenceCopy.themeLight],
                  ['dark', preferenceCopy.themeDark],
                ] as const
              ).map(([value, label]) => (
                <PreferenceOption
                  key={value}
                  label={label}
                  onPress={() => dispatch({ type: 'select-theme', value })}
                  selected={draft.themePreference === value}
                  testID={`onboarding-theme-${value}`}
                />
              ))}
            </View>
          </View>
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

      <View
        style={[
          styles.actions,
          fontScale > 1.5 && styles.stackedActions,
        ]}>
        {draft.step > 0 ? (
          <Button
            disabled={isSaving}
            label={messages.common.back}
            onPress={() => {
              setSaveError(false);
              dispatch({ type: 'back' });
            }}
            testID="onboarding-back"
            variant="secondary"
          />
        ) : null}
        <Button
          label={draft.step === totalSteps - 1 ? copy.completeAction : messages.common.continue}
          loading={isSaving}
          onPress={draft.step === totalSteps - 1 ? complete : goForward}
          testID={draft.step === totalSteps - 1 ? 'onboarding-complete' : 'onboarding-continue'}
          style={styles.primaryAction}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing['2xl'],
    paddingBottom: spacing['2xl'],
  },
  heading: {
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  panel: {
    gap: spacing.lg,
    padding: spacing.xl,
  },
  promiseList: {
    gap: spacing.lg,
  },
  details: {
    gap: spacing['2xl'],
  },
  section: {
    gap: spacing.lg,
  },
  options: {
    gap: spacing.md,
  },
  actions: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'flex-end',
    marginTop: 'auto',
  },
  stackedActions: {
    flexDirection: 'column-reverse',
  },
  primaryAction: {
    flexGrow: 1,
  },
});
