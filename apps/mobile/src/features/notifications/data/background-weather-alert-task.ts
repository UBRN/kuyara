import type { WeatherAlertScheduling } from '@/features/notifications/application/weather-alert-scheduler';
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

    const snapshot = await repository.saveSnapshot(profile.id, provided);
    await dependencies.reschedule({
      localProfileId: profile.id,
      snapshot,
      enabled: true,
      language: resolveLanguagePreference(
        profile.languagePreference,
        dependencies.getDeviceLocale(),
      ),
    });
    return 'success';
  } catch {
    return 'failed';
  }
}
