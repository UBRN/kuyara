import {
  accountDeleteV1ErrorSchema,
  accountDeleteV1Path,
  accountDeleteV1RequestSchema,
  accountDeleteV1SuccessSchema,
  type AccountDeleteV1ErrorCode,
  type AccountDeleteV1Status,
} from '@kuyara/contracts';

import type { AppleTokenRevoker } from './apple-token-revoker.ts';
import { admitRequest, readRequestBody, type RateLimiter } from '../json-request.ts';
import { createErrorResponse, jsonHeaders, refusalResponse } from '../json-response.ts';
import { AccountError } from './account-error.ts';
import { bearerToken } from './bearer-token.ts';
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

type Stage = 'verify' | 'lookup' | 'session' | 'apple' | 'delete';

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

export function createAccountDeleteHandler({ verifier, admin, revoker, rateLimiter }: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (new URL(request.url).pathname !== accountDeleteV1Path) return error('not_found');
    // A limiter outage fails closed.
    const admission = await admitRequest(request, rateLimiter, {
      keyPrefix: 'account-delete',
      route: accountDeleteV1Path,
      limiter: 'account_delete_burst',
    });
    if (admission !== 'allowed') return refusalResponse(errorResponse, admission, 'unavailable');
    const accessToken = bearerToken(request);
    if (accessToken === undefined) return error('unauthorized');
    // This body is unauthenticated: it is bounded while reading, and too large is invalid_request.
    const outcome = await readRequestBody(request, {
      schema: accountDeleteV1RequestSchema,
      maxBytes: maxRequestBodyBytes,
    });
    if (outcome.kind !== 'ok') return error('invalid_request');

    let userId: string;
    let hasAppleIdentity: boolean;
    try {
      ({ userId, hasAppleIdentity } = await verifier(accessToken));
    } catch (thrown) {
      return failure('verify', thrown);
    }
    // The session check runs alongside the lookup, so the route keeps five upstream calls in a row.
    const [lookup, session] = await Promise.allSettled([
      admin.getAccount(userId),
      admin.confirmSession(accessToken, userId),
    ]);
    if (lookup.status === 'rejected') return failure('lookup', lookup.reason);
    let account = lookup.value;
    if (account !== null) {
      // A token verifies until it expires, also after its session was signed out; only a live
      // session deletes. An account already gone skips the check, because its sessions went
      // with it, and one Auth no longer finds by the time it is asked is gone the same way.
      if (session.status === 'rejected') return failure('session', session.reason);
      if (session.value === 'user_gone') account = null;
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
        const authorizationCode = outcome.data.appleAuthorizationCode;
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
