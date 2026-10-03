import {
  accountDeleteV1ErrorSchema,
  accountDeleteV1Path,
  accountDeleteV1RequestSchema,
  accountDeleteV1SuccessSchema,
  type AccountDeleteV1ErrorCode,
} from '@kuyara/contracts';

import { afterAccountDeletion } from '@/features/account/domain/account-link';

export type AccountDeletionCode = AccountDeleteV1ErrorCode | 'unknown';

export type AccountDeletionResult =
  | Readonly<{ kind: 'deleted' }>
  | Readonly<{ kind: 'failed'; code: AccountDeletionCode }>;

export type AccountDeletionPort = Readonly<{
  deleteAccount: (input: Readonly<{ accessToken: string; appleAuthorizationCode?: string }>) => Promise<AccountDeletionResult>;
}>;

export type AccountDeletionNetworkPort = Readonly<{
  request: (
    path: typeof accountDeleteV1Path,
    body: Readonly<{ appleAuthorizationCode?: string }>,
    headers: Readonly<{ Authorization: string }>,
  ) => Promise<Readonly<{ status: number; body: unknown }>>;
  cleanup: (change: ReturnType<typeof afterAccountDeletion> & Readonly<{ clearSession: true }>) => Promise<void>;
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
        response = await port.request(accountDeleteV1Path, request.data, { Authorization: `Bearer ${input.accessToken}` });
      } catch {
        return { kind: 'failed', code: 'unavailable' };
      }
      if (response.status >= 200 && response.status < 300) {
        if (!accountDeleteV1SuccessSchema.safeParse(response.body).success) return { kind: 'failed', code: 'unknown' };
        await port.cleanup({ ...afterAccountDeletion(), clearSession: true });
        return { kind: 'deleted' };
      }
      const error = accountDeleteV1ErrorSchema.safeParse(response.body);
      return { kind: 'failed', code: error.success ? error.data.error.code : 'unknown' };
    },
  };
}
