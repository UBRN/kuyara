import { Stack } from 'expo-router';

import { useNotificationApplication } from '@/features/notifications/application/notification-context';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { NotificationsSettingsScreen } from '@/features/profile/presentation/notifications-settings-screen';
import { useMessages } from '@/localization/use-messages';

export default function NotificationsSettingsRoute() {
  const messages = useMessages();
  const { state: profileState } = useProfileApplication();
  const { state, setOptIn, openApplicationSettings } = useNotificationApplication();

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
        isBusy={state.isBusy}
        onOpenSystemSettings={() => void openApplicationSettings()}
        onToggle={async (optIn) => {
          await setOptIn(optIn);
        }}
        optedIn={profileState.profile.notificationsOptIn}
        permission={state.permission}
      />
    </>
  );
}
