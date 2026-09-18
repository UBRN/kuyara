import Constants from 'expo-constants';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import {
  AppText,
  Icon,
  iconNames,
  NativeList,
  NativeListSection,
  NativeListRow,
  NativePickerRow,
} from '@/components/ui';
import type { LanguagePreference, ThemePreference } from '@/domain/preferences';
import type { DressStyle, Gender, LocalProfile } from '@/features/profile/domain/profile';
import { useLocalization } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';

export type SettingsScreenProps = Readonly<{
  profile: LocalProfile;
  notificationsOn: boolean;
  isSaving: boolean;
  onLanguageChange: (value: LanguagePreference) => Promise<void>;
  onAppearanceChange: (value: ThemePreference) => Promise<void>;
  onOpenNotifications: () => void;
  onOpenAiStatus: () => void;
  onGenderChange: (value: Gender) => Promise<void>;
  onDressStyleChange: (value: DressStyle) => Promise<void>;
  onOpenBirthDate: () => void;
  onOpenPrivacy: () => void;
  onOpenSupport: () => void;
}>;

export function SettingsScreen({
  isSaving,
  notificationsOn,
  onAppearanceChange,
  onDressStyleChange,
  onGenderChange,
  onLanguageChange,
  onOpenAiStatus,
  onOpenBirthDate,
  onOpenNotifications,
  onOpenPrivacy,
  onOpenSupport,
  profile,
}: SettingsScreenProps) {
  const { language, messages } = useLocalization();
  const copy = messages.preferences;
  const [saveErrorGroup, setSaveErrorGroup] = useState<'general' | 'about-you' | null>(null);

  const savePreference = async (
    group: 'general' | 'about-you',
    save: () => Promise<void>,
  ) => {
    setSaveErrorGroup(null);
    try {
      await save();
    } catch {
      setSaveErrorGroup(group);
    }
  };

  const birthDateValue = profile.birthDate === null
    ? messages.onboarding.birthDateNotSet
    : new Intl.DateTimeFormat(language, { dateStyle: 'long' })
      .format(calendarDate(profile.birthDate));
  const notificationValue = notificationsOn
    ? messages.notifications.statusOn
    : messages.notifications.statusOff;
  const version = Constants.expoConfig?.version;
  const build = Constants.platform?.ios?.buildNumber
    ?? Constants.platform?.android?.versionCode?.toString();

  return (
    <NativeList testID="settings-screen">
      <NativeListSection
        footer={saveErrorGroup === 'general' ? messages.settings.saveError : undefined}
        heading={messages.settings.generalHeading}
        testID="settings-primary-group">
        <NativePickerRow
          disabled={isSaving}
          label={copy.languageTitle}
          onSelectionChange={(value) => savePreference(
            'general',
            () => onLanguageChange(value),
          )}
          options={[
            { label: copy.languageSystem, value: 'system' },
            { label: copy.languageTurkish, value: 'tr' },
            { label: copy.languageEnglish, value: 'en' },
          ]}
          selection={profile.languagePreference}
          systemImage={iconNames.language.ios}
          testID="settings-language-row"
        />
        <NativePickerRow
          disabled={isSaving}
          label={copy.themeTitle}
          onSelectionChange={(value) => savePreference(
            'general',
            () => onAppearanceChange(value),
          )}
          options={[
            { label: copy.themeSystem, value: 'system' },
            { label: copy.themeLight, value: 'light' },
            { label: copy.themeDark, value: 'dark' },
          ]}
          selection={profile.themePreference}
          systemImage={iconNames.theme.ios}
          testID="settings-theme-row"
        />
      </NativeListSection>

      <NativeListSection
        heading={messages.settings.statusHeading}
        testID="settings-services-group">
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="bell" size={size} />}
          label={messages.notifications.title}
          onPress={onOpenNotifications}
          testID="settings-notifications-row"
          value={notificationValue}
        />
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="sparkle" size={size} />}
          label={messages.settings.aiStatusHeading}
          onPress={onOpenAiStatus}
          testID="settings-ai-status-row"
        />
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="info" size={size} />}
          label={messages.analytics.privacyTitle}
          onPress={onOpenPrivacy}
          testID="settings-privacy-row"
        />
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="help" size={size} />}
          label={messages.settings.supportRow}
          onPress={onOpenSupport}
          testID="settings-support-row"
        />
      </NativeListSection>

      <NativeListSection
        heading={messages.settings.aboutYouHeading}
        footer={saveErrorGroup === 'about-you'
          ? messages.settings.saveError
          : messages.settings.aboutYouFooter}
        testID="settings-about-you-group">
        <NativePickerRow
          disabled={isSaving}
          label={copy.genderTitle}
          onSelectionChange={(value) => savePreference(
            'about-you',
            () => onGenderChange(value),
          )}
          options={[
            { label: copy.genderWoman, value: 'woman' },
            { label: copy.genderMan, value: 'man' },
          ]}
          selection={profile.gender ?? 'woman'}
          systemImage={iconNames.tabProfileOutline.ios}
          testID="settings-gender-row"
        />
        <NativePickerRow
          disabled={isSaving}
          label={copy.dressStyleTitle}
          onSelectionChange={(value) => savePreference(
            'about-you',
            () => onDressStyleChange(value),
          )}
          options={[
            { label: copy.dressStyleCasual, value: 'casual' },
            { label: copy.dressStyleSmart, value: 'smart' },
            { label: copy.dressStyleFormal, value: 'formal' },
          ]}
          selection={profile.dressStyle ?? 'smart'}
          systemImage={iconNames.clothing.ios}
          testID="settings-dress-style-row"
        />
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="calendar" size={size} />}
          label={copy.birthDateTitle}
          onPress={onOpenBirthDate}
          testID="settings-birth-date-row"
          value={birthDateValue}
        />
      </NativeListSection>
      <NativeListSection footer={
        <AppText
          colorRole="textSecondary"
          style={styles.version}
          tabularNumbers
          variant="caption">
          {version
            ? messages.settings.versionLine(version, build)
            : messages.settings.developmentBuild}
        </AppText>
      } />
    </NativeList>
  );
}

const styles = StyleSheet.create({
  version: {
    textAlign: 'center',
    paddingBottom: spacing['2xl'],
    width: '100%',
  },
});

function calendarDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}
