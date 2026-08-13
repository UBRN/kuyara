import { useRouter } from 'expo-router';
import { useMemo } from 'react';

import { useProfileApplication } from '@/features/profile/application/profile-context';
import { recommendOutfits } from '@/features/recommendation/application/recommend-outfits';
import type { TodayScreenState } from '@/features/today/model';
import { TodayScreen } from '@/features/today/presentation/today-screen';
import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { useLocalization } from '@/localization/use-messages';

const emptyWardrobeItems = Object.freeze([]) as readonly WardrobeItem[];

export default function TodayRoute() {
  const { language } = useLocalization();
  const router = useRouter();
  const { state: profileState } = useProfileApplication();
  const { state: weatherState } = useWeatherApplication();
  const { state: wardrobeState } = useWardrobeApplication();
  const weatherSnapshot =
    weatherState.status === 'ready' ? weatherState.snapshot : null;
  const wardrobeItems =
    wardrobeState.status === 'ready' && !wardrobeState.hasRefreshError
      ? wardrobeState.items
      : emptyWardrobeItems;
  const clothingPreference =
    profileState.status === 'ready'
      ? profileState.profile.clothingPreference
      : null;
  const recommendation = useMemo(
    () =>
      weatherSnapshot && clothingPreference
        ? recommendOutfits({
            snapshot: weatherSnapshot,
            wardrobeItems,
            clothingPreference,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Persisted fields define snapshot identity.
    [
      weatherSnapshot?.id,
      weatherSnapshot?.fetchedAt,
      wardrobeItems,
      clothingPreference,
    ],
  );

  let state: TodayScreenState;
  if (weatherState.status === 'loading' || wardrobeState.status === 'loading') {
    state = { kind: 'loading' };
  } else if (
    weatherState.status === 'error' ||
    weatherState.snapshot === null ||
    weatherState.activeLocation === null ||
    weatherState.freshness === null ||
    recommendation === null
  ) {
    state = { kind: 'unavailable' };
  } else {
    state = {
      kind: 'loaded',
      snapshot: {
        weather: weatherState.snapshot,
        activeLocation: weatherState.activeLocation,
        freshness: weatherState.freshness,
        recommendation,
      },
    };
  }

  return (
    <TodayScreen
      language={language}
      onOpenOutfitDetail={(id) => router.push(`/${id}`)}
      onOpenSettings={() => router.push('/settings')}
      state={state}
    />
  );
}
