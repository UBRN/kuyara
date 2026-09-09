import type { ReactNode } from 'react';
import { type StyleProp, type ViewStyle, Pressable, Switch as RNSwitch, Text as RNText, View } from 'react-native';

// Native passthroughs for both the universal and SwiftUI modules, plus modifiers.
// Models slots and events, not native layout or accessibility bridging.
export const tint = (color: string) => ({ $type: 'tint', color });
export const listStyle = (style: string) => ({ $type: 'listStyle', style });
export const scrollContentBackground = (visible: string) => ({ $type: 'scrollContentBackground', visible });
export const font = (params: Record<string, unknown>) => ({ $type: 'font', ...params });
export const foregroundStyle = (style: unknown) => ({ $type: 'foregroundStyle', style });
export const environment = (key: string, value: string) => ({ $type: 'environment', key, value });
export const lineLimit = () => ({ $type: 'lineLimit', limit: undefined });

export function RNHostView({ children }: Readonly<{ children?: ReactNode }>) {
  return <View>{children}</View>;
}

export function Section({ children, footer, header, testID }: Readonly<{
  children?: ReactNode;
  footer?: ReactNode;
  header?: ReactNode;
  testID?: string;
}>) {
  return <View testID={testID ?? 'expo-ui-section'}>{header}{children}{footer}</View>;
}

export function Host({ children, ...props }: Readonly<{
  children?: ReactNode;
  colorScheme?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>) {
  return <View testID="expo-ui-host" {...props}>{children}</View>;
}

export function List({ children, ...props }: Readonly<{
  children?: ReactNode;
  testID?: string;
}>) {
  return <View testID="expo-ui-list" {...props}>{children}</View>;
}

export function Row({ children }: Readonly<{ children?: ReactNode }>) {
  return <View>{children}</View>;
}

export function Column({ children }: Readonly<{ children?: ReactNode }>) {
  return <View>{children}</View>;
}

export function Text({
  children,
  modifiers,
  testID,
  textStyle,
}: Readonly<{
  children?: ReactNode;
  modifiers?: readonly Record<string, unknown>[];
  testID?: string;
  textStyle?: { color?: string };
}>) {
  return (
    <RNText
      {...{ modifiers }}
      style={textStyle ? { color: textStyle.color } : undefined}
      testID={testID}>
      {children}
    </RNText>
  );
}

export function Icon({
  name,
  color,
}: Readonly<{ color?: string; name?: string; size?: number }>) {
  return <View accessibilityLabel={name} style={{ backgroundColor: color }} testID="expo-ui-icon" />;
}

// The real `ListItem` (`ListItem.ios.tsx`) wraps a bare string/number headline in a
// SwiftUI `Text` before mounting it, because a SwiftUI host cannot render a raw string.
// React Native has the same rule for its own `View`, so this mock does the same thing.
function wrapBareText(node: ReactNode): ReactNode {
  return typeof node === 'string' || typeof node === 'number' ? <RNText>{node}</RNText> : node;
}

export function ListItem({
  children,
  leading,
  supportingText,
  onPress,
  testID,
  trailing,
}: Readonly<{
  children?: ReactNode;
  supportingText?: ReactNode;
  leading?: ReactNode;
  onPress?: () => void;
  testID?: string;
  trailing?: ReactNode;
}>) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      testID={testID}>
      {leading}
      {wrapBareText(children)}
      {wrapBareText(supportingText)}
      {trailing}
    </Pressable>
  );
}

export function Switch({
  disabled,
  onValueChange,
  testID,
  value,
}: Readonly<{
  disabled?: boolean;
  onValueChange?: (value: boolean) => void;
  testID?: string;
  value?: boolean;
}>) {
  return (
    <RNSwitch disabled={disabled} onValueChange={onValueChange} testID={testID} value={value} />
  );
}

export function DatePicker({
  modifiers,
  onDateChange,
  selection,
  testID,
  title,
}: Readonly<{
  modifiers?: readonly Record<string, unknown>[];
  onDateChange?: (date: Date) => void;
  selection?: Date;
  testID?: string;
  title?: string;
}>) {
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="adjustable"
      accessibilityValue={{ text: selection?.toISOString() }}
      testID={testID}
      {...{ modifiers, onDateChange }}
    />
  );
}
