import { Stack, useRouter } from 'expo-router';

import { Icon, IconButton } from '@/components/ui';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { ProfileScreen } from '@/features/profile/presentation/profile-screen';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { useMessages } from '@/localization/use-messages';

export default function ProfileRoute() {
  const messages = useMessages();
  const router = useRouter();
  useScreenViewed('profile');
  const { state } = useWeatherApplication();
  const activeLocation = state.status === 'ready' ? state.activeLocation : null;
  const activePlaceName = activeLocation
    ? activeLocation.source === 'manual'
      ? activeLocation.displayName
      : messages.weather.currentLocation
    : null;

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
        activePlaceName={activePlaceName}
        onOpenWardrobe={(filter) =>
          router.push(filter ? { params: { filter }, pathname: '/wardrobe' } : '/wardrobe')
        }
        onOpenWeather={() => router.push('/weather')}
      />
    </>
  );
}
