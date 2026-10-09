import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import { NotificationApplicationProvider } from '@/features/notifications/application/notification-application-provider';
import type {
  NotificationGateway,
  NotificationPermissionState,
} from '@/features/notifications/data/notification-gateway';

import {
  NotificationApplicationContext,
  type NotificationApplicationValue,
} from '@/features/notifications/application/notification-context';
import { useWeatherAlertOffer } from '@/features/notifications/application/use-weather-alert-offer';
import {
  ProfileApplicationContext,
  type ProfileApplicationValue,
} from '@/features/profile/application/profile-context';
import type { LocalProfile } from '@/features/profile/domain/profile';
import {
  WeatherApplicationContext,
  type WeatherApplicationValue,
} from '@/features/weather/application/weather-application-context';
import type { ManualLocationId, WeatherSnapshot } from '@/features/weather/domain/weather';

jest.mock('@/features/notifications/data/expo-notification-gateway', () => ({
  ExpoNotificationGateway: class {},
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    router: { navigate: jest.fn() },
    useFocusEffect: (callback: () => void | (() => void)) =>
      React.useEffect(callback, [callback]),
  };
});

const fetchedAt = '2026-09-09T08:00:00.000Z';

const measurements = Object.freeze({
  temperatureCelsius: 20,
  apparentTemperatureCelsius: 20,
  condition: 'clear' as const,
  precipitationProbability: 0,
  windSpeedMetersPerSecond: 0,
  humidity: 0.5,
  uvIndex: 0,
});

const offerSnapshot = Object.freeze({
  id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  localProfileId: 'profile-one',
  locationKey: 'manual:sample.istanbul',
  timeZone: 'UTC',
  fetchedAt,
  current: Object.freeze({ observedAt: fetchedAt, ...measurements }),
  origin: Object.freeze({ kind: 'sample', sourceId: 'offer-hook-test' }),
  minimumTemperatureCelsius: 20,
  maximumTemperatureCelsius: 21,
  hourly: Object.freeze([Object.freeze({
    forecastAt: '2026-09-09T10:00:00.000Z',
    ...measurements,
    precipitationProbability: 0.6,
  })]),
} as const satisfies WeatherSnapshot);

function profileApplication(
  weatherAlertOfferShown: boolean,
  markWeatherAlertOfferShown: () => Promise<void>,
  updateMorningBriefingOptIn: (optIn: boolean) => Promise<void> = jest.fn(async () => undefined),
  optedIn: Readonly<{ notifications?: boolean; morningBriefing?: boolean }> = {},
): ProfileApplicationValue {
  const profile = {
    id: 'profile-one',
    gender: 'woman',
    dressStyle: 'smart',
    birthDate: null,
    displayName: null,
    namePromptVersion: 0,
    languagePreference: 'system',
    themePreference: 'system',
    onboardingCompleted: true,
    notificationsOptIn: optedIn.notifications ?? false,
    weatherAlertOfferShown,
    morningBriefingOptIn: optedIn.morningBriefing ?? false,
    analyticsConsent: 'undecided',
    createdAt: fetchedAt,
    updatedAt: fetchedAt,
    clothingPreference: 'womens',
  } as const satisfies LocalProfile;

  return {
    state: { status: 'ready', profile, isSaving: false },
    retry: jest.fn(async () => undefined),
    completeOnboarding: jest.fn(async () => undefined),
    updateGender: jest.fn(async () => undefined),
    updateDressStyle: jest.fn(async () => undefined),
    updateBirthDate: jest.fn(async () => undefined),
    updateDisplayName: jest.fn(async () => undefined),
    updateLanguagePreference: jest.fn(async () => undefined),
    updateThemePreference: jest.fn(async () => undefined),
    updateNotificationsOptIn: jest.fn(async () => undefined),
    updateMorningBriefingOptIn,
    markWeatherAlertOfferShown,
    updateAnalyticsConsent: jest.fn(async () => undefined),
  };
}

function weatherApplication(
  placeOverrides: Readonly<{ catalogId: ManualLocationId; locationKey: string }> | null = null,
): WeatherApplicationValue {
  return {
    state: {
      status: 'ready',
      activeLocation: {
        source: 'manual',
        catalogId: 'sample.istanbul',
        displayName: 'Istanbul',
        locationKey: 'manual:sample.istanbul',
        coordinates: { latitudeE2: 4101, longitudeE2: 2898 },
        timeZone: 'UTC',
        ...placeOverrides,
      },
      snapshot: offerSnapshot,
      freshness: 'fresh',
      permission: { kind: 'granted', accuracy: 'full' },
      locationFlow: 'idle',
      isSelectingLocation: false,
      isRefreshing: false,
      refreshFailure: null,
    },
    retry: jest.fn(async () => undefined),
    dismissLocationFlow: jest.fn(),
    beginDeviceLocationSelection: jest.fn(async () => undefined),
    confirmDeviceLocationRequest: jest.fn(async () => undefined),
    openApplicationSettings: jest.fn(async () => undefined),
    selectManualLocation: jest.fn(async () => undefined),
    refresh: jest.fn(async () => undefined),
    revalidateFreshness: jest.fn(async () => undefined),
  };
}

function notificationApplication(
  setOptIn: NotificationApplicationValue['setOptIn'],
): NotificationApplicationValue {
  return {
    state: { permission: { kind: 'undetermined' }, isBusy: false },
    setOptIn,
    requestPermission: jest.fn(async () => ({ outcome: 'enabled' as const })),
    openApplicationSettings: jest.fn(async () => undefined),
    weatherAlertScheduler: { reschedule: jest.fn(async () => undefined) },
  };
}

function wrapper(values: Readonly<{
  notification: () => NotificationApplicationValue;
  profile: () => ProfileApplicationValue;
  weather?: WeatherApplicationValue;
}>) {
  const weather = values.weather ?? weatherApplication();
  return function Providers({ children }: PropsWithChildren) {
    return (
      <ProfileApplicationContext value={values.profile()}>
        <NotificationApplicationContext value={values.notification()}>
          <WeatherApplicationContext value={weather}>
            {children}
          </WeatherApplicationContext>
        </NotificationApplicationContext>
      </ProfileApplicationContext>
    );
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-09T08:10:00.000Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

test('re-evaluates the offer when the focused clock crosses the freshness boundary', async () => {
  const providers = wrapper({
    notification: () => notificationApplication(
      jest.fn(async () => ({ outcome: 'enabled' } as const)),
    ),
    profile: () => profileApplication(false, jest.fn(async () => undefined)),
  });
  const hook = await renderHook(() => useWeatherAlertOffer(), { wrapper: providers });

  expect(hook.result.current.offer).toEqual({
    kind: 'offer',
    ruleId: 'precipitation_onset',
  });

  await act(async () => {
    jest.advanceTimersByTime(21 * 60_000);
  });

  expect(hook.result.current.offer).toEqual({ kind: 'none' });
  await hook.unmount();
});

test.each([
  ['alerts', { notifications: true }],
  ['the morning briefing', { morningBriefing: true }],
] as const)('no offer is made to a person who already turned on %s in Settings', async (_kind, optedIn) => {
  const providers = wrapper({
    notification: () => notificationApplication(
      jest.fn(async () => ({ outcome: 'enabled' } as const)),
    ),
    profile: () => profileApplication(
      false, jest.fn(async () => undefined), jest.fn(async () => undefined), optedIn,
    ),
  });
  const hook = await renderHook(() => useWeatherAlertOffer(), { wrapper: providers });

  expect(hook.result.current.offer).toEqual({ kind: 'none' });
  await hook.unmount();
});

test('the snapshot kept from the previous place never makes the offer for the new one', async () => {
  const providers = wrapper({
    notification: () => notificationApplication(
      jest.fn(async () => ({ outcome: 'enabled' } as const)),
    ),
    profile: () => profileApplication(false, jest.fn(async () => undefined)),
    weather: weatherApplication({ locationKey: 'manual:sample.ankara', catalogId: 'sample.ankara' }),
  });
  const hook = await renderHook(() => useWeatherAlertOffer(), { wrapper: providers });

  expect(hook.result.current.offer).toEqual({ kind: 'none' });
  await hook.unmount();
});

test('persists the once-only flag before the OS request and a denial stays spent', async () => {
  let persisted = false;
  const markWeatherAlertOfferShown = jest.fn(async () => {
    persisted = true;
  });
  const requestPermission = jest.fn(async () => {
    expect(persisted).toBe(true);
    return { outcome: 'blocked', canRequestAgain: false } as const;
  });
  let profile = profileApplication(false, markWeatherAlertOfferShown);
  const notification = notificationApplication(requestPermission);
  const providers = wrapper({
    notification: () => notification,
    profile: () => profile,
  });
  const hook = await renderHook(() => useWeatherAlertOffer(), { wrapper: providers });

  let outcome;
  await act(async () => {
    outcome = await hook.result.current.acceptOffer();
  });

  expect(outcome).toEqual({ outcome: 'blocked', canRequestAgain: false });
  expect(markWeatherAlertOfferShown).toHaveBeenCalledTimes(1);
  expect(requestPermission).toHaveBeenCalledTimes(1);
  expect(markWeatherAlertOfferShown.mock.invocationCallOrder[0])
    .toBeLessThan(requestPermission.mock.invocationCallOrder[0]);

  profile = profileApplication(true, markWeatherAlertOfferShown);
  await hook.rerender(undefined);
  expect(hook.result.current.offer).toEqual({ kind: 'none' });
  await hook.unmount();

  const coldStart = await renderHook(() => useWeatherAlertOffer(), { wrapper: providers });
  expect(coldStart.result.current.offer).toEqual({ kind: 'none' });
  await coldStart.unmount();
});

// ADR 0004: accepting turns both notification kinds on, whichever one the offer named, and a
// refused permission turns neither on.
test('accepting the offer opts into the briefing too, and a refusal opts into neither', async () => {
  const updateMorningBriefingOptIn = jest.fn(async () => undefined);
  const granted = wrapper({
    notification: () => notificationApplication(
      jest.fn(async () => ({ outcome: 'enabled' } as const)),
    ),
    profile: () => profileApplication(
      false,
      jest.fn(async () => undefined),
      updateMorningBriefingOptIn,
    ),
  });
  const hook = await renderHook(() => useWeatherAlertOffer(), { wrapper: granted });

  await act(async () => {
    await hook.result.current.acceptOffer();
  });

  expect(updateMorningBriefingOptIn.mock.calls).toEqual([[true]]);
  await hook.unmount();

  const refusedBriefing = jest.fn(async () => undefined);
  const refused = wrapper({
    notification: () => notificationApplication(
      jest.fn(async () => ({ outcome: 'blocked', canRequestAgain: false } as const)),
    ),
    profile: () => profileApplication(false, jest.fn(async () => undefined), refusedBriefing),
  });
  const blocked = await renderHook(() => useWeatherAlertOffer(), { wrapper: refused });

  await act(async () => {
    await blocked.result.current.acceptOffer();
  });

  expect(refusedBriefing).not.toHaveBeenCalled();
  await blocked.unmount();
});

// The OS prompt was refused, then the person turned notifications on in iOS Settings and came
// back: the provider re-reads the permission when the app turns active, and the hook finishes
// the accept as if the grant had been immediate.
test('a permission granted in Settings after a refused accept finishes the accept', async () => {
  const appStateListeners: ((state: string) => void)[] = [];
  const addEventListener = jest.spyOn(AppState, 'addEventListener').mockImplementation(
    ((_type: string, listener: (state: string) => void) => {
      appStateListeners.push(listener);
      return { remove: () => undefined };
    }) as unknown as typeof AppState.addEventListener,
  );
  let permission: NotificationPermissionState = { kind: 'undetermined' };
  const gateway: NotificationGateway = {
    getPermissionState: async () => permission,
    requestPermission: async () => (permission = { kind: 'denied', canRequestAgain: false }),
    openApplicationSettings: jest.fn(async () => undefined),
    cancelScheduledWeatherAlerts: async () => true,
    scheduleWeatherAlert: async () => true,
    subscribeToResponses: () => () => undefined,
  };
  const persistOptIn = jest.fn(async () => undefined);
  const updateMorningBriefingOptIn = jest.fn(async () => undefined);
  const profile = profileApplication(
    false, jest.fn(async () => undefined), updateMorningBriefingOptIn,
  );
  const weather = weatherApplication();
  function Providers({ children }: PropsWithChildren) {
    return (
      <ProfileApplicationContext value={profile}>
        <ProductAnalyticsProvider analytics={new RecordingProductAnalytics()} firstUseStore={new InMemoryFirstUseStore()}>
          <NotificationApplicationProvider gateway={gateway} notificationsOptIn={false} persistOptIn={persistOptIn}>
            <WeatherApplicationContext value={weather}>{children}</WeatherApplicationContext>
          </NotificationApplicationProvider>
        </ProductAnalyticsProvider>
      </ProfileApplicationContext>
    );
  }
  const hook = await renderHook(() => useWeatherAlertOffer(), { wrapper: Providers });

  await act(async () => {
    await hook.result.current.acceptOffer();
  });
  expect(hook.result.current.finishedInSettings).toBe(false);
  expect(persistOptIn).not.toHaveBeenCalled();
  expect(updateMorningBriefingOptIn).not.toHaveBeenCalled();

  // Still denied when the app comes back: nothing changes.
  await act(async () => {
    appStateListeners.forEach((listener) => listener('active'));
  });
  expect(hook.result.current.finishedInSettings).toBe(false);
  expect(persistOptIn).not.toHaveBeenCalled();

  permission = { kind: 'granted' };
  await act(async () => {
    appStateListeners.forEach((listener) => listener('active'));
  });

  await waitFor(() => expect(hook.result.current.finishedInSettings).toBe(true));
  expect(persistOptIn.mock.calls).toEqual([[true]]);
  expect(updateMorningBriefingOptIn.mock.calls).toEqual([[true]]);

  // A later foreground does not write again.
  await act(async () => {
    appStateListeners.forEach((listener) => listener('active'));
  });
  expect(persistOptIn).toHaveBeenCalledTimes(1);
  expect(updateMorningBriefingOptIn).toHaveBeenCalledTimes(1);
  addEventListener.mockRestore();
  await hook.unmount();
});

// Dismissing the refused offer ends the wait: a grant made much later (for example from
// kuyara's own row in iOS Settings) must not turn both opt-ins on behind the person's back.
test('a permission granted in Settings after the refused offer was dismissed opts in nothing', async () => {
  const appStateListeners: ((state: string) => void)[] = [];
  const addEventListener = jest.spyOn(AppState, 'addEventListener').mockImplementation(
    ((_type: string, listener: (state: string) => void) => {
      appStateListeners.push(listener);
      return { remove: () => undefined };
    }) as unknown as typeof AppState.addEventListener,
  );
  let permission: NotificationPermissionState = { kind: 'undetermined' };
  const gateway: NotificationGateway = {
    getPermissionState: async () => permission,
    requestPermission: async () => (permission = { kind: 'denied', canRequestAgain: false }),
    openApplicationSettings: jest.fn(async () => undefined),
    cancelScheduledWeatherAlerts: async () => true,
    scheduleWeatherAlert: async () => true,
    subscribeToResponses: () => () => undefined,
  };
  const persistOptIn = jest.fn(async () => undefined);
  const updateMorningBriefingOptIn = jest.fn(async () => undefined);
  const profile = profileApplication(
    false, jest.fn(async () => undefined), updateMorningBriefingOptIn,
  );
  const weather = weatherApplication();
  function Providers({ children }: PropsWithChildren) {
    return (
      <ProfileApplicationContext value={profile}>
        <ProductAnalyticsProvider analytics={new RecordingProductAnalytics()} firstUseStore={new InMemoryFirstUseStore()}>
          <NotificationApplicationProvider gateway={gateway} notificationsOptIn={false} persistOptIn={persistOptIn}>
            <WeatherApplicationContext value={weather}>{children}</WeatherApplicationContext>
          </NotificationApplicationProvider>
        </ProductAnalyticsProvider>
      </ProfileApplicationContext>
    );
  }
  const hook = await renderHook(() => useWeatherAlertOffer(), { wrapper: Providers });

  await act(async () => {
    await hook.result.current.acceptOffer();
  });
  expect(hook.result.current.finishedInSettings).toBe(false);

  act(() => hook.result.current.cancelSettingsWait());

  permission = { kind: 'granted' };
  await act(async () => {
    appStateListeners.forEach((listener) => listener('active'));
  });

  // Let the provider re-read the grant and any finishing write run before asserting silence.
  await act(async () => {
    await jest.advanceTimersByTimeAsync(50);
  });
  expect(hook.result.current.finishedInSettings).toBe(false);
  expect(persistOptIn).not.toHaveBeenCalled();
  expect(updateMorningBriefingOptIn).not.toHaveBeenCalled();
  addEventListener.mockRestore();
  await hook.unmount();
});
