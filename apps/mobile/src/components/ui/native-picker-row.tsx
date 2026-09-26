import {
  accessibilityHidden,
  accessibilityLabel as accessibilityLabelModifier,
  background,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  frame,
  labelsHidden,
  menuIndicator,
  pickerStyle,
  shapes,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { Alert, Platform, PlatformColor } from 'react-native';

import { haptics } from '@/components/ui/haptics';
import { Icon, iconNames, type IconName } from '@/components/ui/icon';
import { listRowTileColors } from '@/components/ui/list-row-tile';
import { NativeListRow } from '@/components/ui/native-list';
import { resolveListRowTileGeometry } from '@/components/ui/primitive-contracts';
import { useTextScaling } from '@/components/ui/use-text-scaling';
import { useKuyaraTheme } from '@/theme/theme-context';

const swiftUI = Platform.select<() => typeof import('@expo/ui/swift-ui') | null>({
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Keep SwiftUI off Android.
  ios: () => require('@expo/ui/swift-ui') as typeof import('@expo/ui/swift-ui'),
  default: () => null,
})();

const IOS_ROW_FRAME_MODIFIERS = [frame({ maxWidth: Infinity, alignment: 'leading' })];
// A Menu label takes the tint as its foreground, so the label names the system label ink
// itself: O14 row anatomy A reads every Settings label in one ink, the tint is for actions.
const IOS_LABEL_MODIFIERS = Platform.OS === 'ios' ? [foregroundStyle(PlatformColor('label'))] : [];
// `ListItem` spaces its leading tile and its headline by 12, so a Picker row's label starts
// at the same x as every other tiled row and the separators line up.
const LIST_ITEM_LEADING_SPACING = 12;
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
  /** The row's glyph, drawn in the same 28-point tile as every other Settings row. */
  icon?: IconName;
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
  icon,
  testID,
}: NativePickerRowProps<T>) {
  const theme = useKuyaraTheme();
  const { controlScale, usesStackedLayout } = useTextScaling();
  const selectedLabel = options.find((option) => option.value === selection)?.label ?? '';
  const spokenLabel = selectedLabel ? `${label}, ${selectedLabel}` : label;
  const select = (value: T) => {
    if (disabled || value === selection) return;
    haptics.selection();
    void onSelectionChange(value);
  };

  if (swiftUI) {
    // ADR 0028 section 2's tile, drawn in SwiftUI because the Menu label cannot host the
    // React Native one: the same geometry, fill and ink as `ListRowTile`.
    const tile = resolveListRowTileGeometry(controlScale);
    const tileColors = listRowTileColors(theme);
    const leadingTile = icon ? (
      <swiftUI.Image
        modifiers={[
          font({ size: tile.glyphSize }),
          foregroundStyle(tileColors.ink),
          frame({ width: tile.size, height: tile.size }),
          background(tileColors.fill, shapes.roundedRectangle({ cornerRadius: tile.borderRadius })),
          accessibilityHidden(),
        ]}
        systemName={iconNames[icon].ios}
        testID={testID ? `${testID}-tile` : undefined}
      />
    ) : null;
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
          <swiftUI.HStack modifiers={IOS_ROW_FRAME_MODIFIERS} spacing={LIST_ITEM_LEADING_SPACING}>
            {leadingTile}
            {usesStackedLayout ? (
              <swiftUI.VStack alignment="leading" spacing={2}>
                <swiftUI.Text modifiers={IOS_LABEL_MODIFIERS}>{label}</swiftUI.Text>
                {trailingValue}
              </swiftUI.VStack>
            ) : (
              <swiftUI.Text modifiers={IOS_LABEL_MODIFIERS}>{label}</swiftUI.Text>
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
      glyph={icon ? ({ color, size }) => <Icon color={color} name={icon} size={size} /> : undefined}
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
