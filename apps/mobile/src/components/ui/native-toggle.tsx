import { Switch } from '@expo/ui';
import { tint } from '@expo/ui/swift-ui/modifiers';
import { Platform } from 'react-native';

import { useKuyaraTheme } from '@/theme/theme-context';

// ADR 0030 section 7: native toggles are tinted `brandPrimary`; section 1 leaves every
// other property of the control, track and thumb included, to the system. The universal
// `Switch`'s own prop surface (`node_modules/@expo/ui/build/universal/Switch/types.d.ts`)
// carries no tint prop, so the only way to reach it is the swift-ui `tint` modifier
// through `Switch`'s `modifiers` escape hatch. That escape hatch is iOS/Android-specific
// (`ModifierConfig` from `@expo/ui/swift-ui/modifiers` or `@expo/ui/jetpack-compose/modifiers`);
// this wrapper only supplies the iOS one, so Android keeps the system's own tint until a
// jetpack-compose modifier is added under the same rule ADR 0019 section 4 sets for
// `expo-glass-effect`: nothing crosses this boundary without a decision. `@expo/ui` is
// still only imported from `components/ui`; feature code never sees it (ADR 0019 section 2).
export type NativeToggleProps = Readonly<{
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}>;

export function NativeToggle({
  disabled = false,
  onValueChange,
  testID,
  value,
}: NativeToggleProps) {
  const theme = useKuyaraTheme();

  return (
    <Switch
      disabled={disabled}
      modifiers={Platform.OS === 'ios' ? [tint(theme.colors.brandPrimary)] : undefined}
      onValueChange={onValueChange}
      testID={testID}
      value={value}
    />
  );
}
