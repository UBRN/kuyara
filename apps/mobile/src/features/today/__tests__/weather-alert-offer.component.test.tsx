import { act, renderHook } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

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
import type { WeatherSnapshot } from '@/features/weather/domain/weather';

jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
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
): ProfileApplicationValue {
  const profile = {
    id: 'profile-one',
    gender: 'woman',
    dressStyle: 'smart',
    birthDate: null,
    languagePreference: 'system',
    themePreference: 'system',
    onboardingCompleted: true,
    notificationsOptIn: false,
    weatherAlertOfferShown,
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
    updateLanguagePreference: jest.fn(async () => undefined),
    updateThemePreference: jest.fn(async () => undefined),
    updateNotificationsOptIn: jest.fn(async () => undefined),
    markWeatherAlertOfferShown,
    updateAnalyticsConsent: jest.fn(async () => undefined),
  };
}

function weatherApplication(): WeatherApplicationValue {
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
    openApplicationSettings: jest.fn(async () => undefined),
    weatherAlertScheduler: { reschedule: jest.fn(async () => undefined) },
  };
}

function wrapper(values: Readonly<{
  notification: () => NotificationApplicationValue;
  profile: () => ProfileApplicationValue;
}>) {
  const weather = weatherApplication();
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
