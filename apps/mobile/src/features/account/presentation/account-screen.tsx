import { Alert } from 'react-native';

import { Icon, NativeList, NativeListRow, NativeListSection } from '@/components/ui';
import type { AccountProvider } from '@/features/account/application/account-screens';
import { useAccountScreens } from '@/features/account/application/account-screens-context';
import { SyncToneGlyph } from '@/features/account/presentation/account-status';
import { describeSync, formatSyncTime } from '@/features/account/presentation/account-sync-view';
import { useLocalization } from '@/localization/use-messages';

const allProviders: readonly AccountProvider[] = ['apple', 'google'];

/**
 * Frames 07, 08, 09, 10, 21, 22, 34 and 35: the Account screen, a native grouped list
 * (ADR 0030) pushed from Settings. Who is signed in and how, the sync status and what the
 * account holds, the sign-in methods, sign-out behind the system confirmation, and the way
 * to the deletion page two taps from Settings (ADR 0041 section 7).
 */
export function AccountScreen({ onOpenDelete }: Readonly<{ onOpenDelete: () => void }>) {
  const { port, snapshot } = useAccountScreens();
  const { hour12, language, messages } = useLocalization();
  const copy = messages.account;
  const { session } = snapshot;
  if (session.kind !== 'signedIn') return null;

  const sync = describeSync(session, snapshot.online, copy, formatSyncTime(session.lastSyncedAt, language, hour12));
  const confirmSignOut = () => Alert.alert(copy.signOutAlert.title, copy.signOutAlert.body, [
    { style: 'cancel', text: copy.signOutAlert.cancel },
    { onPress: port.signOut, text: copy.signOutAlert.confirm },
  ]);

  return (
    <NativeList testID="account-screen">
      <NativeListSection testID="account-identity-group">
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="personCircle" size={size} />}
          label={session.email}
          supportingText={copy.method[session.provider]}
          testID="account-identity-row"
        />
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
          value={copy.account.pieces(session.closetPieces)}
        />
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="calendar" size={size} />}
          label={copy.account.history}
          testID="account-history-row"
          value={copy.account.days(session.historyDays)}
        />
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="clothing" size={size} />}
          label={copy.account.preferences}
          testID="account-preferences-row"
          value={copy.account.included}
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

      <NativeListSection footer={copy.account.methodsFooter} heading={copy.account.methodsHeading} testID="account-methods-group">
        {allProviders.map((provider) => (session.providers.includes(provider) ? (
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
            onPress={() => port.addProvider(provider)}
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
  );
}
