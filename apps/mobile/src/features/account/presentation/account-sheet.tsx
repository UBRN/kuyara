import { NativeSheet } from '@/components/ui';
import type { AccountSheetHost } from '@/features/account/application/account-screens';
import { useAccountScreens } from '@/features/account/application/account-screens-context';
import { AccountResultContent } from '@/features/account/presentation/account-result';
import { AccountSignInPage } from '@/features/account/presentation/account-sign-in-page';
import { useAccountHarness } from '@/features/account/presentation/use-account-harness';

/**
 * The account sheet one screen presents: the sign-in page, then in the same sheet the result
 * that follows it (ADR 0041 section 5). Profile stays mounted under Settings, so each screen
 * hosts its own sheet and only the one named in the snapshot shows.
 */
export function AccountSheet({ host }: Readonly<{ host: AccountSheetHost }>) {
  useAccountHarness();
  const { port, snapshot } = useAccountScreens();
  const { result } = snapshot;

  return (
    <NativeSheet
      onDismiss={port.closeSheet}
      size={result ? 'fit' : 'large'}
      testID={`account-sheet-${host}`}
      visible={snapshot.sheet === host}>
      {result ? <AccountResultContent onDone={port.closeSheet} result={result} /> : <AccountSignInPage />}
    </NativeSheet>
  );
}
