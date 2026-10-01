import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { router, Stack, usePathname } from 'expo-router';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Platform, Share, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { use, useCallback, useEffect, useState } from 'react';

import { LaunchCurtain, type LaunchReadiness } from '@/components/ui/launch-curtain';

import {
  AnalyticsConsentGate,
  isAnalyticsConsentGateEligible,
} from '@/features/analytics/application/analytics-consent-gate';
import {
  AnalyticsConsentTriggerProvider,
  useAnalyticsConsentTrigger,
} from '@/features/analytics/application/analytics-consent-trigger';
import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { PerformanceTelemetryContext } from '@/features/analytics/application/use-performance-telemetry';
import { readAnalyticsConsentSync } from '@/features/analytics/data/analytics-consent-sync-source';
import { createProductAnalytics } from '@/features/analytics/data/create-product-analytics';
import { countLaunchedSession } from '@/features/analytics/data/expo-file-session-counter';
import {
  configureObserveTelemetry,
  observePerformanceTelemetry,
  withObserveRoot,
} from '@/features/analytics/data/observe-performance-telemetry';
import { telemetryDispatchingEnabled } from '@/features/analytics/domain/performance-telemetry';
import { NotificationApplicationProvider } from '@/features/notifications/application/notification-application-provider';
import { NotificationApplicationContext } from '@/features/notifications/application/notification-context';
import { WeatherAlertObserver } from '@/features/notifications/application/weather-alert-observer';
import {
  registerBackgroundWeatherAlertTask,
  unregisterBackgroundWeatherAlertTask,
} from '@/features/notifications/data/expo-background-weather-alert-task';
import type { BootstrapReport } from '@/features/profile/application/profile-application-controller';
import { ProfileApplicationProvider } from '@/features/profile/application/profile-application-provider';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import type { LocalProfile } from '@/features/profile/domain/profile';
import { BootstrapScreen } from '@/features/profile/presentation/bootstrap-screen';
import { composeBootstrapReportText } from '@/features/profile/presentation/bootstrap-report-text';
import { RecommendationApplicationProvider } from '@/features/recommendation/application/recommendation-application-provider';
import { WeatherApplicationProvider } from '@/features/weather/application/weather-application-provider';
import { WardrobeApplicationProvider } from '@/features/wardrobe/application/wardrobe-application-provider';
import { WalkthroughProvider } from '@/features/walkthrough/application/walkthrough-provider';
import { isDeepLinkLaunch } from '@/features/walkthrough/domain/walkthrough-rules';
import { openKuyaraDatabaseSync } from '@/infrastructure/sqlite/expo-sqlite-database';
import { useKuyaraTheme } from '@/theme/theme-context';

// Module scope, before the first render: Observe's expo-router integration has to be
// enabled before any screen mounts, and the same call decides whether anything is
// dispatched. The consent answer is therefore read synchronously from SQLite here. A
// consent change inside the session re-applies the configuration through the port
// (`setDispatching`), so withdrawal takes effect immediately rather than at the next launch.
configureObserveTelemetry({
  dispatchingEnabled: telemetryDispatchingEnabled(
    readAnalyticsConsentSync(openKuyaraDatabaseSync),
  ),
});

// A session is one app process, so the launch is counted here, once, before the first render.
// ADR 0033 section 6: the consent sheet is asked for from the second session onwards.
const sessionIndex = countLaunchedSession();

// A process plays its launch once: a root that mounts again in the same process (a scene
// reconnecting) is not a cold launch.
let launchPlayed = false;

// The native splash stays until the launch curtain has drawn its first frame, the same
// picture, and hands over without a fade: iOS has none by default, and Android's 400 ms
// fade would cross-dissolve over the curtain's own motion.
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions(Platform.OS === 'android' ? { duration: 0 } : { fade: false });

// The bootstrap screen renders before the router, the database and the consent answer exist,
// so the only channel a user has for a launch failure is the system share sheet. The text is
// composed on the device and shown in the sheet before anything is sent; a dismissed or
// unavailable sheet rejects and is ignored.
function shareBootstrapReport(report: BootstrapReport): void {
  void Share.share({
    message: composeBootstrapReportText(report, {
      appVersion: Constants.expoConfig?.version,
      buildNumber: Constants.platform?.ios?.buildNumber
        ?? Constants.platform?.android?.versionCode?.toString(),
      osName: Device.osName,
      osVersion: Device.osVersion,
      modelName: Device.modelName,
    }),
  }).catch(() => undefined);
}

/**
 * The first screen is drawn: the shell's navigator mounted with it. A launch from a tapped
 * notification or a link plays the shortened curtain, read from the same sources the tour
 * reads. The tap that launched the app reaches the count one commit later, from the
 * notification provider's own effect; the report follows it, and the curtain moves only on
 * the frame after, so it reads that tap.
 */
function LaunchReadyReport({ onReady }: Readonly<{ onReady: (shortened: boolean) => void }>) {
  const openedNotifications = use(NotificationApplicationContext)?.openedNotifications ?? 0;
  const pathname = usePathname();
  const [deepLink] = useState(() => isDeepLinkLaunch(pathname));
  useEffect(() => {
    onReady(deepLink || openedNotifications > 0);
  }, [deepLink, onReady, openedNotifications]);
  return null;
}

type ReadyApplicationShellProps = Readonly<{
  profile: LocalProfile;
  updateNotificationsOptIn: (optIn: boolean) => Promise<void>;
  onLaunchReady: (shortened: boolean) => void;
}>;

function ReadyApplicationShell({
  profile,
  updateNotificationsOptIn,
  onLaunchReady,
}: ReadyApplicationShellProps) {
  const theme = useKuyaraTheme();
  // The task only ever refreshes weather to reschedule notifications, so it costs the
  // device a background window for nothing while both kinds are off (ADR 0004).
  const wantsBackgroundRefresh = profile.notificationsOptIn || profile.morningBriefingOptIn;
  useEffect(() => {
    void (wantsBackgroundRefresh
      ? registerBackgroundWeatherAlertTask()
      : unregisterBackgroundWeatherAlertTask());
  }, [wantsBackgroundRefresh]);
  const [analytics] = useState(() =>
    createProductAnalytics(__DEV__, profile.analyticsConsent));
  const pathname = usePathname();
  const { recommendationShown, beginConsentPresentation } = useAnalyticsConsentTrigger();
  const presentAnalyticsConsent = useCallback(() => {
    const presentation = beginConsentPresentation();
    router.push({ pathname: '/analytics-consent', params: { presentation } });
  }, [beginConsentPresentation]);
  const baseNavigationTheme = theme.isDark ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseNavigationTheme,
    colors: {
      ...baseNavigationTheme.colors,
      primary: theme.colors.brandPrimary,
      background: theme.colors.background,
      // O14 dark cards B: the nav chrome takes the ground, so the card is the only lifted
      // plane. Light is unchanged: its elevated plane already equals the ground.
      card: theme.colors.background,
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
          <LaunchReadyReport onReady={onLaunchReady} />
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
                    sessionIndex,
                  })}
                />
                {/* Phase 8: the coach-mark tour draws above the navigator, native tabs and
                    sheets included, and reads the launch it opens in. */}
                <WalkthroughProvider sessionIndex={sessionIndex}>
                <Stack
                  screenOptions={{
                    animation: 'default',
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
                      // ADR 0033 section 3: one clear question, answered before any event
                      // is captured. Accept and decline are the only exits.
                      gestureEnabled: false,
                      presentation: Platform.OS === 'ios' ? 'formSheet' : 'modal',
                      ...(Platform.OS === 'ios' ? {
                        sheetAllowedDetents: 'fitToContents' as const,
                        sheetGrabberVisible: false,
                      } : {}),
                    }}
                  />
                </Stack>
                </WalkthroughProvider>
              </ThemeProvider>
            </RecommendationApplicationProvider>
          </WardrobeApplicationProvider>
        </WeatherApplicationProvider>
      </NotificationApplicationProvider>
    </ProductAnalyticsProvider>
  );
}

type ThemedApplicationShellProps = Readonly<{
  onLaunchReady: (shortened: boolean) => void;
  onLaunchFailed: () => void;
}>;

function ThemedApplicationShell({ onLaunchFailed, onLaunchReady }: ThemedApplicationShellProps) {
  const { retry, state, updateNotificationsOptIn } = useProfileApplication();
  const failed = state.status === 'error';
  useEffect(() => {
    if (failed) onLaunchFailed();
  }, [failed, onLaunchFailed]);

  if (state.status === 'loading') {
    return <BootstrapScreen status="loading" />;
  }

  if (state.status === 'error') {
    return (
      <BootstrapScreen
        onReportProblem={() => shareBootstrapReport(state.report)}
        onRetry={() => void retry()}
        reason={state.report.stage}
        status="error"
      />
    );
  }

  return (
    <AnalyticsConsentTriggerProvider>
      <ReadyApplicationShell
        onLaunchReady={onLaunchReady}
        profile={state.profile}
        updateNotificationsOptIn={updateNotificationsOptIn}
      />
    </AnalyticsConsentTriggerProvider>
  );
}

// Phase 7: the outfit detail board's tap and swipe are gesture-handler gestures, which do
// nothing, and report nothing, without this root. The package has been a native dependency
// of every build, so this is JavaScript only.
function RootLayout() {
  const [cold] = useState(() => !launchPlayed);
  useEffect(() => {
    launchPlayed = true;
  }, []);
  // A drawn first screen may still learn it was opened by a notification; a failure is final.
  // The curtain takes the answer it holds on the frame it starts and ignores any later one.
  const [launch, setLaunch] = useState<LaunchReadiness>('pending');
  const reportReady = useCallback((shortened: boolean) => {
    setLaunch((current) => {
      if (current === 'pending') return shortened ? 'shortened' : 'ready';
      return current === 'ready' && shortened ? 'shortened' : current;
    });
  }, []);
  const reportFailed = useCallback(() => {
    setLaunch((current) => (current === 'pending' ? 'failed' : current));
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <LaunchCurtain cold={cold} onFirstFrame={SplashScreen.hide} readiness={launch}>
        <PerformanceTelemetryContext value={observePerformanceTelemetry}>
          <ProfileApplicationProvider>
            <ThemedApplicationShell onLaunchFailed={reportFailed} onLaunchReady={reportReady} />
          </ProfileApplicationProvider>
        </PerformanceTelemetryContext>
      </LaunchCurtain>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

// `ObserveRoot` marks the first render and mounts the router integration's storage provider.
export default withObserveRoot(RootLayout);
