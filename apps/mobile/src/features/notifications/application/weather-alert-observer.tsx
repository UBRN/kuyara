import { weatherLocalDateKey } from '@kuyara/contracts';
import { AppState } from 'react-native';
import { useEffect, useEffectEvent } from 'react';

import { notificationsAreActive } from '@/features/notifications/application/notification-application-controller';
import { useNotificationApplication } from '@/features/notifications/application/notification-context';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { useLocalizationContext } from '@/localization/localization-context';

export function WeatherAlertObserver() {
  const notificationApplication = useNotificationApplication();
  const profileApplication = useProfileApplication();
  const weatherApplication = useWeatherApplication();
  const { language } = useLocalizationContext();
  const profile = profileApplication.state.status === 'ready'
    ? profileApplication.state.profile
    : null;
  const weather = weatherApplication.state.status === 'ready'
    ? weatherApplication.state
    : null;
  const snapshot = weather?.snapshot ?? null;
  const snapshotId = snapshot?.id;
  const permission = notificationApplication.state.permission;
  const notificationsOptIn = profile?.notificationsOptIn ?? false;
  const localProfileId = profile?.id ?? null;
  // An alert's identity is keyed to the local day, so the plan has to be redone when the
  // day turns. The date is re-read on every render and a change re-runs the effect;
  // becoming active, the one moment a rollover is certain to have been missed, replans too.
  const localDate = snapshot
    && weatherLocalDateKey(new Date().toISOString(), snapshot.timeZone);

  const rescheduleWeatherAlerts = useEffectEvent(() => {
    if (!localProfileId) return;
    // ADR 0032 section 6: alerts are planned only when the opt-in and the OS permission
    // both allow them and a snapshot has loaded, and the existing schedule is cancelled
    // only on a known opt-out or a known denial. Every other combination (a permission not
    // yet read or still undetermined, weather loading or failed to load) is absence of
    // knowledge, and acting on it would drop the alerts an earlier session or the
    // background task left pending. A ready weather state can still carry no snapshot,
    // which plans nothing and would reach the scheduler as a cancellation.
    const cancels = !notificationsOptIn || permission.kind === 'denied';
    const plans = notificationsOptIn
      && permission.kind === 'granted'
      && snapshot !== null;
    if (!cancels && !plans) return;
    void notificationApplication.weatherAlertScheduler.reschedule({
      localProfileId,
      snapshot,
      enabled: notificationsAreActive(notificationsOptIn, permission),
      language,
    }).catch(() => undefined);
  });

  useEffect(() => {
    rescheduleWeatherAlerts();
  }, [
    language,
    localDate,
    localProfileId,
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
