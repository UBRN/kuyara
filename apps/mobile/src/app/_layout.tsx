import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { NotificationApplicationProvider } from '@/features/notifications/application/notification-application-provider';
import { ProfileApplicationProvider } from '@/features/profile/application/profile-application-provider';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { BootstrapScreen } from '@/features/profile/presentation/bootstrap-screen';
import { RecommendationApplicationProvider } from '@/features/recommendation/application/recommendation-application-provider';
import { WeatherApplicationProvider } from '@/features/weather/application/weather-application-provider';
import { WardrobeApplicationProvider } from '@/features/wardrobe/application/wardrobe-application-provider';
import { useKuyaraTheme } from '@/theme/theme-context';

function ThemedApplicationShell() {
  const theme = useKuyaraTheme();
  const { state, updateNotificationsOptIn } = useProfileApplication();
  const baseNavigationTheme = theme.isDark ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseNavigationTheme,
    colors: {
      ...baseNavigationTheme.colors,
      primary: theme.colors.brandPrimary,
      background: theme.colors.background,
      card: theme.colors.backgroundElevated,
      text: theme.colors.textPrimary,
      border: theme.colors.borderSubtle,
      notification: theme.colors.brandAccent,
    },
  };

  if (state.status !== 'ready') {
    return <BootstrapScreen status={state.status} />;
  }

  return (
    <NotificationApplicationProvider
      notificationsOptIn={state.profile.notificationsOptIn}
      persistOptIn={updateNotificationsOptIn}>
      <WeatherApplicationProvider localProfileId={state.profile.id}>
        <WardrobeApplicationProvider localProfileId={state.profile.id}>
          <RecommendationApplicationProvider localProfileId={state.profile.id}>
            <ThemeProvider value={navigationTheme}>
              <StatusBar style={theme.isDark ? 'light' : 'dark'} />
              <Stack
                screenOptions={{
                  animation: theme.isReduceMotionEnabled ? 'none' : 'default',
                  headerShown: false,
                }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                  name="onboarding"
                  options={{ gestureEnabled: false }}
                />
              </Stack>
            </ThemeProvider>
          </RecommendationApplicationProvider>
        </WardrobeApplicationProvider>
      </WeatherApplicationProvider>
    </NotificationApplicationProvider>
  );
}

export default function RootLayout() {
  return (
    <ProfileApplicationProvider>
      <ThemedApplicationShell />
    </ProfileApplicationProvider>
  );
}
