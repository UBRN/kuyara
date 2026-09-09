import { useEffect, useEffectEvent } from 'react';

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
  const permissionKind = notificationApplication.state.permission.kind;
  const notificationsOptIn = profile?.notificationsOptIn ?? false;
  const localProfileId = profile?.id ?? null;

  const rescheduleWeatherAlerts = useEffectEvent(() => {
    if (!localProfileId) return;
    void notificationApplication.weatherAlertScheduler.reschedule({
      localProfileId,
      snapshot,
      enabled: notificationsOptIn && permissionKind === 'granted',
      language,
    }).catch(() => undefined);
  });

  useEffect(() => {
    rescheduleWeatherAlerts();
  }, [
    language,
    localProfileId,
    notificationApplication.weatherAlertScheduler,
    notificationsOptIn,
    permissionKind,
    snapshotId,
  ]);

  return null;
}
