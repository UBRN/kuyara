import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { GlassButton, useTransitionLanded } from '@/components/ui';
import { useSingleTap } from '@/components/ui/use-single-push';
import type { StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import { resolveVisibleCategory } from '@/features/wardrobe/application/closet-categories';
import { useVisibleClosetCategories } from '@/features/wardrobe/application/use-visible-closet-categories';
import {
  isWardrobeRouteId,
  parseStructuralCategoryParam,
  parseWardrobeEntryStateParam,
} from '@/features/wardrobe/application/wardrobe-form';
import { WardrobeListRoute } from '@/features/wardrobe/presentation/wardrobe-list-route';
import { useMessages } from '@/localization/use-messages';

export default function WardrobeRoute() {
  // O9 and ADR 0028 section 7: `category` opens the Closet on one category (Profile's
  // category cells, and the add flow's return); the list keeps it current as the user
  // switches tabs, so the plus button below starts the add flow on the category in view.
  // `filter=wanted` brings the Wanted section into view (Profile's Wanted row, a saved
  // wanted piece). `added` names the item the add flow has just saved, so only that tile
  // arrives on the way back.
  const { added, category, filter } = useLocalSearchParams<{
    added?: string;
    category?: string;
    filter?: string;
  }>();
  const categories = useVisibleClosetCategories();
  // A category the profile does not offer and holds nothing in falls back to the first shown.
  const initialCategory = resolveVisibleCategory(categories, parseStructuralCategoryParam(category));
  const addedItemId = isWardrobeRouteId(added) ? added : null;
  // The last tile the add flow saved. A later edit or delete pops back here with params of
  // its own and no `added`, which must not read as a new arrival.
  const [savedItemId, setSavedItemId] = useState(addedItemId);
  if (addedItemId !== null && addedItemId !== savedItemId) {
    setSavedItemId(addedItemId);
  }
  const messages = useMessages();
  // One guard for the plus button, the list's add action and the tiles: whichever is
  // pressed first opens its screen, and a quick second press anywhere opens nothing.
  const tap = useSingleTap();
  // The Closet opened from Profile's heading or Wanted row carries no category; the list
  // resolves one and reports it here so the plus button still starts on the one in view.
  const [viewedCategory, setViewedCategory] = useState<StructuralCategory | undefined>();
  const addCategory = initialCategory ?? viewedCategory;
  // Held here rather than in the list, which remounts for each saved tile: only the first
  // push onto the Closet waits for its transition.
  const transitionLanded = useTransitionLanded();

  return (
    <>
      {/* ADR 0029 section 2: a native large title, a native back to Profile and a plus
          bar button are the screen's only chrome, so they are set here rather than
          hand-drawn, exactly as profile.tsx sets its own header in its route file. */}
      <Stack.Screen
        options={{
          headerLargeTitle: true,
          headerRight: () => (
            <GlassButton
              accessibilityHint={messages.wardrobe.addHint}
              icon="plus"
              kind="bar"
              label={messages.wardrobe.addAction}
              onPress={() =>
                tap.push(
                  addCategory
                    ? { params: { category: addCategory }, pathname: '/wardrobe/new' }
                    : '/wardrobe/new',
                )
              }
              testID="wardrobe-add-button"
            />
          ),
          headerShown: true,
          headerTitle: messages.wardrobe.title,
        }}
      />
      {/* A finished add pops back to this screen and swaps its params rather than opening a
          second Closet, so the list mounts afresh for each saved tile, as a newly opened
          Closet would: that tile alone arrives and its confirmation shows. An edit or
          delete returns to the list as it was. */}
      <WardrobeListRoute
        categories={categories}
        initialCategory={initialCategory}
        onCategoryInView={setViewedCategory}
        key={savedItemId ?? ''}
        revealWanted={parseWardrobeEntryStateParam(filter) === 'wanted'}
        savedItemId={savedItemId}
        singleTap={tap}
        transitionLanded={transitionLanded}
      />
    </>
  );
}
