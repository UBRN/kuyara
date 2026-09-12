import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { router, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { useCallback, useEffect, useState } from 'react';

import {
  AnalyticsConsentGate,
  isAnalyticsConsentGateEligible,
} from '@/features/analytics/application/analytics-consent-gate';
import {
  AnalyticsConsentTriggerProvider,
  useAnalyticsConsentTrigger,
} from '@/features/analytics/application/analytics-consent-trigger';
import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { createProductAnalytics } from '@/features/analytics/data/create-product-analytics';
import { NotificationApplicationProvider } from '@/features/notifications/application/notification-application-provider';
import { WeatherAlertObserver } from '@/features/notifications/application/weather-alert-observer';
import {
  registerBackgroundWeatherAlertTask,
  unregisterBackgroundWeatherAlertTask,
} from '@/features/notifications/data/expo-background-weather-alert-task';
import { ProfileApplicationProvider } from '@/features/profile/application/profile-application-provider';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import type { LocalProfile } from '@/features/profile/domain/profile';
import { BootstrapScreen } from '@/features/profile/presentation/bootstrap-screen';
import { RecommendationApplicationProvider } from '@/features/recommendation/application/recommendation-application-provider';
import { WeatherApplicationProvider } from '@/features/weather/application/weather-application-provider';
import { WardrobeApplicationProvider } from '@/features/wardrobe/application/wardrobe-application-provider';
import { useKuyaraTheme } from '@/theme/theme-context';

type ReadyApplicationShellProps = Readonly<{
  profile: LocalProfile;
  updateNotificationsOptIn: (optIn: boolean) => Promise<void>;
}>;

function ReadyApplicationShell({
  profile,
  updateNotificationsOptIn,
}: ReadyApplicationShellProps) {
  const theme = useKuyaraTheme();
  // The task only ever refreshes weather to reschedule alerts, so it costs the device a
  // background window for nothing while the user has opted out.
  useEffect(() => {
    void (profile.notificationsOptIn
      ? registerBackgroundWeatherAlertTask()
      : unregisterBackgroundWeatherAlertTask());
  }, [profile.notificationsOptIn]);
  const [analytics] = useState(() =>
    createProductAnalytics(__DEV__, profile.analyticsConsent));
  const pathname = usePathname();
  const { recommendationShown } = useAnalyticsConsentTrigger();
  const presentAnalyticsConsent = useCallback(() => {
    router.push('/analytics-consent');
  }, []);
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
    <ProductAnalyticsProvider analytics={analytics}>
      <NotificationApplicationProvider
        notificationsOptIn={profile.notificationsOptIn}
        persistOptIn={updateNotificationsOptIn}>
        <WeatherApplicationProvider localProfileId={profile.id}>
          <WeatherAlertObserver />
          <WardrobeApplicationProvider localProfileId={profile.id}>
            <RecommendationApplicationProvider localProfileId={profile.id}>
              <ThemeProvider value={navigationTheme}>
                <StatusBar style={theme.isDark ? 'light' : 'dark'} />
                <AnalyticsConsentGate
                  onPresent={presentAnalyticsConsent}
                  shouldPresent={isAnalyticsConsentGateEligible({
                    analyticsConsent: profile.analyticsConsent,
                    onboardingCompleted: profile.onboardingCompleted,
                    pathname,
                    recommendationShown,
                  })}
                />
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
                  <Stack.Screen
                    name="analytics-consent"
                    options={{
                      presentation: Platform.OS === 'ios' ? 'formSheet' : 'modal',
                      ...(Platform.OS === 'ios' ? {
                        sheetAllowedDetents: 'fitToContents' as const,
                        sheetGrabberVisible: false,
                      } : {}),
                    }}
                  />
                </Stack>
              </ThemeProvider>
            </RecommendationApplicationProvider>
          </WardrobeApplicationProvider>
        </WeatherApplicationProvider>
      </NotificationApplicationProvider>
    </ProductAnalyticsProvider>
  );
}

function ThemedApplicationShell() {
  const { retry, state, updateNotificationsOptIn } = useProfileApplication();

  if (state.status === 'loading') {
    return <BootstrapScreen status="loading" />;
  }

  if (state.status === 'error') {
    return (
      <BootstrapScreen
        onRetry={() => void retry()}
        reason={state.reason}
        status="error"
      />
    );
  }

  return (
    <AnalyticsConsentTriggerProvider>
      <ReadyApplicationShell
        profile={state.profile}
        updateNotificationsOptIn={updateNotificationsOptIn}
      />
    </AnalyticsConsentTriggerProvider>
  );
}

export default function RootLayout() {
  return (
    <ProfileApplicationProvider>
      <ThemedApplicationShell />
    </ProfileApplicationProvider>
  );
}
