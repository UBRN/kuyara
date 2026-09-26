import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Icon } from '@/components/ui';
import { displayNameIssue } from '@/features/profile/domain/profile';
import { useMessages } from '@/localization/use-messages';
import { borderWidths, layout, radii, spacing, typography } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type NameInputProps = Readonly<{
  value: string;
  onChangeText: (value: string) => void;
  testID: string;
  onClear?: () => void;
  autoFocus?: boolean;
}>;

export function NameInput({ autoFocus = false, value, onChangeText, testID, onClear }: NameInputProps) {
  const messages = useMessages();
  const copy = messages.onboarding;
  const profileCopy = messages.profile;
  const theme = useKuyaraTheme();
  const issue = displayNameIssue(value);

  return (
    <View style={styles.group}>
      <View style={[styles.field, {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.borderDefined,
      }]}>
        <TextInput
          accessibilityLabel={copy.namePlaceholder}
          autoCapitalize="words"
          autoFocus={autoFocus}
          autoCorrect={false}
          onChangeText={onChangeText}
          onSubmitEditing={() => Keyboard.dismiss()}
          placeholder={copy.namePlaceholder}
          placeholderTextColor={theme.colors.textSecondary}
          returnKeyType="done"
          style={[styles.input, { color: theme.colors.textPrimary }, typography.body]}
          testID={testID}
          value={value}
        />
        {onClear && value !== '' ? (
          <Pressable
            accessibilityLabel={profileCopy.nameClear}
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClear}
            style={styles.clear}
            testID={`${testID}-clear`}>
            <Icon color={theme.colors.textSecondary} name="clearCircleFilled" size={20} />
          </Pressable>
        ) : null}
      </View>
      {issue ? (
        <AppText
          accessibilityLiveRegion="polite"
          colorRole="textSecondary"
          testID={`${testID}-error`}>
          {issue === 'short' ? copy.nameShortError : copy.nameLongError}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  field: {
    alignItems: 'center',
    borderRadius: radii.control,
    borderWidth: borderWidths.subtle,
    flexDirection: 'row',
    minHeight: layout.minimumTouchTarget,
  },
  input: { flex: 1, minHeight: layout.minimumTouchTarget, paddingHorizontal: spacing.md },
  clear: { minHeight: layout.minimumTouchTarget, minWidth: layout.minimumTouchTarget,
    alignItems: 'center', justifyContent: 'center' },
});
