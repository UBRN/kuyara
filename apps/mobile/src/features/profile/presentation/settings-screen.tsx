import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Fragment, useState } from 'react';

import { AppText, Screen, Surface } from '@/components/ui';
import { Divider } from '@/components/ui/divider';
import type {
  ClothingPreference,
  LanguagePreference,
  ThemePreference,
} from '@/domain/preferences';
import type { AiProbeUiState } from '@/features/recommendation/application/use-ai-probe';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';
import type { NotificationPermissionState } from '@/features/notifications/data/notification-gateway';
import type { LocalProfile } from '@/features/profile/domain/profile';
import { AiStatusSection } from '@/features/profile/presentation/ai-status-section';
import { PreferenceOption } from '@/features/profile/presentation/preference-option';
import { useMessages } from '@/localization/use-messages';
import { interaction, layout, spacing } from '@/theme/theme';

type SettingsScreenProps = Readonly<{
  aiStatus: AiProbeUiState;
  isProbeSupported: boolean;
  lastGenerationMode: RecommendationGenerationMode | null;
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
  const copy = messages.preferences;
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

  return (
    <Screen testID="settings-screen" contentContainerStyle={styles.content}>
      <AppText accessibilityRole="header" style={styles.title} variant="titleLarge">
        {messages.settings.title}
      </AppText>
      <AppText colorRole="textSecondary">
        {messages.settings.introduction}
      </AppText>

      <Surface style={styles.groupCard} variant="elevated">
        <AppText colorRole="brandAccent" variant="eyebrow">
          {copy.languageTitle}
        </AppText>
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

      <Surface style={styles.groupCard} variant="elevated">
        <AppText colorRole="brandAccent" variant="eyebrow">
          {copy.themeTitle}
        </AppText>
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

      <Surface style={styles.groupCard} variant="elevated">
        <AppText colorRole="brandAccent" variant="eyebrow">
          {messages.notifications.title}
        </AppText>
        <View style={styles.notificationRow}>
          <AppText colorRole="textSecondary" style={styles.notificationIntroduction}>
            {messages.notifications.introduction}
          </AppText>
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
        ) : null}
        {testNotificationResult ? (
          <AppText accessibilityLiveRegion="polite" colorRole="textSecondary">
            {testNotificationResult === 'scheduled'
              ? messages.notifications.testNotificationScheduled
              : messages.notifications.testNotificationFailed}
          </AppText>
        ) : null}
      </Surface>

      <AiStatusSection
        aiStatus={aiStatus}
        isProbeSupported={isProbeSupported}
        lastGenerationMode={lastGenerationMode}
        onCheckAiStatus={onCheckAiStatus}
      />

      <Surface style={styles.groupCard} variant="elevated">
        <AppText colorRole="brandAccent" variant="eyebrow">
          {copy.clothingTitle}
        </AppText>
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
  title: {
    marginTop: spacing.xl,
  },
  groupCard: {
    gap: spacing.lg,
    padding: spacing.xl,
  },
  options: {
    gap: spacing.md,
  },
  notificationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
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
