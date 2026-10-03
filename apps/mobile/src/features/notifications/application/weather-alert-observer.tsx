import { weatherLocalDateKey } from '@kuyara/contracts';
import { AppState } from 'react-native';
import { useEffect, useEffectEvent } from 'react';

import { useNotificationApplication } from '@/features/notifications/application/notification-context';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { wantsAnyNotification } from '@/features/profile/domain/profile';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { activeLocationSnapshot } from '@/features/weather/domain/weather';
import { systemNow } from '@/infrastructure/system-clock';
import { useLocalizationContext } from '@/localization/localization-context';

export function WeatherAlertObserver() {
  const notificationApplication = useNotificationApplication();
  const profileApplication = useProfileApplication();
  const weatherApplication = useWeatherApplication();
  const { hour12, language, temperatureUnit } = useLocalizationContext();
  const profile = profileApplication.state.status === 'ready'
    ? profileApplication.state.profile
    : null;
  const weather = weatherApplication.state.status === 'ready'
    ? weatherApplication.state
    : null;
  const snapshot = weather
    ? activeLocationSnapshot(weather.snapshot, weather.activeLocation)
    : null;
  const locationMismatch = weather?.snapshot != null
    && weather.snapshot.locationKey !== weather.activeLocation?.locationKey;
  const snapshotId = snapshot?.id;
  const permission = notificationApplication.state.permission;
  const notificationsOptIn = profile?.notificationsOptIn ?? false;
  const morningBriefingOptIn = profile?.morningBriefingOptIn ?? false;
  const localProfileId = profile?.id ?? null;
  // An alert's identity is keyed to the dressing-day window, so the plan has to be redone
  // when that window turns. The local date is the cheap half of the trigger: it is re-read
  // on every render and a change re-runs the effect. The window's own 18:00 and 04:00 turns
  // are not date changes, so they are caught by becoming active or by the next render
  // rather than by a timer, which is the consequence ADR 0032 records.
  const localDate = snapshot
    && weatherLocalDateKey(systemNow(), snapshot.timeZone);

  const rescheduleWeatherAlerts = useEffectEvent(() => {
    if (!localProfileId) return;
    // ADR 0032 section 6: alerts are planned only when the opt-in and the OS permission
    // both allow them and a snapshot has loaded, and the existing schedule is cancelled
    // only on a known opt-out or a known denial. Every other combination (a permission not
    // yet read or still undetermined, weather loading or failed to load) is absence of
    // knowledge, and acting on it would drop the alerts an earlier session or the
    // background task left pending. A ready weather state can still carry no snapshot,
    // which plans nothing and would reach the scheduler as a cancellation.
    // ADR 0004: the two kinds have their own opt-ins, so either one on is a reason to plan
    // and both off is the opt-out that cancels.
    const anyOptIn = wantsAnyNotification({ notificationsOptIn, morningBriefingOptIn });
    // A place switch keeps the previous snapshot visible while the new one loads. Cancel
    // the old place's pending alerts before a failed refresh can leave them on the device.
    const cancels = !anyOptIn || permission.kind === 'denied' || locationMismatch;
    const plans = anyOptIn
      && permission.kind === 'granted'
      && snapshot !== null;
    const disablesKind = !notificationsOptIn || !morningBriefingOptIn;
    if (!cancels && !plans && !disablesKind) return;
    void notificationApplication.weatherAlertScheduler.reschedule({
      localProfileId,
      snapshot: permission.kind === 'granted' ? snapshot : null,
      weatherAlertsEnabled: !cancels && notificationsOptIn,
      morningBriefingEnabled: !cancels && morningBriefingOptIn,
      language,
      hour12,
      temperatureUnit,
    }).catch(() => undefined);
  });

  useEffect(() => {
    rescheduleWeatherAlerts();
  }, [
    hour12,
    temperatureUnit,
    language,
    localDate,
    localProfileId,
    weather?.activeLocation?.locationKey,
    morningBriefingOptIn,
    notificationApplication.weatherAlertScheduler,
    notificationsOptIn,
    permission.kind,
    snapshotId,
  ]);

  useEffect(() => {
    // The scheduler coalesces a burst, so a foreground that also changes the date or the
    // permission still ends in one plan.
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') rescheduleWeatherAlerts();
    });
    return () => subscription.remove();
  }, []);

  return null;
}
