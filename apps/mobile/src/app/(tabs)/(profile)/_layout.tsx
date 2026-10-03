import { Stack } from 'expo-router';

import { PrimaryTabStack } from '@/navigation/primary-tab-stack';

// Expo Router orders a stack's routes by name length when nothing anchors it, so
// `history` would be this stack's first route: a fresh or remounted Profile tab then
// opens History as its root, with no way back. The anchor keeps Profile the root, under
// the tab and under every deep link into the stack.
export const unstable_settings = { anchor: 'profile' };

export default function ProfileStack() {
  return (
    <PrimaryTabStack>
      {/* A declared screen goes before the undeclared ones, so Profile is declared first to
          stay the stack's root. */}
      <Stack.Screen name="profile" />
      {/* Editing a Closet piece slides up from the bottom as a full-height page over the tab
          bar. The presentation and the header are decided here, before the push: a modal
          that turns its header on from inside remounts and loses its title. */}
      <Stack.Screen
        name="wardrobe/[id]"
        options={{ headerBackVisible: false, headerLargeTitle: false, headerShown: true, presentation: 'fullScreenModal' }}
      />
    </PrimaryTabStack>
  );
}
