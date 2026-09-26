import { BottomSheet } from '@expo/ui/community/bottom-sheet';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTextScaling } from '@/components/ui/use-text-scaling';
import { useKuyaraTheme } from '@/theme/theme-context';

// ADR 0019: feature code never imports `@expo/ui`; this wrapper is the only importer of
// its bottom sheet, exactly as `segmented-control.tsx` is the only importer of the
// community segmented control.
//
// The installed 57.0.18 surface was read before writing this. Three entry points expose
// a sheet and only one of them hosts React Native children:
// - `@expo/ui/swift-ui` `BottomSheet` and `@expo/ui/jetpack-compose` `ModalBottomSheet`
//   are the platform primitives; their children are SwiftUI and Compose views.
// - the universal `@expo/ui` `BottomSheet` renders its children inside a SwiftUI `Group`
//   or a Compose `Column`, so React Native content would need its own `RNHostView`.
// - `@expo/ui/community/bottom-sheet` wraps exactly that for us on both platforms: a
//   SwiftUI sheet with `presentationDetents` on iOS, a Material 3 `ModalBottomSheet` on
//   Android, both hosting the children through `RNHostView`. It is the one used here, so
//   the sheet's content stays ordinary React Native and no `Modal` fallback is needed.
//
// Detents are the platform's `medium` and `large`, expressed as the fractions the
// community component parses. Above the `useTextScaling` stacking threshold the medium
// detent shows barely one row of anything, so the sheet opens large and stays there.
const MEDIUM_DETENT = '50%';
const LARGE_DETENT = '100%';

export type NativeSheetProps = Readonly<{
  children: ReactNode;
  /** Fires after the platform's own dismissal, and after a programmatic close. */
  onDismiss: () => void;
  /**
   * `large` opens at the large detent only, for content that never fits the medium one.
   * `fit` sizes the sheet to its content: only for a short, fixed form such as the name
   * editor (O14), whose height changes by at most one line while it is open.
   */
  size?: 'default' | 'large' | 'fit';
  testID?: string;
  visible: boolean;
}>;

/**
 * A platform bottom sheet over the current screen. The sheet owns its presentation,
 * its dismissal, its grabber and its scrim; the caller owns only what is inside it.
 */
export function NativeSheet({ children, onDismiss, size = 'default', testID, visible }: NativeSheetProps) {
  const theme = useKuyaraTheme();
  const { usesStackedLayout } = useTextScaling();

  return (
    <BottomSheet
      backgroundStyle={{ backgroundColor: theme.colors.surface }}
      enablePanDownToClose
      index={visible ? 0 : -1}
      onClose={onDismiss}
      snapPoints={size === 'fit'
        ? undefined
        : usesStackedLayout || size === 'large' ? [LARGE_DETENT] : [MEDIUM_DETENT, LARGE_DETENT]}>
      {/* `backgroundStyle` paints the sheet's own chrome, the grabber zone and the
          bottom safe-area inset included; the content carries the same fill because it
          is hosted in its own native view that would otherwise be transparent. */}
      <View
        style={[size === 'fit' ? null : styles.content, { backgroundColor: theme.colors.surface }]}
        testID={testID}>
        {children}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
});
