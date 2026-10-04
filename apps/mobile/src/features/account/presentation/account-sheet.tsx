import { NativeSheet } from '@/components/ui';
import { useSinglePush } from '@/components/ui/use-single-push';
import { accountIntroFirstPage } from '@/features/account/application/account-intro-pages';
import type { AccountSheetHost } from '@/features/account/application/account-screens';
import { useAccountScreens } from '@/features/account/application/account-screens-context';
import { AccountConsentContent, useConsentTextToggle } from '@/features/account/presentation/account-consent';
import { AccountMergeResultContent } from '@/features/account/presentation/account-merge-result';
import { AccountResultContent } from '@/features/account/presentation/account-result';
import { AccountSignInPage } from '@/features/account/presentation/account-sign-in-page';
import { useAccountHarness } from '@/features/account/presentation/use-account-harness';

/**
 * The account sheet one screen presents: the sign-in page, then in the same sheet the sync
 * consent question when the account holds no answer, then the result (ADR 0041 section 5). The
 * sign-in page and the question fill the large detent, so the question never needs the sheet
 * to grow; only the short result fits its content.
 * Profile stays mounted under Settings, so each screen hosts its own sheet and only the one
 * named in the snapshot shows.
 */
export function AccountSheet({ host }: Readonly<{ host: AccountSheetHost }>) {
  useAccountHarness();
  const { port, snapshot } = useAccountScreens();
  const push = useSinglePush();
  const { consent, result } = snapshot;
  const asking = consent.prompt === 'signIn';
  const text = useConsentTextToggle(asking);
  // Duplicates are never removed for the person: the merge result opens the Closet (ADR 0041 section 4).
  const openCloset = () => {
    port.closeSheet();
    push('/wardrobe');
  };

  return (
    <NativeSheet
      dismissible={!text.open}
      onDismiss={port.closeSheet}
      size={result && !asking ? 'fit' : 'large'}
      testID={`account-sheet-${host}`}
      visible={snapshot.sheet === host}>
      {asking
        ? (
          <AccountConsentContent
            expanded={text.open}
            onContinue={port.answerConsent}
            onToggleText={text.toggle}
            status={consent.status}
          />
        )
        : result?.kind === 'merged'
          ? <AccountMergeResultContent counts={result.counts} onDone={port.closeSheet} onOpenCloset={openCloset} profileFrom={result.profileFrom} />
          : result
            ? <AccountResultContent onDone={port.closeSheet} result={result} />
            : <AccountSignInPage initialPage={accountIntroFirstPage(host)} />}
    </NativeSheet>
  );
}
