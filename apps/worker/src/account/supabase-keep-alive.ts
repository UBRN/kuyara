import { defaultFetch, type FetchLike } from '../default-fetch.ts';
import { boundedFetch } from './bounded-fetch.ts';
import { isHttpsUrl } from './https-url.ts';

type Dependencies = Readonly<{
  supabaseUrl: string | undefined;
  secretKey: string | undefined;
  fetch?: FetchLike;
  timeoutMs?: number;
}>;

/**
 * The daily request that keeps the Free-plan Supabase project from pausing (ADR 0041,
 * section 11): one call of `public.keep_alive()`, a function that returns a constant and
 * reads no table. Like the deletion route it calls nothing while a setting is missing. The
 * secret key travels only in the `apikey` header, where Supabase's gateway accepts the
 * `sb_secret_` key type (it is not a JWT, so never in `Authorization`). Only a closed
 * outcome is logged: no address, key, status text or body.
 */
export async function runSupabaseKeepAlive(dependencies: Dependencies): Promise<void> {
  const { supabaseUrl, secretKey } = dependencies;
  if (!supabaseUrl || !isHttpsUrl(supabaseUrl) || !secretKey) {
    console.info({ event: 'supabase_keep_alive', outcome: 'skipped_unconfigured' });
    return;
  }
  const fetchImpl = dependencies.fetch ?? defaultFetch();
  const url = `${supabaseUrl.replace(/\/+$/u, '')}/rest/v1/rpc/keep_alive`;
  try {
    const { status } = await boundedFetch(fetchImpl, url, {
      method: 'POST',
      headers: { apikey: secretKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}',
    }, dependencies.timeoutMs ?? 4000);
    if (status === 200) {
      console.info({ event: 'supabase_keep_alive', outcome: 'ok' });
    } else {
      console.warn({ event: 'supabase_keep_alive', outcome: 'failed', reason: 'rejected' });
    }
  } catch {
    // boundedFetch raises only its closed unavailable: a network fault, a timeout or an oversized body.
    console.warn({ event: 'supabase_keep_alive', outcome: 'failed', reason: 'unreachable' });
  }
}
