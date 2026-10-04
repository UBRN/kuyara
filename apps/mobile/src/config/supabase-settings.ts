/**
 * The Supabase project the account feature talks to (ADR 0041 sections 10 and 12): its https
 * origin and its publishable key, both public. The one place the app reads the two variables
 * (Metro inlines these literal `process.env` reads).
 */
export type SupabaseSettings = Readonly<{ url: string; publishableKey: string }>;

/**
 * Null when either value is missing or malformed, and then the live account port is not
 * composed. Only the publishable key type is accepted: a secret key can never reach the client.
 */
export function resolveSupabaseSettings(
  configuredUrl: string | undefined = process.env.EXPO_PUBLIC_SUPABASE_URL,
  configuredKey: string | undefined = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
): SupabaseSettings | null {
  const publishableKey = configuredKey?.trim() ?? '';
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) return null;
  try {
    const url = new URL(configuredUrl?.trim() ?? '');
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      return null;
    }
    return { url: url.origin, publishableKey };
  } catch {
    return null;
  }
}
