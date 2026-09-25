import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { GlassButton } from '@/components/ui';
import {
  isWardrobeRouteId,
  parseWardrobeEntryStateParam,
} from '@/features/wardrobe/application/wardrobe-form';
import { WardrobeListRoute } from '@/features/wardrobe/presentation/wardrobe-list-route';
import { useMessages } from '@/localization/use-messages';

export default function WardrobeRoute() {
  // ADR 0028 section 7 item 3, shared with ADR 0029: the filter so Profile's Wanted row
  // can open the Closet list on the wanted state instead of the default owned one. The
  // list keeps this param current as the user switches segments, so the plus button below
  // and the add flow both start from the list the user is looking at. `added` names the
  // item the add flow has just saved, so only that tile arrives on the way back.
  const { added, filter } = useLocalSearchParams<{ added?: string; filter?: string }>();
  const initialEntryState = parseWardrobeEntryStateParam(filter) ?? 'owned';
  const savedItemId = isWardrobeRouteId(added) ? added : null;
  const messages = useMessages();
  const router = useRouter();

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
                router.push({
                  params: { filter: initialEntryState },
                  pathname: '/wardrobe/new',
                })
              }
              testID="wardrobe-add-button"
            />
          ),
          headerShown: true,
          headerTitle: messages.wardrobe.title,
        }}
      />
      <WardrobeListRoute initialEntryState={initialEntryState} savedItemId={savedItemId} />
    </>
  );
}
