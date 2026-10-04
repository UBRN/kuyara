import { accountDeleteV1Path } from '@kuyara/contracts';

import type { AccountDeletionNetworkPort } from '@/features/account/application/account-delete';
import { fetchJsonWithTimeout, type Fetch } from '@/infrastructure/network/fetch-json-with-timeout';

/**
 * The Worker revokes Apple's token and deletes the user before it answers, so it gets longer than a read;
 * the Worker bounds its five upstream calls at `accountUpstreamTimeoutMs` (3 s) each, inside this wait.
 */
const deletionTimeoutMs = 20_000;

/**
 * `POST /v1/account/delete` on the Worker (ADR 0041 section 2), and the phone's side once it
 * answers: the device link and every pending flag reset in one transaction, then the session
 * deleted. The access token travels only in the `Authorization` header.
 */
export function createWorkerAccountDeletion({ baseUrl, clearSession, fetcher, resetLinkAndFlags }: Readonly<{
  baseUrl: string;
  fetcher: Fetch;
  resetLinkAndFlags: () => Promise<void>;
  clearSession: () => Promise<void>;
}>): AccountDeletionNetworkPort {
  return {
    async request(body, accessToken) {
      const { response, body: json } = await fetchJsonWithTimeout(
        fetcher,
        `${baseUrl}${accountDeleteV1Path}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(body),
        },
        deletionTimeoutMs,
        { network: () => new Error('account_delete_unreachable'), invalidJson: () => new Error('account_delete_unreadable') },
      );
      return { status: response.status, body: json };
    },
    // `resetLinkAndFlags` clears the link and every pending flag, and the session goes with them,
    // also when the reset fails: the account no longer exists to sign in to.
    async cleanup() {
      try {
        await resetLinkAndFlags();
      } finally {
        await clearSession();
      }
    },
  };
}
