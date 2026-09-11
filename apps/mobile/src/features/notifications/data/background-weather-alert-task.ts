import type { WeatherAlertScheduling } from '@/features/notifications/application/weather-alert-scheduler';
import { weatherAlertBackgroundLeadTimeMinutes } from '@/features/notifications/domain/weather-alerts';
import type { NotificationPermissionState } from '@/features/notifications/data/notification-gateway';
import type { Profile } from '@/features/profile/domain/profile';
import type { WeatherProvider } from '@/features/weather/data/weather-provider';
import type { WeatherRepository } from '@/features/weather/data/weather-repository';
import { weatherFreshness } from '@/features/weather/domain/weather';
import { resolveLanguagePreference } from '@/localization/language-preference';

export type BackgroundWeatherAlertTaskOutcome = 'success' | 'failed';

type BackgroundWeatherAlertTaskDependencies = Readonly<{
  loadProfile: () => Promise<Profile | null>;
  loadWeatherRepository: () => Promise<WeatherRepository>;
  provider: WeatherProvider;
  getNotificationPermission: () => Promise<NotificationPermissionState>;
  reschedule: WeatherAlertScheduling['reschedule'];
  getDeviceLocale: () => string;
  now: () => string;
}>;

export async function runBackgroundWeatherAlertTask(
  dependencies: BackgroundWeatherAlertTaskDependencies,
): Promise<BackgroundWeatherAlertTaskOutcome> {
  try {
    const profile = await dependencies.loadProfile();
    if (!profile?.notificationsOptIn) return 'success';

    const permission = await dependencies.getNotificationPermission();
    if (permission.kind !== 'granted') return 'success';

    const repository = await dependencies.loadWeatherRepository();
    const location = await repository.getActiveLocation(profile.id);
    if (!location) return 'success';

    // A background window that lands minutes after a foreground refresh has nothing to
    // learn from the provider, and the request would be spend with no new data behind it.
    const cached = await repository.getSnapshot(profile.id, location.locationKey)
      .catch(() => null);
    let snapshot = cached && weatherFreshness(cached.fetchedAt, dependencies.now()) === 'fresh'
      ? cached
      : null;
    if (!snapshot) {
      const provided = await dependencies.provider.fetchSnapshot(location);
      if (
        provided.locationKey !== location.locationKey
        || provided.timeZone !== location.timeZone
      ) {
        throw new Error('Mismatched weather location.');
      }
      if (weatherFreshness(provided.fetchedAt, dependencies.now()) === 'invalid') {
        throw new Error('Invalid weather fetch time.');
      }
      snapshot = await repository.saveSnapshot(profile.id, provided);
    }

    await dependencies.reschedule({
      localProfileId: profile.id,
      snapshot,
      enabled: true,
      language: resolveLanguagePreference(
        profile.languagePreference,
        dependencies.getDeviceLocale(),
      ),
      // Decided 2026-09-12, an amendment to ADR 0032 section 3: the app is not open here,
      // so a crossing closer than the foreground lead still earns a shortened warning.
      leadTimeMinutes: weatherAlertBackgroundLeadTimeMinutes,
    });
    return 'success';
  } catch {
    return 'failed';
  }
}
