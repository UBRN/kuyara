import { Alert, StyleSheet, View } from 'react-native';

import { AppText, Icon, ListRowTile, NativeList, NativeListContentRow, NativeListRow, NativeListSection } from '@/components/ui';
import { useErrorAnnouncement } from '@/components/ui/use-error-announcement';
import { accountProviders } from '@/features/account/application/account-screens';
import { useAccountScreens } from '@/features/account/application/account-screens-context';
import { AccountConsentSheet } from '@/features/account/presentation/account-consent';
import { showIdentityTakenAlert } from '@/features/account/presentation/account-identity-taken-alert';
import { SyncToneGlyph } from '@/features/account/presentation/account-status';
import { describeSync } from '@/features/account/presentation/account-sync-view';
import { useLocalization } from '@/localization/use-messages';
import { formatClockTime } from '@/presentation/format-clock-time';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

/**
 * Frames 07, 08, 09, 10, 21, 22, 34 and 35: the Account screen, a native grouped list
 * (ADR 0030) pushed from Settings. Who is signed in and how, the sync status and what the
 * account holds, the sign-in methods, sign-out behind the system confirmation, and the way
 * to the deletion page two taps from Settings (ADR 0041 section 7). The records group says
 * whether the sync consent is on, gives it on its own sheet, and withdraws it behind the system
 * confirmation (section 10).
 */
export function AccountScreen({ onOpenDelete }: Readonly<{ onOpenDelete: () => void }>) {
  const { port, snapshot } = useAccountScreens();
  const { hour12, language, messages } = useLocalization();
  const theme = useKuyaraTheme();
  const copy = messages.account;
  const { session } = snapshot;
  // A failure is the system's footer text with the danger mark, so it follows the list's insets;
  // VoiceOver hears it the moment it appears.
  const recordsFailed = snapshot.consent.status === 'failed' && snapshot.consent.prompt === null;
  useErrorAnnouncement(recordsFailed ? copy.records.failed : null);
  if (session.kind !== 'signedIn') return null;
  const recordsOn = session.syncConsent === 'given';

  const sync = describeSync(session, snapshot.online, copy, formatClockTime(session.lastSyncedAt, language, hour12));
  const signOutBody = recordsOn ? copy.signOutAlert.body : copy.signOutAlert.bodyWithoutRecords;
  const confirmSignOut = () => Alert.alert(copy.signOutAlert.title, signOutBody, [
    { style: 'cancel', text: copy.signOutAlert.cancel },
    { onPress: port.signOut, text: copy.signOutAlert.confirm },
  ]);
  const confirmWithdraw = () => Alert.alert(copy.withdrawAlert.title, copy.withdrawAlert.body, [
    { style: 'cancel', text: copy.withdrawAlert.cancel },
    { onPress: port.withdrawConsent, style: 'destructive', text: copy.withdrawAlert.confirm },
  ]);
  const recordsFooter = recordsFailed ? copy.records.failed : recordsOn ? copy.records.onFooter : copy.records.offFooter;

  return (
    <>
      <NativeList testID="account-screen">
        <NativeListSection testID="account-identity-group">
          <NativeListContentRow testID="account-identity-row">
            <View style={styles.identity}>
              <ListRowTile glyph={({ color, size }) => <Icon color={color} name="personCircle" size={size} />} />
              <View style={styles.identityText}>
                <AppText ellipsizeMode="middle" numberOfLines={1}>{session.email}</AppText>
                <AppText colorRole="textSecondary" variant="caption">{copy.method[session.provider]}</AppText>
              </View>
            </View>
          </NativeListContentRow>
        </NativeListSection>

        <NativeListSection footer={sync.footer} heading={copy.sync.heading} testID="account-sync-group">
          <NativeListRow
            glyph={({ size }) => <SyncToneGlyph size={size} tone={sync.tone} />}
            label={sync.label}
            testID="account-sync-status-row"
            value={sync.value}
          />
          <NativeListRow
            glyph={({ color, size }) => <Icon color={color} name="hanger" size={size} />}
            label={copy.account.closet}
            testID="account-closet-row"
            value={recordsOn ? copy.account.pieces(session.closetPieces) : copy.account.notIncluded}
          />
          <NativeListRow
            glyph={({ color, size }) => <Icon color={color} name="calendar" size={size} />}
            label={copy.account.history}
            testID="account-history-row"
            value={recordsOn ? copy.account.days(session.historyDays) : copy.account.notIncluded}
          />
          <NativeListRow
            glyph={({ color, size }) => <Icon color={color} name="clothing" size={size} />}
            label={copy.account.preferences}
            testID="account-preferences-row"
            value={recordsOn ? copy.account.included : copy.account.notIncluded}
          />
          <NativeListRow
            glyph={({ color, size }) => <Icon color={color} name="refresh" size={size} />}
            label={sync.action.label}
            onPress={sync.action.enabled ? port.syncNow : undefined}
            secondary={!sync.action.enabled}
            testID="account-sync-action-row"
            tinted={sync.action.enabled}
          />
        </NativeListSection>

        {session.syncConsent === null ? null : (
          <NativeListSection
            footer={recordsFooter}
            footerSymbol={recordsFailed ? { name: 'warning', color: theme.colors.dangerInk } : undefined}
            heading={copy.records.heading}
            testID="account-records-group">
            <NativeListRow
              glyph={({ color, size }) => <Icon color={color} name="sync" size={size} />}
              label={copy.records.label}
              testID="account-records-status-row"
              value={recordsOn ? copy.records.on : copy.records.off}
            />
            <NativeListRow
              glyph={({ color, size }) => <Icon color={color} name={recordsOn ? 'statusOff' : 'plusCircle'} size={size} />}
              label={recordsOn ? copy.records.withdraw : copy.records.give}
              onPress={snapshot.consent.status === 'saving' ? undefined : recordsOn ? confirmWithdraw : port.openConsent}
              secondary={snapshot.consent.status === 'saving'}
              testID="account-records-action-row"
              tinted={snapshot.consent.status !== 'saving'}
            />
          </NativeListSection>
        )}

        <NativeListSection footer={copy.account.methodsFooter} heading={copy.account.methodsHeading} testID="account-methods-group">
          {accountProviders.map((provider) => (session.providers.includes(provider) ? (
            <NativeListRow
              glyph={({ color, size }) => <Icon color={color} name={provider === 'apple' ? 'appleLogo' : 'personCircle'} size={size} />}
              key={provider}
              label={copy.account.providerName[provider]}
              testID={`account-method-${provider}-row`}
              value={copy.account.connected}
            />
          ) : (
            <NativeListRow
              glyph={({ color, size }) => <Icon color={color} name="plusCircle" size={size} />}
              key={provider}
              label={copy.account.add[provider]}
              onPress={() => void port.addProvider(provider).then((outcome) => {
                if (outcome === 'identityTaken') showIdentityTakenAlert(copy, provider);
              })}
              testID={`account-add-${provider}-row`}
              tinted
            />
          )))}
        </NativeListSection>

        <NativeListSection testID="account-sign-out-group">
          <NativeListRow
            glyph={({ color, size }) => <Icon color={color} name="signOut" size={size} />}
            label={copy.account.signOut}
            onPress={confirmSignOut}
            testID="account-sign-out-row"
            tinted
          />
        </NativeListSection>

        <NativeListSection footer={copy.account.deleteFooter} testID="account-delete-group">
          <NativeListRow
            destructive
            glyph={({ color, size }) => <Icon color={color} name="trash" size={size} />}
            label={copy.account.delete}
            onPress={onOpenDelete}
            testID="account-delete-row"
          />
        </NativeListSection>
      </NativeList>
      <AccountConsentSheet />
    </>
  );
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  identityText: { flex: 1, minWidth: 0 },
});
