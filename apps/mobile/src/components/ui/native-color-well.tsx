import { Platform, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { borderWidths, layout } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// Load SwiftUI only on iOS, as native-list.tsx does.
const swiftUI: typeof import('@expo/ui/swift-ui') | null = Platform.OS === 'ios'
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Keep SwiftUI off Android.
  ? (require('@expo/ui/swift-ui') as typeof import('@expo/ui/swift-ui'))
  : null;
const modifiers: typeof import('@expo/ui/swift-ui/modifiers') | null = Platform.OS === 'ios'
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Keep SwiftUI off Android.
  ? (require('@expo/ui/swift-ui/modifiers') as typeof import('@expo/ui/swift-ui/modifiers'))
  : null;

export type NativeColorWellProps = Readonly<{
  /** The well's spoken name ("More colors"); it is hidden as a visible label. */
  accessibilityLabel: string;
  /** Spoken after the name while a custom colour is chosen, such as its colour family. */
  accessibilityValue?: string;
  selected: boolean;
  disabled?: boolean;
  /** The chosen custom colour as `#RRGGBB`, or `null` while none is. */
  value: string | null;
  /** Receives an uppercase `#RRGGBB`; anything else the picker reports is dropped. */
  onChange: (hex: string) => void;
  testID: string;
}>;

const SIZE = layout.minimumTouchTarget;

/**
 * HIG Color wells: the system colour well that opens the system colour picker, the last
 * swatch of the Closet palette (O8). SwiftUI's `ColorPicker` on iOS; Android has no
 * equivalent control in this build, so the well is not drawn there and the palette's
 * swatches remain the whole choice. Selection is the same `brandAccent` ring the swatches
 * use, plus the selected trait for VoiceOver.
 */
export function NativeColorWell({
  accessibilityLabel,
  accessibilityValue,
  disabled = false,
  onChange,
  selected,
  testID,
  value,
}: NativeColorWellProps) {
  const theme = useKuyaraTheme();
  if (Platform.OS !== 'ios' || !swiftUI || !modifiers) return null;

  const report = (next: string) => {
    if (/^#[0-9a-fA-F]{6}$/.test(next)) onChange(next.toUpperCase());
  };

  return (
    <View style={styles.well} testID={testID}>
      <swiftUI.Host colorScheme={theme.isDark ? 'dark' : 'light'} style={styles.host}>
        <swiftUI.ColorPicker
          label={accessibilityLabel}
          modifiers={[
            modifiers.labelsHidden(),
            modifiers.accessibilityLabel(accessibilityLabel),
            ...(accessibilityValue ? [modifiers.accessibilityValue(accessibilityValue)] : []),
            ...(selected ? [modifiers.accessibilityAddTraits(['isSelected'])] : []),
            ...(disabled ? [modifiers.disabled(true)] : []),
          ]}
          onSelectionChange={report}
          selection={value}
          supportsOpacity={false}
          testID={`${testID}-picker`}
        />
      </swiftUI.Host>
      {/* The plus says the well adds a colour of its own; it draws over the well's empty
          centre and lets every touch through to the native control. */}
      {value === null ? (
        <View pointerEvents="none" style={styles.overlay}>
          <Icon color={theme.colors.iconPrimary} name="plus" size={16} />
        </View>
      ) : null}
      <View
        pointerEvents="none"
        style={[styles.ring, { borderColor: selected ? theme.colors.brandAccent : 'transparent' }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  well: {
    height: SIZE,
    width: SIZE,
  },
  host: {
    height: SIZE,
    width: SIZE,
  },
  overlay: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  ring: {
    borderRadius: SIZE / 2,
    borderWidth: borderWidths.strong,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
