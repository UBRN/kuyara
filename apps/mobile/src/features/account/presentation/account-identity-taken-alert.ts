import { showAlert } from '@/components/ui/system-presentation';
import type { AccountProvider } from '@/features/account/application/account-screens';
import type { AccountMessages } from '@/localization/messages';

/**
 * Adding an Apple or Google identity that already belongs to another kuyara account
 * (ADR 0041 section 1): a system alert with one "OK". Its body names the way out, signing
 * out and signing in with that identity, which opens the other account.
 */
export function showIdentityTakenAlert(copy: AccountMessages, provider: AccountProvider): void {
  const { body, ok, title } = copy.identityTaken;
  showAlert(title[provider], body[provider], [{ text: ok }]);
}
