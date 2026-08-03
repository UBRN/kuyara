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
import { useKuyaraTheme } from '@/theme/theme-context';
import { radii, spacing } from '@/theme/theme';

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
  const theme = useKuyaraTheme();

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
        <AppText colorRole="brandAccent" variant="eyebrow">
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
        <Surface style={styles.panel} variant="default">
          <AppText colorRole="brandAccent" variant="eyebrow">
            {copy.promiseHeading}
          </AppText>
          <View style={styles.promiseList}>
            {[copy.weatherPromise, copy.outfitsPromise, copy.wardrobePromise].map((promise) => (
              <View key={promise} style={styles.promiseRow}>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                  style={[styles.promiseMarker, { backgroundColor: theme.colors.brandAccent }]}
                />
                <AppText style={styles.promiseText}>{promise}</AppText>
              </View>
            ))}
          </View>
        </Surface>
      ) : null}

      {draft.step === 1 ? (
        <View style={styles.section} accessibilityLabel={preferenceCopy.clothingTitle}>
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
            variant="quiet"
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
    gap: spacing.md,
  },
  promiseRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  promiseMarker: {
    borderRadius: radii.pill,
    height: 6,
    marginTop: 9,
    width: 6,
  },
  promiseText: {
    flex: 1,
    flexShrink: 1,
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
