import {
  accountDeleteV1ErrorSchema,
  accountDeleteV1RequestSchema,
  accountDeleteV1SuccessSchema,
  type AccountDeleteV1ErrorCode,
} from '@kuyara/contracts';

export type AccountDeletionCode = AccountDeleteV1ErrorCode | 'unknown';

export type AccountDeletionResult =
  | Readonly<{ kind: 'deleted'; appleUnrevoked: boolean }>
  | Readonly<{ kind: 'failed'; code: AccountDeletionCode }>;

export type AccountDeletionPort = Readonly<{
  deleteAccount: (input: Readonly<{ accessToken: string; appleAuthorizationCode?: string }>) => Promise<AccountDeletionResult>;
}>;

export type AccountDeletionNetworkPort = Readonly<{
  /** The deletion request, authorized by `accessToken`. */
  request: (
    body: Readonly<{ appleAuthorizationCode?: string }>,
    accessToken: string,
  ) => Promise<Readonly<{ status: number; body: unknown }>>;
  /** Resets the device link and flags, then ends the local session even when the reset failed. */
  cleanup: () => Promise<void>;
}>;

export function createAccountDeletionClient(port: AccountDeletionNetworkPort): AccountDeletionPort {
  return {
    async deleteAccount(input) {
      const request = accountDeleteV1RequestSchema.safeParse(
        input.appleAuthorizationCode === undefined ? {} : { appleAuthorizationCode: input.appleAuthorizationCode },
      );
      if (!request.success || input.accessToken.length === 0) return { kind: 'failed', code: 'invalid_request' };
      let response: Readonly<{ status: number; body: unknown }>;
      try {
        response = await port.request(request.data, input.accessToken);
      } catch {
        // A lost answer is not a refusal: the Worker may have deleted the account. It answers a
        // repeat for an account already gone as deleted, so the request is sent once more.
        try {
          response = await port.request(request.data, input.accessToken);
        } catch {
          return { kind: 'failed', code: 'unavailable' };
        }
      }
      if (response.status >= 200 && response.status < 300) {
        const success = accountDeleteV1SuccessSchema.safeParse(response.body);
        if (!success.success) return { kind: 'failed', code: 'unknown' };
        // The account is gone whatever happens on the phone now, so the answer stays `deleted`.
        // A cleanup that fails is tried once more; the data layer ends the session either way.
        const cleanup = () => port.cleanup();
        try {
          await cleanup().catch(cleanup);
        } catch {
          // Both attempts failed: the screens still end the session, as for any deletion.
        }
        return { kind: 'deleted', appleUnrevoked: success.data.data.status === 'deleted_apple_unrevoked' };
      }
      const error = accountDeleteV1ErrorSchema.safeParse(response.body);
      return { kind: 'failed', code: error.success ? error.data.error.code : 'unknown' };
    },
  };
}
