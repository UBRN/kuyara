import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';

/**
 * A layer above everything the app draws, native tabs and presented sheets included: on iOS a
 * full-window overlay (a pass-through container on the key window, modal to VoiceOver), on
 * Android a view above the navigator. Touches that land on no view of the layer pass to the
 * app underneath. A container is stacked above what is presented when it mounts, so a caller
 * that needs it above a sheet presented later remounts it.
 */
export function WindowOverlay({ children }: Readonly<{ children: ReactNode }>) {
  if (Platform.OS === 'ios') return <FullWindowOverlay>{children}</FullWindowOverlay>;
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {children}
    </View>
  );
}
