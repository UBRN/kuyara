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
          // O10: an inline title between the toolbar's Cancel and Save, which the form
          // sets itself; the Profile stack's layout shows this modal's header without a back.
          headerTitle: messages.wardrobe.editTitle,
        }}
      />
      <WardrobeEditItemRoute itemId={id} />
    </>
  );
}
