import { Platform, StyleSheet, View } from 'react-native';

import { ClosetColorDisc, ColorWellMark } from '@/components/ui/garment-board/closet-color-art';
import { borderWidths, interaction, layout } from '@/theme/theme';
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
  /** The well's one spoken name ("More colors"); it has no visible label. */
  accessibilityLabel: string;
  /** Spoken while the custom colour is the choice, such as its colour family. */
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
// Drawn at the swatch discs' size (color-swatch.tsx).
const DISC_SIZE = 36;
// SwiftUI draws its well at 28 points whatever the frame (measured on the Simulator, O8), and
// only the well takes touches. Scaled up, it covers the whole 44-point slot, so the slot is
// the touch target; the host clips it to that square.
const NATIVE_WELL_SIZE = 28;
export const COLOR_WELL_TOUCH_SCALE = (SIZE + 2) / NATIVE_WELL_SIZE;
// The native well only takes the touches: kuyara draws the well itself, so it looks like the
// swatches and never shows a colour that is no longer chosen. SwiftUI stops hit-testing a
// fully transparent view, so it keeps a trace of opacity under the drawn mark.
const NATIVE_WELL_OPACITY = 0.02;

/**
 * HIG Color wells: the last swatch of the Closet palette (O8), which opens the system colour
 * picker (SwiftUI's `ColorPicker`). It is one radio in the palette's set: the React Native
 * wrapper carries the name, the selected state and the value, and the native control is
 * hidden from assistive technology; VoiceOver's activation taps through to it. Empty, it is
 * the multicolour ring with a plus; chosen, the custom colour's disc with the same ring and
 * check as the other swatches. A colour that is no longer chosen is not kept. Android has no
 * equivalent control in this build, so no well is drawn there.
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
  const chosen = selected && value !== null ? value : null;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radio"
      accessibilityState={{ disabled, selected }}
      accessibilityValue={chosen && accessibilityValue ? { text: accessibilityValue } : undefined}
      accessible
      style={[styles.well, disabled && styles.disabled]}
      testID={testID}>
      <swiftUI.Host colorScheme={theme.isDark ? 'dark' : 'light'} style={styles.host}>
        <swiftUI.ColorPicker
          label={accessibilityLabel}
          modifiers={[
            modifiers.labelsHidden(),
            modifiers.accessibilityHidden(true),
            modifiers.scaleEffect(COLOR_WELL_TOUCH_SCALE),
            modifiers.opacity(NATIVE_WELL_OPACITY),
            ...(disabled ? [modifiers.disabled(true)] : []),
          ]}
          onSelectionChange={report}
          selection={chosen}
          supportsOpacity={false}
          testID={`${testID}-picker`}
        />
      </swiftUI.Host>
      <View pointerEvents="none" style={styles.overlay}>
        {chosen ? (
          <ClosetColorDisc choice={{ kind: 'custom', hex: chosen }} selected size={DISC_SIZE}
            testID={`${testID}-disc`} />
        ) : (
          <ColorWellMark size={DISC_SIZE} testID={`${testID}-mark`} />
        )}
      </View>
      <View
        pointerEvents="none"
        style={[styles.ring, { borderColor: selected ? theme.colors.brandAccent : 'transparent' }]}
        testID={`${testID}-ring`}
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
    overflow: 'hidden',
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
  disabled: {
    opacity: interaction.disabledOpacity,
  },
});
