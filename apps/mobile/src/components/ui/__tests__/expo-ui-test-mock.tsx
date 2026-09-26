import { Children, isValidElement, type ReactNode } from 'react';
import { type StyleProp, type ViewStyle, Pressable, Switch as RNSwitch, Text as RNText, View } from 'react-native';

// Native passthroughs for both the universal and SwiftUI modules, plus modifiers.
// Models slots and events, not native layout or accessibility bridging.
export const tint = (color: string) => ({ $type: 'tint', color });
export const accessibilityLabel = (label: string) => ({ $type: 'accessibilityLabel', label });
export const accessibilityValue = (value: string) => ({ $type: 'accessibilityValue', value });
export const accessibilityAddTraits = (traits: string[]) => ({ $type: 'accessibilityAddTraits', traits });
export const accessibilityHidden = (hidden = true) => ({ $type: 'accessibilityHidden', hidden });
export const listStyle = (style: string) => ({ $type: 'listStyle', style });
export const scrollContentBackground = (visible: string) => ({ $type: 'scrollContentBackground', visible });
export const font = (params: Record<string, unknown>) => ({ $type: 'font', ...params });
export const foregroundStyle = (style: unknown) => ({ $type: 'foregroundStyle', style });
export const frame = (params: Record<string, unknown>) => ({ $type: 'frame', ...params });
export const environment = (key: string, value: string) => ({ $type: 'environment', key, value });
export const lineLimit = () => ({ $type: 'lineLimit', limit: undefined });
export const labelsHidden = () => ({ $type: 'labelsHidden' });
export const disabled = (value = true) => ({ $type: 'disabled', disabled: value });
export const menuIndicator = (visibility: string) => ({ $type: 'menuIndicator', visibility });
export const pickerStyle = (style: string) => ({ $type: 'pickerStyle', style });
export const tag = (value: string | number) => ({ $type: 'tag', tag: value });
export const accessibilityHint = (hint: string) => ({ $type: 'accessibilityHint', hint });
export const buttonStyle = (style: string) => ({ $type: 'buttonStyle', style });
export const controlSize = (size: string) => ({ $type: 'controlSize', size });
export const buttonBorderShape = (shape: string) => ({ $type: 'buttonBorderShape', shape });
export const onAppear = (handler: () => void) => ({ $type: 'onAppear', handler });
export const background = (style: unknown, shape?: unknown) => ({ $type: 'background', style, shape });
export const shapes = {
  roundedRectangle: (params: Record<string, unknown>) => ({ shape: 'roundedRectangle', ...params }),
};

// The SwiftUI button: its accessible name is the label, or the accessibilityLabel modifier
// for a label-less system button such as the glass close.
export function Button({ label, modifiers, onPress, role, systemImage, testID }: Readonly<{
  label?: string;
  modifiers?: readonly Record<string, unknown>[];
  onPress?: () => void;
  role?: string;
  systemImage?: string;
  testID?: string;
}>) {
  const named = modifiers?.find((modifier) => modifier.$type === 'accessibilityLabel');
  const isDisabled = modifiers?.some((modifier) => modifier.$type === 'disabled' && modifier.disabled) ?? false;
  return (
    <Pressable
      accessibilityLabel={(named?.label as string | undefined) ?? label}
      accessibilityRole="button"
      accessibilityState={isDisabled ? { disabled: true } : undefined}
      disabled={isDisabled}
      onPress={onPress}
      testID={testID}
      {...{ modifiers, swiftUIRole: role, systemImage }}>
      {label ? <RNText>{label}</RNText> : null}
    </Pressable>
  );
}

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

type StackProps = Readonly<{
  alignment?: string;
  children?: ReactNode;
  modifiers?: readonly Record<string, unknown>[];
  spacing?: number;
  testID?: string;
}>;

export function HStack({ alignment, children, modifiers, spacing, testID }: StackProps) {
  return (
    <View
      testID={testID ?? 'expo-ui-hstack'}
      {...{ alignment, modifiers, spacing }}>
      {children}
    </View>
  );
}

export function VStack({ alignment, children, modifiers, spacing, testID }: StackProps) {
  return (
    <View
      testID={testID ?? 'expo-ui-vstack'}
      {...{ alignment, modifiers, spacing }}>
      {children}
    </View>
  );
}

export function Spacer({ modifiers, testID }: Readonly<{
  modifiers?: readonly Record<string, unknown>[];
  testID?: string;
}>) {
  return <View testID={testID ?? 'expo-ui-spacer'} {...{ modifiers }} />;
}

export function Image({ modifiers, systemName, testID }: Readonly<{
  modifiers?: readonly Record<string, unknown>[];
  systemName?: string;
  testID?: string;
}>) {
  return (
    <View
      accessibilityLabel={systemName}
      testID={testID ?? 'expo-ui-image'}
      {...{ modifiers, systemName }}
    />
  );
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
  modifiers,
  supportingText,
  onPress,
  testID,
  trailing,
}: Readonly<{
  children?: ReactNode;
  supportingText?: ReactNode;
  leading?: ReactNode;
  modifiers?: readonly Record<string, unknown>[];
  onPress?: () => void;
  testID?: string;
  trailing?: ReactNode;
}>) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      {...{ modifiers }}
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
  modifiers,
  onValueChange,
  testID,
  value,
}: Readonly<{
  disabled?: boolean;
  modifiers?: readonly Record<string, unknown>[];
  onValueChange?: (value: boolean) => void;
  testID?: string;
  value?: boolean;
}>) {
  const labelModifier = modifiers?.find((modifier) => modifier.$type === 'accessibilityLabel');

  return (
    <RNSwitch
      accessibilityLabel={labelModifier?.label as string | undefined}
      disabled={disabled}
      {...{ modifiers }}
      onValueChange={onValueChange}
      testID={testID}
      value={value}
    />
  );
}

export function Menu({ children, label, modifiers, testID }: Readonly<{
  children?: ReactNode;
  label?: ReactNode;
  modifiers?: readonly Record<string, unknown>[];
  testID?: string;
}>) {
  const labelModifier = modifiers?.find((modifier) => modifier.$type === 'accessibilityLabel');
  const valueModifier = modifiers?.find((modifier) => modifier.$type === 'accessibilityValue');

  return (
    <Pressable
      accessibilityLabel={labelModifier?.label as string | undefined}
      accessibilityRole="button"
      accessibilityState={{
        disabled: modifiers?.some((modifier) => modifier.$type === 'disabled'),
      }}
      accessibilityValue={{ text: valueModifier?.value as string | undefined }}
      testID={testID ?? 'expo-ui-menu'}
      {...{ label, modifiers }}>
      {label}
      {children}
    </Pressable>
  );
}

export function Picker({
  children,
  label,
  modifiers,
  onSelectionChange,
  selection,
  systemImage,
  testID,
}: Readonly<{
  children?: ReactNode;
  label?: string;
  modifiers?: readonly Record<string, unknown>[];
  onSelectionChange?: (value: string) => void;
  selection?: string;
  systemImage?: string;
  testID?: string;
}>) {
  const options = Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode; modifiers?: readonly Record<string, unknown>[] }>(child)) {
      return [];
    }
    const value = child.props.modifiers?.find((modifier) => modifier.$type === 'tag')?.tag;
    return typeof value === 'string'
      ? [{ label: child.props.children, value }]
      : [];
  });
  const selectedLabel = options.find((option) => option.value === selection)?.label;
  const hidesLabel = modifiers?.some((modifier) => modifier.$type === 'labelsHidden');

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{
        disabled: modifiers?.some((modifier) => modifier.$type === 'disabled'),
      }}
      accessibilityValue={{ text: typeof selectedLabel === 'string' ? selectedLabel : undefined }}
      {...{ modifiers, onSelectionChange, options, selection, systemImage }}
      testID={testID ?? 'expo-ui-picker'}>
      {!hidesLabel && systemImage ? <View accessibilityLabel={systemImage} testID="expo-ui-icon" /> : null}
      {!hidesLabel && label ? <RNText>{label}</RNText> : null}
      {!hidesLabel && typeof selectedLabel === 'string' ? <RNText>{selectedLabel}</RNText> : null}
    </Pressable>
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
