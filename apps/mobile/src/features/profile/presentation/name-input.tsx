import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Icon } from '@/components/ui';
import { useErrorAnnouncement } from '@/components/ui/use-error-announcement';
import { displayNameInputIssue, displayNameMaxLength, displayNameMinLength } from '@/features/profile/domain/profile';
import type { AppMessages } from '@/localization/messages/types';
import { useMessages } from '@/localization/use-messages';
import { borderWidths, layout, radii, spacing, typography } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type NameInputProps = Readonly<{
  value: string;
  onChangeText: (value: string) => void;
  testID: string;
  onClear?: () => void;
  autoFocus?: boolean;
  /** The field's spoken name when the caller draws a visible label of its own. */
  accessibilityLabel?: string;
  /** Onboarding's name may be left empty, so its short-name error says so. */
  skippable?: boolean;
}>;

/** What is wrong with a typed name, in words, or null; one wording for the field and its caller. */
export function nameInputError(value: string, messages: AppMessages, skippable = false): string | null {
  const issue = displayNameInputIssue(value);
  const shortError = skippable ? messages.onboarding.nameShortError : messages.profile.nameShortError;
  return issue === 'short' ? shortError(displayNameMinLength)
    : issue === 'long' ? messages.onboarding.nameLongError(displayNameMaxLength)
      : issue === 'letter' ? messages.onboarding.nameLetterError : null;
}

export function NameInput({
  accessibilityLabel,
  autoFocus = false,
  value,
  onChangeText,
  testID,
  onClear,
  skippable = false,
}: NameInputProps) {
  const messages = useMessages();
  const copy = messages.onboarding;
  const profileCopy = messages.profile;
  const theme = useKuyaraTheme();
  const error = nameInputError(value, messages, skippable);
  // VoiceOver ignores the line's live region, so iOS speaks it; the field carries it as its
  // hint while it shows.
  useErrorAnnouncement(error);

  return (
    <View style={styles.group}>
      <View style={[styles.field, {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.borderDefined,
      }]}>
        <TextInput
          accessibilityHint={error ?? undefined}
          accessibilityLabel={accessibilityLabel ?? copy.namePlaceholder}
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
      {error ? (
        <AppText
          accessibilityLiveRegion="polite"
          colorRole="textSecondary"
          testID={`${testID}-error`}>
          {error}
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
