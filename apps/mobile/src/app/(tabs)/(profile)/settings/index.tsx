import { Stack, router } from 'expo-router';
import { Linking } from 'react-native';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import { SUPPORT_URL } from '@/features/analytics/domain/privacy-policy';
import { notificationsAreActive } from '@/features/notifications/application/notification-application-controller';
import { useNotificationApplication } from '@/features/notifications/application/notification-context';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { SettingsScreen } from '@/features/profile/presentation/settings-screen';
import { useLocalization } from '@/localization/use-messages';

export default function SettingsRoute() {
  const { language, messages } = useLocalization();
  const {
    state,
    updateDressStyle,
    updateGender,
    updateLanguagePreference,
    updateThemePreference,
  } = useProfileApplication();
  const { state: notificationState } = useNotificationApplication();
  const { analytics, firstUses } = useProductAnalytics();
  useScreenViewed('settings');

  if (state.status !== 'ready') {
    return null;
  }

  return (
    <>
      {/* ADR 0030 section 5, the same pattern profile.tsx and wardrobe/index.tsx use: a
          native inline title is chrome the OS owns, so it is set here rather than
          hand-drawn in SettingsScreen. The back title is set explicitly because this is
          the screen the language changes on: react-native-screens refreshes a screen's
          native title only while it is on top, so a blank back title would resolve from
          the Profile item's stale, pre-switch title until Profile is shown again. */}
      <Stack.Screen
        options={{
          headerBackTitle: messages.profile.title,
          headerShown: true,
          headerTitle: messages.settings.title,
        }}
      />
      <SettingsScreen
        isSaving={state.isSaving}
        notificationsOn={notificationsAreActive(
          // ADR 0004: the row stands for the Notifications surface, which now holds two
          // kinds, so either one being in force reads as On.
          state.profile.notificationsOptIn || state.profile.morningBriefingOptIn,
          notificationState.permission,
        )}
        onAppearanceChange={async (value) => {
          await updateThemePreference(value);
          analytics.capture('setting_changed', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            setting_name: 'appearance_theme',
            new_value: value,
          });
          void firstUses.markFirstUse('appearance_override').then((firstUse) => {
            if (!firstUse) return;
            analytics.capture('feature_used_first_time', {
              schema_version: ANALYTICS_SCHEMA_VERSION,
              feature_name: 'appearance_override',
            });
          });
        }}
        onDressStyleChange={async (value) => {
          await updateDressStyle(value);
          analytics.capture('setting_changed', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            setting_name: 'dress_style',
            new_value: value,
          });
        }}
        onGenderChange={async (value) => {
          await updateGender(value);
          analytics.capture('setting_changed', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            setting_name: 'gender',
          });
        }}
        onLanguageChange={async (value) => {
          await updateLanguagePreference(value);
          analytics.capture('setting_changed', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            setting_name: 'language',
            new_value: value,
          });
          void firstUses.markFirstUse('language_override').then((firstUse) => {
            if (!firstUse) return;
            analytics.capture('feature_used_first_time', {
              schema_version: ANALYTICS_SCHEMA_VERSION,
              feature_name: 'language_override',
            });
          });
        }}
        onOpenAiStatus={() => router.push('/settings/ai-status')}
        onOpenBirthDate={() => router.push('/settings/birth-date')}
        onOpenNotifications={() => router.push('/settings/notifications')}
        onOpenPrivacy={() => router.push('/settings/privacy')}
        onOpenSupport={() => {
          void Linking.openURL(SUPPORT_URL[language]);
        }}
        profile={state.profile}
      />
    </>
  );
}
