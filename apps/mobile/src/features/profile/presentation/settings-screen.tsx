import Constants from 'expo-constants';
import { StyleSheet } from 'react-native';

import { AppText, Icon, NativeList, NativeListSection, NativeListRow } from '@/components/ui';
import type { LocalProfile } from '@/features/profile/domain/profile';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';

// About you keeps clothing preference until ADR 0015 supplies gender and birth date.
export type SettingsScreenProps = Readonly<{
  profile: LocalProfile;
  notificationsOn: boolean;
  onOpenLanguage: () => void;
  onOpenAppearance: () => void;
  onOpenNotifications: () => void;
  onOpenAiStatus: () => void;
  onOpenClothingPreference: () => void;
}>;

export function SettingsScreen({
  notificationsOn,
  onOpenAiStatus,
  onOpenAppearance,
  onOpenClothingPreference,
  onOpenLanguage,
  onOpenNotifications,
  profile,
}: SettingsScreenProps) {
  const messages = useMessages();
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
  const clothingValue = profile.clothingPreference === 'mens' ? copy.mensClothing : copy.womensClothing;
  const notificationValue = notificationsOn
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
      </NativeListSection>

      <NativeListSection
        heading={messages.settings.aboutYouHeading}
        footer={messages.settings.aboutYouFooter}
        testID="settings-about-you-group">
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="tabProfileOutline" size={size} />}
          label={copy.clothingTitle}
          onPress={onOpenClothingPreference}
          testID="settings-clothing-row"
          value={clothingValue}
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
