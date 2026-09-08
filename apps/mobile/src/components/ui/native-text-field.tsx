import { Host, TextInput } from '@expo/ui';
import { accessibilityLabel as nativeAccessibilityLabel } from '@expo/ui/swift-ui/modifiers';
import { Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useTextScaling } from '@/components/ui/use-text-scaling';
import { borderWidths, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type NativeTextFieldProps = Readonly<{
  label: string;
  placeholder: string;
  maxLength: number;
  onChangeText: (text: string) => void;
  testID: string;
}>;

export function NativeTextField({ label, placeholder, maxLength, onChangeText, testID }: NativeTextFieldProps) {
  const theme = useKuyaraTheme();
  const { fontScale } = useTextScaling();
  // An explicit height keeps the native Host measurable; allow the line to grow with Dynamic Type.
  const height = 48 * Math.max(1, fontScale);
  return (
    <View style={styles.field}>
      <AppText variant="bodyStrong">{label}</AppText>
      {/* The RN wrapper owns the control edge: a border on the native view itself is drawn
          with mismatched insets by the Host. */}
      <View
        style={[
          styles.frame,
          { borderColor: theme.colors.borderDefined, backgroundColor: theme.colors.surface },
        ]}>
        <Host colorScheme={theme.isDark ? 'dark' : 'light'} style={{ height }}>
          <TextInput
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={maxLength}
            modifiers={Platform.OS === 'ios' ? [nativeAccessibilityLabel(label)] : undefined}
            onChangeText={onChangeText}
            placeholder={placeholder}
            returnKeyType="search"
            style={{ height, paddingHorizontal: spacing.md }}
            testID={testID}
          />
        </Host>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  frame: { borderWidth: borderWidths.subtle, borderRadius: radii.control, overflow: 'hidden' },
});
