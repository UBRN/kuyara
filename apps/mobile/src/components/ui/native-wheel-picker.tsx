import { Host, Picker } from '@expo/ui';
import {
  accessibilityLabel as accessibilityLabelModifier,
  labelsHidden,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { Platform } from 'react-native';

import { haptics } from '@/components/ui/haptics';
import { useKuyaraTheme } from '@/theme/theme-context';

const swiftUI = Platform.select<() => typeof import('@expo/ui/swift-ui') | null>({
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Keep SwiftUI off Android.
  ios: () => require('@expo/ui/swift-ui') as typeof import('@expo/ui/swift-ui'),
  default: () => null,
})();

// ADR 0019: feature code never imports `@expo/ui`; this wrapper is its only wheel.
//
// The installed SwiftUI `DatePicker` has no minute interval, so a 15-minute time wheel is
// built from a `Picker` with the `wheel` style over a closed list of options. iOS draws the
// native rotor with SwiftUI's `Picker` itself, because the universal one passes it no name:
// the label is hidden from sight and named to VoiceOver, which reads it before the value.
// Android keeps the universal `Picker`, which falls back to the platform's own dropdown
// (Material 3 has no wheel). `Host matchContents` collapses inside a ScrollView (ADR 0019),
// so the host takes the standard rotor height explicitly.
const WHEEL_HEIGHT = 216;

export type NativeWheelPickerOption<T extends string> = Readonly<{ label: string; value: T }>;

export type NativeWheelPickerProps<T extends string> = Readonly<{
  /** The wheel's accessible name: what the chosen value is for. It is never drawn. */
  label: string;
  options: readonly NativeWheelPickerOption<T>[];
  selection: T;
  onSelectionChange: (value: T) => void;
  testID?: string;
}>;

export function NativeWheelPicker<T extends string>({
  label,
  onSelectionChange,
  options,
  selection,
  testID,
}: NativeWheelPickerProps<T>) {
  const theme = useKuyaraTheme();
  const select = (value: T) => {
    if (value === selection) return;
    haptics.selection();
    onSelectionChange(value);
  };

  return (
    <Host colorScheme={theme.isDark ? 'dark' : 'light'} style={{ height: WHEEL_HEIGHT }}>
      {swiftUI ? (
        <swiftUI.Picker
          label={label}
          modifiers={[pickerStyle('wheel'), labelsHidden(), accessibilityLabelModifier(label)]}
          onSelectionChange={(value) => select(value as T)}
          selection={selection}
          testID={testID}>
          {options.map((option) => (
            <swiftUI.Text key={option.value} modifiers={[tag(option.value)]}>
              {option.label}
            </swiftUI.Text>
          ))}
        </swiftUI.Picker>
      ) : (
        <Picker
          appearance="wheel"
          onValueChange={(value) => select(value as T)}
          selectedValue={selection}
          testID={testID}>
          {options.map((option) => (
            <Picker.Item key={option.value} label={option.label} value={option.value} />
          ))}
        </Picker>
      )}
    </Host>
  );
}
