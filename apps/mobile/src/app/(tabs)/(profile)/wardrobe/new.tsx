import { Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import type { NativeStackNavigationProp } from 'expo-router/native-stack';
import type { ParamListBase } from 'expo-router/react-navigation';
import { useEffect, useState } from 'react';

import { usePresentationHold } from '@/components/ui/presentation-hold';
import { resolveVisibleCategory } from '@/features/wardrobe/application/closet-categories';
import { useVisibleClosetCategories } from '@/features/wardrobe/application/use-visible-closet-categories';
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
  const { category, filter, phrase } = useLocalSearchParams<{
    category?: string;
    filter?: string;
    phrase?: string;
  }>();
  // ADR 0042: Siri's Closet add arrives with `phrase`. The route reads it once for the form
  // and drops it from its params, so it stays in no URL, history entry or later render.
  const [initialPhrase] = useState(phrase);
  // The screen's own navigation, not the global router: a cold-start deep link mounts this
  // screen before the root navigator reports ready, and the router refuses until then.
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  useEffect(() => {
    if (phrase !== undefined) navigation.setParams({ phrase: undefined });
  }, [navigation, phrase]);
  const messages = useMessages();
  const categories = useVisibleClosetCategories();
  // The form is presented over the tab as a full-screen modal (the Profile stack's layout).
  usePresentationHold(true);

  return (
    <>
      {/* The form's title and its Cancel/Save pair are the platform's header: the screen
          carries no hand-drawn header and `Screen`'s automatic content inset clears it.
          The exit guard runs off `beforeRemove`, so Cancel and Android's back are
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
        defaultCategory={resolveVisibleCategory(categories, parseStructuralCategoryParam(category))}
        defaultEntryState={parseWardrobeEntryStateParam(filter)}
        initialPhrase={initialPhrase}
      />
    </>
  );
}
