import { Stack, router } from 'expo-router';

import { useProfileApplication } from '@/features/profile/application/profile-context';
import { SettingsScreen } from '@/features/profile/presentation/settings-screen';
import { useMessages } from '@/localization/use-messages';

export default function SettingsRoute() {
  const messages = useMessages();
  const { state } = useProfileApplication();

  if (state.status !== 'ready') {
    return null;
  }

  return (
    <>
      {/* ADR 0030 section 5, the same pattern profile.tsx and wardrobe/index.tsx use: a
          native inline title is chrome the OS owns, so it is set here rather than
          hand-drawn in SettingsScreen. The back button to Profile is the platform's
          default, unset here. */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: messages.settings.title,
        }}
      />
      <SettingsScreen
        notificationsOn={state.profile.notificationsOptIn}
        onOpenAiStatus={() => router.push('/settings/ai-status')}
        onOpenAppearance={() => router.push('/settings/appearance')}
        onOpenClothingPreference={() => router.push('/settings/clothing')}
        onOpenLanguage={() => router.push('/settings/language')}
        onOpenNotifications={() => router.push('/settings/notifications')}
        profile={state.profile}
      />
    </>
  );
}
