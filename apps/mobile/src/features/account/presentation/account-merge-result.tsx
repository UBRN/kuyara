import { StyleSheet, View } from 'react-native';

import { AppText, Button, Icon } from '@/components/ui';
import type { MergeCounts, ProfileSource } from '@/features/account/domain/account-merge';
import { ProfileSourceRow, ResultRow } from '@/features/account/presentation/account-result';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

/**
 * The merge result (ADR 0041 sections 4 and 6), after a first link or a different account, in
 * the account sheet's result anatomy: what this phone and the account gave each other, per kind,
 * the rule that settled a piece or day both held, and where the profile came from. It follows a
 * link under the sync consent, the only link that merges records; without it the signed-in
 * result says that only the name and gender went. Duplicates are never removed for the person,
 * so "Open Closet" sits beside "Done".
 */
export function AccountMergeResultContent({
  counts,
  onDone,
  onOpenCloset,
  profileFrom,
}: Readonly<{ counts: MergeCounts; profileFrom: ProfileSource; onDone: () => void; onOpenCloset: () => void }>) {
  const account = useMessages().account;
  const copy = account.merge;
  const theme = useKuyaraTheme();

  return (
    <View style={styles.content} testID="account-result-merged">
      <Icon color={theme.colors.successInk} name="checkCircle" size={28} />
      <AppText accessibilityRole="header" variant="titleLarge">{copy.title}</AppText>
      <ResultRow icon="hanger">
        <AppText tabularNumbers testID="account-merge-closet">{copy.closet(counts.piecesAdded, counts.piecesReceived)}</AppText>
      </ResultRow>
      <ResultRow icon="calendar">
        <AppText tabularNumbers testID="account-merge-history">
          {copy.history(counts.historyDaysAdded, counts.historyDaysReceived)}
        </AppText>
      </ResultRow>
      <ResultRow icon="sync">
        <AppText>{copy.rule}</AppText>
        <AppText colorRole="textSecondary" variant="caption">{copy.duplicates}</AppText>
      </ResultRow>
      <ProfileSourceRow from={profileFrom} />
      <Button label={copy.done} onPress={onDone} size="large" testID="account-result-done" />
      <Button label={copy.openCloset} onPress={onOpenCloset} size="large" testID="account-merge-open-closet" variant="plain" />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xl },
});
