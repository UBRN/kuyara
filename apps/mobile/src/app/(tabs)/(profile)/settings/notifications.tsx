import { Stack } from 'expo-router';
import { useState } from 'react';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import { useNotificationApplication } from '@/features/notifications/application/notification-context';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { NotificationsSettingsScreen } from '@/features/profile/presentation/notifications-settings-screen';
import { useMessages } from '@/localization/use-messages';

export default function NotificationsSettingsRoute() {
  const messages = useMessages();
  const { state: profileState } = useProfileApplication();
  const { state, setOptIn, openApplicationSettings } = useNotificationApplication();
  const { analytics, firstUses } = useProductAnalytics();
  // The toggle snaps back on its own when the OS refuses, which says nothing. Remembering
  // the refusal keeps the denied footer and the Open Settings row on screen even when the
  // permission itself stayed undetermined, as it does when the prompt is dismissed.
  const [blocked, setBlocked] = useState(false);
  useScreenViewed('settings_notifications');

  if (profileState.status !== 'ready') {
    return null;
  }

  return (
    <>
      {/* ADR 0030 section 5: a native inline title and a back button that reads
          "Settings", the previous screen's own title, by the platform's default. */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: messages.notifications.title,
        }}
      />
      <NotificationsSettingsScreen
        blocked={blocked}
        isBusy={state.isBusy}
        onOpenSystemSettings={() => void openApplicationSettings()}
        onToggle={async (optIn) => {
          const result = await setOptIn(optIn);
          setBlocked(result.outcome === 'blocked');
          // Taxonomy 5.9: `notifications_enabled` only actually changed for these two
          // outcomes; a `blocked` opt-in leaves the persisted preference untouched.
          if (result.outcome === 'enabled' || result.outcome === 'disabled') {
            analytics.capture('setting_changed', {
              schema_version: ANALYTICS_SCHEMA_VERSION,
              setting_name: 'notifications_enabled',
              new_value: result.outcome === 'enabled',
            });
          }
          if (result.outcome === 'blocked') {
            analytics.capture('notification_permission_resolved', {
              schema_version: ANALYTICS_SCHEMA_VERSION,
              outcome: 'blocked',
              can_request_again: result.canRequestAgain,
            });
            return;
          }
          if (result.outcome !== 'enabled') return;
          analytics.capture('notification_permission_resolved', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            outcome: 'enabled',
          });
          if (await firstUses.markFirstUse('notifications')) {
            analytics.capture('feature_used_first_time', {
              schema_version: ANALYTICS_SCHEMA_VERSION,
              feature_name: 'notifications',
            });
          }
        }}
        optedIn={profileState.profile.notificationsOptIn}
        permission={state.permission}
      />
    </>
  );
}
