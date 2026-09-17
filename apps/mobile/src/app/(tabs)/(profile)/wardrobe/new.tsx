import { Stack, useLocalSearchParams } from 'expo-router';

import { parseWardrobeEntryStateParam } from '@/features/wardrobe/application/wardrobe-form';
import { WardrobeNewItemRoute } from '@/features/wardrobe/presentation/wardrobe-item-routes';
import { useMessages } from '@/localization/use-messages';

export default function WardrobeNewRoute() {
  // The Closet list's segment, so a piece added from Wanted is filed as wanted instead of
  // silently defaulting to owned. An absent or unrecognised value leaves the form's own
  // default in place.
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const messages = useMessages();

  return (
    <>
      {/* The form's title and its back control are the platform's, as on the Closet
          list: the screen carries no hand-drawn header and `Screen`'s automatic content
          inset clears the large title. The exit guard runs off `beforeRemove`, so the
          native back button is confirmed exactly as the drawn one was. */}
      <Stack.Screen
        options={{
          headerLargeTitle: true,
          headerShown: true,
          headerTitle: messages.wardrobe.newTitle,
        }}
      />
      <WardrobeNewItemRoute defaultEntryState={parseWardrobeEntryStateParam(filter)} />
    </>
  );
}
