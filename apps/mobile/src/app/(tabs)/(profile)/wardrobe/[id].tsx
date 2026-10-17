import { Stack, useLocalSearchParams } from 'expo-router';

import { usePresentationHold } from '@/components/ui/presentation-hold';
import { WardrobeEditItemRoute } from '@/features/wardrobe/presentation/wardrobe-item-routes';
import { useMessages } from '@/localization/use-messages';

export default function WardrobeItemRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const messages = useMessages();
  // The form is presented over the tab as a full-screen modal (the Profile stack's layout).
  usePresentationHold(true);

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
