import { useRouter } from 'expo-router';

import { ProfileScreen } from '@/features/profile/presentation/profile-screen';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { useMessages } from '@/localization/use-messages';

export default function ProfileRoute() {
  const messages = useMessages();
  const router = useRouter();
  const { state } = useWeatherApplication();
  const activeLocation = state.status === 'ready' ? state.activeLocation : null;
  const activePlaceName = activeLocation
    ? activeLocation.source === 'manual'
      ? messages.weather.locations[activeLocation.catalogId]
      : messages.weather.currentLocation
    : null;

  return (
    <ProfileScreen
      activePlaceName={activePlaceName}
      onOpenSettings={() => router.push('/settings')}
      onOpenWardrobe={() => router.push('/wardrobe')}
      onOpenWeather={() => router.push('/weather')}
    />
  );
}
