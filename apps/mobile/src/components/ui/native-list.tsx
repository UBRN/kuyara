import { Column, Host as UniversalHost, Icon as ExpoIcon, List as UniversalList, ListItem, RNHostView, Row, Text as ExpoText } from '@expo/ui';
import { font, foregroundStyle, listStyle, scrollContentBackground, tint } from '@expo/ui/swift-ui/modifiers';
import type { ReactElement, ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { ListRowTile, type ListRowTileGlyph } from '@/components/ui/list-row-tile';
import { NativeToggle } from '@/components/ui/native-toggle';
import { useTextScaling } from '@/components/ui/use-text-scaling';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// Load SwiftUI only on iOS; Android keeps the universal Host and List.
const swiftUI = Platform.select<() => typeof import('@expo/ui/swift-ui') | null>({
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Keep SwiftUI off Android.
  ios: () => require('@expo/ui/swift-ui') as typeof import('@expo/ui/swift-ui'),
  default: () => null,
})();
const SYSTEM_SECONDARY_LABEL = 'secondaryLabel';
// `textStyle.color` cannot name a system colour on iOS (Expo UI parses CSS colours only), so the
// secondary ink is the hierarchical foreground style; the `body` text style keeps Dynamic Type.
const IOS_SECONDARY_TEXT_MODIFIERS = Platform.OS === 'ios'
  ? [font({ textStyle: 'body' }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]
  : undefined;
const IOS_BODY_SEMIBOLD_FONT_MODIFIERS = Platform.OS === 'ios'
  ? [font({ textStyle: 'body', weight: 'semibold' })]
  : undefined;

export type NativeListProps = Readonly<{ children: ReactNode; testID?: string }>;

export function NativeList({ children, testID }: NativeListProps) {
  const theme = useKuyaraTheme();
  const colorScheme = theme.isDark ? 'dark' : 'light';
  // The same bottom safe-area rule Screen applies: the list is the screen's scroll container.
  const safeAreaInsets = useSafeAreaInsets();

  return (
    <View
      style={[styles.root, { backgroundColor: theme.colors.background, paddingBottom: safeAreaInsets.bottom }]}
      testID={testID}>
      {swiftUI ? (
        <swiftUI.Host colorScheme={colorScheme} style={styles.root} useViewportSizeMeasurement>
          <swiftUI.List modifiers={[
            listStyle('insetGrouped'),
            scrollContentBackground('hidden'),
            tint(theme.colors.brandPrimary),
          ]}>
            {children}
          </swiftUI.List>
        </swiftUI.Host>
      ) : (
        <UniversalHost colorScheme={colorScheme} style={styles.root}>
          <UniversalList>{children}</UniversalList>
        </UniversalHost>
      )}
    </View>
  );
}

export type NativeListSectionProps = Readonly<{
  children?: ReactNode;
  heading?: string;
  footer?: string | ReactElement;
  testID?: string;
}>;

export function NativeListSection({ children, footer, heading, testID }: NativeListSectionProps) {
  const header = heading ? (
    <RNHostView matchContents>
      <AppText accessibilityRole="header" colorRole="textSecondary" style={styles.heading} variant="bodyStrong">
        {heading}
      </AppText>
    </RNHostView>
  ) : undefined;
  const nativeFooter = typeof footer === 'string'
    ? <ExpoText>{footer}</ExpoText>
    : footer ? <RNHostView matchContents>{footer}</RNHostView> : undefined;

  return swiftUI ? (
    <swiftUI.Section footer={nativeFooter} header={header} testID={testID}>
      {children}
    </swiftUI.Section>
  ) : (
    <>
      {header}
      {children}
      {nativeFooter}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  heading: { paddingLeft: spacing.lg },
});

export type NativeListRowToggle = Readonly<{
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}>;

export type NativeListRowProps = Readonly<{
  /** The row's headline. Kuyara supplies the string; the system renders it. */
  label: string;
  /** A trailing value shown in the system's secondary ink, before the chevron. */
  value?: string;
  /** The shared 28-point leading tile (ADR 0028 section 2). Omitted rows have none. */
  glyph?: ListRowTileGlyph;
  /** Renders the headline in `brandPrimary` for an action row (ADR 0030 section 7). */
  tinted?: boolean;
  /** Renders the headline in the system's secondary ink for an informational row. */
  secondary?: boolean;
  /** Explicit chevron control. Defaults to on for a plain navigable row. */
  chevron?: boolean;
  supportingText?: string;
  /** Renders a tinted `Switch` as the trailing accessory instead of a value/chevron. */
  toggle?: NativeListRowToggle;
  onPress?: () => void;
  testID?: string;
}>;

export function NativeListRow({
  chevron,
  glyph,
  label,
  onPress,
  secondary = false,
  testID,
  supportingText,
  tinted = false,
  toggle,
  value,
}: NativeListRowProps) {
  const theme = useKuyaraTheme();
  const { usesStackedLayout } = useTextScaling();
  const showChevron = chevron ?? (Boolean(onPress) && !toggle && !tinted);
  const stacksValue = usesStackedLayout && value !== undefined && !toggle;

  const headline: ReactNode = tinted ? (
    <ExpoText
      modifiers={IOS_BODY_SEMIBOLD_FONT_MODIFIERS}
      textStyle={{ color: theme.colors.brandPrimary, fontWeight: '600' }}>
      {label}
    </ExpoText>
  ) : secondary ? (
    <ExpoText modifiers={IOS_SECONDARY_TEXT_MODIFIERS} textStyle={{ color: SYSTEM_SECONDARY_LABEL }}>
      {label}
    </ExpoText>
  ) : (
    label
  );
  const stackedValue = stacksValue ? (
    <ExpoText
      modifiers={IOS_SECONDARY_TEXT_MODIFIERS}
      testID={testID ? `${testID}-value-stacked` : undefined}
      textStyle={{ color: SYSTEM_SECONDARY_LABEL }}>
      {value}
    </ExpoText>
  ) : null;
  const resolvedSupportingText: ReactNode = stacksValue ? (
    supportingText !== undefined ? (
      <Column alignment="start" spacing={2}>
        {stackedValue}
        <ExpoText
          modifiers={IOS_SECONDARY_TEXT_MODIFIERS}
          textStyle={{ color: SYSTEM_SECONDARY_LABEL }}>
          {supportingText}
        </ExpoText>
      </Column>
    ) : stackedValue
  ) : supportingText;

  const trailing: ReactNode = toggle ? (
    <NativeToggle
      disabled={toggle.disabled}
      onValueChange={toggle.onValueChange}
      testID={testID ? `${testID}-toggle` : undefined}
      value={toggle.value}
    />
  ) : (!stacksValue && value !== undefined) || showChevron ? (
    <Row alignment="center" spacing={4}>
      {!stacksValue && value !== undefined ? (
        <ExpoText modifiers={IOS_SECONDARY_TEXT_MODIFIERS} textStyle={{ color: SYSTEM_SECONDARY_LABEL }}>
          {value}
        </ExpoText>
      ) : null}
      {showChevron ? (
        Platform.OS === 'ios' ? (
          <ExpoIcon color="tertiaryLabel" name="chevron.right" size={13} />
        ) : (
          <RNHostView matchContents><Icon color={theme.colors.textSecondary} name="chevronRight" size={13} /></RNHostView>
        )
      ) : null}
    </Row>
  ) : undefined;

  return (
    <ListItem
      leading={
        glyph ? (
          <RNHostView matchContents>
            {/* The tile is a React Native view, so its identifier is the one Maestro
                can resolve; a testID on the SwiftUI ListItem itself is not found. */}
            <ListRowTile glyph={glyph} testID={testID} />
          </RNHostView>
        ) : undefined
      }
      onPress={onPress}
      supportingText={resolvedSupportingText}
      testID={glyph ? undefined : testID}
      trailing={trailing}>
      {headline}
    </ListItem>
  );
}
