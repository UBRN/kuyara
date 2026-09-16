import { Stack, useLocalSearchParams } from 'expo-router';

import { WardrobeEditItemRoute } from '@/features/wardrobe/presentation/wardrobe-item-routes';
import { useMessages } from '@/localization/use-messages';

export default function WardrobeItemRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const messages = useMessages();

  return (
    <>
      <Stack.Screen
        options={{
          headerLargeTitle: true,
          headerShown: true,
          headerTitle: messages.wardrobe.editTitle,
        }}
      />
      <WardrobeEditItemRoute itemId={id} />
    </>
  );
}
