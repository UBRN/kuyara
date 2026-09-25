import { Host, Picker } from '@expo/ui';

import { haptics } from '@/components/ui/haptics';
import { useKuyaraTheme } from '@/theme/theme-context';

// ADR 0019: feature code never imports `@expo/ui`; this wrapper is its only wheel.
//
// The installed SwiftUI `DatePicker` has no minute interval, so a 15-minute time wheel is
// built from the universal `Picker` with the `wheel` appearance over a closed list of
// options: iOS draws the native rotor, Android falls back to the platform's own dropdown
// (Material 3 has no wheel). `Host matchContents` collapses inside a ScrollView (ADR 0019),
// so the host takes the standard rotor height explicitly.
const WHEEL_HEIGHT = 216;

export type NativeWheelPickerOption<T extends string> = Readonly<{ label: string; value: T }>;

export type NativeWheelPickerProps<T extends string> = Readonly<{
  options: readonly NativeWheelPickerOption<T>[];
  selection: T;
  onSelectionChange: (value: T) => void;
  testID?: string;
}>;

export function NativeWheelPicker<T extends string>({
  onSelectionChange,
  options,
  selection,
  testID,
}: NativeWheelPickerProps<T>) {
  const theme = useKuyaraTheme();

  return (
    <Host colorScheme={theme.isDark ? 'dark' : 'light'} style={{ height: WHEEL_HEIGHT }}>
      <Picker
        appearance="wheel"
        onValueChange={(value) => {
          if (value === selection) return;
          haptics.selection();
          onSelectionChange(value as T);
        }}
        selectedValue={selection}
        testID={testID}>
        {options.map((option) => (
          <Picker.Item key={option.value} label={option.label} value={option.value} />
        ))}
      </Picker>
    </Host>
  );
}
