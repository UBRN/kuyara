import { Stack, useRouter } from 'expo-router';

import { Icon, IconButton } from '@/components/ui';
import { useScreenInteractive } from '@/features/analytics/application/use-screen-interactive';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { ProfileScreen } from '@/features/profile/presentation/profile-screen';
import { useMessages } from '@/localization/use-messages';

export default function ProfileRoute() {
  const messages = useMessages();
  const router = useRouter();
  useScreenViewed('profile');
  // Profile renders its rows from the already-ready profile, so its content is present on
  // the first render.
  useScreenInteractive({ state: 'ready' });
  const { state } = useProfileApplication();

  return (
    <>
      {/* ADR 0028 section 1: a native large title with the Settings gear as the bar
          button is the screen's only chrome, so it is set here rather than hand-drawn
          in ProfileScreen. */}
      <Stack.Screen
        options={{
          headerLargeTitle: true,
          headerRight: () => (
            <IconButton
              accessibilityHint={messages.profile.settingsHint}
              accessibilityLabel={messages.profile.settingsAction}
              icon={(color) => <Icon color={color} name="settings" size={20} />}
              onPress={() => router.push('/settings')}
              variant="quiet"
              testID="profile-settings-button"
            />
          ),
          headerShown: true,
          headerTitle: messages.profile.title,
        }}
      />
      <ProfileScreen
        displayName={state.status === 'ready' ? state.profile.displayName : null}
        onOpenWardrobe={(filter) =>
          router.push(filter ? { params: { filter }, pathname: '/wardrobe' } : '/wardrobe')
        }
      />
    </>
  );
}
