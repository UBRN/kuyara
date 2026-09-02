import {
  AccessibilityInfo,
  findNodeHandle,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Icon, Screen } from '@/components/ui';
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
import { borderWidths, radii, spacing } from '@/theme/theme';

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

  const promises = [
    ['location', copy.weatherPromise],
    ['sparkle', copy.outfitsPromise],
    ['heart', copy.wardrobePromise],
  ] as const;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Screen
        contentContainerStyle={styles.content}
        testID={`onboarding-step-${draft.step + 1}`}>
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
              ? copy.clothingBody
              : copy.detailsBody}
        </AppText>
      </View>

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
        </View>
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
            <View style={styles.sectionHeading}>
              <AppText accessibilityRole="header" variant="bodyStrong">
                {preferenceCopy.languageTitle}
              </AppText>
              <AppText colorRole="textSecondary">
                {preferenceCopy.languageDescription}
              </AppText>
            </View>
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
            <View style={styles.sectionHeading}>
              <AppText accessibilityRole="header" variant="bodyStrong">
                {preferenceCopy.themeTitle}
              </AppText>
              <AppText colorRole="textSecondary">
                {preferenceCopy.themeDescription}
              </AppText>
            </View>
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

      </Screen>

      <SafeAreaView
        edges={['bottom']}
        style={[
          styles.pinnedAction,
          {
            backgroundColor: theme.colors.backgroundElevated,
            borderColor: theme.colors.borderSubtle,
          },
        ]}>
        {draft.step === 0 ? (
          <AppText colorRole="textSecondary" variant="caption">
            {messages.weather.locationRationaleBody}
          </AppText>
        ) : null}
        <View style={[styles.actions, fontScale > 1.5 && styles.stackedActions]}>
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
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing['2xl'],
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
  details: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.md,
  },
  sectionHeading: {
    gap: spacing.xs,
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
