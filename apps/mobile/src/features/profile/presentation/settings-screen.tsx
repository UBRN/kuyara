import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Icon, IconButton, Screen, Surface } from '@/components/ui';
import { Divider } from '@/components/ui/divider';
import type {
  ClothingPreference,
  LanguagePreference,
  ThemePreference,
} from '@/domain/preferences';
import type { NotificationPermissionState } from '@/features/notifications/data/notification-gateway';
import type { LocalProfile } from '@/features/profile/domain/profile';
import { AiStatusSection } from '@/features/profile/presentation/ai-status-section';
import { PreferenceOption } from '@/features/profile/presentation/preference-option';
import type { AiProbeUiState } from '@/features/recommendation/application/use-ai-probe';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';
import { useMessages } from '@/localization/use-messages';
import { interaction, layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type SettingsScreenProps = Readonly<{
  aiStatus: AiProbeUiState;
  isProbeSupported: boolean;
  lastGenerationMode: RecommendationGenerationMode | null;
  onBack: () => void;
  onCheckAiStatus: () => void;
  profile: LocalProfile;
  isSaving: boolean;
  updateClothingPreference: (preference: ClothingPreference) => Promise<void>;
  updateLanguagePreference: (preference: LanguagePreference) => Promise<void>;
  updateThemePreference: (preference: ThemePreference) => Promise<void>;
  notificationPermission: NotificationPermissionState;
  isNotificationBusy: boolean;
  onToggleNotifications: (optIn: boolean) => Promise<void>;
  onOpenNotificationSettings: () => void;
  onSendTestNotification: () => Promise<boolean>;
}>;

export function SettingsScreen({
  aiStatus,
  isProbeSupported,
  isSaving,
  lastGenerationMode,
  onBack,
  onCheckAiStatus,
  isNotificationBusy,
  notificationPermission,
  onOpenNotificationSettings,
  onSendTestNotification,
  onToggleNotifications,
  profile,
  updateClothingPreference,
  updateLanguagePreference,
  updateThemePreference,
}: SettingsScreenProps) {
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const copy = messages.preferences;
  const [headerHeight, setHeaderHeight] = useState(0);
  const [hasSaveError, setHasSaveError] = useState(false);
  const [testNotificationResult, setTestNotificationResult] = useState<
    'scheduled' | 'failed' | null
  >(null);

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

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <SafeAreaView
        edges={['top']}
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        style={[
          styles.header,
          { backgroundColor: theme.colors.surface },
          theme.elevation.chrome,
        ]}
        testID="settings-header">
        <View style={styles.headerContent}>
          <IconButton
            accessibilityLabel={messages.common.back}
            hitSlop={7}
            icon={(color) => <Icon color={color} name="chevronLeft" size={20} />}
            onPress={onBack}
            testID="settings-back-button"
          />
          <AppText accessibilityRole="header" style={styles.headerTitle} variant="titleLarge">
            {messages.settings.title}
          </AppText>
        </View>
      </SafeAreaView>

      <Screen
        contentContainerStyle={styles.content}
        contentTopClearance={headerHeight + spacing['2xl']}
        testID="settings-screen">
        <AppText colorRole="textSecondary">{messages.settings.introduction}</AppText>

        <View style={styles.group}>
          <AppText colorRole="brandAccent" variant="eyebrow">
            {copy.languageTitle}
          </AppText>
          <Surface style={[styles.groupCard, theme.elevation.raised]}>
            <View style={styles.settingSummary}>
              <Icon color={theme.colors.iconSecondary} name="language" size={21} />
              <View style={styles.settingCopy}>
                <AppText>{copy.languageTitle}</AppText>
                <AppText colorRole="textSecondary">{languageValue}</AppText>
              </View>
            </View>
            <Divider variant="inset" />
            <View style={styles.options}>
              {(
                [
                  ['system', copy.languageSystem],
                  ['tr', copy.languageTurkish],
                  ['en', copy.languageEnglish],
                ] as const
              ).map(([value, label], index) => (
                <Fragment key={value}>
                  {index > 0 ? <Divider variant="inset" /> : null}
                  <PreferenceOption
                    disabled={isSaving}
                    label={label}
                    onPress={() => void save(() => updateLanguagePreference(value))}
                    selected={profile.languagePreference === value}
                    testID={`settings-language-${value}`}
                  />
                </Fragment>
              ))}
            </View>
          </Surface>
        </View>

        <View style={styles.group}>
          <AppText colorRole="brandAccent" variant="eyebrow">
            {copy.themeTitle}
          </AppText>
          <Surface style={[styles.groupCard, theme.elevation.raised]}>
            <View style={styles.settingSummary}>
              <Icon color={theme.colors.iconSecondary} name="theme" size={21} />
              <View style={styles.settingCopy}>
                <AppText>{copy.themeTitle}</AppText>
                <AppText colorRole="textSecondary">{themeValue}</AppText>
              </View>
            </View>
            <Divider variant="inset" />
            <View style={styles.options}>
              {(
                [
                  ['system', copy.themeSystem],
                  ['light', copy.themeLight],
                  ['dark', copy.themeDark],
                ] as const
              ).map(([value, label], index) => (
                <Fragment key={value}>
                  {index > 0 ? <Divider variant="inset" /> : null}
                  <PreferenceOption
                    disabled={isSaving}
                    label={label}
                    onPress={() => void save(() => updateThemePreference(value))}
                    selected={profile.themePreference === value}
                    testID={`settings-theme-${value}`}
                  />
                </Fragment>
              ))}
            </View>
          </Surface>
        </View>

        <View style={styles.group}>
          <AppText colorRole="brandAccent" variant="eyebrow">
            {messages.notifications.title}
          </AppText>
          <Surface style={[styles.groupCard, theme.elevation.raised]}>
            <View style={styles.notificationRow}>
              <Icon color={theme.colors.iconSecondary} name="bell" size={21} />
              <View style={styles.notificationIntroduction}>
                <AppText>{messages.notifications.toggleLabel}</AppText>
                <AppText colorRole="textSecondary">
                  {messages.notifications.introduction}
                </AppText>
              </View>
              <Switch
                accessibilityLabel={messages.notifications.toggleLabel}
                disabled={isNotificationBusy}
                onValueChange={(optIn) => void save(() => onToggleNotifications(optIn))}
                testID="settings-notifications-toggle"
                value={profile.notificationsOptIn}
              />
            </View>
            {notificationPermission.kind === 'denied' ? (
              <>
                <Divider variant="inset" />
                <AppText colorRole="textSecondary">
                  {messages.notifications.permissionDeniedHint}
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  onPress={onOpenNotificationSettings}
                  style={({ pressed }) => [
                    styles.notificationAction,
                    pressed && styles.pressed,
                  ]}
                  testID="settings-notifications-open-settings">
                  <AppText colorRole="brandAccent" variant="bodyStrong">
                    {messages.notifications.openSettingsAction}
                  </AppText>
                </Pressable>
              </>
            ) : null}
            {__DEV__ ? (
              <>
                <Divider variant="inset" />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setTestNotificationResult(null);
                    void onSendTestNotification().then((scheduled) => {
                      setTestNotificationResult(scheduled ? 'scheduled' : 'failed');
                    });
                  }}
                  style={({ pressed }) => [
                    styles.notificationAction,
                    pressed && styles.pressed,
                  ]}
                  testID="settings-notifications-test">
                  <AppText colorRole="brandAccent" variant="bodyStrong">
                    {messages.notifications.testNotificationAction}
                  </AppText>
                </Pressable>
              </>
            ) : null}
            {testNotificationResult ? (
              <AppText accessibilityLiveRegion="polite" colorRole="textSecondary">
                {testNotificationResult === 'scheduled'
                  ? messages.notifications.testNotificationScheduled
                  : messages.notifications.testNotificationFailed}
              </AppText>
            ) : null}
          </Surface>
        </View>

        <AiStatusSection
          aiStatus={aiStatus}
          isProbeSupported={isProbeSupported}
          lastGenerationMode={lastGenerationMode}
          onCheckAiStatus={onCheckAiStatus}
        />

        <View style={styles.group}>
          <AppText colorRole="brandAccent" variant="eyebrow">
            {copy.clothingTitle}
          </AppText>
          <Surface style={[styles.groupCard, theme.elevation.raised]}>
            <View style={styles.options}>
              <PreferenceOption
                disabled={isSaving}
                label={copy.womensClothing}
                onPress={() => void save(() => updateClothingPreference('womens'))}
                selected={profile.clothingPreference === 'womens'}
                testID="settings-clothing-womens"
              />
              <Divider variant="inset" />
              <PreferenceOption
                disabled={isSaving}
                label={copy.mensClothing}
                onPress={() => void save(() => updateClothingPreference('mens'))}
                selected={profile.clothingPreference === 'mens'}
                testID="settings-clothing-mens"
              />
            </View>
          </Surface>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    borderBottomLeftRadius: radii.card,
    borderBottomRightRadius: radii.card,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
  headerContent: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    maxWidth: layout.maxContentWidth,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    width: '100%',
  },
  headerTitle: {
    flex: 1,
  },
  content: {
    gap: spacing['2xl'],
    paddingBottom: spacing['2xl'],
  },
  group: {
    gap: spacing.md,
  },
  groupCard: {
    gap: spacing.lg,
    padding: spacing.xl,
  },
  options: {
    gap: spacing.md,
  },
  settingSummary: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: layout.minimumTouchTarget,
  },
  settingCopy: {
    flex: 1,
  },
  notificationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  notificationIntroduction: {
    flex: 1,
  },
  notificationAction: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
});
