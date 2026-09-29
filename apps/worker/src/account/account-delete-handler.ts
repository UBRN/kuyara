import {
  accountDeleteV1ErrorSchema,
  accountDeleteV1Path,
  accountDeleteV1RequestSchema,
  accountDeleteV1SuccessSchema,
  type AccountDeleteV1ErrorCode,
} from '@kuyara/contracts';

import type { AppleTokenRevoker } from './apple-token-revoker.ts';
import { createErrorResponse, jsonHeaders } from '../json-response.ts';
import { AccountError } from './account-error.ts';
import { readTextWithLimit } from './bounded-fetch.ts';
import type { SupabaseAdmin } from './supabase-admin.ts';
import type { SupabaseTokenVerifier } from './supabase-token-verifier.ts';

type Dependencies = Readonly<{
  verifier: SupabaseTokenVerifier;
  admin: SupabaseAdmin;
  revoker: AppleTokenRevoker;
  rateLimiter: { limit(input: { key: string }): Promise<{ success: boolean }> };
}>;

// The body is `{}` or one code of at most 1024 characters; anything past this is refused unread.
const maxRequestBodyBytes = 4096;

type Stage = 'verify' | 'lookup' | 'apple' | 'delete';

const statuses: Readonly<Record<AccountDeleteV1ErrorCode, number>> = {
  invalid_request: 400,
  apple_code_invalid: 400,
  unauthorized: 401,
  not_found: 404,
  method_not_allowed: 405,
  rate_limited: 429,
  internal_error: 500,
  unavailable: 503,
};

const errorResponse = createErrorResponse<AccountDeleteV1ErrorCode>(accountDeleteV1ErrorSchema);

function error(code: AccountDeleteV1ErrorCode, extraHeaders?: Readonly<Record<string, string>>): Response {
  return errorResponse(statuses[code], code, extraHeaders);
}

// Only a closed stage and code are logged: never the token, the code, the user id or a message.
function failure(stage: Stage, thrown: unknown): Response {
  const code = thrown instanceof AccountError ? thrown.code : 'internal_error';
  console.warn({ event: 'account_delete_failed', stage, code });
  return error(code);
}

function bearerToken(request: Request): string | undefined {
  const match = /^bearer ([^\s]+)$/iu.exec(request.headers.get('authorization') ?? '');
  return match?.[1];
}

export function createAccountDeleteHandler({ verifier, admin, revoker, rateLimiter }: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (new URL(request.url).pathname !== accountDeleteV1Path) return error('not_found');
    if (request.method !== 'POST') return error('method_not_allowed', { Allow: 'POST' });
    try {
      const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
      if (!(await rateLimiter.limit({ key: `account-delete:${ip}` })).success) {
        console.warn({ event: 'rate_limited', route: accountDeleteV1Path, limiter: 'account_delete_burst' });
        return error('rate_limited', { 'Retry-After': '60' });
      }
    } catch {
      // A limiter outage fails closed; its message is not worth logging.
      return error('unavailable');
    }
    const accessToken = bearerToken(request);
    if (accessToken === undefined) return error('unauthorized');
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      return error('invalid_request');
    }
    // This body is unauthenticated: bound it before it is parsed, by the declared length and
    // again while reading, since a header can lie or be absent. Too large is invalid_request.
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (!Number.isFinite(declared) || declared > maxRequestBodyBytes) return error('invalid_request');
    let body: unknown;
    try {
      const text = await readTextWithLimit(request.body, maxRequestBodyBytes);
      if (text === undefined) return error('invalid_request');
      body = JSON.parse(text);
    } catch {
      return error('invalid_request');
    }
    const parsed = accountDeleteV1RequestSchema.safeParse(body);
    if (!parsed.success) return error('invalid_request');

    let userId: string;
    try {
      ({ userId } = await verifier(accessToken));
    } catch (thrown) {
      return failure('verify', thrown);
    }
    let account: Awaited<ReturnType<SupabaseAdmin['getAccount']>>;
    try {
      account = await admin.getAccount(userId);
    } catch (thrown) {
      return failure('lookup', thrown);
    }
    // A valid token for a user that no longer exists is a repeated request: already deleted.
    if (account !== null) {
      // Revocation comes first: a delete that succeeds while revocation fails would leave
      // Apple's requirement unmet with no way to get the token again.
      if (account.appleSubject !== null) {
        try {
          if (parsed.data.appleAuthorizationCode === undefined) throw new AccountError('apple_code_invalid');
          await revoker({
            authorizationCode: parsed.data.appleAuthorizationCode,
            expectedSubject: account.appleSubject,
          });
        } catch (thrown) {
          return failure('apple', thrown);
        }
      }
      try {
        await admin.deleteUser(userId);
      } catch (thrown) {
        return failure('delete', thrown);
      }
    }
    return Response.json(accountDeleteV1SuccessSchema.parse({ data: { status: 'deleted' } }), { headers: jsonHeaders });
  };
}
