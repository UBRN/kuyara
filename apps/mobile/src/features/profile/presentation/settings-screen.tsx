import { StyleSheet, View } from 'react-native';
import { useState } from 'react';

import { AppText, Screen, SectionHeader } from '@/components/ui';
import type {
  ClothingPreference,
  LanguagePreference,
  ThemePreference,
} from '@/domain/preferences';
import type { LocalProfile } from '@/features/profile/domain/profile';
import { PreferenceOption } from '@/features/profile/presentation/preference-option';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';

type SettingsScreenProps = Readonly<{
  profile: LocalProfile;
  isSaving: boolean;
  updateClothingPreference: (preference: ClothingPreference) => Promise<void>;
  updateLanguagePreference: (preference: LanguagePreference) => Promise<void>;
  updateThemePreference: (preference: ThemePreference) => Promise<void>;
}>;

export function SettingsScreen({
  isSaving,
  profile,
  updateClothingPreference,
  updateLanguagePreference,
  updateThemePreference,
}: SettingsScreenProps) {
  const messages = useMessages();
  const copy = messages.preferences;
  const [hasSaveError, setHasSaveError] = useState(false);

  const save = async (operation: () => Promise<void>) => {
    if (isSaving) {
      return;
    }

    setHasSaveError(false);
    try {
      await operation();
    } catch {
      setHasSaveError(true);
    }
  };

  return (
    <Screen testID="settings-screen" contentContainerStyle={styles.content}>
      <AppText colorRole="textSecondary" style={styles.introduction}>
        {messages.settings.introduction}
      </AppText>

      <View style={styles.section}>
        <SectionHeader
          title={copy.clothingTitle}
          supportingText={copy.clothingDescription}
        />
        <View style={styles.options}>
          <PreferenceOption
            disabled={isSaving}
            label={copy.womensClothing}
            onPress={() => void save(() => updateClothingPreference('womens'))}
            selected={profile.clothingPreference === 'womens'}
            testID="settings-clothing-womens"
          />
          <PreferenceOption
            disabled={isSaving}
            label={copy.mensClothing}
            onPress={() => void save(() => updateClothingPreference('mens'))}
            selected={profile.clothingPreference === 'mens'}
            testID="settings-clothing-mens"
          />
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader
          title={copy.languageTitle}
          supportingText={copy.languageDescription}
        />
        <View style={styles.options}>
          {(
            [
              ['system', copy.languageSystem],
              ['tr', copy.languageTurkish],
              ['en', copy.languageEnglish],
            ] as const
          ).map(([value, label]) => (
            <PreferenceOption
              key={value}
              disabled={isSaving}
              label={label}
              onPress={() => void save(() => updateLanguagePreference(value))}
              selected={profile.languagePreference === value}
              testID={`settings-language-${value}`}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader
          title={copy.themeTitle}
          supportingText={copy.themeDescription}
        />
        <View style={styles.options}>
          {(
            [
              ['system', copy.themeSystem],
              ['light', copy.themeLight],
              ['dark', copy.themeDark],
            ] as const
          ).map(([value, label]) => (
            <PreferenceOption
              key={value}
              disabled={isSaving}
              label={label}
              onPress={() => void save(() => updateThemePreference(value))}
              selected={profile.themePreference === value}
              testID={`settings-theme-${value}`}
            />
          ))}
        </View>
      </View>

      {isSaving ? (
        <AppText accessibilityLiveRegion="polite" colorRole="textSecondary">
          {messages.settings.saving}
        </AppText>
      ) : null}
      {hasSaveError ? (
        <AppText
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          colorRole="textSecondary"
          testID="settings-save-error">
          {messages.settings.saveError}
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing['2xl'],
    paddingBottom: spacing['2xl'],
  },
  introduction: {
    marginTop: spacing.xl,
  },
  section: {
    gap: spacing.lg,
  },
  options: {
    gap: spacing.md,
  },
});
