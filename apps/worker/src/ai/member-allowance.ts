import { AccountError } from '../account/account-error.ts';
import { bearerToken } from '../account/bearer-token.ts';
import type { SupabaseTokenVerifier } from '../account/supabase-token-verifier.ts';
import {
  createDurableDailyCounter, dailyCounterKey, type DailyCounterNamespace,
} from '../daily-counter.ts';

/**
 * The "Ask the stylist again" requests a signed-in member may make per UTC day (ADR 0041,
 * section 13). The owner of the figure: everyone else keeps the device's own allowance.
 */
export const MEMBER_REASK_DAILY_LIMIT = 10;

/** Counts one member re-ask against the request's own bearer token; never throws. */
export type MemberAllowance = (request: Request, now: Date) => Promise<'within' | 'exhausted'>;

type Dependencies = Readonly<{
  verifier: SupabaseTokenVerifier;
  namespace: DailyCounterNamespace;
}>;

/**
 * A request is a member's only when its `Authorization` header carries an access token the
 * Supabase verifier accepts. The verified user id names one counter object, so it keys the
 * count; the object stores no id, and the id is never logged, returned or sent anywhere. Every other case (no header, a token
 * that fails verification, a verifier or counter outage) answers `within`: the allowance adds
 * no new way for a recommendation to fail, and the burst limiter and the Workers AI daily
 * total still bound the request.
 */
export function createMemberAllowance({ verifier, namespace }: Dependencies): MemberAllowance {
  return async (request, now) => {
    const accessToken = bearerToken(request);
    if (accessToken === undefined) return 'within';
    let userId: string;
    try {
      ({ userId } = await verifier(accessToken));
    } catch (thrown) {
      // A rejected token is an ordinary non-member request; only an outage is worth a line.
      if (!(thrown instanceof AccountError && thrown.code === 'unauthorized')) {
        console.warn({ event: 'ai_member_verifier_unavailable' });
      }
      return 'within';
    }
    // The user id names the object only; the stored key carries the constant prefix and the day.
    try {
      const count = await createDurableDailyCounter(namespace, `ai:member:${userId}`)
        .increment(dailyCounterKey('ai:member', now));
      return count > MEMBER_REASK_DAILY_LIMIT ? 'exhausted' : 'within';
    } catch {
      console.warn({ event: 'ai_member_counter_unavailable' });
      return 'within';
    }
  };
}
