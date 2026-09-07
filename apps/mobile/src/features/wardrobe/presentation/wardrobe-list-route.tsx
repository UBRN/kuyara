import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';
import type { WardrobeEntryState } from '@/features/wardrobe/domain/wardrobe-item';
import { WardrobeListScreen } from '@/features/wardrobe/presentation/wardrobe-list-screen';

export function WardrobeListRoute({
  initialEntryState,
}: Readonly<{ initialEntryState?: WardrobeEntryState }> = {}) {
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
      initialEntryState={initialEntryState}
      onAdd={() => router.push('/wardrobe/new')}
      onBack={() => router.back()}
      onEdit={(id) => router.push(`/wardrobe/${id}`)}
      onRetry={() => void refresh()}
      resolvePhotoUri={resolvePhotoUri}
      state={state}
    />
  );
}
