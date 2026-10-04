import { z } from 'zod';

import { defaultFetch, type FetchLike } from '../default-fetch.ts';
import { AccountError } from './account-error.ts';
import { boundedFetch } from './bounded-fetch.ts';
import { userIdPattern } from './user-id.ts';

export type SupabaseAccount = Readonly<{
  // The subject of the account's Apple identity, or null when it has none.
  appleSubject: string | null;
}>;

export type SupabaseAdmin = Readonly<{
  /** The account's identities, or null when the user no longer exists. */
  getAccount(userId: string): Promise<SupabaseAccount | null>;
  /** Hard-deletes the user; one that is already gone counts as deleted. */
  deleteUser(userId: string): Promise<void>;
}>;

type Dependencies = Readonly<{
  // The https origin from `supabaseBaseUrl`, used as is.
  supabaseUrl: string;
  secretKey: string;
  fetch?: FetchLike;
  timeoutMs: number;
}>;

const userSchema = z.object({
  id: z.string(),
  identities: z.array(z.object({
    provider: z.string(),
    provider_id: z.string().min(1).optional(),
    identity_data: z.object({ sub: z.string().min(1).optional() }).optional(),
  })),
});

/**
 * The two Supabase Auth admin calls account deletion needs, over plain `fetch`. The secret
 * key travels only in the `apikey` header: Supabase's gateway accepts it there for both the
 * legacy and the new key types. Bodies, keys and addresses never enter an error.
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
