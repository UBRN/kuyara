import { Stack } from 'expo-router';

export function PrimaryTabStack() {
  return (
    <Stack
      screenOptions={{
        animation: 'default',
        headerShown: false,
        // iOS 26 resolves the default `automatic` scroll edge effect to nothing over this
        // stack's scroll views, so a large-title route let its content pass under the
        // status bar and the header unchanged. `hard` is the cut-and-divider style the
        // app's own native list already draws, and it is set once for every route in the
        // stack rather than per screen. The other edges keep the platform default.
        scrollEdgeEffects: {
          bottom: 'automatic',
          left: 'automatic',
          right: 'automatic',
          top: 'hard',
        },
      }}
    />
  );
}
