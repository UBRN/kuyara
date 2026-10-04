import {
  accountDeleteV1ErrorSchema,
  accountDeleteV1Path,
  accountDeleteV1RequestSchema,
  accountDeleteV1SuccessSchema,
  type AccountDeleteV1ErrorCode,
  type AccountDeleteV1Status,
} from '@kuyara/contracts';

import type { AppleTokenRevoker } from './apple-token-revoker.ts';
import {
  checkRateLimit, isJsonRequest, rateLimitedHeaders, readJsonBody, type RateLimiter,
} from '../json-request.ts';
import { createErrorResponse, jsonHeaders } from '../json-response.ts';
import { AccountError } from './account-error.ts';
import type { SupabaseAdmin } from './supabase-admin.ts';
import type { SupabaseTokenVerifier } from './supabase-token-verifier.ts';

type Dependencies = Readonly<{
  verifier: SupabaseTokenVerifier;
  admin: SupabaseAdmin;
  revoker: AppleTokenRevoker;
  rateLimiter: RateLimiter;
}>;

// The body is `{}` or one code of at most 1024 characters; anything past this is refused unread.
const maxRequestBodyBytes = 4096;

type Stage = 'verify' | 'lookup' | 'apple' | 'delete';

const statuses: Readonly<Record<AccountDeleteV1ErrorCode, number>> = {
  invalid_request: 400,
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
    const limit = await checkRateLimit(rateLimiter, request, {
      keyPrefix: 'account-delete',
      route: accountDeleteV1Path,
      limiter: 'account_delete_burst',
    });
    // A limiter outage fails closed.
    if (limit === 'unavailable') return error('unavailable');
    if (limit === 'limited') {
      console.warn({ event: 'rate_limited', route: accountDeleteV1Path, limiter: 'account_delete_burst' });
      return error('rate_limited', rateLimitedHeaders);
    }
    const accessToken = bearerToken(request);
    if (accessToken === undefined) return error('unauthorized');
    if (!isJsonRequest(request)) return error('invalid_request');
    // This body is unauthenticated: readJsonBody bounds it while reading. Too large is invalid_request.
    const body = await readJsonBody(request.body, maxRequestBodyBytes);
    if (body === undefined) return error('invalid_request');
    const parsed = accountDeleteV1RequestSchema.safeParse(body);
    if (!parsed.success) return error('invalid_request');

    let userId: string;
    let hasAppleIdentity: boolean;
    try {
      ({ userId, hasAppleIdentity } = await verifier(accessToken));
    } catch (thrown) {
      return failure('verify', thrown);
    }
    let account: Awaited<ReturnType<SupabaseAdmin['getAccount']>>;
    try {
      account = await admin.getAccount(userId);
    } catch (thrown) {
      return failure('lookup', thrown);
    }
    let status: AccountDeleteV1Status = 'deleted';
    // A valid token for a user that no longer exists is a repeated request: already deleted.
    // Whether the earlier attempt revoked Apple's token is unknown, so an account whose token
    // names Apple gets the safe instruction to remove kuyara in Settings.
    if (account === null && hasAppleIdentity) {
      status = 'deleted_apple_unrevoked';
      console.info({ event: 'account_delete_apple_unrevoked', reason: 'already_deleted' });
    }
    if (account !== null) {
      // Revocation comes first: a delete that succeeds while revocation fails would leave
      // Apple's requirement unmet with no way to get the token again. A missing, refused or
      // foreign code never blocks the delete (ADR 0041, section 2); only Apple being
      // unreachable or the revoke call failing does, and that throws.
      let unrevokedReason: 'no_code' | 'refused' | undefined;
      if (account.appleSubject !== null) {
        const authorizationCode = parsed.data.appleAuthorizationCode;
        if (authorizationCode === undefined) {
          unrevokedReason = 'no_code';
        } else {
          try {
            const revocation = await revoker({ authorizationCode, expectedSubject: account.appleSubject });
            if (revocation === 'refused') unrevokedReason = 'refused';
          } catch (thrown) {
            return failure('apple', thrown);
          }
        }
      }
      try {
        await admin.deleteUser(userId);
      } catch (thrown) {
        return failure('delete', thrown);
      }
      if (unrevokedReason !== undefined) {
        status = 'deleted_apple_unrevoked';
        // One closed event, so these can be counted without personal data.
        console.info({ event: 'account_delete_apple_unrevoked', reason: unrevokedReason });
      }
    }
    return Response.json(accountDeleteV1SuccessSchema.parse({ data: { status } }), { headers: jsonHeaders });
  };
}
