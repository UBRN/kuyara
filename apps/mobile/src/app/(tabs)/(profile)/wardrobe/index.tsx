import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { Icon, IconButton } from '@/components/ui';
import type { WardrobeEntryState } from '@/features/wardrobe/domain/wardrobe-item';
import { WardrobeListRoute } from '@/features/wardrobe/presentation/wardrobe-list-route';
import { useMessages } from '@/localization/use-messages';

export default function WardrobeRoute() {
  // ADR 0028 section 7 item 3, shared with ADR 0029: an optional initial filter so
  // Profile's Wanted row can open the Closet list on the wanted state instead of the
  // default owned one.
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const initialEntryState: WardrobeEntryState | undefined =
    filter === 'wanted' || filter === 'owned' ? filter : undefined;
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
            <IconButton
              accessibilityHint={messages.wardrobe.addHint}
              accessibilityLabel={messages.wardrobe.addAction}
              icon={(color) => <Icon color={color} name="plus" size={20} />}
              onPress={() => router.push('/wardrobe/new')}
              style={{ backgroundColor: 'transparent', borderColor: 'transparent', borderWidth: 0 }}
              testID="wardrobe-add-button"
            />
          ),
          headerShown: true,
          headerTitle: messages.wardrobe.title,
        }}
      />
      <WardrobeListRoute initialEntryState={initialEntryState} />
    </>
  );
}
