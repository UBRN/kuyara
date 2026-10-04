import { Stack, router } from 'expo-router';
import Constants from 'expo-constants';
import { Linking, Platform, Share } from 'react-native';

import { useSinglePush } from '@/components/ui/use-single-push';
import { ACCOUNT_SCREENS_ENABLED } from '@/features/account/application/account-screens-flag';
import { AccountSettingsSection } from '@/features/account/presentation/account-settings-section';
import { AccountSheet } from '@/features/account/presentation/account-sheet';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import { SUPPORT_URL } from '@/features/analytics/domain/privacy-policy';
import { notificationsAreActive } from '@/features/notifications/application/notification-application-controller';
import { useNotificationApplication } from '@/features/notifications/application/notification-context';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { wantsAnyNotification } from '@/features/profile/domain/profile';
import { SettingsScreen } from '@/features/profile/presentation/settings-screen';
import { useWalkthrough } from '@/features/walkthrough/application/walkthrough-context';
import { IOS_REVIEW_URL, IOS_STORE_URL, LICENCE_URL, androidStoreLinks } from '@/config/store-links';
import { useLocalization } from '@/localization/use-messages';

export default function SettingsRoute() {
  const { language, messages } = useLocalization();
  const {
    state,
    updateDressStyle,
    updateStyleAesthetics,
    updateMorningSheetEnabled,
    updateGender,
    updateLanguagePreference,
    updateDisplayName,
    updateThemePreference,
    updateTemperatureUnitPreference,
    updateWindSpeedUnitPreference,
  } = useProfileApplication();
  const { state: notificationState } = useNotificationApplication();
  const { analytics, firstUses } = useProductAnalytics();
  const androidPackage = Constants.expoConfig?.android?.package;
  const walkthrough = useWalkthrough();
  const push = useSinglePush();
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
        accountSection={ACCOUNT_SCREENS_ENABLED
          ? <AccountSettingsSection onOpenAccount={() => push('/settings/account')} />
          : null}
        isSaving={state.isSaving}
        notificationsOn={notificationsAreActive(
          // ADR 0004: the row stands for the Notifications surface, which now holds two
          // kinds, so either one being in force reads as On.
          wantsAnyNotification(state.profile),
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
        onTemperatureUnitChange={(value) => updateTemperatureUnitPreference?.(value) ?? Promise.resolve()}
        onWindSpeedUnitChange={(value) => updateWindSpeedUnitPreference?.(value) ?? Promise.resolve()}
        onDressStyleChange={async (value) => {
          await updateDressStyle(value);
          analytics.capture('setting_changed', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            setting_name: 'dress_style',
            new_value: value,
          });
        }}
        onStyleAestheticsChange={(values) => updateStyleAesthetics?.(values) ?? Promise.resolve()}
        onMorningSheetEnabledChange={(enabled) => updateMorningSheetEnabled?.(enabled) ?? Promise.resolve()}
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
        onOpenServiceProviders={() => push('/settings/service-providers')}
        onOpenBirthDate={() => push('/settings/birth-date')}
        onNameChange={updateDisplayName}
        onOpenNotifications={() => push('/settings/notifications')}
        onOpenEasierToSee={() => push('/settings/easier-to-see')}
        onOpenPrivacy={() => push('/settings/privacy')}
        onOpenSupport={() => {
          void Linking.openURL(SUPPORT_URL[language]).catch(() => {
            // A link the system cannot open leaves the screen as it was; nothing is lost.
          });
        }}
        onOpenFeedback={() => push('/settings/feedback')}
        onOpenLicence={() => {
          void Linking.openURL(LICENCE_URL).catch(() => {
            // A link the system cannot open leaves the screen as it was; nothing is lost.
          });
        }}
        // Phase 8: the tour starts over Today, from Profile's root so its step 7 lands there.
        onRestartTour={walkthrough ? () => {
          walkthrough.restart();
          router.dismissAll();
          router.navigate('/');
        } : undefined}
        onRate={() => {
          const url = Platform.OS === 'ios'
            ? IOS_REVIEW_URL
            : androidPackage ? androidStoreLinks(androidPackage).review : null;
          if (url) void Linking.openURL(url).catch(() => {
            // A link the system cannot open leaves the screen as it was; nothing is lost.
          });
        }}
        onShare={() => {
          const sentence = messages.settings.shareText;
          void Share.share(Platform.OS === 'ios'
            ? { message: sentence, url: IOS_STORE_URL }
            : { message: androidPackage
              ? `${sentence} ${androidStoreLinks(androidPackage).share}`
              : sentence });
        }}
        profile={state.profile}
        showRate={Platform.OS === 'ios' || Boolean(androidPackage)}
      />
      {ACCOUNT_SCREENS_ENABLED ? <AccountSheet host="settings" /> : null}
    </>
  );
}
