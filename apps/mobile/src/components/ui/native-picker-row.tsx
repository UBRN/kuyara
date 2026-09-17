import type { SymbolViewProps } from 'expo-symbols';
import {
  accessibilityLabel as accessibilityLabelModifier,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  frame,
  labelsHidden,
  menuIndicator,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { Alert, Platform } from 'react-native';

import { haptics } from '@/components/ui/haptics';
import { NativeListRow } from '@/components/ui/native-list';
import { useTextScaling } from '@/components/ui/use-text-scaling';

const swiftUI = Platform.select<() => typeof import('@expo/ui/swift-ui') | null>({
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Keep SwiftUI off Android.
  ios: () => require('@expo/ui/swift-ui') as typeof import('@expo/ui/swift-ui'),
  default: () => null,
})();

type SFSymbol = Extract<SymbolViewProps['name'], string>;

const IOS_ROW_FRAME_MODIFIERS = [frame({ maxWidth: Infinity, alignment: 'leading' })];
const IOS_ROW_SYMBOL_MODIFIERS = [font({ textStyle: 'body' })];
const IOS_SECONDARY_TEXT_MODIFIERS = [
  font({ textStyle: 'body' }),
  foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
];
const IOS_MENU_INDICATOR_MODIFIERS = [
  font({ textStyle: 'caption' }),
  foregroundStyle({ type: 'hierarchical', style: 'tertiary' }),
];

export type NativePickerRowOption<T extends string> = Readonly<{
  label: string;
  value: T;
}>;

export type NativePickerRowProps<T extends string> = Readonly<{
  disabled?: boolean;
  label: string;
  onSelectionChange: (value: T) => void | Promise<void>;
  options: readonly NativePickerRowOption<T>[];
  selection: T;
  systemImage?: SFSymbol;
  testID?: string;
}>;

/**
 * A native menu-style Picker that is itself a Settings list row.
 *
 * Never use pickerStyle('navigationLink') here. SwiftUI pushes its hosting controller onto
 * react-native-screens' navigation controller, whose delegate then crashes on the non-screen view.
 *
 * Never split the row's spoken text into accessibilityLabel plus accessibilityValue either. A
 * SwiftUI Menu exposes the two separately, and the accessibility tree then surfaces the bare value
 * as the element's text, so the row reads "Sistem" where the NativeListRow rows beside it read
 * "Bildirimler, Kapalı". The label carries "<label>, <value>" so every Settings row reads alike.
 */
export function NativePickerRow<T extends string>({
  disabled = false,
  label,
  onSelectionChange,
  options,
  selection,
  systemImage,
  testID,
}: NativePickerRowProps<T>) {
  const { usesStackedLayout } = useTextScaling();
  const selectedLabel = options.find((option) => option.value === selection)?.label ?? '';
  const spokenLabel = selectedLabel ? `${label}, ${selectedLabel}` : label;
  const select = (value: T) => {
    if (disabled || value === selection) return;
    haptics.selection();
    void onSelectionChange(value);
  };

  if (swiftUI) {
    const trailingValue = (
      <swiftUI.HStack spacing={4}>
        <swiftUI.Text modifiers={IOS_SECONDARY_TEXT_MODIFIERS}>
          {selectedLabel}
        </swiftUI.Text>
        <swiftUI.Image
          modifiers={IOS_MENU_INDICATOR_MODIFIERS}
          systemName="chevron.up.chevron.down"
        />
      </swiftUI.HStack>
    );

    return (
      <swiftUI.Menu
        label={
          <swiftUI.HStack modifiers={IOS_ROW_FRAME_MODIFIERS} spacing={8}>
            {systemImage ? (
              <swiftUI.Image modifiers={IOS_ROW_SYMBOL_MODIFIERS} systemName={systemImage} />
            ) : null}
            {usesStackedLayout ? (
              <swiftUI.VStack alignment="leading" spacing={2}>
                <swiftUI.Text>{label}</swiftUI.Text>
                {trailingValue}
              </swiftUI.VStack>
            ) : (
              <swiftUI.Text>{label}</swiftUI.Text>
            )}
            <swiftUI.Spacer />
            {usesStackedLayout ? null : trailingValue}
          </swiftUI.HStack>
        }
        modifiers={[
          accessibilityLabelModifier(spokenLabel),
          menuIndicator('hidden'),
          ...(disabled ? [disabledModifier()] : []),
        ]}
        testID={testID}>
        <swiftUI.Picker
          label={label}
          modifiers={[pickerStyle('inline'), labelsHidden()]}
          onSelectionChange={(value) => select(value as T)}
          selection={selection}>
          {options.map((option) => (
            <swiftUI.Text key={option.value} modifiers={[tag(option.value)]}>
              {option.label}
            </swiftUI.Text>
          ))}
        </swiftUI.Picker>
      </swiftUI.Menu>
    );
  }

  return (
    <NativeListRow
      label={label}
      onPress={disabled ? undefined : () => {
        Alert.alert(
          label,
          undefined,
          options.map((option) => ({
            onPress: () => select(option.value),
            text: option.label,
          })),
          { cancelable: true },
        );
      }}
      testID={testID}
      value={selectedLabel}
    />
  );
}
