import { Redirect, Stack, router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { useSinglePush } from '@/components/ui/use-single-push';
import { ACCOUNT_SCREENS_ENABLED } from '@/features/account/application/account-screens-flag';
import { useAccountScreens } from '@/features/account/application/account-screens-context';
import { AccountScreen } from '@/features/account/presentation/account-screen';
import { useAccountHarness } from '@/features/account/presentation/use-account-harness';
import { useMessages } from '@/localization/use-messages';

export default function AccountRoute() {
  return ACCOUNT_SCREENS_ENABLED ? <AccountRouteContent /> : <Redirect href="/settings" />;
}

function AccountRouteContent() {
  useAccountHarness();
  const messages = useMessages();
  const push = useSinglePush();
  const { snapshot } = useAccountScreens();
  const signedOut = snapshot.session.kind === 'signedOut';

  // Sign-out and deletion leave the ended account's screens for Settings, where the one-time line
  // follows; the deletion result itself shows on the app-wide sheet the tab layout hosts. This
  // screen stays mounted behind other tabs, so the return waits for focus rather than pulling a
  // person on Today or Weather into Settings.
  useFocusEffect(useCallback(() => {
    if (signedOut) router.dismissTo('/settings');
  }, [signedOut]));

  return (
    <>
      <Stack.Screen
        options={{
          headerBackTitle: messages.settings.title,
          headerShown: true,
          headerTitle: messages.account.account.title,
        }}
      />
      <AccountScreen onOpenDelete={() => push('/settings/delete-account')} />
    </>
  );
}
