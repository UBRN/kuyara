import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText, Icon, NativeListRow, NativeListSection } from '@/components/ui';
import { useAccountScreens } from '@/features/account/application/account-screens-context';
import { syncToneSymbol } from '@/features/account/presentation/account-status';
import { describeSync, formatSyncTime } from '@/features/account/presentation/account-sync-view';
import { useLocalization } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

/**
 * Frames 05, 06, 13, 23 and 36: Settings' Account group, directly above Profile (ADR 0041
 * section 5). Signed out it offers sign-in with the benefit footnote; signed in it names the
 * method and the sync status. After sign-out or deletion a one-time line replaces the
 * footnote until the next visit.
 */
export function AccountSettingsSection({ onOpenAccount }: Readonly<{ onOpenAccount: () => void }>) {
  const { port, snapshot } = useAccountScreens();
  const { hour12, language, messages } = useLocalization();
  const theme = useKuyaraTheme();
  const { width } = useWindowDimensions();
  const copy = messages.account;
  const { session } = snapshot;
  // The one-time line stays while Settings is on screen and is gone on the next visit.
  useEffect(() => port.clearNotice, [port]);

  if (session.kind === 'signedIn') {
    const sync = describeSync(session, snapshot.online, copy, formatSyncTime(session.lastSyncedAt, language, hour12));
    return (
      <NativeListSection heading={copy.settings.group} testID="settings-account-group">
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="personCircle" size={size} />}
          label={copy.settings.signedIn[session.provider]}
          onPress={onOpenAccount}
          supportingSymbol={sync.tone === 'progress'
            ? { name: 'sync', color: theme.colors.iconSecondary }
            : syncToneSymbol(sync.tone, theme.colors)}
          supportingText={sync.settingsLine}
          testID="settings-account-row"
        />
      </NativeListSection>
    );
  }

  const notice = session.notice === 'deleted'
    ? { icon: 'checkCircle', color: theme.colors.successInk, text: copy.settings.deleted } as const
    : session.notice === 'signedOut'
      ? { icon: 'info', color: theme.colors.iconSecondary, text: copy.settings.signedOut } as const
      : null;

  return (
    <NativeListSection
      footer={notice ? (
        <View style={[styles.notice, { width: Math.max(0, width - spacing.lg * 4) }]} testID="settings-account-notice">
          <Icon color={notice.color} name={notice.icon} size={16} />
          <AppText style={styles.noticeText} variant="caption">{notice.text}</AppText>
        </View>
      ) : copy.settings.signedOutFooter}
      heading={copy.settings.group}
      testID="settings-account-group">
      <NativeListRow
        glyph={({ color, size }) => <Icon color={color} name="personCircle" size={size} />}
        label={copy.settings.signIn}
        onPress={() => port.openSignIn('settings')}
        testID="settings-account-sign-in-row"
      />
    </NativeListSection>
  );
}

const styles = StyleSheet.create({
  notice: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  noticeText: { flex: 1 },
});
