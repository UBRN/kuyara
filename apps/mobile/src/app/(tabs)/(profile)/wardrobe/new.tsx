import { Stack, useLocalSearchParams } from 'expo-router';

import {
  parseStructuralCategoryParam,
  parseWardrobeEntryStateParam,
} from '@/features/wardrobe/application/wardrobe-form';
import { WardrobeNewItemRoute } from '@/features/wardrobe/presentation/wardrobe-item-routes';
import { useMessages } from '@/localization/use-messages';

export default function WardrobeNewRoute() {
  // `filter` files a piece added as wanted instead of silently defaulting to owned;
  // `category` is the Closet category the user added from (O9), so the type chooser opens
  // on it. An absent or unrecognised value leaves the form's own default in place.
  const { category, filter } = useLocalSearchParams<{ category?: string; filter?: string }>();
  const messages = useMessages();

  return (
    <>
      {/* The form's title and its Cancel/Save pair are the platform's header: the screen
          carries no hand-drawn header and `Screen`'s automatic content inset clears it.
          The exit guard runs off `beforeRemove`, so Cancel and the back swipe are
          confirmed the same way. */}
      <Stack.Screen
        options={{
          // O10: an inline title between the toolbar's Cancel and Save, which the
          // form sets itself; Cancel replaces the back button.
          headerBackVisible: false,
          headerLargeTitle: false,
          headerShown: true,
          headerTitle: messages.wardrobe.newTitle,
        }}
      />
      <WardrobeNewItemRoute
        defaultCategory={parseStructuralCategoryParam(category)}
        defaultEntryState={parseWardrobeEntryStateParam(filter)}
      />
    </>
  );
}
