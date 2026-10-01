import { Redirect, Stack } from 'expo-router';

import { ACCOUNT_SCREENS_ENABLED } from '@/features/account/application/account-screens-flag';
import { DeleteAccountScreen } from '@/features/account/presentation/delete-account-screen';
import { useAccountHarness } from '@/features/account/presentation/use-account-harness';
import { useMessages } from '@/localization/use-messages';

export default function DeleteAccountRoute() {
  return ACCOUNT_SCREENS_ENABLED ? <DeleteAccountRouteContent /> : <Redirect href="/settings" />;
}

// When deletion finishes the Account route under this one returns everyone to Settings.
function DeleteAccountRouteContent() {
  useAccountHarness();
  const messages = useMessages();
  return (
    <>
      <Stack.Screen
        options={{
          headerBackTitle: messages.account.account.title,
          headerShown: true,
          headerTitle: messages.account.deletion.title,
        }}
      />
      <DeleteAccountScreen />
    </>
  );
}
