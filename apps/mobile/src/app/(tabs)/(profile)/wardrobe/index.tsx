import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { GlassButton } from '@/components/ui';
import { useSinglePush } from '@/components/ui/use-single-push';
import type { StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
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
  const initialCategory = parseStructuralCategoryParam(category);
  const savedItemId = isWardrobeRouteId(added) ? added : null;
  const messages = useMessages();
  const push = useSinglePush();
  // The Closet opened from Profile's heading or Wanted row carries no category; the list
  // resolves one and reports it here so the plus button still starts on the one in view.
  const [viewedCategory, setViewedCategory] = useState<StructuralCategory | undefined>();
  const addCategory = initialCategory ?? viewedCategory;

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
                push(
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
          Closet would: that tile alone arrives and its confirmation shows. */}
      <WardrobeListRoute
        initialCategory={initialCategory}
        onCategoryInView={setViewedCategory}
        key={savedItemId ?? ''}
        revealWanted={parseWardrobeEntryStateParam(filter) === 'wanted'}
        savedItemId={savedItemId}
      />
    </>
  );
}
