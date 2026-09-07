import { SegmentedControl as ExpoSegmentedControl } from '@expo/ui/community/segmented-control';
import { StyleSheet } from 'react-native';

import { haptics } from '@/components/ui/haptics';
import { layout } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// ADR 0019 and ADR 0029 section 2: the first real `@expo/ui` adoption. Feature code
// never imports `@expo/ui`; this wrapper is the only importer, exactly as `haptics.ts`
// is the only importer of `expo-haptics`.
//
// The installed 57.0.8 type surface was checked before writing this (`node_modules/@expo/ui/build`):
// the universal `Picker`'s `appearance` prop is `'wheel' | 'menu'` only, with no segmented
// style, so this builds on `@expo/ui/community/segmented-control` instead, per the brief's
// own fallback rule. Two verified limits of that component, read from its source rather than
// guessed:
// - `tintColor` is applied only on Android (`SegmentedButton.colors.activeContainerColor`);
//   the iOS implementation never reads it, so `brandPrimary` tinting is Android/web only
//   until `@expo/ui` exposes an iOS tint hook. Recorded as a contradiction with ADR 0029's
//   "tinted brandPrimary" rather than silently worked around.
// - The component owns its own internal `Host` with `matchContents={{ vertical: true }}` and
//   forwards our `style` to it; we cannot reach in and replace `matchContents`. ADR 0019's own
//   finding ("Host matchContents collapses to zero height inside a ScrollView... an explicit
//   height works") is the basis for the fixed `style.height` below, but this is the one
//   `@expo/ui` behaviour in this screen that was not confirmed on a device by this lane.
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
      style={styles.control}
      testID={testID}
      tintColor={theme.colors.brandPrimary}
      values={options.map((option) => option.label)}
    />
  );
}

const styles = StyleSheet.create({
  control: {
    height: CONTROL_HEIGHT,
    width: '100%',
  },
});
