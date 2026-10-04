import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Icon, type IconName } from '@/components/ui';
import type { AccountResult } from '@/features/account/application/account-screens';
import type { ProfileSource } from '@/features/account/domain/account-merge';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
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

/** Where the profile came from, in a whole sentence; nothing when the phone's went to the account. */
export function ProfileSourceRow({ from }: Readonly<{ from: ProfileSource }>) {
  const copy = useMessages().account.restore;
  if (from === 'phone') return null;
  return (
    <ResultRow icon="personCircle">
      <AppText>{from === 'account' ? copy.doneProfile : copy.doneNameAndGender}</AppText>
    </ResultRow>
  );
}

/**
 * Frames 04, 14, 15 and 26: the shared result anatomy on a sheet sized to its content. A
 * mark, a title, rows with an icon each, and one filled button that closes the sheet.
 */
/** Every result but the merge, which has its own content with "Open Closet" (`account-merge-result.tsx`). */
type SingleResult = Exclude<AccountResult, Readonly<{ kind: 'merged' }>>;

export function AccountResultContent({ onDone, result }: Readonly<{ result: SingleResult; onDone: () => void }>) {
  const copy = useMessages().account;
  const theme = useKuyaraTheme();

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
            {result.added === 'records'
              ? <AppText tabularNumbers>{copy.welcome.summary(result.pieces, result.days)}</AppText>
              : <AppText>{result.added === 'profile' ? copy.welcome.withoutRecords : copy.welcome.notYet}</AppText>}
          </ResultRow>
        </>
      );
      break;
    case 'restored':
      title = copy.restore.doneTitle;
      action = copy.restore.done;
      body = (
        <>
          <ResultRow icon="hanger">
            <AppText tabularNumbers>{copy.restore.doneBody(result.pieces, result.days)}</AppText>
          </ResultRow>
          <ProfileSourceRow from={result.profileFrom} />
        </>
      );
      break;
    case 'deleted':
      title = copy.deleted.title;
      action = copy.deleted.done;
      body = (
        <>
          <ResultRow icon="trash">
            <AppText>{result.appleUnrevoked ? copy.deleted.goneUnrevoked : copy.deleted.gone[result.provider]}</AppText>
          </ResultRow>
          {result.appleUnrevoked ? (
            <ResultRow icon="appleLogo">
              <AppText testID="account-result-apple-unrevoked">{copy.deleted.appleUnrevoked}</AppText>
            </ResultRow>
          ) : null}
          <ResultRow icon="statusRunning"><AppText>{copy.deleted.stay}</AppText></ResultRow>
        </>
      );
      break;
  }

  return (
    <View style={styles.content} testID={`account-result-${result.kind}`}>
      <Icon color={theme.colors.successInk} name="checkCircle" size={28} />
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
});
