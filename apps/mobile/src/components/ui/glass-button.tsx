import {
  accessibilityHint as nativeAccessibilityHint,
  accessibilityLabel as nativeAccessibilityLabel,
  buttonStyle,
  controlSize,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Platform, StyleSheet } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { PressScale } from '@/components/ui/press-scale';
import { useTextScaling } from '@/components/ui/use-text-scaling';
import { layout } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// ADR 0019: feature code never imports `@expo/ui`; this wrapper is the one place a system
// glass button is drawn. Liquid Glass stays something iOS 26 draws on navigation and control
// layers: `back` and `close` are SwiftUI buttons in the system `.glass` style, and `bar` is
// the glyph a native header's bar button item already frames in glass. kuyara paints none of
// it. Android has no glass, so the same kinds map onto Material's plain controls.
const swiftUI = Platform.select<() => typeof import('@expo/ui/swift-ui') | null>({
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Keep SwiftUI off Android.
  ios: () => require('@expo/ui/swift-ui') as typeof import('@expo/ui/swift-ui'),
  default: () => null,
})();

const BAR_GLYPH_SIZE = 20;

export type GlassButtonProps = Readonly<{
  /** The accessible name; `back` also shows it beside the chevron. */
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
  testID?: string;
}> & (
  | Readonly<{ kind: 'bar'; icon: IconName }>
  | Readonly<{ kind: 'back' | 'close' }>
);

export function GlassButton(props: GlassButtonProps) {
  const theme = useKuyaraTheme();
  const { fontScale } = useTextScaling();
  const { accessibilityHint, label, onPress, testID } = props;

  if (props.kind === 'bar') {
    // A native header item: the bar draws the glass capsule and its press, so the glyph
    // carries only the 44-point target and Law 7's press scale.
    return (
      <PressScale
        accessibilityHint={accessibilityHint}
        accessibilityLabel={label}
        accessibilityRole="button"
        onPress={onPress}
        style={styles.bar}
        testID={testID}>
        <Icon color={theme.colors.iconPrimary} name={props.icon} size={BAR_GLYPH_SIZE} />
      </PressScale>
    );
  }

  if (swiftUI) {
    const { Button: SwiftUIButton, Host } = swiftUI;
    const modifiers = [
      buttonStyle('glass'),
      controlSize('large'),
      tint(theme.colors.brandPrimary),
      nativeAccessibilityLabel(label),
      ...(accessibilityHint ? [nativeAccessibilityHint(accessibilityHint)] : []),
    ];
    const height = layout.minimumTouchTarget * Math.max(1, fontScale);

    // A Host needs an explicit height inside a scroll view; `close` is a fixed circle, and
    // `back` takes its width from the label it draws.
    return props.kind === 'close' ? (
      <Host
        colorScheme={theme.isDark ? 'dark' : 'light'}
        style={{ height, width: height }}>
        <SwiftUIButton modifiers={modifiers} onPress={onPress} role="close" testID={testID} />
      </Host>
    ) : (
      <Host
        colorScheme={theme.isDark ? 'dark' : 'light'}
        matchContents={{ horizontal: true }}
        style={[styles.back, { height }]}>
        <SwiftUIButton
          label={label}
          modifiers={modifiers}
          onPress={onPress}
          systemImage="chevron.left"
          testID={testID}
        />
      </Host>
    );
  }

  // Material: the close icon button on the sheet's tonal fill, and back as a plain text
  // button with its chevron; the system back gesture stays the platform's.
  return props.kind === 'close' ? (
    <IconButton
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      icon="close"
      onPress={onPress}
      raised
      testID={testID}
    />
  ) : (
    <Button
      accessibilityHint={accessibilityHint}
      icon="chevronLeft"
      label={label}
      onPress={onPress}
      size="small"
      style={styles.back}
      testID={testID}
      variant="plain"
    />
  );
}

const styles = StyleSheet.create({
  bar: {
    width: layout.minimumTouchTarget,
    height: layout.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: {
    alignSelf: 'flex-start',
  },
});
