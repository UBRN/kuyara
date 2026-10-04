import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';

import { followWritesWhileAccountsOpen } from '@/features/account/application/account-pulled-writes';
import { ProfileApplicationController } from '@/features/profile/application/profile-application-controller';
import {
  ProfileApplicationContext,
  type ProfileApplicationValue,
} from '@/features/profile/application/profile-context';
import { usePerformanceTelemetry } from '@/features/analytics/application/use-performance-telemetry';
import { loadProfileRepository } from '@/features/profile/application/profile-repository-loader';
import type { AnalyticsConsent } from '@/features/profile/domain/profile';
import { LocalizationProvider } from '@/localization/localization-provider';
import { KuyaraThemeProvider } from '@/theme/theme-provider';

export function ProfileApplicationProvider({ children }: PropsWithChildren) {
  // The port is a module singleton in the composition root and the no-op elsewhere, so this
  // identity never changes and the controller is never rebuilt.
  const telemetry = usePerformanceTelemetry();
  const controller = useMemo(
    () => new ProfileApplicationController(
      loadProfileRepository,
      (error) => telemetry.reportError(error),
    ),
    [telemetry],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    void controller.initialize();
  }, [controller]);
  // The account's name, gender, dress style and styles a sync pull lands show without a restart.
  useEffect(() => followWritesWhileAccountsOpen(() => void controller.reload()), [controller]);

  const updateNotificationsOptIn = useCallback(
    (optIn: boolean) => controller.updateNotificationsOptIn(optIn),
    [controller],
  );
  const updateMorningBriefingOptIn = useCallback(
    (optIn: boolean) => controller.updateMorningBriefingOptIn(optIn),
    [controller],
  );
  const markWeatherAlertOfferShown = useCallback(
    () => controller.markWeatherAlertOfferShown(),
    [controller],
  );
  const updateAnalyticsConsent = useCallback(
    (consent: AnalyticsConsent) => controller.updateAnalyticsConsent(consent),
    [controller],
  );

  const value = useMemo<ProfileApplicationValue>(
    () => ({
      state,
      retry: () => controller.retry(),
      completeOnboarding: (preferences) =>
        controller.completeOnboarding(preferences),
      updateGender: (gender) => controller.updateGender(gender),
      updateDressStyle: (dressStyle) => controller.updateDressStyle(dressStyle),
      updateStyleAesthetics: (values) => controller.updateStyleAesthetics(values),
      updateMorningSheetEnabled: (enabled) => controller.updateMorningSheetEnabled(enabled),
      updateEasierToSee: (enabled) => controller.updateEasierToSee(enabled),
      updateBirthDate: (birthDate) => controller.updateBirthDate(birthDate),
      updateDisplayName: (displayName) => controller.updateDisplayName(displayName),
      updateLanguagePreference: (preference) =>
        controller.updateLanguagePreference(preference),
      updateThemePreference: (preference) =>
        controller.updateThemePreference(preference),
      updateTemperatureUnitPreference: (preference) =>
        controller.updateTemperatureUnitPreference(preference),
      updateWindSpeedUnitPreference: (preference) =>
        controller.updateWindSpeedUnitPreference(preference),
      updateNotificationsOptIn,
      updateMorningBriefingOptIn,
      markWeatherAlertOfferShown,
      markWalkthroughSeen: () => controller.markWalkthroughSeen(),
      markSwapHintShown: () => controller.markSwapHintShown(),
      updateAnalyticsConsent,
    }),
    [
      controller,
      markWeatherAlertOfferShown,
      state,
      updateAnalyticsConsent,
      updateMorningBriefingOptIn,
      updateNotificationsOptIn,
    ],
  );

  const languagePreference =
    state.status === 'ready' ? state.profile.languagePreference : 'system';
  const themePreference =
    state.status === 'ready' ? state.profile.themePreference : 'system';
  const easierToSee = state.status === 'ready' && state.profile.easierToSee === true;
  const temperatureUnitPreference =
    state.status === 'ready' ? state.profile.temperatureUnitPreference : undefined;
  const windSpeedUnitPreference =
    state.status === 'ready' ? state.profile.windSpeedUnitPreference : undefined;

  return (
    <ProfileApplicationContext value={value}>
      <LocalizationProvider
        preference={languagePreference}
        temperatureUnitPreference={temperatureUnitPreference}
        windSpeedUnitPreference={windSpeedUnitPreference}>
        <KuyaraThemeProvider easierToSee={easierToSee} preference={themePreference}>
          {children}
        </KuyaraThemeProvider>
      </LocalizationProvider>
    </ProfileApplicationContext>
  );
}
