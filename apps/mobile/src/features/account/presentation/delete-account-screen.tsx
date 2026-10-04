import { Alert, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText, Button, Icon, NativeList, NativeListRow, NativeListSection } from '@/components/ui';
import { useAccountScreens } from '@/features/account/application/account-screens-context';
import { StatusLine } from '@/features/account/presentation/account-status';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';

/**
 * Frames 11, 12, 25, 37 and 38: what deletion removes and what stays, then one red tonal
 * button behind the system's "Delete your account?" alert (ADR 0041 section 7). The button
 * keeps its place: it carries the spinner while deletion runs, is inactive with a warning
 * line offline, and comes back with an error line after a failure.
 */
export function DeleteAccountScreen() {
  const { port, snapshot } = useAccountScreens();
  const copy = useMessages().account;
  const { width } = useWindowDimensions();
  const { session } = snapshot;
  if (session.kind !== 'signedIn') return null;

  const deleting = snapshot.deletion === 'deleting';
  const confirm = () => Alert.alert(copy.deleteAlert.title, copy.deleteAlert.body, [
    { style: 'cancel', text: copy.deleteAlert.cancel },
    { onPress: port.deleteAccount, style: 'destructive', text: copy.deleteAlert.confirm },
  ]);

  return (
    <NativeList testID="delete-account-screen">
      <NativeListSection heading={copy.deletion.goneHeading} testID="delete-account-gone-group">
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="personCircle" size={size} />}
          label={copy.deletion.goneAccount[session.provider]}
        />
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="hanger" size={size} />}
          label={session.syncConsent === 'none' || session.syncConsent === 'withdrawn'
            ? copy.deletion.goneDataWithoutRecords : copy.deletion.goneData}
        />
      </NativeListSection>
      <NativeListSection footer={copy.deletion.footer[session.provider]} heading={copy.deletion.stayHeading} testID="delete-account-stay-group">
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="statusRunning" size={size} />}
          label={copy.deletion.stay}
        />
      </NativeListSection>
      <NativeListSection footer={
        <View style={[styles.action, { width: Math.max(0, width - spacing.lg * 2) }]}>
          <Button
            disabled={!snapshot.online}
            icon="trash"
            label={copy.deletion.action}
            loading={deleting}
            onPress={confirm}
            size="large"
            testID="delete-account-button"
            variant="destructive"
          />
          {deleting ? (
            <AppText colorRole="textSecondary" testID="delete-account-deleting" variant="caption">
              {copy.deletion.deleting}
            </AppText>
          ) : snapshot.deletion === 'failed' ? (
            <StatusLine testID="delete-account-status" text={copy.deletion.failed} tone="danger" />
          ) : !snapshot.online ? (
            <StatusLine testID="delete-account-status" text={copy.deletion.offline} tone="warning" />
          ) : null}
        </View>
      } />
    </NativeList>
  );
}

const styles = StyleSheet.create({
  action: { gap: spacing.md },
});
