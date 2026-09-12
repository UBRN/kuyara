import { render, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import type { FailureCategory } from '@/domain/failure-category';
import { NotificationApplicationContext, type NotificationApplicationValue } from '@/features/notifications/application/notification-context';
import { WeatherAlertObserver } from '@/features/notifications/application/weather-alert-observer';
import { WeatherAlertScheduler, type WeatherAlertScheduling } from '@/features/notifications/application/weather-alert-scheduler';
import type { NotificationGateway, NotificationPermissionState } from '@/features/notifications/data/notification-gateway';
import type { WeatherAlertDeliveryRepository } from '@/features/notifications/data/weather-alert-delivery-repository';
import { ProfileApplicationContext, type ProfileApplicationValue } from '@/features/profile/application/profile-context';
import type { LocalProfile } from '@/features/profile/domain/profile';
import { WeatherApplicationContext, type WeatherApplicationValue } from '@/features/weather/application/weather-application-context';
import type { WeatherFreshness, WeatherSnapshot } from '@/features/weather/domain/weather';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';

const profile: LocalProfile = {
  id: 'profile-id',
  gender: 'woman',
  dressStyle: 'smart',
  birthDate: null,
  clothingPreference: 'womens',
  languagePreference: 'en',
  themePreference: 'light',
  onboardingCompleted: true,
  notificationsOptIn: true,
  analyticsConsent: 'undecided',
  createdAt: '2026-09-09T08:00:00.000Z',
  updatedAt: '2026-09-09T08:00:00.000Z',
};

function snapshot(id: string): WeatherSnapshot {
  return {
    id,
    localProfileId: profile.id,
    locationKey: 'manual:sample.istanbul',
    timeZone: 'Europe/Istanbul',
    fetchedAt: '2026-09-09T08:00:00.000Z',
    origin: { kind: 'sample', sourceId: 'test' },
    current: {
      observedAt: '2026-09-09T08:00:00.000Z',
      temperatureCelsius: 16,
      apparentTemperatureCelsius: 16,
      condition: 'clear',
      precipitationProbability: 0,
      windSpeedMetersPerSecond: 2,
      humidity: 0.5,
      uvIndex: 1,
    },
    minimumTemperatureCelsius: 8,
    maximumTemperatureCelsius: 18,
    hourly: [{
      forecastAt: '2026-09-09T10:00:00.000Z',
      temperatureCelsius: 12,
      apparentTemperatureCelsius: 8,
      condition: 'rain',
      precipitationProbability: 0.8,
      windSpeedMetersPerSecond: 3,
      humidity: 0.7,
      uvIndex: 0,
    }],
  };
}

function profileApplication(notificationsOptIn: boolean): ProfileApplicationValue {
  return {
    state: {
      status: 'ready',
      profile: { ...profile, notificationsOptIn },
      isSaving: false,
    },
    retry: async () => undefined,
    completeOnboarding: async () => undefined,
    updateGender: async () => undefined,
    updateDressStyle: async () => undefined,
    updateBirthDate: async () => undefined,
    updateLanguagePreference: async () => undefined,
    updateThemePreference: async () => undefined,
    updateNotificationsOptIn: async () => undefined,
    updateAnalyticsConsent: async () => undefined,
  };
}

function weatherApplication(
  weatherSnapshot: WeatherSnapshot | null,
  freshness: WeatherFreshness,
  refreshFailure: FailureCategory | null,
  status: 'loading' | 'ready' | 'error',
): WeatherApplicationValue {
  return {
    state: status !== 'ready' ? { status } : {
      status: 'ready', activeLocation: null, snapshot: weatherSnapshot, freshness,
      permission: { kind: 'undetermined' }, locationFlow: 'idle',
      isSelectingLocation: false, isRefreshing: false, refreshFailure,
    },
    retry: async () => undefined,
    dismissLocationFlow: () => undefined,
    beginDeviceLocationSelection: async () => undefined,
    confirmDeviceLocationRequest: async () => undefined,
    openApplicationSettings: async () => undefined,
    selectManualLocation: async () => undefined,
    refresh: async () => undefined,
    revalidateFreshness: async () => undefined,
  };
}

function notificationApplication(
  scheduler: WeatherAlertScheduling,
  permission: NotificationPermissionState,
): NotificationApplicationValue {
  return {
    state: { permission, isBusy: false },
    setOptIn: async () => ({ outcome: 'enabled' }),
    openApplicationSettings: async () => undefined,
    weatherAlertScheduler: scheduler,
  };
}

function Providers({
  scheduler,
  weatherSnapshot,
  notificationsOptIn = true,
  permission = { kind: 'granted' },
  language = 'en',
  freshness = 'fresh',
  refreshFailure = null,
  weatherStatus = 'ready',
}: Readonly<{
  scheduler: WeatherAlertScheduling;
  weatherSnapshot: WeatherSnapshot | null;
  notificationsOptIn?: boolean;
  permission?: NotificationPermissionState;
  language?: SupportedLanguage;
  freshness?: WeatherFreshness;
  refreshFailure?: FailureCategory | null;
  weatherStatus?: 'loading' | 'ready' | 'error';
}>) {
  return (
    <ProfileApplicationContext.Provider value={profileApplication(notificationsOptIn)}>
      <LocalizationContext.Provider value={{ language, messages: messages[language], hour12: false }}>
        <NotificationApplicationContext.Provider value={notificationApplication(scheduler, permission)}>
          <WeatherApplicationContext.Provider
            value={weatherApplication(
              weatherSnapshot, freshness, refreshFailure, weatherStatus,
            )}
          >
            <WeatherAlertObserver />
          </WeatherApplicationContext.Provider>
        </NotificationApplicationContext.Provider>
      </LocalizationContext.Provider>
    </ProfileApplicationContext.Provider>
  );
}

test('a fresh snapshot id change triggers exactly one additional reschedule', async () => {
  const reschedule = jest.fn<
    ReturnType<WeatherAlertScheduling['reschedule']>,
    Parameters<WeatherAlertScheduling['reschedule']>
  >(async () => undefined);
  const scheduler: WeatherAlertScheduling = { reschedule };
  const firstSnapshot = snapshot('snapshot-one');
  const result = await render(
    <Providers scheduler={scheduler} weatherSnapshot={firstSnapshot} />,
  );
  await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(1));

  result.rerender(
    <Providers scheduler={scheduler} weatherSnapshot={snapshot('snapshot-two')} />,
  );

  await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(2));
  expect(reschedule.mock.calls[1]?.[0].snapshot?.id).toBe('snapshot-two');
});

test('a stale snapshot still reschedules weather alerts with the cached snapshot', async () => {
  const reschedule = jest.fn<
    ReturnType<WeatherAlertScheduling['reschedule']>,
    Parameters<WeatherAlertScheduling['reschedule']>
  >(async () => undefined);
  const weatherSnapshot = snapshot('snapshot-stale');

  await render(
    <Providers
      scheduler={{ reschedule }}
      weatherSnapshot={weatherSnapshot}
      freshness="stale"
    />,
  );

  await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(1));
  expect(reschedule.mock.calls[0]?.[0].snapshot).toBe(weatherSnapshot);
});

test('a refresh failure with the same cached snapshot does not cancel or reschedule alerts', async () => {
  const reschedule = jest.fn<
    ReturnType<WeatherAlertScheduling['reschedule']>,
    Parameters<WeatherAlertScheduling['reschedule']>
  >(async () => undefined);
  const weatherSnapshot = snapshot('snapshot-cached');
  const result = await render(
    <Providers scheduler={{ reschedule }} weatherSnapshot={weatherSnapshot} />,
  );
  await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(1));

  result.rerender(
    <Providers
      scheduler={{ reschedule }}
      weatherSnapshot={snapshot('snapshot-cached')}
      freshness="stale"
      refreshFailure="offline"
    />,
  );

  expect(reschedule).toHaveBeenCalledTimes(1);
  expect(reschedule.mock.calls[0]?.[0].snapshot).toBe(weatherSnapshot);
});

function cancellableScheduler() {
  const cancelScheduledWeatherAlerts = jest.fn(async () => true);
  const gateway: NotificationGateway = {
    getPermissionState: async () => ({ kind: 'granted' }),
    requestPermission: async () => ({ kind: 'granted' }),
    openApplicationSettings: async () => undefined,
    cancelScheduledWeatherAlerts,
    scheduleWeatherAlert: async () => true,
    subscribeToResponses: () => () => undefined,
  };
  const repository: WeatherAlertDeliveryRepository = {
    upsertScheduled: async () => undefined,
    deletePending: async () => undefined,
    listFiredIds: async () => new Set(),
    pruneBefore: async () => undefined,
  };
  return {
    cancelScheduledWeatherAlerts,
    scheduler: new WeatherAlertScheduler(
      gateway,
      repository,
      () => '2026-09-09T08:00:00.000Z',
    ),
  };
}

test.each([
  ['opt-in off', false, { kind: 'granted' } as const],
  ['permission denied', true, { kind: 'denied', canRequestAgain: false } as const],
])('%s cancels pending weather alerts', async (_label, notificationsOptIn, permission) => {
  const harness = cancellableScheduler();

  await render(
    <Providers
      scheduler={harness.scheduler}
      weatherSnapshot={snapshot('snapshot-one')}
      notificationsOptIn={notificationsOptIn}
      permission={permission}
    />,
  );

  await waitFor(() => expect(harness.cancelScheduledWeatherAlerts).toHaveBeenCalledTimes(1));
});

const rescheduleSpy = () => jest.fn<
  ReturnType<WeatherAlertScheduling['reschedule']>,
  Parameters<WeatherAlertScheduling['reschedule']>
>(async () => undefined);

test.each([
  ['an undetermined permission', { kind: 'undetermined' } as const, 'ready' as const],
  ['weather that is still loading', { kind: 'granted' } as const, 'loading' as const],
  ['weather that failed to load', { kind: 'granted' } as const, 'error' as const],
])('%s neither plans nor cancels', async (_label, permission, weatherStatus) => {
  // ADR 0032 section 6: none of these proves an opt-out or a denial, so the alerts an
  // earlier session or the background task left pending have to survive them.
  const reschedule = rescheduleSpy();

  await render(
    <Providers
      scheduler={{ reschedule }}
      weatherSnapshot={snapshot('snapshot-one')}
      permission={permission}
      weatherStatus={weatherStatus}
    />,
  );

  expect(reschedule).not.toHaveBeenCalled();
});

test('ready weather with no cached snapshot plans nothing and cancels nothing', async () => {
  // The scheduler reads a null snapshot as a cancellation, so the observer must not reach
  // it before there is something to plan from.
  const harness = cancellableScheduler();

  await render(
    <Providers scheduler={harness.scheduler} weatherSnapshot={null} />,
  );

  expect(harness.cancelScheduledWeatherAlerts).not.toHaveBeenCalled();
});

test('the plan follows once the cached weather has loaded', async () => {
  const reschedule = rescheduleSpy();
  const weatherSnapshot = snapshot('snapshot-one');
  const result = await render(
    <Providers
      scheduler={{ reschedule }}
      weatherSnapshot={weatherSnapshot}
      weatherStatus="loading"
    />,
  );
  expect(reschedule).not.toHaveBeenCalled();

  result.rerender(
    <Providers scheduler={{ reschedule }} weatherSnapshot={weatherSnapshot} />,
  );

  await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(1));
  expect(reschedule.mock.calls[0]?.[0].snapshot).toBe(weatherSnapshot);
});

test.each([
  ['an opt-out', false, { kind: 'undetermined' } as const],
  ['a denial', true, { kind: 'denied', canRequestAgain: false } as const],
])('%s cancels even before the weather has loaded', async (_label, notificationsOptIn, permission) => {
  const harness = cancellableScheduler();

  await render(
    <Providers
      scheduler={harness.scheduler}
      weatherSnapshot={snapshot('snapshot-one')}
      notificationsOptIn={notificationsOptIn}
      permission={permission}
      weatherStatus="loading"
    />,
  );

  await waitFor(() => expect(harness.cancelScheduledWeatherAlerts).toHaveBeenCalledTimes(1));
});

test('returning to the foreground replans, so a day that turned while away is caught', async () => {
  const addEventListener = jest.mocked(AppState.addEventListener);
  addEventListener.mockReturnValue({ remove: () => undefined });
  const reschedule = jest.fn<
    ReturnType<WeatherAlertScheduling['reschedule']>,
    Parameters<WeatherAlertScheduling['reschedule']>
  >(async () => undefined);
  await render(
    <Providers scheduler={{ reschedule }} weatherSnapshot={snapshot('snapshot-one')} />,
  );
  await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(1));

  const notify = (status: AppStateStatus) => {
    addEventListener.mock.calls.forEach(([, listener]) => listener(status));
  };
  notify('background');
  notify('active');

  await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(2));
});
