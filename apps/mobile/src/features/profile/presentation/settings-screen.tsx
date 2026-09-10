import Constants from 'expo-constants';
import { StyleSheet } from 'react-native';

import { AppText, Icon, NativeList, NativeListSection, NativeListRow } from '@/components/ui';
import type { LocalProfile } from '@/features/profile/domain/profile';
import { useLocalization } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';

export type SettingsScreenProps = Readonly<{
  profile: LocalProfile;
  notificationsOn: boolean;
  onOpenLanguage: () => void;
  onOpenAppearance: () => void;
  onOpenNotifications: () => void;
  onOpenAiStatus: () => void;
  onOpenGender: () => void;
  onOpenDressStyle: () => void;
  onOpenBirthDate: () => void;
  onOpenPrivacy: () => void;
}>;

export function SettingsScreen({
  notificationsOn,
  onOpenAiStatus,
  onOpenAppearance,
  onOpenBirthDate,
  onOpenDressStyle,
  onOpenGender,
  onOpenLanguage,
  onOpenNotifications,
  onOpenPrivacy,
  profile,
}: SettingsScreenProps) {
  const { language, messages } = useLocalization();
  const copy = messages.preferences;

  const languageValue = profile.languagePreference === 'system'
    ? copy.languageSystem
    : profile.languagePreference === 'tr'
      ? copy.languageTurkish
      : copy.languageEnglish;
  const themeValue = profile.themePreference === 'system'
    ? copy.themeSystem
    : profile.themePreference === 'light'
      ? copy.themeLight
      : copy.themeDark;
  const genderValue = profile.gender === 'man' ? copy.genderMan : copy.genderWoman;
  const dressStyleValue = profile.dressStyle === 'casual'
    ? copy.dressStyleCasual
    : profile.dressStyle === 'formal'
      ? copy.dressStyleFormal
      : copy.dressStyleSmart;
  const birthDateValue = profile.birthDate === null
    ? messages.onboarding.birthDateNotSet
    : new Intl.DateTimeFormat(language, { dateStyle: 'long' })
      .format(calendarDate(profile.birthDate));
  const notificationValue = notificationsOn
    ? messages.notifications.statusOn
    : messages.notifications.statusOff;
  const analyticsValue = profile.analyticsConsent === 'granted'
    ? messages.notifications.statusOn
    : messages.notifications.statusOff;
  const version = Constants.expoConfig?.version;
  const build = Constants.platform?.ios?.buildNumber
    ?? Constants.platform?.android?.versionCode?.toString();

  return (
    <NativeList testID="settings-screen">
      <NativeListSection testID="settings-primary-group">
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="language" size={size} />}
          label={copy.languageTitle}
          onPress={onOpenLanguage}
          testID="settings-language-row"
          value={languageValue}
        />
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="theme" size={size} />}
          label={copy.themeTitle}
          onPress={onOpenAppearance}
          testID="settings-theme-row"
          value={themeValue}
        />
      </NativeListSection>

      <NativeListSection testID="settings-services-group">
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
          value={analyticsValue}
        />
      </NativeListSection>

      <NativeListSection
        heading={messages.settings.aboutYouHeading}
        footer={messages.settings.aboutYouFooter}
        testID="settings-about-you-group">
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="tabProfileOutline" size={size} />}
          label={copy.genderTitle}
          onPress={onOpenGender}
          testID="settings-gender-row"
          value={genderValue}
        />
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="clothing" size={size} />}
          label={copy.dressStyleTitle}
          onPress={onOpenDressStyle}
          testID="settings-dress-style-row"
          value={dressStyleValue}
        />
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="calendar" size={size} />}
          label={copy.birthDateTitle}
          onPress={onOpenBirthDate}
          testID="settings-birth-date-row"
          value={birthDateValue}
        />
      </NativeListSection>
      {version ? (
        <NativeListSection footer={
          <AppText
            colorRole="textSecondary"
            style={styles.version}
            tabularNumbers
            variant="caption">
            {messages.settings.versionLine(version, build)}
          </AppText>
        } />
      ) : null}
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
