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
          // O10: an inline title between the toolbar's Cancel and Save, which the
          // form sets itself; Cancel replaces the back button.
          headerBackVisible: false,
          headerLargeTitle: false,
          headerShown: true,
          headerTitle: messages.wardrobe.editTitle,
        }}
      />
      <WardrobeEditItemRoute itemId={id} />
    </>
  );
}
