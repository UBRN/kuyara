import { Stack, useIsFocused } from 'expo-router';

import { GlassButton } from '@/components/ui';
import { useSinglePush } from '@/components/ui/use-single-push';
import { useScreenInteractive } from '@/features/analytics/application/use-screen-interactive';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { ProfileScreen } from '@/features/profile/presentation/profile-screen';
import { useMessages } from '@/localization/use-messages';

export default function ProfileRoute() {
  const messages = useMessages();
  const push = useSinglePush();
  useScreenViewed('profile');
  // Profile renders its rows from the already-ready profile, so its content is present on
  // the first render.
  useScreenInteractive({ state: 'ready' });
  const { state } = useProfileApplication();
  // The tab mounts at launch, before it is shown; its content arrives on the first showing.
  const shown = useIsFocused();

  return (
    <>
      {/* ADR 0028 section 1: a native large title with the Settings gear as the bar
          button is the screen's only chrome, so it is set here rather than hand-drawn
          in ProfileScreen. */}
      <Stack.Screen
        options={{
          headerLargeTitle: true,
          headerRight: () => (
            <GlassButton
              accessibilityHint={messages.profile.settingsHint}
              icon="settings"
              kind="bar"
              label={messages.profile.settingsAction}
              onPress={() => push('/settings')}
              testID="profile-settings-button"
            />
          ),
          headerShown: true,
          headerTitle: messages.profile.title,
        }}
      />
      <ProfileScreen
        displayName={state.status === 'ready' ? state.profile.displayName : null}
        onAddPiece={() => push('/wardrobe/new')}
        onOpenCategory={(category) =>
          push({ params: { category }, pathname: '/wardrobe' })
        }
        onOpenHistory={() => push('/history')}
        onOpenWardrobe={(filter) =>
          push(filter ? { params: { filter }, pathname: '/wardrobe' } : '/wardrobe')
        }
        shown={shown}
      />
    </>
  );
}
