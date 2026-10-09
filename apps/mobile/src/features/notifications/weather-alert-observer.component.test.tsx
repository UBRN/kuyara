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
import type { ActiveLocation, WeatherFreshness, WeatherSnapshot } from '@/features/weather/domain/weather';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';

const profile: LocalProfile = {
  id: 'profile-id',
  gender: 'woman',
  dressStyle: 'smart',
  birthDate: null,
  displayName: null,
  namePromptVersion: 0,
  clothingPreference: 'womens',
  languagePreference: 'en',
  themePreference: 'light',
  onboardingCompleted: true,
  notificationsOptIn: true,
  weatherAlertOfferShown: false,
  morningBriefingOptIn: false,
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

function profileApplication(notificationsOptIn: boolean, morningBriefingOptIn: boolean): ProfileApplicationValue {
  return {
    state: {
      status: 'ready',
      profile: { ...profile, notificationsOptIn, morningBriefingOptIn },
      isSaving: false,
    },
    retry: async () => undefined,
    completeOnboarding: async () => undefined,
    updateGender: async () => undefined,
    updateDressStyle: async () => undefined,
    updateBirthDate: async () => undefined,
    updateDisplayName: async () => undefined,
    updateLanguagePreference: async () => undefined,
    updateThemePreference: async () => undefined,
    updateNotificationsOptIn: async () => undefined,
    updateMorningBriefingOptIn: async () => undefined,
    markWeatherAlertOfferShown: async () => undefined,
    updateAnalyticsConsent: async () => undefined,
  };
}

function weatherApplication(
  weatherSnapshot: WeatherSnapshot | null,
  freshness: WeatherFreshness,
  refreshFailure: FailureCategory | null,
  status: 'loading' | 'ready' | 'error',
  activeLocationKey: string,
  activeTimeZone: string,
): WeatherApplicationValue {
  return {
    state: status !== 'ready' ? { status } : {
      status: 'ready', activeLocation: {
        source: 'manual', catalogId: 'sample.istanbul', displayName: 'Istanbul',
        locationKey: activeLocationKey, coordinates: { latitudeE2: 4101, longitudeE2: 2897 },
        timeZone: activeTimeZone,
      } satisfies ActiveLocation, snapshot: weatherSnapshot, freshness,
      permission: { kind: 'undetermined' }, locationFlow: 'idle',
      isSelectingLocation: false, isRefreshing: false, refreshFailure,
    },
    retry: async () => undefined,
    dismissLocationFlow: () => undefined,
    beginDeviceLocationSelection: async () => undefined,
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
    requestPermission: async () => ({ outcome: 'enabled' as const }),
    openApplicationSettings: async () => undefined,
    weatherAlertScheduler: scheduler,
  };
}

function Providers({
  scheduler,
  weatherSnapshot,
  notificationsOptIn = true,
  morningBriefingOptIn = false,
  permission = { kind: 'granted' },
  language = 'en',
  hour12 = false,
  temperatureUnit = 'celsius',
  freshness = 'fresh',
  refreshFailure = null,
  weatherStatus = 'ready',
  activeLocationKey = 'manual:sample.istanbul',
  activeTimeZone = 'Europe/Istanbul',
}: Readonly<{
  scheduler: WeatherAlertScheduling;
  weatherSnapshot: WeatherSnapshot | null;
  notificationsOptIn?: boolean;
  morningBriefingOptIn?: boolean;
  permission?: NotificationPermissionState;
  language?: SupportedLanguage;
  hour12?: boolean;
  temperatureUnit?: 'celsius' | 'fahrenheit';
  freshness?: WeatherFreshness;
  refreshFailure?: FailureCategory | null;
  weatherStatus?: 'loading' | 'ready' | 'error';
  activeLocationKey?: string;
  activeTimeZone?: string;
}>) {
  return (
    <ProfileApplicationContext.Provider value={profileApplication(notificationsOptIn, morningBriefingOptIn)}>
      <LocalizationContext.Provider value={{ language, messages: messages[language], hour12, temperatureUnit }}>
        <NotificationApplicationContext.Provider value={notificationApplication(scheduler, permission)}>
          <WeatherApplicationContext.Provider
            value={weatherApplication(
              weatherSnapshot, freshness, refreshFailure, weatherStatus, activeLocationKey, activeTimeZone,
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

test('switching location cancels old alerts while the previous snapshot remains', async () => {
  const harness = cancellableScheduler();
  const oldSnapshot = snapshot('snapshot-old');
  const result = await render(
    <Providers scheduler={harness.scheduler} weatherSnapshot={oldSnapshot} />,
  );
  await waitFor(() => expect(harness.cancelScheduledWeatherAlerts).toHaveBeenCalledTimes(1));
  const scheduledBeforeSwitch = harness.scheduleWeatherAlert.mock.calls.length;

  result.rerender(
    <Providers
      scheduler={harness.scheduler}
      weatherSnapshot={oldSnapshot}
      activeLocationKey="manual:sample.ankara"
      freshness="stale"
      refreshFailure="offline"
    />,
  );

  await waitFor(() => expect(harness.cancelScheduledWeatherAlerts).toHaveBeenCalledTimes(2));
  expect(harness.scheduleWeatherAlert).toHaveBeenCalledTimes(scheduledBeforeSwitch);
});

test('a time-zone-only move cancels the old zone\'s alerts while its snapshot remains', async () => {
  const harness = cancellableScheduler();
  const oldSnapshot = snapshot('snapshot-old');
  const result = await render(
    <Providers morningBriefingOptIn scheduler={harness.scheduler} weatherSnapshot={oldSnapshot} />,
  );
  await waitFor(() => expect(harness.cancelScheduledWeatherAlerts).toHaveBeenCalledTimes(1));
  const scheduledBeforeMove = harness.scheduleWeatherAlert.mock.calls.length;

  result.rerender(
    <Providers
      morningBriefingOptIn
      scheduler={harness.scheduler}
      weatherSnapshot={oldSnapshot}
      activeTimeZone="Europe/London"
      freshness="stale"
    />,
  );

  await waitFor(() => expect(harness.cancelScheduledWeatherAlerts).toHaveBeenCalledTimes(2));
  expect(harness.scheduleWeatherAlert).toHaveBeenCalledTimes(scheduledBeforeMove);
});

// The clock setting decides how the crossing reads in the notification body, so a change
// to it has to re-plan the schedule the same way a language change does.
test("the device's clock setting reaches the scheduler and re-plans when it changes", async () => {
  const reschedule = jest.fn<
    ReturnType<WeatherAlertScheduling['reschedule']>,
    Parameters<WeatherAlertScheduling['reschedule']>
  >(async () => undefined);
  const scheduler: WeatherAlertScheduling = { reschedule };
  const weatherSnapshot = snapshot('snapshot-one');
  const result = await render(
    <Providers scheduler={scheduler} weatherSnapshot={weatherSnapshot} />,
  );
  await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(1));
  expect(reschedule.mock.calls[0]?.[0].hour12).toBe(false);

  result.rerender(
    <Providers hour12 scheduler={scheduler} weatherSnapshot={weatherSnapshot} />,
  );

  await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(2));
  expect(reschedule.mock.calls[1]?.[0].hour12).toBe(true);
});

test('changing the device temperature unit reschedules local alerts', async () => {
  const reschedule = jest.fn<
    ReturnType<WeatherAlertScheduling['reschedule']>,
    Parameters<WeatherAlertScheduling['reschedule']>
  >(async () => undefined);
  const scheduler: WeatherAlertScheduling = { reschedule };
  const weatherSnapshot = snapshot('snapshot-one');
  const result = await render(<Providers scheduler={scheduler} weatherSnapshot={weatherSnapshot} />);
  await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(1));
  expect(reschedule.mock.calls[0]?.[0].temperatureUnit).toBe('celsius');
  result.rerender(
    <Providers scheduler={scheduler} temperatureUnit="fahrenheit" weatherSnapshot={weatherSnapshot} />,
  );
  await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(2));
  expect(reschedule.mock.calls[1]?.[0].temperatureUnit).toBe('fahrenheit');
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

test('turning off weather alerts with stale weather reaches the scheduler immediately', async () => {
  const reschedule = rescheduleSpy();
  const weatherSnapshot = snapshot('snapshot-cached');
  const result = await render(
    <Providers scheduler={{ reschedule }} weatherSnapshot={weatherSnapshot}
      morningBriefingOptIn freshness="stale" />,
  );
  await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(1));
  result.rerender(
    <Providers scheduler={{ reschedule }} weatherSnapshot={weatherSnapshot}
      notificationsOptIn={false} morningBriefingOptIn freshness="stale" />,
  );
  await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(2));
  expect(reschedule.mock.calls[1]?.[0].weatherAlertsEnabled).toBe(false);
  expect(reschedule.mock.calls[1]?.[0].morningBriefingEnabled).toBe(true);
});

function cancellableScheduler() {
  const cancelScheduledWeatherAlerts = jest.fn(async () => true);
  const scheduleWeatherAlert = jest.fn(async () => true);
  const gateway: NotificationGateway = {
    getPermissionState: async () => ({ kind: 'granted' }),
    requestPermission: async () => ({ kind: 'granted' }),
    openApplicationSettings: async () => undefined,
    cancelScheduledWeatherAlerts,
    scheduleWeatherAlert,
    subscribeToResponses: () => () => undefined,
  };
  const repository: WeatherAlertDeliveryRepository = {
    upsertScheduled: async () => undefined,
    deletePending: async () => undefined,
    listFiredIds: async () => new Set(),
    listPending: async () => [],
    pruneBefore: async () => undefined,
  };
  return {
    cancelScheduledWeatherAlerts,
    scheduleWeatherAlert,
    scheduler: new WeatherAlertScheduler(
      gateway,
      async () => repository,
      () => '2026-09-09T08:00:00.000Z',
      () => 'UTC',
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
  ['a permission read that failed', { kind: 'unknown' } as const, 'ready' as const],
  ['weather that is still loading', { kind: 'granted' } as const, 'loading' as const],
  ['weather that failed to load', { kind: 'granted' } as const, 'error' as const],
])('%s neither plans nor cancels when both kinds remain enabled', async (_label, permission, weatherStatus) => {
  // ADR 0032 section 6: none of these proves an opt-out or a denial, so the alerts an
  // earlier session or the background task left pending have to survive them.
  const reschedule = rescheduleSpy();

  await render(
    <Providers
      scheduler={{ reschedule }}
      weatherSnapshot={snapshot('snapshot-one')}
      morningBriefingOptIn
      permission={permission}
      weatherStatus={weatherStatus}
    />,
  );

  expect(reschedule).not.toHaveBeenCalled();
});

test('ready weather with no cached snapshot plans nothing and cancels nothing', async () => {
  // Without a known opt-out, a missing snapshot leaves both kinds pending.
  const harness = cancellableScheduler();

  await render(
    <Providers scheduler={harness.scheduler} weatherSnapshot={null} morningBriefingOptIn />,
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
      morningBriefingOptIn
      weatherStatus="loading"
    />,
  );
  expect(reschedule).not.toHaveBeenCalled();

  result.rerender(
    <Providers scheduler={{ reschedule }} weatherSnapshot={weatherSnapshot} morningBriefingOptIn />,
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
