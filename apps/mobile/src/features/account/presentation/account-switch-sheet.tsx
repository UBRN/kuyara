import { StyleSheet, View } from 'react-native';

import { AppText, Button, Icon, NativeSheet } from '@/components/ui';
import { ResultRow } from '@/features/account/presentation/account-result';
import { StatusLine } from '@/features/account/presentation/account-status';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

/** What this phone holds from the account it was last linked to. */
export type AccountSwitchPrompt = Readonly<{ pieces: number; days: number; pendingChanges: number }>;

/**
 * Signing in with a different account (ADR 0041 section 6): a sheet that cannot be swiped
 * away asks whether the Closet and History already here join the new account. The two
 * answers carry equal weight, each with one sentence on what it does, and the changes that
 * "Don't add" would lose are counted when there are any.
 */
export function AccountSwitchSheet({
  onAdd,
  onDontAdd,
  prompt,
}: Readonly<{ prompt: AccountSwitchPrompt | null; onAdd: () => void; onDontAdd: () => void }>) {
  const copy = useMessages().account.switchAccount;
  const theme = useKuyaraTheme();

  return (
    <NativeSheet dismissible={false} onDismiss={() => undefined} size="fit" testID="account-switch-sheet" visible={prompt !== null}>
      {prompt ? (
        <View style={styles.content}>
          <Icon color={theme.colors.textPrimary} name="personCircle" size={28} />
          <AppText accessibilityRole="header" variant="titleLarge">{copy.title}</AppText>
          <AppText colorRole="textSecondary">{copy.body}</AppText>
          <ResultRow icon="hanger">
            <AppText tabularNumbers testID="account-switch-holds">{copy.holds(prompt.pieces, prompt.days)}</AppText>
          </ResultRow>
          {prompt.pendingChanges > 0 ? (
            <StatusLine testID="account-switch-pending" text={copy.pending(prompt.pendingChanges)} tone="neutral" />
          ) : null}
          <View style={styles.choice}>
            <Button label={copy.add} onPress={onAdd} size="large" testID="account-switch-add" variant="tonal" />
            <AppText colorRole="textSecondary" variant="caption">{copy.addHint}</AppText>
          </View>
          <View style={styles.choice}>
            <Button label={copy.dontAdd} onPress={onDontAdd} size="large" testID="account-switch-dont-add" variant="tonal" />
            <AppText colorRole="textSecondary" variant="caption">{copy.dontAddHint}</AppText>
          </View>
        </View>
      ) : null}
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xl },
  choice: { gap: spacing.xs },
});
