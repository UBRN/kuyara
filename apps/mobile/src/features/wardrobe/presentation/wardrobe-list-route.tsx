import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';
import { WardrobeListScreen } from '@/features/wardrobe/presentation/wardrobe-list-screen';

export function WardrobeListRoute() {
  const router = useRouter();
  const { refresh, resolvePhotoUri, state } = useWardrobeApplication();

  useFocusEffect(
    useCallback(() => {
      if (state.status === 'ready') {
        void refresh();
      }
    }, [refresh, state.status]),
  );

  return (
    <WardrobeListScreen
      onAdd={() => router.push('/wardrobe/new')}
      onBack={() => router.back()}
      onEdit={(id) => router.push(`/wardrobe/${id}`)}
      onRetry={() => void refresh()}
      resolvePhotoUri={resolvePhotoUri}
      state={state}
    />
  );
}
