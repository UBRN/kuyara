import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ProfileApplicationProvider } from '@/features/profile/application/profile-application-provider';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { BootstrapScreen } from '@/features/profile/presentation/bootstrap-screen';
import { useKuyaraTheme } from '@/theme/theme-context';

function ThemedApplicationShell() {
  const theme = useKuyaraTheme();
  const { state } = useProfileApplication();
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
  );
}

export default function RootLayout() {
  return (
    <ProfileApplicationProvider>
      <ThemedApplicationShell />
    </ProfileApplicationProvider>
  );
}
