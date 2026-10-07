import { SegmentedControl as ExpoSegmentedControl } from '@expo/ui/community/segmented-control';
import { StyleSheet } from 'react-native';

import { haptics } from '@/components/ui/haptics';
import { useTextScaling } from '@/components/ui/use-text-scaling';
import { layout } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// ADR 0019 and ADR 0029 section 2: the first real `@expo/ui` adoption. Feature code
// never imports `@expo/ui`; this wrapper is the only importer, exactly as `haptics.ts`
// is the only importer of `expo-haptics`.
//
// The installed 57.0.18 type surface was checked before writing this (`node_modules/@expo/ui/build`):
// the universal `Picker`'s `appearance` prop is `'wheel' | 'menu'` only, with no segmented
// style, so this builds on `@expo/ui/community/segmented-control` instead, per the documented
// fallback rule. Two verified limits of that component, read from its source rather than
// guessed:
// - `tintColor` is applied only on Android (`SegmentedButton.colors.activeContainerColor`);
//   the iOS implementation never reads it. Composing the same SwiftUI `Picker` with
//   `pickerStyle('segmented')` directly and applying `tint(brandPrimary)` was tried on the
//   Simulator and left the selected segment in the system white and grey: SwiftUI's tint does
//   not reach `UISegmentedControl.selectedSegmentTintColor`, and `@expo/ui` exposes no UIKit
//   appearance hook. So `brandPrimary` tinting is Android/web only. Recorded as a
//   contradiction with ADR 0029's "tinted brandPrimary" rather than silently worked around.
// - The component owns its own internal `Host` with `matchContents={{ vertical: true }}` and
//   forwards our `style` to it; we cannot reach in and replace `matchContents`. ADR 0019's own
//   finding ("Host matchContents collapses to zero height inside a ScrollView... an explicit
//   height works") is the basis for the fixed `style.height` below; the control itself draws
//   at the standard 32-point segmented height inside that host. SwiftUI grows the segments
//   with the text size, so the host grows by the same capped scale as the other controls;
//   a fixed 44 clipped the labels at the largest standard text size.
const CONTROL_HEIGHT = layout.minimumTouchTarget;

export type SegmentedControlOption<Value extends string> = Readonly<{
  value: Value;
  label: string;
}>;

export type SegmentedControlProps<Value extends string> = Readonly<{
  options: readonly SegmentedControlOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  testID?: string;
}>;

export function SegmentedControl<Value extends string>({
  onChange,
  options,
  testID,
  value,
}: SegmentedControlProps<Value>) {
  const theme = useKuyaraTheme();
  const { controlScale } = useTextScaling();
  const selectedIndex = options.findIndex((option) => option.value === value);

  return (
    <ExpoSegmentedControl
      appearance={theme.isDark ? 'dark' : 'light'}
      enabled
      onChange={(event) => {
        const nextOption = options[event.nativeEvent.selectedSegmentIndex];
        if (nextOption && nextOption.value !== value) {
          haptics.selection();
          onChange(nextOption.value);
        }
      }}
      selectedIndex={selectedIndex === -1 ? 0 : selectedIndex}
      style={[styles.control, { height: Math.max(CONTROL_HEIGHT, Math.ceil(CONTROL_HEIGHT * controlScale)) }]}
      testID={testID}
      tintColor={theme.colors.brandPrimary}
      values={options.map((option) => option.label)}
    />
  );
}

const styles = StyleSheet.create({
  control: {
    width: '100%',
  },
});
