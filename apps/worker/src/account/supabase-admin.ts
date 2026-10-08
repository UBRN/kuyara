import { z } from 'zod';

import { defaultFetch, type FetchLike } from '../default-fetch.ts';
import { AccountError } from './account-error.ts';
import { boundedFetch } from './bounded-fetch.ts';
import { userIdPattern } from './user-id.ts';

export type SupabaseAccount = Readonly<{
  // The subject of the account's Apple identity, or null when it has none.
  appleSubject: string | null;
}>;

export type SessionState = 'alive' | 'user_gone';

export type SupabaseAdmin = Readonly<{
  /** The account's identities, or null when the user no longer exists. */
  getAccount(userId: string): Promise<SupabaseAccount | null>;
  /**
   * `alive` while the access token's session is, and `user_gone` when Supabase Auth no longer
   * finds its user. A verified token outlives a sign-out until it expires; Auth refusing it
   * for any other reason (the session is gone, the user banned, the token bad) is `unauthorized`.
   */
  confirmSession(accessToken: string, userId: string): Promise<SessionState>;
  /** Hard-deletes the user; one that is already gone counts as deleted. */
  deleteUser(userId: string): Promise<void>;
}>;

type Dependencies = Readonly<{
  // The https origin from `supabaseBaseUrl`, used as is.
  supabaseUrl: string;
  // The public client key the app ships; the session check is a client request.
  publishableKey: string;
  // The admin calls only.
  secretKey: string;
  fetch?: FetchLike;
  timeoutMs: number;
}>;

/**
 * Supabase Auth's 403 answers to `GET /auth/v1/user` for a token it no longer honours (its
 * `requireAuthentication` middleware): the session row is gone, the user is banned, or the
 * token is bad. `user_not_found` is the user itself gone. Any other failure is an outage.
 */
const refusedSessionCodes: ReadonlySet<string> = new Set(['session_not_found', 'user_banned', 'bad_jwt']);
const authErrorSchema = z.object({ error_code: z.string() });
const sessionUserSchema = z.object({ id: z.string() });

const userSchema = z.object({
  id: z.string(),
  identities: z.array(z.object({
    provider: z.string(),
    provider_id: z.string().min(1).optional(),
    identity_data: z.object({ sub: z.string().min(1).optional() }).optional(),
  })),
});

/**
 * The Supabase Auth calls account deletion needs, over plain `fetch`: two admin calls and the
 * session check. Every key travels only in the `apikey` header. The admin calls send the secret
 * key, which Supabase's gateway accepts there for both the legacy and the new key types; the
 * session check sends the publishable key with the user's JWT as the bearer, as the app's own
 * client does, so Auth reads the request as that user's. Bodies, keys, tokens and addresses
 * never enter an error.
 */
export function createSupabaseAdmin(dependencies: Dependencies): SupabaseAdmin {
  const fetchImpl = dependencies.fetch ?? defaultFetch();
  const { timeoutMs } = dependencies;
  const base = `${dependencies.supabaseUrl}/auth/v1/admin/users`;
  const headers = { apikey: dependencies.secretKey, Accept: 'application/json' };

  function urlFor(userId: string): string {
    // The id normally comes from a verified token's `sub`; check it again before it becomes a path.
    if (!userIdPattern.test(userId)) throw new AccountError('unavailable');
    return `${base}/${userId}`;
  }

  return {
    async getAccount(userId) {
      const { status, json } = await boundedFetch(
        fetchImpl, urlFor(userId), { method: 'GET', headers }, timeoutMs,
      );
      if (status === 404) return null;
      const user = status === 200 ? userSchema.safeParse(json) : undefined;
      if (!user?.success || user.data.id !== userId) throw new AccountError('unavailable');
      const apple = user.data.identities.filter((identity) => identity.provider === 'apple');
      if (apple.length === 0) return { appleSubject: null };
      // Supabase keeps one identity per provider; two would leave the subject to guess.
      const subject = apple.length === 1
        ? (apple[0].provider_id ?? apple[0].identity_data?.sub)
        : undefined;
      if (subject === undefined) throw new AccountError('unavailable');
      return { appleSubject: subject };
    },

    async confirmSession(accessToken, userId) {
      const { status, json } = await boundedFetch(fetchImpl, `${dependencies.supabaseUrl}/auth/v1/user`, {
        method: 'GET',
        headers: { apikey: dependencies.publishableKey, Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
      }, timeoutMs);
      if (status === 200 && sessionUserSchema.safeParse(json).data?.id === userId) return 'alive';
      const refusal = status === 403 ? authErrorSchema.safeParse(json).data?.error_code : undefined;
      if (refusal === 'user_not_found') return 'user_gone';
      throw new AccountError(refusal !== undefined && refusedSessionCodes.has(refusal) ? 'unauthorized' : 'unavailable');
    },

    async deleteUser(userId) {
      const { status } = await boundedFetch(fetchImpl, urlFor(userId), {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ should_soft_delete: false }),
      }, timeoutMs);
      if (status !== 200 && status !== 204 && status !== 404) throw new AccountError('unavailable');
    },
  };
}
