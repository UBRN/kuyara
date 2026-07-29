import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';

import AppTabs from '@/components/app-tabs';
import { KuyaraThemeProvider } from '@/theme/theme-provider';
import { useKuyaraTheme } from '@/theme/theme-context';

function ThemedApplicationShell() {
  const theme = useKuyaraTheme();
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

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <AppTabs />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <KuyaraThemeProvider>
      <ThemedApplicationShell />
    </KuyaraThemeProvider>
  );
}
