import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Icon, ProgressFill, type IconName } from '@/components/ui';
import type { AccountResult } from '@/features/account/application/account-screens';
import { useMessages } from '@/localization/use-messages';
import { radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

/** One result line: a secondary-ink mark and its sentence. */
export function ResultRow({ children, icon }: Readonly<{ children: ReactNode; icon: IconName }>) {
  const theme = useKuyaraTheme();
  return (
    <View style={styles.row}>
      <Icon color={theme.colors.iconSecondary} name={icon} size={20} />
      <View style={styles.rowText}>{children}</View>
    </View>
  );
}

/**
 * Frames 04, 14, 15 and 26: the shared result anatomy on a sheet sized to its content. A
 * mark, a title, rows with an icon each, and one filled button that closes the sheet.
 */
export function AccountResultContent({ onDone, result }: Readonly<{ result: AccountResult; onDone: () => void }>) {
  const copy = useMessages().account;
  const theme = useKuyaraTheme();
  const success = { color: theme.colors.successInk, name: 'checkCircle' } as const;
  const mark = result.kind === 'restoring' ? { color: theme.colors.textPrimary, name: 'restoreArrow' } as const : success;

  let title: string;
  let body: ReactNode;
  let action: string;
  switch (result.kind) {
    case 'signedIn':
      title = copy.welcome.title;
      action = copy.welcome.done;
      body = (
        <>
          <ResultRow icon="personCircle">
            <AppText testID="account-result-email">{result.email}</AppText>
            <AppText colorRole="textSecondary" variant="caption">{copy.method[result.provider]}</AppText>
          </ResultRow>
          <ResultRow icon="hanger">
            <AppText tabularNumbers>{copy.welcome.summary(result.pieces, result.days)}</AppText>
          </ResultRow>
        </>
      );
      break;
    case 'restoring': {
      const { counts } = result;
      const done = counts.piecesDone + counts.daysDone;
      const total = counts.piecesTotal + counts.daysTotal;
      title = copy.restore.progressTitle;
      action = copy.restore.progressAction;
      body = (
        <>
          <ProgressFill progress={total > 0 ? done / total : 0} style={styles.progress} />
          <AppText tabularNumbers testID="account-result-progress">{copy.restore.progressCount(counts)}</AppText>
          <AppText>{copy.restore.progressBody}</AppText>
          <AppText colorRole="textSecondary" variant="caption">{copy.restore.progressKeep}</AppText>
        </>
      );
      break;
    }
    case 'restored':
      title = copy.restore.doneTitle;
      action = copy.restore.done;
      body = (
        <>
          <ResultRow icon="hanger">
            <AppText tabularNumbers>{copy.restore.doneBody(result.pieces, result.days)}</AppText>
          </ResultRow>
          <ResultRow icon="personCircle"><AppText>{copy.restore.doneProfile}</AppText></ResultRow>
        </>
      );
      break;
    case 'deleted':
      title = copy.deleted.title;
      action = copy.deleted.done;
      body = (
        <>
          <ResultRow icon="trash"><AppText>{copy.deleted.gone[result.provider]}</AppText></ResultRow>
          <ResultRow icon="statusRunning"><AppText>{copy.deleted.stay}</AppText></ResultRow>
        </>
      );
      break;
  }

  return (
    <View style={styles.content} testID={`account-result-${result.kind}`}>
      <Icon color={mark.color} name={mark.name} size={28} />
      <AppText accessibilityRole="header" variant="titleLarge">{title}</AppText>
      {body}
      <Button label={action} onPress={onDone} size="large" testID="account-result-done" />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xl },
  row: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  rowText: { flex: 1, gap: spacing.xs },
  progress: { borderRadius: radii.pill, height: 6 },
});
